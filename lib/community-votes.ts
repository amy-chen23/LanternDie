export type InsectVoteSummary = {
  insect_id: string;
  revision: number;
  final_label: 'alive' | 'dead' | null;
  alive_votes: number | null;
  dead_votes: number | null;
  uncertain_votes: number | null;
};

export function voteDistribution(summary: InsectVoteSummary) {
  const counts = [summary.alive_votes, summary.dead_votes, summary.uncertain_votes];
  if (counts.some(count => count === null || !Number.isSafeInteger(count) || count < 0)) return null;
  const total = counts.reduce<number>((sum, count) => sum + count!, 0);
  return {
    total,
    options: (['alive', 'dead', 'uncertain'] as const).map((label, index) => ({
      label, count: counts[index]!, percent: total ? Math.round(counts[index]! / total * 100) : 0,
    })),
  };
}
