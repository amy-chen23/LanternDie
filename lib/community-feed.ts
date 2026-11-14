import type { Report } from './reports';

export const communityFeedStatuses = ['pending_detection', 'pending_review', 'admin_review', 'published'] as const;

export function communityApproval(report: Pick<Report, 'workflow_status' | 'insects_ready' | 'insects'>): 'approved' | 'pending' | 'rejected' {
  if (report.workflow_status === 'rejected') return 'rejected';
  return report.workflow_status === 'published' && report.insects_ready && report.insects.length > 0
    && report.insects.every(insect => insect.label === 'alive' || insect.label === 'dead') ? 'approved' : 'pending';
}

/** Presentation only: rejection wins; any confirmed DEAD insect makes a mixed card green. */
export function communityTone(report: Pick<Report, 'workflow_status' | 'insects'>): 'dead' | 'neutral' | 'rejected' {
  if (report.workflow_status === 'rejected') return 'rejected';
  return report.insects.some(insect => insect.label === 'dead') ? 'dead' : 'neutral';
}
