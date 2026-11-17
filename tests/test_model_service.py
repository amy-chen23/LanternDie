import base64
import io
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).parents[1]))
from PIL import Image
from fastapi.testclient import TestClient
from model_service.app import app


class ModelServiceTests(unittest.TestCase):
    def test_real_bundled_model_and_authentication(self):
        buffer = io.BytesIO()
        Image.new('RGB',(100,80),(0,0,0)).save(buffer,format='JPEG')
        payload = {'image_base64':base64.b64encode(buffer.getvalue()).decode(),
                   'image_width':100,'image_height':80,
                   'boxes':[{'x':0,'y':0,'width':100,'height':80}]}
        with patch.dict(os.environ,{'CLASSIFIER_TOKEN':'t'*32}), TestClient(app) as client:
            self.assertEqual(client.post('/score',json=payload).status_code,401)
            headers = {'Authorization':'Bearer '+'t'*32}
            response = client.post('/score',json=payload,headers=headers)
            self.assertEqual(response.status_code,200,response.text)
            result = response.json()
            self.assertEqual(len(result['scores']),1)
            self.assertTrue(0<=result['scores'][0]<=1)
            self.assertEqual(result['model_sha256'],'57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d')
            # Wrong dimensions and missing boxes fail rather than returning a low score.
            self.assertEqual(client.post('/score',json={**payload,'image_width':99},headers=headers).status_code,422)
            self.assertEqual(client.post('/score',json={**payload,'boxes':[]},headers=headers).status_code,422)
            self.assertEqual(client.post('/score',json={**payload,'image_base64':'invalid'},headers=headers).status_code,422)


if __name__ == '__main__':
    unittest.main()
