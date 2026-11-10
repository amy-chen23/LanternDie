"""Copy only verified model artifacts into the app; never bundle dataset photos."""
import hashlib
import json
from pathlib import Path

from confidence import atomic_write, write_json


def bundle(data=Path('confidence-training'), destination=Path('assets/models')):
    source = data / '_work/mobile'
    model = (source / 'lanternfly-dead.onnx').read_bytes()
    metadata = json.loads((source / 'model.json').read_text())
    policy = json.loads((data / '_work/threshold/policy.json').read_text())
    checksum = hashlib.sha256(model).hexdigest()
    if metadata['sha256'] != checksum or policy['model_sha256'] != checksum:
        raise ValueError('Export, metadata, and threshold policy must describe the same model')
    if metadata['input']['dtype'] != 'float32' or policy['automatic_verification_enabled']:
        raise ValueError('Only float32 shadow-mode bundles are currently supported')
    atomic_write(destination / 'lanternfly-dead.onnx', lambda stream: stream.write(model))
    write_json(destination / 'model.json', metadata)
    write_json(destination / 'policy.json', {
        'modelVersion': 'lanternfly-dead-v1', 'modelSha256': checksum,
        'threshold': policy['threshold'], 'automaticVerificationEnabled': False,
        'preprocessingVersion': 'padded-rgb-pillow-bilinear-v1',
    })
    print(f'Bundled model SHA256 {checksum}; automatic verification disabled')


if __name__ == '__main__':
    bundle()
