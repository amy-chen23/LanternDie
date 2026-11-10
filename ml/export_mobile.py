"""Export the trained checkpoint as a self-contained, verified phone model."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import tempfile

import numpy as np
import onnx
import onnxruntime as ort
from PIL import Image, ImageOps
import torch
from torchvision.models import mobilenet_v3_small

from confidence import write_json


class PhoneClassifier(torch.nn.Module):
    def __init__(self, classifier):
        super().__init__()
        self.classifier = classifier
        self.register_buffer('mean', torch.tensor([0.485, 0.456, 0.406]).reshape(1, 3, 1, 1))
        self.register_buffer('std', torch.tensor([0.229, 0.224, 0.225]).reshape(1, 3, 1, 1))

    def forward(self, rgb):
        pixels = rgb.permute(0, 3, 1, 2).float() / 255.0
        return torch.sigmoid(self.classifier((pixels - self.mean) / self.std))


def prepare_rgb(path):
    with Image.open(path) as source:
        image = ImageOps.exif_transpose(source).convert('RGB')
        image = ImageOps.pad(image, (224, 224), method=Image.Resampling.BILINEAR, color=(124, 116, 104))
        return np.asarray(image, dtype=np.float32)[None].copy()


def export(data):
    torch.set_num_threads(4)
    source = data / '_work/model/classifier.pt'
    checkpoint = torch.load(source, map_location='cpu', weights_only=True)
    if checkpoint['architecture'] != 'mobilenet_v3_small_features_linear':
        raise ValueError('Unsupported checkpoint architecture')
    backbone = mobilenet_v3_small(weights=None)
    encoder = torch.nn.Sequential(backbone.features, torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten())
    classifier = torch.nn.Sequential(encoder, torch.nn.Linear(576, 1))
    classifier.load_state_dict(checkpoint['state_dict'], strict=True)
    model = PhoneClassifier(classifier).eval().requires_grad_(False)
    output = data / '_work/mobile'
    output.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(suffix='.onnx', dir=output)
    os.close(fd)
    temporary = Path(name)
    try:
        example = torch.zeros((1, 224, 224, 3), dtype=torch.float32)
        torch.onnx.export(model, (example,), str(temporary), dynamo=True,
                          opset_version=18, external_data=False,
                          input_names=['rgb'], output_names=['dead_score'])
        onnx.checker.check_model(onnx.load(temporary))
        session = ort.InferenceSession(str(temporary), providers=['CPUExecutionProvider'])
        with (data / '_work/manifest.csv').open() as stream:
            rows = [r for r in csv.DictReader(stream) if r['status'] == 'ready']
        if checkpoint.get('life_stage_scope') == 'adult':
            rows = [r for r in rows if r.get('life_stage', '').strip().lower() == 'adult']
        if not rows:
            raise ValueError('No reviewed crops available to verify the export')
        max_error = 0.0
        # Validate real inputs and boundary values, not just the export's dummy input.
        inputs = [prepare_rgb(data / row['crop']) for row in rows]
        inputs += [np.full((1, 224, 224, 3), v, dtype=np.float32) for v in (0, 255)]
        for pixels in inputs:
            with torch.inference_mode():
                expected = model(torch.from_numpy(pixels)).numpy()
            actual = session.run(['dead_score'], {'rgb': pixels})[0]
            np.testing.assert_allclose(actual, expected, atol=1e-5, rtol=1e-5)
            max_error = max(max_error, float(np.max(np.abs(actual - expected))))
        target = output / 'lanternfly-dead.onnx'
        os.replace(temporary, target)
        metadata = {
            'life_stage_scope': checkpoint.get('life_stage_scope', 'all'),
            'model': target.name,
            'sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
            'source_checkpoint_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'input': {'name': 'rgb', 'dtype': 'float32', 'shape': [1, 224, 224, 3],
                      'layout': 'NHWC', 'channels': 'RGB, no alpha', 'range': [0, 255]},
            'preprocessing': {
                'orientation': 'Apply EXIF orientation before detecting/cropping',
                'detector_input': 'Same as training: longest edge <=1600; JPEG quality 75',
                'crop': 'One lanternfly bounding box; pad each side by 15% of box dimensions; clamp to image',
                'resize': 'Preserve aspect ratio; bilinear resize to fit 224x224; centered padding RGB (124,116,104), as PIL.ImageOps.pad',
                'normalization': 'Embedded in model; do not normalize input yourself',
            },
            'output': {'name': 'dead_score', 'shape': [1, 1], 'sigmoid': 'Embedded',
                       'meaning': 'Uncalibrated dead score, not a validated probability'},
            'calibrated': False,
            'self_test': {'input': 'all-zero float32 RGB [1,224,224,3]',
                          'dead_score': float(session.run(['dead_score'], {'rgb': inputs[-2]})[0].item()),
                          'absolute_tolerance': 1e-4},
            'experimental_dead_threshold': 0.7,
            'below_threshold': 'uncertain; not established alive',
            'validation': {'inputs_checked': len(inputs), 'max_absolute_error': max_error,
                           'runtime': ort.__version__, 'provider': 'CPUExecutionProvider'},
            'scope': 'Insect crop classifier only. Does not locate or identify lanternflies. Phone performance not tested.',
        }
        write_json(output / 'model.json', metadata)
        # Portable golden input: packed little-endian RGB float32 for phone tests.
        (output / 'reference.f32').write_bytes(inputs[0].astype('<f4').tobytes())
        write_json(output / 'reference.json', {
            'input': 'reference.f32', 'shape': [1, 224, 224, 3], 'dtype': 'float32 little-endian',
            'dead_score': float(session.run(['dead_score'], {'rgb': inputs[0]})[0].item()),
            'absolute_tolerance': 1e-5,
        })
        print(json.dumps({'model': str(target), 'size_mib': target.stat().st_size / 1024**2,
                          'validation': metadata['validation']}, indent=2))
    finally:
        temporary.unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=Path('confidence-training'))
    export(parser.parse_args().data)
