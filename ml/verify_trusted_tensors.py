"""Compare Node's prepared RGB tensors with the preserved original PyTorch weights.
Run after scripts/feasibility/node-onnx.mjs with ONNX_POC_TENSOR_PREFIX set.
Never rewrites the checkpoint, ONNX graph, fixtures, or existing verification files.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import torch
from torchvision.models import mobilenet_v3_small
from export_mobile import PhoneClassifier


def verify(prefix, measurements, output):
    torch.set_num_threads(4)
    metadata = json.loads(Path('assets/models/model.json').read_text())
    checkpoint = Path('confidence-training/_work/model/classifier.pt')
    before = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    assert before == metadata['source_checkpoint_sha256']
    saved = torch.load(checkpoint, map_location='cpu', weights_only=True)
    assert saved['architecture'] == 'mobilenet_v3_small_features_linear'
    backbone = mobilenet_v3_small(weights=None)
    encoder = torch.nn.Sequential(backbone.features, torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten())
    classifier = torch.nn.Sequential(encoder, torch.nn.Linear(576, 1))
    classifier.load_state_dict(saved['state_dict'], strict=True)
    model = PhoneClassifier(classifier).eval().requires_grad_(False)
    report = json.loads(measurements.read_text())
    assert report['modelSha256'] == metadata['sha256']
    checked = []
    for reference in report['scores']:
        pixels = np.fromfile(f'{prefix}-{reference["file"]}.f32', dtype='<f4').reshape(1,224,224,3)
        with torch.inference_mode():
            expected = model(torch.from_numpy(pixels)).item()
        actual = reference['onnx']
        np.testing.assert_allclose(actual, expected, atol=1e-5, rtol=1e-5)
        assert (actual >= 0.98) == (expected >= 0.98)
        checked.append({'file':reference['file'], 'pytorch_identical_tensor':expected,
                        'node_onnx':actual, 'absolute_error':abs(actual-expected)})
    assert hashlib.sha256(checkpoint.read_bytes()).hexdigest() == before
    result = {'kind':'identical-jpeg-js-prepared-tensors-node-versus-original-pytorch',
              'checkpoint_sha256':before, 'model_sha256':metadata['sha256'],
              'pytorch_version':torch.__version__, 'comparisons':checked,
              'max_absolute_error':max(row['absolute_error'] for row in checked),
              'legacy_threshold_decision_mismatches':0}
    output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tensors-prefix',default='/private/tmp/lanterndie-trusted-tensor')
    parser.add_argument('--measurements',type=Path,default=Path('docs/trusted-inference-node-measurements.json'))
    parser.add_argument('--output',type=Path,default=Path('docs/trusted-inference-tensor-parity.json'))
    args=parser.parse_args()
    verify(args.tensors_prefix,args.measurements,args.output)
