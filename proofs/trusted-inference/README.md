# Isolated shadow inference proof

Retired local experiment, not part of the application. Historical milestone
documents/measurement JSON files were removed from docs; old commands below may
require archived evidence. See [current application documentation](../../docs/README.md).
This folder is not part of the Expo build, root `/api`, or existing Vercel config.
Nothing here automatically deploys. No frontend or worker calls this endpoint.

Use Node 22 (the project's `.node-version`):

```sh
npm ci --prefix proofs/trusted-inference
node --experimental-strip-types --test tests/trusted-inference-poc.test.mjs
node --experimental-strip-types proofs/trusted-inference/test-runtime.mjs
node proofs/trusted-inference/build.mjs linux-x64
```

The build prints a **new** external temporary Build Output location. It refuses
existing output directories and workspace output. Its private model and native
libraries are inside the function mount; it creates no static assets. `linux-x64`
is the hosted candidate, not a Linux execution test. `darwin-arm64` is for local
execution only and MUST NOT be deployed to Vercel.

For the local packaged test on macOS arm64, select a fresh output path:

```sh
node proofs/trusted-inference/build.mjs darwin-arm64 /private/tmp/lanterndie-shadow-local/.vercel/output
node proofs/trusted-inference/test-packaged.mjs /private/tmp/lanterndie-shadow-local/.vercel/output/functions/api/shadow-inference.func/index.mjs
```

This runner requires local `initdb`, `pg_ctl`, and `psql`. It creates its own
loopback-only disposable PostgreSQL cluster, loads repository fixtures, executes
real M1 RPCs, and removes the cluster. Auth and Storage are explicitly stubbed;
no hosted credentials are read. It runs the packaged handler with Node's request/
response contract, not an actual Vercel launcher. The benchmark writes
`docs/milestone-2a-local-results.json`.

`test-runtime.mjs` writes native crop references and temporary prepared tensors.
Compare these with preserved original PyTorch weights (local Python env required):

```sh
python ml/verify_trusted_tensors.py --tensors-prefix /private/tmp/lanterndie-m2a-tensor --measurements docs/milestone-2a-native-parity.json --output docs/milestone-2a-pytorch-parity.json
npm run build:web
npm run test:browser
```

Browser tests include the full/interior crop comparison with those native references.
The existing fixture/model artifacts are preserved. Native inference dependencies
are isolated in this package/lockfile; Python is never included in a function.

Future approved preview request contract:

```http
POST /api/shadow-inference
Authorization: Bearer <Supabase access token>
Content-Type: application/json

{"reportId":"<uuid>","insectId":"<uuid>","revision":1}
```

Only the three shown fields are accepted. No user-supplied image URLs/paths,
geometry, model scores, labels, provenance, or idempotency keys. Successful JSON
contains `shadowOnly: true`, a prediction UUID, raw score and provenance metadata;
`predictedLifeStatus` is deliberately null. Errors use stable generic codes,
`shadowOnly: true`, and `Cache-Control: no-store`. No CORS is enabled. Do not use
service-role credentials in a browser, test client, or public environment variable.
