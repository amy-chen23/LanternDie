import type { WorkflowStatus } from './report-processing';

export type SubmissionFilter = 'all' | 'pending' | 'published' | 'rejected';

export function submissionStatusLabel(status: WorkflowStatus): string {
  if (status === 'published') return 'Published';
  if (status === 'rejected') return 'Rejected';
  return 'Pending';
}

export function matchesSubmissionFilter(status: WorkflowStatus, filter: SubmissionFilter): boolean {
  return filter === 'all' || submissionStatusLabel(status).toLowerCase() === filter;
}
