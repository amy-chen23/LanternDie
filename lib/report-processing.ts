export type WorkflowStatus = 'pending_detection' | 'pending_review' | 'admin_review' | 'published' | 'rejected';
export type ProcessingStatus = {
  report_id: string;
  status: 'queued' | 'running' | 'retry' | 'complete' | 'duplicate' | 'failed';
  attempts: number;
  available_at: string;
  last_error_code: string | null;
  updated_at: string;
  stage?: 'detection' | 'classification';
};
export function reportProcessingMessage(workflow: WorkflowStatus, job: ProcessingStatus | null): string {
  if (job?.status === 'duplicate') return 'Exact duplicate photo. This submission cannot be published.';
  if (workflow === 'rejected') return 'Report rejected. No kill credit awarded.';
  if (workflow === 'published') return 'Published to the community feed.';
  if (job?.status === 'queued') return 'Photo uploaded. Checks start automatically—you can leave this screen.';
  if (job?.status === 'running') return 'Checking your photo automatically. You can leave this screen.';
  if (job?.status === 'retry') return 'Checks were interrupted. We will retry automatically.';
  if (job?.status === 'failed') return 'Detection could not finish. You can retry after 15 minutes.';
  if (workflow === 'admin_review') return 'Detection results are unavailable.';
  if (workflow === 'pending_review') return 'Lanternfly detection complete.';
  return 'Photo saved. Background checks are pending.';
}
export function hasPendingProcessing(jobs: (ProcessingStatus | null)[]) {
  return jobs.some(job => job && ['queued', 'running', 'retry'].includes(job.status));
}
