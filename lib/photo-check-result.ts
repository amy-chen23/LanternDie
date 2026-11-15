import type { Report } from './reports';

type PhotoCheckReport = Pick<Report, 'workflow_status' | 'identification' | 'processing' | 'insects_ready' | 'insects'>;

export function photoCheckResult(report: PhotoCheckReport): { title: string; explanation: string; nextSteps: string } | null {
  if (report.processing?.status === 'duplicate') return {
    title: 'Duplicate photo',
    explanation: 'This photo matches an existing submission. Photo checks were not run again.',
    nextSteps: 'This submission will not be published and earns no kill credit. You can delete it or submit a different photo of a new sighting.',
  };
  if (report.identification?.status !== 'not_detected' || report.insects_ready || report.insects.length > 0) return null;
  if (report.processing && ['queued', 'running', 'retry', 'failed'].includes(report.processing.status)) return null;

  const result = {
    title: 'No lanternfly detected',
    explanation: 'Automated photo checks did not detect a lanternfly in this image. A lanternfly may have been missed.',
  };
  if (report.workflow_status === 'rejected') return {
    ...result,
    nextSteps: 'This submission was rejected. It will not be published and earns no kill credit. You can delete it or submit a new sighting with a clearer photo of a lanternfly.',
  };
  if (report.workflow_status === 'published') return {
    ...result,
    nextSteps: 'This submission is published following review. The automated photo check alone does not determine publication.',
  };
  return {
    ...result,
    nextSteps: 'Pending review — this submission is not published yet. An admin can check for a missed lanternfly. No action is needed while you wait; you can also submit a clearer photo as a new sighting.',
  };
}
