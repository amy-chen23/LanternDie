import { supabase } from './supabase';
import type { ReviewInsect, ReviewLabel } from './community-review';
import type { InsectVoteSummary } from './community-votes';

export async function loadReportVoteSummary(reportId: string): Promise<InsectVoteSummary[]> {
  if (!supabase) throw new Error('Sign in to view community votes.');
  const { data, error } = await supabase.rpc('get_report_vote_summary', { p_report_id: reportId });
  if (error || !Array.isArray(data)) throw new Error('Community votes could not load. Please retry.');
  return data as InsectVoteSummary[];
}

export async function loadReportReview(reportId: string, claim = false): Promise<ReviewInsect[]> {
  if (!supabase) throw new Error('Sign in to review reports.');
  const { data, error } = await supabase.rpc(claim ? 'claim_report_review' : 'get_report_review', { p_report_id: reportId });
  if (error || !Array.isArray(data)) throw new Error('Review unavailable. Refresh the queue; you must have used the app in the past 14 days and cannot review your own report.');
  return data as ReviewInsect[];
}
export async function saveInsectReview(insect: ReviewInsect, label: ReviewLabel | null) {
  if (!supabase) throw new Error('Sign in to review reports.');
  const { error } = await supabase.rpc('set_insect_review_vote', {
    p_insect_id: insect.insect_id, p_revision: insect.revision, p_label: label,
  });
  if (error) throw new Error('Could not save this label. The box, review seat, or final decision may have changed. Refresh this review.');
}
export async function releaseReportReview(reportId: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc('release_report_review', { p_report_id: reportId });
  if (error) throw new Error('Could not release your review seats. They will expire automatically.');
}

/** Check only visible Explore posts; do not reserve seats or depend on queue pagination. */
export async function loadReviewableReportIds(reportIds: string[]): Promise<string[]> {
  if (!supabase || !reportIds.length) return [];
  const ids = [...new Set(reportIds)];
  const { data, error } = await supabase.from('report_verification_queue').select('id').in('id', ids);
  if (error || !Array.isArray(data)) throw new Error('Review prompts could not load. Refresh the feed to try again.');
  return data.map(row => row.id).filter(id => typeof id === 'string' && ids.includes(id));
}
