export type ReviewLabel = 'alive' | 'dead' | 'uncertain';
export type ReviewInsect = {
  insect_id: string;
  revision: number;
  box: { x: number; y: number; width: number; height: number };
  final_label: 'alive' | 'dead' | null;
  my_vote: ReviewLabel | null;
  can_vote: boolean;
  feedback: { alive_votes: number; dead_votes: number; uncertain_votes: number; model_score: number | null } | null;
};
export function reviewFinished(insects: ReviewInsect[]) {
  return insects.length > 0 && insects.every(insect => insect.final_label !== null);
}
export function reviewActionMessage(insect: ReviewInsect) {
  if (insect.final_label) return `Final decision: ${insect.final_label === 'dead' ? 'Dead' : 'Alive'}. Only an admin can change it.`;
  if (insect.can_vote) return insect.my_vote ? 'You can change or remove your label until the decision is final.' : 'Is this lanternfly alive or dead?';
  if (insect.my_vote === 'uncertain') return 'Uncertain recorded. Your seat is available to another reviewer.';
  return 'No review seat is currently reserved for you. Try claiming a seat again.';
}
