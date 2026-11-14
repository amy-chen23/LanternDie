import type { WorkflowStatus } from './report-processing';

export type SubmissionFilter = 'all' | 'pending' | 'earned' | 'no_points';
type SubmissionSummary = { workflow_status: WorkflowStatus; verified_kills: number };

export function submissionStatusLabel(status: WorkflowStatus): string {
  if (status === 'published') return 'Published';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

export function matchesSubmissionFilter(report: SubmissionSummary, filter: SubmissionFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending') return ['pending_detection', 'pending_review', 'admin_review'].includes(report.workflow_status);
  if (filter === 'no_points' && report.workflow_status === 'rejected') return true;
  if (report.workflow_status !== 'published' || !Number.isSafeInteger(report.verified_kills) || report.verified_kills < 0) return false;
  return filter === 'earned' ? report.verified_kills > 0 : report.verified_kills === 0;
}
