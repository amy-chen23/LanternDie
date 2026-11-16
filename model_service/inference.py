"""The current checkpoint's ONNX export; no training or weight updates."""
import base64
import hashlib
import io
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps
import onnxruntime as ort


class Classifier:
    def __init__(self, directory=Path('assets/models')):
        metadata = json.loads((directory / 'model.json').read_text())
        path = directory / 'lanternfly-dead.onnx'
        self.checksum = hashlib.sha256(path.read_bytes()).hexdigest()
        if self.checksum != metadata['sha256']:
            raise ValueError('Model checksum mismatch')
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        self.session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
        score = self.session.run(['dead_score'], {'rgb': np.zeros((1,224,224,3), dtype=np.float32)})[0].item()
        if not math.isfinite(score) or abs(score - metadata['self_test']['dead_score']) > metadata['self_test']['absolute_tolerance']:
            raise ValueError('Model reference prediction failed')

    def score(self, payload):
        encoded = payload['image_base64']
        if not isinstance(encoded, str) or len(encoded)>7_000_000:
            raise ValueError('Invalid image')
        data = base64.b64decode(encoded, validate=True)
        if not data or len(data)>5*1024*1024:
            raise ValueError('Invalid image')
        boxes = payload['boxes']
        if not isinstance(boxes, list) or not 1 <= len(boxes) <= 20:
            raise ValueError('Invalid boxes')
        with Image.open(io.BytesIO(data)) as original:
            if original.format != 'JPEG' or original.width*original.height>4_000_000:
                raise ValueError('Invalid image')
            image = ImageOps.exif_transpose(original).convert('RGB')
            if (image.width,image.height)!=(payload['image_width'],payload['image_height']):
                raise ValueError('Image dimension mismatch')
        scores = []
        for box in boxes:
            x,y,w,h = [box[k] for k in ('x','y','width','height')]
            if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in (x,y,w,h)):
                raise ValueError('Invalid box')
            if min(x,y)<0 or min(w,h)<=0 or x+w>image.width or y+h>image.height:
                raise ValueError('Box outside image')
            bounds = (max(0,int(x-w*.15)),max(0,int(y-h*.15)),
                      min(image.width,int(x+w+w*.15+1)),min(image.height,int(y+h+h*.15+1)))
            crop = ImageOps.pad(image.crop(bounds),(224,224),method=Image.Resampling.BILINEAR,color=(124,116,104))
            pixels = np.asarray(crop,dtype=np.float32)[None].copy()
            score = float(self.session.run(['dead_score'], {'rgb':pixels})[0].item())
            if not math.isfinite(score) or not 0<=score<=1:
                raise ValueError('Invalid score')
            scores.append(score)
        return {'model_sha256':self.checksum,'scores':scores,'preprocessing_version':'padded-rgb-pillow-bilinear-v1'}
