import type { Report } from './reports';
import type { Box } from './death-policy';
import policy from '../assets/models/policy.json' with { type: 'json' };

type AssessmentReport = Pick<Report, 'workflow_status' | 'processing' | 'identification' | 'death_assessment'>;
export function currentAssessment(report: AssessmentReport) {
  const assessment = report.death_assessment;
  return assessment && assessment.detector_updated_at === report.identification?.updated_at
    && assessment.model_sha256 === policy.modelSha256 ? assessment : null;
}
export function assessmentComplete(report: AssessmentReport) {
  const assessment = currentAssessment(report);
  return assessment?.status === 'complete' && report.identification?.status === 'detected'
    && assessment.threshold === policy.threshold
    && assessment.scores.length === report.identification.detections.length
    && assessment.scores.length > 0
    && assessment.scores.every(score => Number.isFinite(score) && score >= 0 && score <= 1);
}
export function canAssessReport(report: AssessmentReport) {
  return report.workflow_status !== 'rejected' && report.processing?.status !== 'duplicate'
    && report.identification?.status === 'detected' && report.identification.detections.length > 0;
}
export function shouldAutoAssess(report: AssessmentReport, runtimeAvailable: boolean) {
  return runtimeAvailable && canAssessReport(report) && !assessmentComplete(report)
    && currentAssessment(report)?.status !== 'failed';
}

export type ClassificationLabel = 'DEAD' | 'ALIVE' | 'LIKELY DEAD' | 'UNCERTAIN';

export function classificationLabel(finalLabel: 'alive' | 'dead' | 'pending' | null, score?: number, threshold?: number): ClassificationLabel {
  if (finalLabel === 'dead') return 'DEAD';
  if (finalLabel === 'alive') return 'ALIVE';
  return Number.isFinite(score) && score! >= 0 && score! <= 1
    && Number.isFinite(threshold) && threshold! >= 0 && threshold! <= 1
    && score! >= threshold! ? 'LIKELY DEAD' : 'UNCERTAIN';
}

export function classificationForBox(report: Report, box: Box, finalLabel: 'alive' | 'dead' | 'pending' | null = null): ClassificationLabel {
  const assessment = report.death_assessment;
  if (!assessmentComplete(report) || !assessment || !report.identification) {
    return classificationLabel(finalLabel);
  }
  const index = report.identification.detections.findIndex(original => original.x === box.x && original.y === box.y
    && original.width === box.width && original.height === box.height);
  return classificationLabel(finalLabel, assessment.scores[index], assessment.threshold);
}

export function summarizeClassifications(labels: ClassificationLabel[]): string {
  if (!labels.length) return 'No lanternfly detected';
  const counts = new Map<ClassificationLabel, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const groups = Array.from(counts, ([label, count]) => `${count} ${label} lanternfl${count === 1 ? 'y' : 'ies'}`);
  const last = groups.pop()!;
  return `${groups.length ? `${groups.join(', ')} and ` : ''}${last} detected`;
}

export function reportClassificationSummary(report: Report): string {
  const labels = report.insects_ready || report.insects.length
    ? report.insects.map(insect => classificationForBox(report, insect.box, insect.label))
    : report.identification?.detections.map(box => classificationForBox(report, box)) ?? [];
  return summarizeClassifications(labels);
}
