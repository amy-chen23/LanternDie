import type { LifeStatus, VerificationState } from './verification-state.ts';
/** Restricted RPC adapter for future server workers; no live caller in milestone 1. */
type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export function createShadowVerificationService(client: RpcClient) {
  async function execute(name: string, args: Record<string, unknown>): Promise<string> {
    const { data, error } = await client.rpc(name, args);
    if (error || typeof data !== 'string') throw new Error(error?.message ?? 'verification_operation_failed');
    return data;
  }
  return {
    transition(input: { insectId: string; revision: number; expectedVersion: number; to: VerificationState;
      acceptedLifeStatus: LifeStatus | null; method: 'model' | 'admin' | 'system'; policyId: string;
      predictionId: string | null; reason: string; idempotencyKey: string }) {
      return execute('transition_shadow_verification', { p_insect_id: input.insectId, p_revision: input.revision,
        p_expected_version: input.expectedVersion, p_to: input.to, p_life_status: input.acceptedLifeStatus,
        p_method: input.method, p_policy_id: input.policyId, p_prediction_id: input.predictionId,
        p_reason: input.reason, p_key: input.idempotencyKey });
    },
    recordCredit(input: { insectId: string; decisionId: string; to: 'PROVISIONAL' | 'HELD' | 'FINALIZED' | 'REVERSED';
      idempotencyKey: string; reason: string }) {
      return execute('record_shadow_credit_event', { p_insect_id: input.insectId, p_decision_id: input.decisionId,
        p_to: input.to, p_key: input.idempotencyKey, p_reason: input.reason });
    },
  };
}
