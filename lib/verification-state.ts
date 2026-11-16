/** Milestone 1 shadow definitions. Deliberately not imported by live workflows. */
export const verificationStates = ['PENDING', 'AI_CLASSIFIED', 'PROVISIONAL', 'COMMUNITY_REVIEW', 'CONTESTED', 'VERIFIED', 'INCONCLUSIVE', 'REJECTED'] as const;
export type VerificationState = typeof verificationStates[number];
export type LifeStatus = 'ALIVE' | 'DEAD';
export const transitions: Readonly<Record<VerificationState, readonly VerificationState[]>> = {
  PENDING: ['AI_CLASSIFIED', 'COMMUNITY_REVIEW', 'INCONCLUSIVE', 'REJECTED'],
  AI_CLASSIFIED: ['PROVISIONAL', 'COMMUNITY_REVIEW', 'INCONCLUSIVE', 'REJECTED'],
  PROVISIONAL: ['VERIFIED', 'CONTESTED', 'INCONCLUSIVE', 'REJECTED'],
  COMMUNITY_REVIEW: ['PROVISIONAL', 'CONTESTED', 'INCONCLUSIVE', 'REJECTED'],
  CONTESTED: ['PROVISIONAL', 'VERIFIED', 'INCONCLUSIVE', 'REJECTED'],
  VERIFIED: ['CONTESTED'],
  INCONCLUSIVE: ['AI_CLASSIFIED', 'COMMUNITY_REVIEW', 'REJECTED'],
  REJECTED: ['CONTESTED', 'COMMUNITY_REVIEW'],
};
export function canTransition(from: string, to: string): boolean {
  return Object.hasOwn(transitions, from) && transitions[from as VerificationState].includes(to as VerificationState);
}
export type VerificationBands = {
  highAliveMax: number | null; mediumAliveMax: number | null;
  mediumDeadMin: number | null; highDeadMin: number | null;
};
export type VerificationPolicy = VerificationBands & {
  autoAcceptanceEnabled: boolean; calibrationApproved: boolean;
  reviewWindowSeconds: number; reviewSeats: number; matchingVotes: number;
};
export const defaultVerificationPolicy: Readonly<VerificationPolicy> = Object.freeze({
  highAliveMax: null, mediumAliveMax: null, mediumDeadMin: null, highDeadMin: null,
  autoAcceptanceEnabled: false, calibrationApproved: false,
  reviewWindowSeconds: 24 * 60 * 60, reviewSeats: 5, matchingVotes: 3,
});
export function bandsConfigured(policy: VerificationBands): boolean {
  const { highAliveMax: a, mediumAliveMax: b, mediumDeadMin: c, highDeadMin: d } = policy;
  return [a,b,c,d].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)
    && a! <= b! && b! < c! && c! <= d!;
}
/** Bands operate on a raw score, never a calibrated accuracy/probability claim. */
export function classifyRawScore(score: number, policy: VerificationPolicy, trusted: boolean) {
  if (!Number.isFinite(score) || score < 0 || score > 1) throw new Error('invalid_raw_score');
  if (!policy.calibrationApproved || !bandsConfigured(policy)) {
    return { band: 'UNCONFIGURED' as const, predictedLifeStatus: null, autoAcceptEligible: false };
  }
  let band: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  let predictedLifeStatus: LifeStatus | null = null;
  if (score >= policy.highDeadMin!) { band = 'HIGH'; predictedLifeStatus = 'DEAD'; }
  else if (score <= policy.highAliveMax!) { band = 'HIGH'; predictedLifeStatus = 'ALIVE'; }
  else if (score >= policy.mediumDeadMin!) { band = 'MEDIUM'; predictedLifeStatus = 'DEAD'; }
  else if (score <= policy.mediumAliveMax!) { band = 'MEDIUM'; predictedLifeStatus = 'ALIVE'; }
  return { band, predictedLifeStatus, autoAcceptEligible: trusted && policy.autoAcceptanceEnabled && band === 'HIGH' };
}
