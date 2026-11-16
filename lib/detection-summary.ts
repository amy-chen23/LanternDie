import type { Report } from './reports';

/** Detection results describe insects only; human decisions live in review tags. */
export function reportDetectionSummary(report: Pick<Report, 'insects_ready' | 'insects' | 'identification'>): string {
  const count = report.insects_ready || report.insects.length
    ? report.insects.length
    : report.identification?.status === 'detected' ? report.identification.detections.length : 0;
  return count ? `${count} lanternfl${count === 1 ? 'y' : 'ies'} detected` : 'No lanternfly detected';
}
