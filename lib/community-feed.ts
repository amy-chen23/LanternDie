import type { Report } from './reports';

export const communityFeedStatuses = ['pending_detection', 'pending_review', 'admin_review', 'published'] as const;

export function communityApproval(report: Pick<Report, 'workflow_status' | 'insects_ready' | 'insects'>): 'approved' | 'pending' | 'rejected' {
  if (report.workflow_status === 'rejected') return 'rejected';
  return report.workflow_status === 'published' && report.insects_ready && report.insects.length > 0
    && report.insects.every(insect => insect.label === 'alive' || insect.label === 'dead') ? 'approved' : 'pending';
}

export function confirmedInsectCounts(report: Pick<Report, 'workflow_status' | 'insects_ready' | 'insects'>) {
  if (communityApproval(report) !== 'approved') return null;
  return {
    alive: report.insects.filter(insect => insect.label === 'alive').length,
    dead: report.insects.filter(insect => insect.label === 'dead').length,
  };
}
