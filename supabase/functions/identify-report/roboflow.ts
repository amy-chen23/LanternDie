type InferenceConfig = {
  apiKey: string;
  modelId?: string;
  workspace?: string;
  workflowId?: string;
  classes: string[];
  threshold: number;
};

export function buildInferenceRequest(config: InferenceConfig, imageBase64: string) {
  const { apiKey, modelId, workspace, workflowId, classes, threshold } = config;
  if (!apiKey || !Number.isFinite(threshold) || threshold <= 0 || threshold > 1 || !classes.length) {
    throw new Error('configuration');
  }
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
  if (workspace || workflowId) {
    if (!workspace || !workflowId || !/^[\w-]+$/.test(workspace) || !/^[\w-]+$/.test(workflowId)) {
      throw new Error('configuration');
    }
    return {
      endpoint: `https://serverless.roboflow.com/${workspace}/workflows/${workflowId}`,
      sourceId: `workflow:${workspace}/${workflowId}`,
      workflow: true,
      headers,
      body: JSON.stringify({
        inputs: { image: { type: 'base64', value: imageBase64 }, classes: classes.join(', ') },
        use_cache: true,
      }),
    };
  }
  if (!modelId || !/^[\w-]+\/[1-9]\d*$/.test(modelId)) throw new Error('configuration');
  return {
    endpoint: `https://serverless.roboflow.com/${modelId}?confidence=${threshold * 100}`,
    sourceId: modelId,
    workflow: false,
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: imageBase64,
  };
}

// REST wraps workflow results in outputs; the Python SDK unwraps this for callers.
// Segmentation predictions also have boxes; mask points are intentionally ignored.
export function unwrapWorkflowDetection(value: unknown, outputKey?: string): unknown {
  const invalid = () => { throw new Error('Invalid workflow detection response.'); };
  if (!value || typeof value !== 'object' || !('outputs' in value)) return invalid();
  const outputs = value.outputs;
  if (!Array.isArray(outputs) || outputs.length !== 1) return invalid();
  const row = outputs[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return invalid();
  const isDetection = (candidate: unknown): boolean => Boolean(candidate && typeof candidate === 'object'
    && 'image' in candidate && 'predictions' in candidate && Array.isArray(candidate.predictions));
  if (outputKey) {
    if (!Object.hasOwn(row, outputKey) || !isDetection(row[outputKey])) return invalid();
    return row[outputKey];
  }
  if (isDetection(row)) return row;
  const candidates = Object.values(row).filter(isDetection);
  if (candidates.length !== 1) return invalid();
  return candidates[0];
}
