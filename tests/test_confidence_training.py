import csv
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('confidence', Path(__file__).parents[1] / 'ml/confidence.py')
confidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(confidence)


class ConfidencePipelineTests(unittest.TestCase):
    def test_interrupted_atomic_write_preserves_previous_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'checkpoint'
            path.write_bytes(b'complete')
            def interrupted(stream):
                stream.write(b'partial')
                raise RuntimeError('interrupted')
            with self.assertRaises(RuntimeError):
                confidence.atomic_write(path, interrupted)
            self.assertEqual(path.read_bytes(), b'complete')
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_workflow_boxes_and_filtering(self):
        output = {'image': {'width': 100, 'height': 80}, 'predictions': [
            {'x': 5, 'y': 5, 'width': 20, 'height': 20, 'confidence': 0.8, 'class': 'Adult Spotted Lanternfly'},
            {'x': 50, 'y': 50, 'width': 20, 'height': 20, 'confidence': 0.2, 'class': 'Adult Spotted Lanternfly'},
        ]}
        self.assertEqual(confidence.parse_output({'outputs': [{'predictions': output}]}, confidence.CLASSES, 0.5), (100, 80, [(0, 0, 15, 15)]))
        output['predictions'] = []
        self.assertEqual(confidence.parse_output({'outputs': [{'predictions': output}]}, confidence.CLASSES, 0.5)[2], [])

    def test_invalid_output_is_not_a_negative_detection(self):
        for output in [{}, {'outputs': []}, {'outputs': [{'predictions': []}]}, {'outputs': [{}, {}]}]:
            with self.assertRaises(ValueError):
                confidence.parse_output(output, confidence.CLASSES, 0.5)

    def test_workflow_empty_result_can_use_known_input_dimensions(self):
        output = {'outputs': [{'predictions': {'image': {'width': None, 'height': None}, 'predictions': []}}]}
        self.assertEqual(confidence.parse_output(output, confidence.CLASSES, 0.5, (1200, 1600)), (1200, 1600, []))
        with self.assertRaises(ValueError):
            confidence.parse_output(output, confidence.CLASSES, 0.5)
        output['outputs'][0]['predictions']['predictions'] = [{'x': 1}]
        with self.assertRaises(ValueError):
            confidence.parse_output(output, confidence.CLASSES, 0.5, (1200, 1600))

    def test_cached_multiple_boxes_can_be_selected_without_new_api_calls(self):
        import hashlib
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for label, color in [('alive', (0, 180, 0)), ('dead', (180, 0, 0))]:
                (root / label).mkdir()
                Image.new('RGB', (64, 64), color).save(root / label / 'sample.png')
            env = root / 'server.env'
            env.write_text('ROBOFLOW_API_KEY=test-only\nROBOFLOW_WORKSPACE=test\nROBOFLOW_WORKFLOW_ID=detector\n')
            records, _ = confidence.read_images(root)
            for row in records:
                fingerprint = hashlib.sha256(json.dumps([row['pixel_hash'], 'test', 'detector', confidence.CLASSES, 0.5, 'crop-v1']).encode()).hexdigest()
                boxes = [[5, 5, 25, 25], [35, 35, 55, 55]] if row['label'] == 'alive' else [[5, 5, 25, 25]]
                confidence.write_json(root / '_work/detections' / f'{fingerprint}.json', {'width': 64, 'height': 64, 'boxes': boxes})
            with patch('urllib.request.urlopen', side_effect=AssertionError('Network should not be used')), redirect_stdout(io.StringIO()):
                confidence.crop(root, env)
                manifest_path = root / '_work/manifest.csv'
                with manifest_path.open() as f:
                    rows = list(csv.DictReader(f))
                alive = next(r for r in rows if r['label'] == 'alive')
                self.assertEqual(alive['status'], 'multiple_detections_review')
                self.assertIn('Candidate 2', (root / '_work/review.html').read_text())
                alive['selection'], alive['group'] = '2', 'known-insect'
                with manifest_path.open('w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=list(rows[0]))
                    writer.writeheader()
                    writer.writerows(rows)
                confidence.crop(root, env)
                with manifest_path.open() as f:
                    alive = next(r for r in csv.DictReader(f) if r['label'] == 'alive')
                self.assertEqual(alive['status'], 'ready')
                self.assertEqual(alive['selection'], '2')
                self.assertEqual(alive['group'], 'known-insect')
                self.assertTrue((root / alive['crop']).is_file())

    def test_audit_rejects_same_pixels_under_conflicting_labels(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for label in confidence.LABELS:
                (root / label).mkdir()
                Image.new('RGB', (30, 20), (30, 60, 90)).save(root / label / 'same.png')
            with self.assertRaises(ValueError):
                with redirect_stdout(io.StringIO()):
                    confidence.audit(root)
            self.assertTrue(json.loads((root / '_work/audit.json').read_text())['conflicting_labels'])

    def test_review_is_required_before_training(self):
        with self.assertRaises(ValueError):
            confidence.train(Path('not-used'), False, 3)

    def test_grouped_evaluation_and_model_export_on_synthetic_crops(self):
        # A tiny stand-in encoder verifies pipeline/export math without downloading weights.
        import torch
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / '_work').mkdir()
            rows = []
            for group in range(6):
                for label in confidence.LABELS:
                    name = f'{label}_{group}.png'
                    color = (150+group*5, 20, 30) if label == 'dead' else (20, 150+group*5, 30)
                    Image.new('RGB', (30, 20), color).save(root / name)
                    rows.append({'path': name, 'label': label, 'group': f'specimen_{group}', 'crop': name,
                                 'status': 'ready', 'pixel_hash': name})
            with (root / '_work/manifest.csv').open('w', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=list(rows[0]))
                writer.writeheader()
                writer.writerows(rows)
            with patch('torchvision.models.mobilenet_v3_small', return_value=SimpleNamespace(features=torch.nn.Identity())):
                with redirect_stdout(io.StringIO()):
                    confidence.train(root, True, 3)
            with (root / '_work/model/out_of_fold.csv').open() as f:
                scores = list(csv.DictReader(f))
            for group in range(6):
                self.assertEqual(len({r['fold'] for r in scores if r['path'].endswith(f'_{group}.png')}), 1)
            model = torch.load(root / '_work/model/classifier.pt', weights_only=True)
            self.assertFalse(model['calibrated'])
            self.assertEqual(model['dead_label'], 1)
            self.assertEqual(len(scores), 12)
            first_weights = {k: v.clone() for k, v in model['state_dict'].items()}
            # Simulate resuming after feature extraction. The encoder must not run,
            # and completed CV folds must not be fitted again (only the final head).
            class MustUseCheckpoint(torch.nn.Module):
                def forward(self, value):
                    raise AssertionError('Feature extraction was repeated')
            import sklearn.linear_model
            original_fit = sklearn.linear_model.LogisticRegression.fit
            fits = []
            def count_fit(instance, x, y, *args, **kwargs):
                fits.append(len(y))
                return original_fit(instance, x, y, *args, **kwargs)
            with patch('torchvision.models.mobilenet_v3_small', return_value=SimpleNamespace(features=MustUseCheckpoint())):
                with patch.object(sklearn.linear_model.LogisticRegression, 'fit', count_fit):
                    with redirect_stdout(io.StringIO()):
                        confidence.train(root, True, 3)
            self.assertEqual(fits, [12])
            resumed = torch.load(root / '_work/model/classifier.pt', weights_only=True)
            for key, value in first_weights.items():
                self.assertTrue(torch.equal(value, resumed['state_dict'][key]))


if __name__ == '__main__':
    unittest.main()
