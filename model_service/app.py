"""Private worker-only scoring endpoint; frontends never receive its token."""
import asyncio
from contextlib import asynccontextmanager
import hmac
import json
import os
from fastapi import FastAPI, HTTPException, Request
from starlette.concurrency import run_in_threadpool
from .inference import Classifier


@asynccontextmanager
async def lifespan(app):
    token = os.environ.get('CLASSIFIER_TOKEN','')
    if len(token)<32:
        raise RuntimeError('Configure CLASSIFIER_TOKEN (at least 32 characters)')
    app.state.token = token
    app.state.model = Classifier()
    app.state.lock = asyncio.Lock()
    yield


app = FastAPI(lifespan=lifespan,docs_url=None,redoc_url=None,openapi_url=None)


@app.get('/health')
def health():
    return {'status':'ready'}


@app.post('/score')
async def score(request: Request):
    if not hmac.compare_digest(request.headers.get('authorization',''), 'Bearer '+app.state.token):
        raise HTTPException(status_code=401,detail='Unauthorized')
    data = bytearray()
    async for chunk in request.stream():
        data.extend(chunk)
        if len(data)>7_100_000:
            raise HTTPException(status_code=413,detail='Image payload too large')
    try:
        payload = json.loads(data)
        async with app.state.lock:
            return await run_in_threadpool(app.state.model.score,payload)
    except (ValueError,KeyError,TypeError,OSError):
        raise HTTPException(status_code=422,detail='Invalid image or boxes') from None
