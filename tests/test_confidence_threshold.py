import csv
import importlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
import io
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'ml'))
threshold = importlib.import_module('threshold')


class ThresholdTests(unittest.TestCase):
    def test_inclusive_boundary_and_community_routing_counts(self):
        result = threshold.counts([
            {'label': 'alive', 'score': 0.98},
            {'label': 'dead', 'score': 0.98},
            {'label': 'dead', 'score': 0.979},
        ], 0.98)
        self.assertEqual(result['alive_accepted_as_dead'], 1)
        self.assertEqual(result['dead_accepted'], 1)
        self.assertEqual(result['community_review_count'], 1)

    def test_zero_errors_on_thirty_does_not_establish_one_percent(self):
        policy = {'threshold': 0.98, 'confidence_level': 0.95, 'target_live_false_accept_rate': 0.01}
        rows = [{'label': 'alive', 'score': 0.1}] * 30 + [{'label': 'dead', 'score': 0.99}]
        result = threshold.validation_result(rows, policy)
        self.assertFalse(result['target_supported'])
        self.assertAlmostEqual(result['live_error_upper_bound'], 1 - 0.05**(1/30))
        rows = [{'label': 'alive', 'score': 0.1}] * 299 + [{'label': 'dead', 'score': 0.99}]
        self.assertTrue(threshold.validation_result(rows, policy)['target_supported'])
        rows[0] = {'label': 'alive', 'score': 0.99}
        self.assertFalse(threshold.validation_result(rows, policy)['target_supported'])

    def test_provisional_selection_is_bound_to_model_and_never_enables_automation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '_work/model').mkdir(parents=True)
            (root / '_work/mobile').mkdir()
            (root / '_work/mobile/lanternfly-dead.onnx').write_bytes(b'model')
            path = root / '_work/model/out_of_fold.csv'
            path.write_text('path,label,raw_dead_score\na,alive,0.971\nb,dead,0.99\nc,dead,0.8\n')
            with redirect_stdout(io.StringIO()):
                policy = threshold.analyze(root)
            self.assertEqual(policy['threshold'], 0.98)
            self.assertEqual(policy['zero_error_independent_live_specimens_needed'], 299)
            self.assertFalse(policy['automatic_verification_enabled'])
            self.assertEqual(policy['model_sha256'], threshold.digest(root / '_work/mobile/lanternfly-dead.onnx'))
            path.write_text('path,label,raw_dead_score\na,alive,nan\nb,dead,0.8\n')
            with self.assertRaises(ValueError):
                threshold.read_scores(path)

    def test_independent_validation_refuses_overlap_and_does_not_retune(self):
        import numpy as np
        from PIL import Image
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '_work/threshold').mkdir(parents=True)
            (root / '_work/mobile').mkdir()
            model = root / '_work/mobile/lanternfly-dead.onnx'
            model.write_bytes(b'model')
            policy = {'threshold': 0.98, 'confidence_level': 0.95,
                      'target_live_false_accept_rate': 0.01, 'model_sha256': threshold.digest(model)}
            policy_path = root / '_work/threshold/policy.json'
            threshold.write_json(policy_path, policy)
            training = root / 'training.png'
            Image.new('RGB', (20, 20), (80, 80, 80)).save(training)
            (root / '_work/manifest.csv').write_text(
                'pixel_hash,group,crop\n' + threshold.image_hash(training) + ',old-insect,training.png\n')
            alive, dead = root / 'alive.png', root / 'dead.png'
            Image.new('RGB', (20, 20), (10, 10, 10)).save(alive)
            Image.new('RGB', (20, 20), (254, 254, 254)).save(dead)
            manifest = root / 'new.csv'
            def write_manifest(alive_path, dead_group='new-dead'):
                manifest.write_text(f'path,label,group\n{alive_path},alive,new-alive\ndead.png,dead,{dead_group}\n')
            write_manifest('alive.png')
            def prepare(path):
                with Image.open(path) as image:
                    return np.asarray(image, dtype=np.uint8)[None].copy()
            class Session:
                def __init__(self, *args, **kwargs):
                    pass
                def run(self, names, inputs):
                    return [np.array([[float(inputs['rgb'][0, 0, 0, 0]) / 255]])]
            with patch.dict(sys.modules, {'export_mobile': SimpleNamespace(prepare_rgb=prepare),
                                         'onnxruntime': SimpleNamespace(InferenceSession=Session)}):
                with self.assertRaises(ValueError):
                    threshold.validate(root, manifest, False)
                with redirect_stdout(io.StringIO()):
                    report = threshold.validate(root, manifest, True)
                self.assertFalse(report['results']['target_supported'])
                self.assertEqual(report['results']['threshold'], 0.98)
                self.assertEqual(json.loads(policy_path.read_text()), policy)
                self.assertEqual(len(list((root / '_work/threshold/validations').glob('*.json'))), 1)
                write_manifest('training.png')
                with self.assertRaises(ValueError):
                    threshold.validate(root, manifest, True)
                write_manifest('alive.png', 'new-alive')
                with self.assertRaises(ValueError):
                    threshold.validate(root, manifest, True)
                model.write_bytes(b'changed-model')
                with self.assertRaises(ValueError):
                    threshold.validate(root, manifest, True)


if __name__ == '__main__':
    unittest.main()
