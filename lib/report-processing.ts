export type WorkflowStatus = 'pending_detection' | 'pending_review' | 'admin_review' | 'published' | 'rejected';
export type ProcessingStatus = {
  report_id: string;
  status: 'queued' | 'running' | 'retry' | 'complete' | 'duplicate' | 'failed';
  attempts: number;
  available_at: string;
  last_error_code: string | null;
  updated_at: string;
};
export function reportProcessingMessage(workflow: WorkflowStatus, job: ProcessingStatus | null): string {
  if (job?.status === 'duplicate') return 'Exact duplicate photo. This submission cannot be published.';
  if (workflow === 'rejected') return 'Report rejected. No kill credit awarded.';
  if (workflow === 'published') return 'Published to the community feed.';
  if (job?.status === 'queued') return 'Photo saved. Waiting for background checks.';
  if (job?.status === 'running') return 'Checking your photo. You can leave this screen.';
  if (job?.status === 'retry') return 'Checks were interrupted. We will retry automatically.';
  if (job?.status === 'failed') return 'Checks could not finish. Awaiting admin review; you can retry after 15 minutes.';
  if (workflow === 'admin_review') return 'Awaiting admin review.';
  if (workflow === 'pending_review') return 'Awaiting alive/dead review. Your report will publish when every insect has a final decision.';
  return 'Photo saved. Background checks are pending.';
}
export function hasPendingProcessing(jobs: (ProcessingStatus | null)[]) {
  return jobs.some(job => job && ['queued', 'running', 'retry'].includes(job.status));
}
