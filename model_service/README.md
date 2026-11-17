> Retired, unused service prototype. The active application uses Roboflow detection only,
> with no alive/dead classifier. Do not deploy this service; follow the
> [current application documentation](../docs/README.md). Commands below describe
> the archived experiment, not the current deployment.

# Automatic upload checks

Every upload is one user action. The database saves a durable job and immediately
wakes `process-report-jobs` through pg_net after commit. The worker hashes the
stored JPEG, rejects exact duplicates, runs Roboflow, then calls this classifier
for all qualifying boxes. Completion and server scores are committed together.
The UI polls progress and displays results without a Start/Identify/Assess click.
Viewing results and submitting a human review are still user actions.

The classifier uses `assets/models/lanternfly-dead.onnx`, exported from the
existing `_work/checkpoints/runs/.../classifier.pt`. Its source-checkpoint hash
matches the local checkpoint at implementation time. It does not retrain or alter
weights. FastAPI loads and validates the model once per process, then runs CPU
ONNX inference. It accepts only authenticated worker requests, bounded JPEG
payloads, matching dimensions, and up to 20 in-bounds boxes. No images are stored
by this service and payloads/credentials are not logged. The runtime pads/resizes
each box exactly as the native pipeline; the JPEG/preprocessing validation caveats
from `ml/INTEGRATION.md` still apply.

## Required rollout (not yet performed)

1. Deploy this service to a CPU container host with HTTPS. From the repository root:

   ```sh
   docker build -f model_service/Dockerfile -t lanterndie-classifier .
   ```

   Set a random server-only `CLASSIFIER_TOKEN` of at least 32 characters in the
   host's secret settings. The container listens on port 8000. `/health` reports
   readiness after the model checksum and reference prediction pass. `/score`
   requires `Authorization: Bearer <CLASSIFIER_TOKEN>`. Host choice and any costs
   require a separate decision; no free hosting or public endpoint was provisioned.

2. Set these Supabase Edge Function secrets (never EXPO_PUBLIC variables):

   - `CLASSIFIER_URL`: the HTTPS endpoint ending in `/score` (no query parameters).
   - `CLASSIFIER_TOKEN`: the same private token.
   - `CLASSIFIER_MODEL_SHA256`: `57306c1814b9b173996d6650854e0ff0df9346381e2d5c3b852fe13f5091948d`.

3. Apply `20261116000000_automatic_model_pipeline.sql`, then redeploy the
   `process-report-jobs` function. Deploy the matching client only after migrating;
   it reads the new server result table. Keep the existing pg_cron recovery job.
   Re-run `supabase/operations/schedule-report-worker.sql` to extend its HTTP timeout
   for the two model stages. pg_net and the existing Vault `project_url` and
   `report_worker_secret` are needed for immediate dispatch. Missing wake-up config
   does not lose uploads; Cron can still process durable jobs. Cold starts, queues,
   and network latency mean immediate dispatch is not instant completion.

4. Test a new upload from Expo Go or the website: it should start checking on its
   own, run detection and classification, and reach human review. No custom native
   runtime is required for this server path. Try duplicates, no detections, multiple
   insects, navigation/restart, and temporary classifier outages.

Do not deploy the updated worker with missing classifier configuration: detected
photos will retry and eventually route to admin attention. No hosted inference
service exists yet, and this code change alone does not activate the live pipeline.
Previously completed detection-only reports are not silently rescored by this
migration; the new chain applies to queued/new work.

## Recovery, decisions, and privacy

Detection results are checkpointed in the private job record before classification.
Transient failures retry under the existing durable lease/backoff policy, reusing
the detector result. A stale worker cannot checkpoint/finish after losing its
lease. The global exact-photo hash check still precedes model calls. After retry
exhaustion the existing admin path applies; the user is never required to click
something to start ordinary processing. The existing technical-retry control is
only recovery after an exhausted failure, not a model-start button.

Server scores are owner/admin-only in `report_model_assessments`, distinct from
legacy untrusted phone scores. Reviewers do not see model suggestions. The existing
human consensus/admin decisions, publication, credit rules, and manual corrections
remain authoritative. A 0.98 score-cutoff crossing is only a suggestion while model
approval is disabled. Low scores mean uncertain, not confirmed alive. Classification
failure is never recorded as a low score or successful completion.

Local test commands:

```sh
confidence-training/.venv/bin/python -m pip install -r model_service/requirements.txt httpx
confidence-training/.venv/bin/python -m unittest discover -s tests -p 'test_model_service.py'
npm run typecheck
npm test
```

For manual local serving, set `CLASSIFIER_TOKEN` privately in your shell and run
`confidence-training/.venv/bin/python -m uvicorn model_service.app:app --host 127.0.0.1 --port 8000`.
The hosted worker requires a reachable HTTPS deployment, not localhost. No secret
or endpoint is embedded in the client. The SQL test uses fake pg_net/Vault objects
and does not contact a real service.
