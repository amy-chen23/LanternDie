# Trusted classifier inference feasibility — Milestone 1

Investigated November 13, 2026. No function, container, service, or migration was
deployed. The active frontend, detector worker, classifier pathway, and leaderboard
were not changed by this milestone. All measurements below are local.

## Recommendation

Proceed, after approval, with a **non-production Vercel Node.js Function packaging
and authentication proof**, using `onnxruntime-node@1.24.3` and the unchanged model.
This reuses the current deployment project and offers materially more memory
headroom than the Supabase Edge limits. It is a recommended candidate, not a
claim that an actual Vercel/Linux deployment has been validated. Keep automatic
acceptance disabled until runtime, provenance, and calibration are approved.

Do not deploy the existing unused private-service prototype or the pending
`20261116000000` hosted-classifier migration as part of M1. A separate service is
a fallback requiring another explicit approval if Vercel packaging proves unviable.

## Artifact and preprocessing

The registered graph is 4,142,697 bytes (3.95 MiB), ONNX IR 10 / opset 18, with no
external tensor files. Its SHA-256 remains
`57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d`.
The original 3,837,723-byte checkpoint remains SHA-256
`99c557bad5862504641bd09284ef1ec3b50fb885ca1b5f40ea13a2cc0994bd85`.
Both were checksum-checked after the local probes. Neither was replaced or retrained.

Operators are Add, Conv, Div, Gather, Gemm, HardSigmoid, HardSwish, Mul, ReduceMean,
Relu, Reshape, Sigmoid, Sub, and Transpose. The existing frozen MobileNet V3 Small
features and linear head require no GPU or Python in a Node deployment.

Use the stored, orientation-normalized JPEG (max 1600px edge, quality 75), current
accepted detector boxes, and original dimensions. Each crop adds 15% padding,
clamps to image bounds, and uses Pillow-compatible aspect-preserving bilinear
resize and centered padding RGB (124,116,104) at 224×224. The pure helpers in
`lib/death-policy.ts` are reused by both proofs. `jpeg-js` avoids DOM/canvas and
native image-library dependencies. The existing production limits are 5 MiB,
4 megapixels, and at most 20 crops for local scoring.

ONNX input is float32 NHWC `[1,224,224,3]`, RGB 0..255. Conversion to NCHW,
normalization with ImageNet statistics, and sigmoid are embedded. Output is one
uncalibrated `dead_score`. No new production ALIVE/DEAD cutoff was invented.

## Option 1: Supabase Edge / WASM

