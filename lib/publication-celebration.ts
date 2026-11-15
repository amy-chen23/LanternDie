type PublishedReport = { id: string; user_id: string; visibility: string; workflow_status: string; verified_kills: number };
export type PublicationLedger = Record<string, boolean>;
export type PublicationCelebration = { reportId: string; deadCount: number };

/** Seed historical publications quietly; celebrate later confirmed publications once. */
export function publicationUpdates(ledger: PublicationLedger | null, reports: PublishedReport[], userId: string) {
  const next = { ...ledger };
  const celebrations: PublicationCelebration[] = [];
  let changed = ledger === null;
  for (const report of reports) {
    if (report.user_id !== userId) continue;
    const publishedDead = report.workflow_status === 'published' && report.visibility === 'public'
      && Number.isInteger(report.verified_kills) && report.verified_kills > 0;
    const known = Object.hasOwn(next, report.id);
    if (next[report.id] === true) continue;
    if (publishedDead && ledger !== null) celebrations.push({ reportId: report.id, deadCount: report.verified_kills });
    if (!known || publishedDead) { next[report.id] = publishedDead; changed = true; }
  }
  return { ledger: changed ? next : ledger!, celebrations, changed };
}

export function parsePublicationLedger(value: string | null): PublicationLedger | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
        || !Object.values(parsed).every(item => typeof item === 'boolean')) return null;
    return parsed as PublicationLedger;
  } catch { return null; }
}
