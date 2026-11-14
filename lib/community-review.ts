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
  if (insect.final_label) return insect.final_label === 'dead' ? 'DEAD' : 'ALIVE';
  if (insect.can_vote) return insect.my_vote ? 'You can change or remove your label until the decision is final.' : 'Is this lanternfly alive or dead?';
  if (insect.my_vote === 'uncertain') return 'Uncertain recorded. Your seat is available to another reviewer.';
  return 'No review seat is currently reserved for you. Try claiming a seat again.';
}

/** Pick one unanswered insect; one response must never label an entire photo. */
export function nextInlineReview(insects: ReviewInsect[]) {
  return insects.find(insect => !insect.final_label && insect.my_vote === null) ?? null;
}
export function validReviewBox(box: ReviewInsect['box'], width: number, height: number) {
  return [width, height, box.x, box.y, box.width, box.height].every(Number.isFinite)
    && width > 0 && height > 0 && box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0
    && box.x + box.width <= width && box.y + box.height <= height;
}