Supabase supports [bundled WebAssembly modules](https://supabase.com/docs/guides/functions/wasm).
Its [hosted limits](https://supabase.com/docs/guides/functions/limits) currently
include 256 MB memory, 2 CPU seconds per request, and a 20 MB CLI-bundled function
limit; Web Workers are unavailable. A native Node binding must not be assumed to
work in that sandbox. The probe uses single-threaded ONNX Runtime Web WASM with
proxy workers disabled and explicit local assets.

**Measured in generic Deno 2.9.6, not Supabase Edge Runtime:** unchanged graph
loaded successfully, initialization 179 ms, and twenty all-zero inferences took
150 ms total. The self-test score was 0.0062818527, within the existing tolerance.
A deterministic 1600×1600 JPEG plus twenty full-image crop preparations/inferences
took 699 ms, with process RSS around 349 MiB. See
`trusted-inference-deno-measurements.json`.

Generic-process RSS is not identical to hosted isolate memory accounting. These
results do not prove a hosted memory-limit violation, nor prove deployment
compatibility. They show insufficient demonstrated headroom for recommending
Edge deployment without actual Edge Runtime testing. The local Docker/Edge
Runtime environment was unavailable; no hosted test was attempted. Asset bundling,
WASM loading, cold starts, max-size JPEGs and hosted CPU accounting remain checks.

Deployment complexity is higher here because runtime glue/WASM/model must be
bundled as static files and the sandbox differs from generic Deno. Authentication
and private storage access would fit the existing worker, but do not solve those
resource uncertainties. Cost would use existing Edge quotas/usage, with CPU-limit
failures and retries a potential operational burden.

## Option 2: existing Vercel project / Node native runtime

The project currently exports a static Expo web application; it does not currently
contain a production Node inference route. A future route would be an explicit
backend addition in that same Vercel project, not frontend PyTorch or an external
model provider. Use the [Node runtime](https://vercel.com/docs/functions/runtimes/node-js),
not the Vercel Edge runtime.

The Node binding has [prebuilt platform binaries](https://onnxruntime.ai/docs/get-started/with-javascript/node.html).
The tested package contains Linux x64 CPU libraries totaling 35,548,416 bytes,
plus the model's 4,142,697 bytes and JS dependencies. Those components are well
below the documented [250 MB function bundle limit](https://vercel.com/docs/functions/limitations).
This arithmetic is not a measured Vercel deployment bundle: tracing and included
files must be verified. The complete multi-platform package is about 212 MiB;
exclude irrelevant OS/architecture binaries from a future function deployment.

**Measured locally on macOS arm64, Node 22.16.0 matching `.node-version`, ORT 1.24.3:**

- Runtime import 8.3 ms and session creation 13.2 ms in this filesystem-warm run.
- Two real JPEG crop fixtures: warm inference medians about 2.94 ms; p95 at most
  3.16 ms across 25 runs each. Decode/resize took about 6.7–15.7 ms.
- A deterministic 1600×1600 JPEG and twenty crop preparations/inferences took
  668 ms wall time / 700 ms process CPU time.
- Process RSS after stress was about 355 MiB. This includes harness-generated
  stress-image allocations; it is not a precise deployed per-request working set.
- Supplemental Node 24 measurements also passed. Native-module import on the
  initial uncached probe was substantially slower (~979 ms); none of these figures
  is a Vercel cold-start measurement.

See `trusted-inference-node22-measurements.json` and the supplemental Node 24 JSON.
Vercel's documented Node memory allowance offers greater headroom, but Linux
execution, actual deployment tracing, concurrency, regional storage latency,
cold starts, and account settings remain unmeasured. Use a cached session, bounded
concurrency, explicit CPU provider, and one intra/inter-op thread in an initial
approved implementation. Do not assume local throughput equals hosted throughput.

Functions consume invocations, CPU, memory and transfer under the account's plan;
[pricing](https://vercel.com/docs/functions/usage-and-pricing) and
[included usage](https://vercel.com/docs/plans/hobby) depend on account/runtime.
This approach adds no separate always-on hosting bill. It is not a guarantee of
zero operational cost or unlimited free inference; no live account quotas or
traffic budget were inspected.

## Option 3: small dedicated service

The pre-existing, unused `model_service/` prototype loads the same graph with
Python ONNX Runtime, uses a private bearer token, validates input size/geometry,
and serializes scoring. Its existing in-process FastAPI authentication/real-model
unit test passed locally (one test). No HTTP listener, container or service was
started for it. The test used the temporary Python environment's ONNX Runtime
1.32.0; its prototype requirements pin 1.24.3, so this is not a production-image test.

A dedicated CPU process gives direct control over dependencies, memory and
concurrency. Native Node or Python can load this unchanged graph; no GPU is needed
by the observed CPU operator set. Unlike an existing-project function, it requires
an independently operated host, deployment, secrets, monitoring, updates and
likely a fixed resource cost. No provider, plan or dollar amount is selected.
It is unnecessary unless existing-project deployment fails its validation.

## Numerical compatibility

Both real JPEG fixtures remain on the same sides of the legacy 0.98 cutoff.
Comparing independent Pillow and jpeg-js decoding produced a maximum absolute
score difference of 0.00026124. To distinguish decoding from graph conversion,
`ml/verify_trusted_tensors.py` then ran the ORIGINAL PyTorch architecture and
weights on the IDENTICAL jpeg-js-prepared tensors consumed by Node. Maximum
absolute error was **2.0023435354232788e-08** (two tensors), with zero legacy
threshold-decision mismatches. See `trusted-inference-tensor-parity.json`.
These are compatibility checks, not calibration or accuracy validation.

## Proposed trusted request boundary (not implemented as an endpoint)

1. A future internal worker authenticates using a server-only credential; any
   owner-triggered request validates its Supabase bearer token via Auth and checks
   ownership/admin authorization. A decoded, unverified JWT is insufficient.
2. Accept report/insect identifiers and expected revisions. Resolve bucket path,
   dimensions, accepted boxes and source hash from the database. Never trust a
   client-provided image URL, local file path, score, trust flag, or final label.
3. Retrieve bytes from the private Storage bucket with server-only credentials;
   enforce byte, pixel, crop-count and execution limits before preprocessing.
4. Verify original image/model checksums and current box revision. Store runtime,
   model/preprocessing version, inference and recording timestamps, and source
   image hash through `record_trusted_model_prediction` using service-role access.
5. Only the server's direct result can become `server_trusted`; browser observations
   use a separate restricted RPC that forces `browser_untrusted`. Browser scores
   cannot be returned to the server as proof of a trusted computation.
6. The future verification engine evaluates that evidence. Browser/native feedback
   remains immediate UX only. Keep automatic acceptance off until approved bands
   and calibration evidence exist. Do not expose service-role keys or private
   worker tokens via EXPO_PUBLIC variables, logs, frontend bundles or responses.

Use bounded classifier retries keyed by model/image/insect/revision. Do not rerun
Roboflow just because classification temporarily failed; the later integration
needs its own durable classification checkpoint/job. No such job or deadline
processor was added in M1. The unused hosted-service migration is not a prerequisite.

## Reproducing the isolated probes

No production dependency installation was changed. Native ORT was installed only
in `/private/tmp/lanterndie-trusted-inference-poc`:

```sh
npm install --prefix /private/tmp/lanterndie-trusted-inference-poc --no-save --package-lock=false onnxruntime-node@1.24.3
ONNX_POC_RUNTIME_ROOT=/private/tmp/lanterndie-trusted-inference-poc \
ONNX_POC_STRESS_JPEG=/private/tmp/lanterndie-verification-stress.jpg \
ONNX_POC_TENSOR_PREFIX=/private/tmp/lanterndie-trusted-tensor \
ONNX_POC_OUTPUT=docs/trusted-inference-node22-measurements.json \
npx --yes --package=node@22.16.0 node --experimental-strip-types scripts/feasibility/node-onnx.mjs

ONNX_POC_STRESS_JPEG=/private/tmp/lanterndie-verification-stress.jpg \
ONNX_POC_OUTPUT=docs/trusted-inference-deno-measurements.json \
npx --yes deno run --allow-read --allow-write=docs --allow-env --allow-sys scripts/feasibility/deno-wasm.mjs

# In a local environment with ml/requirements-mobile.txt and the original checkpoint:
python ml/verify_trusted_tensors.py --measurements docs/trusted-inference-node22-measurements.json
```

Runtimes can emit startup/deprecation/telemetry warnings; the recorded measurements
contain no image bytes, user tokens, or service-role credentials. Temporary probe
outputs are not packaged into the app or served as a model API.
