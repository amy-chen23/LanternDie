"""Verify the preserved checkpoint, a fresh ONNX export and the registered app model.

Run locally with ml/requirements-mobile.txt. Never trains or replaces app assets.
"""
import csv
import hashlib
import json
from pathlib import Path
import tempfile

import numpy as np
import onnx
import onnxruntime as ort
from PIL import Image, ImageOps
import torch
from torchvision.models import mobilenet_v3_small
from export_mobile import PhoneClassifier, prepare_rgb


def verify():
    torch.set_num_threads(4)
    root = Path('confidence-training')
    path = root / '_work/model/classifier.pt'
    checksum = hashlib.sha256(path.read_bytes()).hexdigest()
    metadata = json.loads(Path('assets/models/model.json').read_text())
    policy = json.loads(Path('assets/models/policy.json').read_text())
    assert checksum == metadata['source_checkpoint_sha256'], 'Checkpoint changed'
    saved = torch.load(path, map_location='cpu', weights_only=True)
    assert saved['architecture'] == 'mobilenet_v3_small_features_linear'
    assert saved['input_size'] == 224 and saved['dead_label'] == 1
    backbone = mobilenet_v3_small(weights=None)
    encoder = torch.nn.Sequential(backbone.features, torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten())
    classifier = torch.nn.Sequential(encoder, torch.nn.Linear(576, 1))
    classifier.load_state_dict(saved['state_dict'], strict=True)
    model = PhoneClassifier(classifier).eval().requires_grad_(False)
    bundled = Path('assets/models/lanternfly-dead.onnx')
    assert hashlib.sha256(bundled.read_bytes()).hexdigest() == policy['modelSha256'] == metadata['sha256']
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(str(bundled), sess_options=options, providers=['CPUExecutionProvider'])
    rows = list(csv.DictReader((root / '_work/manifest.csv').open()))
    rows = [r for r in rows if r['status'] == 'ready' and (saved.get('life_stage_scope') != 'adult' or r.get('life_stage') == 'adult')]
    checked, max_error, fresh_error = [], 0., 0.
    with tempfile.TemporaryDirectory() as temp:
        target = Path(temp) / 'fresh.onnx'
        torch.onnx.export(model, (torch.zeros((1,224,224,3)),), str(target), dynamo=True,
                          opset_version=18, external_data=False, input_names=['rgb'], output_names=['dead_score'])
        onnx.checker.check_model(onnx.load(target))
        fresh = ort.InferenceSession(str(target), sess_options=options, providers=['CPUExecutionProvider'])
        for row in rows:
            pixels = prepare_rgb(root / row['crop'])
            with torch.inference_mode():
                expected = model(torch.from_numpy(pixels)).item()
            score = float(session.run(None, {'rgb': pixels})[0].item())
            converted = float(fresh.run(None, {'rgb': pixels})[0].item())
            for value in (score, converted):
                np.testing.assert_allclose(value, expected, atol=1e-5, rtol=1e-5)
                assert (value >= policy['threshold']) == (expected >= policy['threshold'])
            max_error = max(max_error, abs(score-expected))
            fresh_error = max(fresh_error, abs(converted-expected))
            checked.append({'crop':row['crop'], 'pytorch':expected, 'onnx':score})
    # Portable JPEG fixtures contain real reviewed insect crops, never mock scores.
    fixtures = Path('tests/fixtures/browser-inference')
    fixtures.mkdir(parents=True, exist_ok=True)
    references = []
    for name, candidate in [('above',max(checked,key=lambda r:r['onnx'])), ('below',min(checked,key=lambda r:r['onnx']))]:
        with Image.open(root/candidate['crop']) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
            image.thumbnail((480,480),Image.Resampling.BILINEAR)
            destination = fixtures/f'{name}.jpg'
            image.save(destination,quality=90)
        pixels = prepare_rgb(destination)
        with torch.inference_mode():
            score = model(torch.from_numpy(pixels)).item()
        assert (score >= policy['threshold']) == (name == 'above')
        references.append({'file':destination.name,'width':image.width,'height':image.height,'pytorch':score})
    (fixtures/'references.json').write_text(json.dumps(references,indent=2)+'\n')
    assert hashlib.sha256(path.read_bytes()).hexdigest() == checksum
    report = {'checkpoint_sha256':checksum,'model_sha256':metadata['sha256'],
              'checkpoint_metadata':{k:v for k,v in saved.items() if k!='state_dict'},
              'pytorch_version':torch.__version__,'onnxruntime_version':ort.__version__,
              'images_checked':len(checked),'max_absolute_error_bundled':max_error,
              'max_absolute_error_fresh_export':fresh_error,'threshold':policy['threshold'],
              'threshold_decision_mismatches':0,'scores':checked}
    Path('docs/browser-model-verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps({k:v for k,v in report.items() if k not in ('scores','checkpoint_metadata')},indent=2))

if __name__ == '__main__':
    verify()
