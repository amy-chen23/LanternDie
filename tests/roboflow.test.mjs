import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInferenceRequest, unwrapWorkflowDetection } from '../supabase/functions/identify-report/roboflow.ts';
import { parseDetectionResponse } from '../supabase/functions/identify-report/detection.ts';

const config = {
  apiKey: 'test-key-only', workspace: 'testing-workspace-3pknz', workflowId: 'general-segmentation-api-2',
  classes: ['Adult Spotted Lanternfly', 'Early Nymph Spotted Lanternfly', 'Late Nymph Spotted Lanternfly'], threshold: 0.5,
};
const prediction = { image: { width: 200, height: 100 }, predictions: [
  { class: config.classes[0], confidence: 0.8, x: 100, y: 50, width: 40, height: 20, points: [{ x: 80, y: 40 }] },
] };

test('matches the supplied workflow inputs and sends credentials only in the auth header', () => {
  const request = buildInferenceRequest(config, 'aW1hZ2U=');
  assert.equal(request.endpoint, 'https://serverless.roboflow.com/testing-workspace-3pknz/workflows/general-segmentation-api-2');
  assert.equal(request.headers.Authorization, 'Bearer test-key-only');
  assert.equal(request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(request.body), {
    inputs: { image: { type: 'base64', value: 'aW1hZ2U=' }, classes: config.classes.join(', ') }, use_cache: true,
  });
  assert.equal(request.sourceId, 'workflow:testing-workspace-3pknz/general-segmentation-api-2');
  assert.ok(!request.endpoint.includes(config.apiKey) && !request.body.includes(config.apiKey));
});

test('direct detectors remain supported when workflow settings are absent', () => {
  const request = buildInferenceRequest({ ...config, workspace: undefined, workflowId: undefined, modelId: 'lanternfly/2' }, 'aW1hZ2U=');
  assert.equal(request.endpoint, 'https://serverless.roboflow.com/lanternfly/2?confidence=50');
  assert.equal(request.workflow, false);
  assert.equal(request.headers.Authorization, 'Bearer test-key-only');
  assert.equal(request.body, 'aW1hZ2U=');
});

test('incomplete or unsafe workflow configuration fails without falling back to another model', () => {
  for (const patch of [
    { apiKey: '' }, { workspace: undefined }, { workflowId: undefined }, { workflowId: '../other' },
    { threshold: NaN }, { threshold: 0 }, { threshold: 1.1 }, { classes: [] },
  ]) assert.throws(() => buildInferenceRequest({ ...config, ...patch }, ''), /configuration/);
});

test('unwraps named segmentation output and converts its boxes for display', () => {
  const result = parseDetectionResponse(unwrapWorkflowDetection({ outputs: [{ predictions: prediction, visualization: { type: 'base64', value: 'ignored' } }] }), config.classes, config.threshold);
  assert.deepEqual(result.detections, [
    { label: config.classes[0], confidence: 0.8, x: 80, y: 40, width: 40, height: 20 },
  ]);
});

test('accepts direct detection fields in a workflow output row', () => {
  assert.equal(unwrapWorkflowDetection({ outputs: [prediction] }), prediction);
});

test('empty predictions inside valid workflow output means no detections', () => {
  const empty = { ...prediction, predictions: [] };
  assert.deepEqual(parseDetectionResponse(unwrapWorkflowDetection({ outputs: [{ result: empty }] }), config.classes, 0.5).detections, []);
});

test('multiple detection outputs require an explicit output key', () => {
  const response = { outputs: [{ first: prediction, second: prediction }] };
  assert.throws(() => unwrapWorkflowDetection(response), /Invalid workflow/);
  assert.equal(unwrapWorkflowDetection(response, 'second'), prediction);
  assert.throws(() => unwrapWorkflowDetection(response, 'missing'), /Invalid workflow/);
});

test('missing, malformed, or batched workflow output cannot silently mean no lanternflies', () => {
  for (const response of [null, {}, { outputs: [] }, { outputs: [null] }, { outputs: [prediction, prediction] },
    { outputs: [{ visualization: 'base64' }] }, { outputs: [{ predictions: [] }] },
  ]) assert.throws(() => unwrapWorkflowDetection(response), /Invalid workflow/);
});
