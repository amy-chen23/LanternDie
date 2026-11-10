"""Local alive/dead experiment. All generated data stays under the ignored dataset."""
import argparse
import base64
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request

CLASSES = ['Adult Spotted Lanternfly', 'Early Nymph Spotted Lanternfly', 'Late Nymph Spotted Lanternfly']
LABELS = {'alive': 0, 'dead': 1}


def atomic_write(path, writer):
    """Keep the previous complete artifact if writing is interrupted."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            writer(stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def write_json(path, value):
    atomic_write(path, lambda stream: stream.write((json.dumps(value, indent=2) + '\n').encode()))


def read_images(root):
    from PIL import Image, ImageOps
    rows, errors = [], []
    for label in LABELS:
        folder = root / label
        if not folder.is_dir():
            raise ValueError(f'Missing folder: {folder}')
        for path in sorted(folder.rglob('*')):
            if not path.is_file() or path.name.startswith('.'):
                continue
            try:
                with Image.open(path) as original:
                    image = ImageOps.exif_transpose(original).convert('RGB')
                    image.load()
                    digest = hashlib.sha256(str(image.size).encode() + image.tobytes()).hexdigest()
                    rows.append({'path': str(path.relative_to(root)), 'label': label,
                                 'width': image.width, 'height': image.height, 'pixel_hash': digest})
            except Exception as error:
                errors.append({'path': str(path.relative_to(root)), 'error': type(error).__name__})
    return rows, errors


def audit(root):
    rows, errors = read_images(root)
    by_hash = {}
    for row in rows:
        by_hash.setdefault(row['pixel_hash'], []).append(row)
    duplicates = [[r['path'] for r in group] for group in by_hash.values() if len(group) > 1]
    conflicts = [group for group in duplicates if len({next(r['label'] for r in rows if r['path'] == path) for path in group}) > 1]
    summary = {'counts': {label: sum(r['label'] == label for r in rows) for label in LABELS},
               'unreadable': errors, 'duplicate_images': duplicates, 'conflicting_labels': conflicts,
               'pairing': 'Unknown; image-level evaluation cannot establish independence of specimens.'}
    write_json(root / '_work' / 'audit.json', {**summary, 'images': rows})
    print(json.dumps(summary, indent=2))
    if errors or conflicts:
        raise ValueError('Resolve unreadable images or duplicate images with conflicting labels before preparing crops.')
    return rows


def parse_output(value, classes, threshold, input_size=None):
    outputs = value.get('outputs') if isinstance(value, dict) else None
    if not isinstance(outputs, list) or len(outputs) != 1 or not isinstance(outputs[0], dict):
        raise ValueError('Invalid workflow output')
    def detection(v):
        return isinstance(v, dict) and isinstance(v.get('image'), dict) and isinstance(v.get('predictions'), list)
    row = outputs[0]
    candidates = [row] if detection(row) else [v for v in row.values() if detection(v)]
    if len(candidates) != 1:
        raise ValueError('Missing or ambiguous workflow detections')
    result = candidates[0]
    width, height = result['image'].get('width'), result['image'].get('height')
    # This workflow uses null dimensions for a valid empty detection result.
    # There are no boxes to locate, so use the known submitted image dimensions.
    if width is None and height is None and not result['predictions'] and input_size:
        width, height = input_size
    import math
    if any(not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v)
           or v <= 0 or not float(v).is_integer() for v in [width, height]):
        raise ValueError('Invalid image dimensions')
    width, height = int(width), int(height)
    allowed = {c.strip().lower() for c in classes}
    boxes = []
    for p in result['predictions']:
        values = [p.get(k) for k in ['x', 'y', 'width', 'height', 'confidence']]
        if any(not isinstance(v, (float, int)) or isinstance(v, bool) or not math.isfinite(v) for v in values):
            raise ValueError('Invalid prediction')
        x, y, w, h, confidence = values
        if w <= 0 or h <= 0 or not 0 <= confidence <= 1 or not isinstance(p.get('class'), str):
            raise ValueError('Invalid prediction')
        if p['class'].strip().lower() not in allowed or confidence < threshold:
            continue
        left, top, right, bottom = max(0, x-w/2), max(0, y-h/2), min(width, x+w/2), min(height, y+h/2)
        if right > left and bottom > top:
            boxes.append((left, top, right, bottom))
    return width, height, boxes


def crop(root, env_path):
    from PIL import Image, ImageOps
    rows = audit(root)
    settings = {}
    for line in env_path.read_text().splitlines():
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            settings[k.strip()] = v.strip().strip('\"\'')
    key = settings.get('ROBOFLOW_API_KEY', '')
    workspace, workflow = settings.get('ROBOFLOW_WORKSPACE', ''), settings.get('ROBOFLOW_WORKFLOW_ID', '')
    import re
    if not key or not all(re.fullmatch(r'[\w-]+', v) for v in [workspace, workflow]):
        raise ValueError('Configure the workflow and key in the server-only env file first.')
    classes = settings.get('ROBOFLOW_CLASSES', ','.join(CLASSES)).split(',')
    threshold = float(settings.get('ROBOFLOW_DETECTION_THRESHOLD', '0.5'))
    if not 0 < threshold <= 1:
        raise ValueError('Detection threshold must be in (0, 1].')
    endpoint = f'https://serverless.roboflow.com/{workspace}/workflows/{workflow}'
    previous = {}
    manifest_path = root / '_work' / 'manifest.csv'
    if manifest_path.exists():
        with manifest_path.open() as f:
            previous = {r['path']: r for r in csv.DictReader(f)}
    manifest = []
    for index, row in enumerate(rows):
        fingerprint = hashlib.sha256(json.dumps([row['pixel_hash'], workspace, workflow, classes, threshold, 'crop-v1']).encode()).hexdigest()
        cache = root / '_work' / 'detections' / f'{fingerprint}.json'
        entry = {**row, 'group': row['pixel_hash'], 'life_stage': 'unknown', 'crop': '', 'status': '',
                 'error_detail': '', 'selection': '', 'detection_key': fingerprint}
        old = previous.get(row['path'], {})
        if old.get('pixel_hash') == row['pixel_hash']:
            entry['group'] = old.get('group') or row['pixel_hash']
            entry['life_stage'] = old.get('life_stage') or 'unknown'
            if old.get('status') == 'excluded':
                entry['status'] = 'excluded'
                manifest.append(entry)
                continue
            if old.get('detection_key') == fingerprint:
                entry['selection'] = old.get('selection', '')
        try:
            with Image.open(root / row['path']) as original:
                image = ImageOps.exif_transpose(original).convert('RGB')
                image.thumbnail((1600, 1600))
                buffer = io.BytesIO()
                image.save(buffer, format='JPEG', quality=75)
            if cache.exists():
                response = json.loads(cache.read_text())
            else:
                payload = {'inputs': {'image': {'type': 'base64', 'value': base64.b64encode(buffer.getvalue()).decode()},
                                      'classes': ', '.join(classes)}, 'use_cache': True}
                request = urllib.request.Request(endpoint, json.dumps(payload).encode(),
                    headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}'})
                with urllib.request.urlopen(request, timeout=60) as result:
                    response = json.load(result)
                # Cache only normalized detections, never annotated image payloads or credentials.
                w, h, boxes = parse_output(response, classes, threshold, image.size)
                response = {'width': w, 'height': h, 'boxes': boxes}
                write_json(cache, response)
            w, h, boxes = response['width'], response['height'], response['boxes']
            if (w, h) != image.size:
                raise ValueError('Detection/image dimension mismatch')
            def save_crop(box, target):
                left, top, right, bottom = box
                # Preserve appendages with 15% padding on each side; match this at inference.
                dx, dy = (right-left)*0.15, (bottom-top)*0.15
                bounds = (max(0, int(left-dx)), max(0, int(top-dy)), min(w, int(right+dx+1)), min(h, int(bottom+dy+1)))
                target.parent.mkdir(parents=True, exist_ok=True)
                image.crop(bounds).save(target, quality=95)
            if len(boxes) > 1:
                for number, box in enumerate(boxes, 1):
                    save_crop(box, root / '_work' / 'candidates' / row['label'] / f'{fingerprint}-{number}.jpg')
            choice = entry['selection']
            if not boxes:
                entry['status'] = 'no_detection'
            elif len(boxes) > 1 and not choice:
                entry['status'] = 'multiple_detections_review'
            else:
                selected = int(choice) - 1 if choice else 0
                if selected < 0 or selected >= len(boxes):
                    raise ValueError(f'Selection must be a box number from 1 to {len(boxes)}')
                target = root / '_work' / 'crops' / row['label'] / f'{fingerprint}.jpg'
                save_crop(boxes[selected], target)
                entry.update(crop=str(target.relative_to(root)), status='ready')
        except urllib.error.HTTPError as error:
            if error.code in (401, 403):
                raise ValueError('Roboflow rejected workflow access. No upstream error body displayed.') from None
            entry['status'] = f'http_{error.code}'
            entry['error_detail'] = f'Roboflow HTTP {error.code}; upstream response body omitted'
        except Exception as error:
            entry['status'] = f'failed_{type(error).__name__}'
            entry['error_detail'] = str(error).replace(key, '[REDACTED]')[:300]
        manifest.append(entry)
        print(f"{index+1}/{len(rows)} {row['label']}: {entry['status']}", flush=True)
    fields = ['path', 'label', 'group', 'life_stage', 'crop', 'status', 'pixel_hash', 'width', 'height', 'error_detail', 'selection', 'detection_key']
    with (root / '_work' / 'manifest.csv').open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(manifest)
    from html import escape
    cards = ''.join(f'<figure><img loading="lazy" src="{escape(r["crop"].removeprefix("_work/"), quote=True)}"><figcaption>{escape(r["label"])} · {escape(r["path"])}<br>{escape(r["status"])}</figcaption></figure>' for r in manifest if r['crop'])
    review = ''
    for row in manifest:
        if row['status'] == 'ready':
            continue
        review += f'<h3>{escape(row["path"])}</h3><p>{escape(row["status"])} · {escape(row["error_detail"])}</p><a href="../{escape(row["path"], quote=True)}">Open original photo</a><main>'
        if row['status'] == 'multiple_detections_review':
            candidates = sorted((root / '_work' / 'candidates' / row['label']).glob(f'{row["detection_key"]}-*.jpg'), key=lambda p: int(p.stem.rsplit('-', 1)[1]))
            for candidate in candidates:
                number = candidate.stem.rsplit('-', 1)[1]
                review += f'<figure><img src="{escape(str(candidate.relative_to(root / "_work")), quote=True)}"><figcaption>Candidate {number}: set selection to {number} in manifest.csv</figcaption></figure>'
        review += '</main>'
    (root / '_work' / 'review.html').write_text('<!doctype html><meta charset="utf-8"><title>Review lanternfly crops</title><style>body{font:14px system-ui;margin:24px}main{display:flex;flex-wrap:wrap}figure{width:220px;margin:12px}img{width:220px;height:220px;object-fit:contain;background:#eee}figcaption{overflow-wrap:anywhere}</style><h1>Review crops before training</h1><p>Each crop must show the labeled insect. Edit manifest.csv to exclude incorrect crops or assign known specimen/session groups. For multiple detections, choose the complete labeled insect by entering its candidate number in selection, then rerun crop. Overlapping boxes may show the same insect. Do not just change status to ready.</p><h2>Needs attention</h2>'+review+'<h2>Ready crops</h2><main>'+cards+'</main>')
    print('Review _work/review.html and manifest.csv before training. Unknown pairs are not automatically resolved.')


def training_rows(root, adults_only=False):
    with (root / '_work/manifest.csv').open() as stream:
        rows = [r for r in csv.DictReader(stream) if r['status'] == 'ready']
    if adults_only:
        # Detector stage labels can be wrong. Missing/unknown stages must not qualify.
        rows = [r for r in rows if r.get('life_stage', '').strip().lower() == 'adult']
    if not rows:
        raise ValueError('No reviewed adult crops available. Set life_stage=adult in manifest.csv after checking the insect.'
                         if adults_only else 'No ready crops. Run crop first.')
    return rows


def train(root, reviewed, folds, adults_only=False):
    if not reviewed:
        raise ValueError('Review _work/review.html first, then pass --reviewed-crops. This does not certify independence of specimens.')
    import numpy as np
    import torch
    from PIL import Image, ImageOps
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedGroupKFold
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    import sklearn
    from torchvision.models import MobileNet_V3_Small_Weights, mobilenet_v3_small
    from torchvision.transforms.functional import to_tensor, normalize

    torch.manual_seed(42)
    torch.set_num_threads(4)
    torch.hub.set_dir(str(root / '_work' / 'torch-cache'))
    rows = training_rows(root, adults_only)
    for row in rows:
        if not row['crop'] or not (root / row['crop']).is_file():
            raise ValueError(f"Ready row has no crop file: {row['path']}. Select or create a crop first; do not just change status.")
    # Keep exact duplicates and user-supplied groups together in all folds.
    parents = list(range(len(rows)))
    def find(i):
        while parents[i] != i:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i
    for i, a in enumerate(rows):
        for j, b in enumerate(rows[:i]):
            if a['pixel_hash'] == b['pixel_hash'] or (a['group'] and a['group'] == b['group']):
                parents[find(i)] = find(j)
    groups = np.array([find(i) for i in range(len(rows))])
    y = np.array([LABELS[r['label']] for r in rows])
    for label in LABELS.values():
        if len(set(groups[y == label])) < folds:
            raise ValueError(f'Need at least {folds} groups in each class for cross-validation.')
    backbone = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.DEFAULT)
    encoder = torch.nn.Sequential(backbone.features, torch.nn.AdaptiveAvgPool2d(1), torch.nn.Flatten()).eval()
    encoder.requires_grad_(False)
    def prepare(path):
        with Image.open(path) as source:
            image = ImageOps.exif_transpose(source).convert('RGB')
            image = ImageOps.pad(image, (224, 224), method=Image.Resampling.BILINEAR, color=(124, 116, 104))
            return normalize(to_tensor(image), [0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    # Version the cache by actual crop bytes, encoder, preprocessing, and package
    # versions. Label/group/fold changes invalidate evaluation, not image features.
    import torchvision
    encoder_key = f'mobilenet-v3-small-imagenet1k-v1-pad224-v1-{torch.__version__}-{torchvision.__version__}'
    checkpoints = root / '_work' / 'checkpoints'
    with torch.inference_mode():
        features = []
        for start in range(0, len(rows), 16):
            batch_rows = rows[start:start+16]
            keys = [hashlib.sha256(encoder_key.encode() + (root / r['crop']).read_bytes()).hexdigest() for r in batch_rows]
            paths = [checkpoints / 'features' / f'{key}.npy' for key in keys]
            missing = [i for i, path in enumerate(paths) if not path.exists()]
            if missing:
                batch = torch.stack([prepare(root / batch_rows[i]['crop']) for i in missing])
                extracted = encoder(batch).numpy()
                for i, feature in zip(missing, extracted):
                    atomic_write(paths[i], lambda stream, feature=feature: np.save(stream, feature, allow_pickle=False))
            features.append(np.stack([np.load(path, allow_pickle=False) for path in paths]))
            print(f'Features checkpointed: {min(start+16, len(rows))}/{len(rows)} ({len(batch_rows)-len(missing)} reused)', flush=True)
        x = np.concatenate(features)
    def classifier():
        return make_pipeline(StandardScaler(), LogisticRegression(C=0.1, max_iter=2000, random_state=42))
    scores, assignments = np.zeros(len(rows)), np.zeros(len(rows), dtype=int)
    run_key = hashlib.sha256(x.tobytes() + y.tobytes() + groups.tobytes()
        + json.dumps([folds, sklearn.__version__, 'standardscale-logistic-C0.1-seed42-v1']).encode()).hexdigest()
    run_dir = checkpoints / 'runs' / run_key
    splitter = StratifiedGroupKFold(n_splits=folds, shuffle=True, random_state=42)
    for fold, (train_ids, test_ids) in enumerate(splitter.split(x, y, groups)):
        if len(set(y[train_ids])) != 2:
            raise ValueError('A training fold lacks one class; change grouping or reduce folds.')
        checkpoint = run_dir / f'fold-{fold}.npz'
        if checkpoint.exists():
            with np.load(checkpoint, allow_pickle=False) as saved:
                if not np.array_equal(saved['test_ids'], test_ids):
                    raise ValueError('Checkpoint split mismatch')
                scores[test_ids] = saved['scores']
        else:
            model = classifier().fit(x[train_ids], y[train_ids])
            scores[test_ids] = model.predict_proba(x[test_ids])[:, 1]
            atomic_write(checkpoint, lambda stream: np.savez(stream, test_ids=test_ids, scores=scores[test_ids]))
        assignments[test_ids] = fold
        print(f'Validation fold {fold+1}/{folds} checkpointed', flush=True)
    accepted = scores >= 0.7
    n_accepted = int(accepted.sum())
    metrics = {'stage': 'experimental_not_calibrated', 'life_stage_scope': 'adult' if adults_only else 'all',
        'images_used': len(rows), 'folds': folds,
        'classes': {label: int((y == number).sum()) for label, number in LABELS.items()},
        'threshold': 0.7, 'accepted_as_dead': n_accepted,
        'alive_incorrectly_accepted': int(((y == 0) & accepted).sum()),
        'precision_among_accepted': float(y[accepted].mean()) if n_accepted else None,
        'acceptance_rate': float(accepted.mean()),
        'warning': 'Image-level cross-validation with unknown pre/post pairs. Scores are uncalibrated; independent new-insect testing is required. Not a production acceptance gate.'}
    out = root / '_work' / 'model'
    write_json(out / 'metrics.json', metrics)
    with (out / 'out_of_fold.csv').open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['path', 'label', 'group', 'fold', 'raw_dead_score', 'decision'])
        writer.writerows((r['path'], r['label'], int(groups[i]), int(assignments[i]), float(scores[i]), 'likely_dead' if accepted[i] else 'uncertain') for i, r in enumerate(rows))
    final = classifier().fit(x, y)
    scaler, logistic = final.steps[0][1], final.steps[1][1]
    head = torch.nn.Linear(x.shape[1], 1)
    with torch.no_grad():
        head.weight.copy_(torch.tensor(logistic.coef_ / scaler.scale_, dtype=torch.float32))
        head.bias.copy_(torch.tensor(logistic.intercept_ - (logistic.coef_ * scaler.mean_ / scaler.scale_).sum(axis=1), dtype=torch.float32))
    full = torch.nn.Sequential(encoder, head).eval()
    # Verify the exported linear head reproduces the final sklearn classifier.
    with torch.inference_mode():
        exported = torch.sigmoid(head(torch.tensor(x))).numpy().ravel()
    if not np.allclose(exported, final.predict_proba(x)[:, 1], atol=1e-5):
        raise ValueError('Export verification failed')
    artifact = {'architecture': 'mobilenet_v3_small_features_linear', 'state_dict': full.state_dict(),
                'life_stage_scope': 'adult' if adults_only else 'all',
                'input_size': 224, 'preprocessing': 'RGB; EXIF transpose; pad square with (124,116,104); bilinear; ImageNet normalization',
                'dead_label': 1, 'calibrated': False, 'run_key': run_key}
    atomic_write(run_dir / 'classifier.pt', lambda stream: torch.save(artifact, stream))
    atomic_write(out / 'classifier.pt', lambda stream: torch.save(artifact, stream))
    print(json.dumps(metrics, indent=2))
    print(f"Saved local experimental model ({(out / 'classifier.pt').stat().st_size / 1024**2:.2f} MiB). No app acceptance behavior changed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['audit', 'crop', 'train'])
    parser.add_argument('--data', type=Path, default=Path('confidence-training'))
    parser.add_argument('--env', type=Path, default=Path('supabase/functions/.env'))
    parser.add_argument('--reviewed-crops', action='store_true')
    parser.add_argument('--adults-only', action='store_true', help='Train only ready crops explicitly reviewed as life_stage=adult')
    parser.add_argument('--folds', type=int, default=3, choices=[3, 4, 5])
    args = parser.parse_args()
    try:
        if args.command == 'audit': audit(args.data)
        elif args.command == 'crop': crop(args.data, args.env)
        else: train(args.data, args.reviewed_crops, args.folds, args.adults_only)
    except (ValueError, FileNotFoundError) as error:
        parser.exit(1, f'{error}\n')


if __name__ == '__main__':
    main()
