import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../lib/typography';
import { identifyReport } from '../lib/identification';
import type { Report } from '../lib/reports';
import { reportProcessingMessage } from '../lib/report-processing';
import { photoCheckResult } from '../lib/photo-check-result';

export function identificationActionLabel(report: Report): 'Results' | 'Processing' | 'Unavailable' {
  if (photoCheckResult(report)) return 'Results';
  if (report.processing && ['queued', 'running', 'retry'].includes(report.processing.status)) return 'Processing';
  if (report.processing?.status === 'failed' || report.identification?.status === 'failed') return 'Unavailable';
  if (report.identification?.status === 'processing' || report.workflow_status === 'pending_detection') return 'Processing';
  return report.identification || report.insects_ready || report.insects.length ? 'Results' : 'Unavailable';
}

function identificationTitle(report: Report) {
  const photoResult = photoCheckResult(report);
  if (photoResult) return photoResult.title;
  const result = report.identification;
  const action = identificationActionLabel(report);
  if (action === 'Processing') return 'Photo checks pending';
  if (action === 'Unavailable') return 'Identification unavailable';
  if (report.insects_ready || report.insects.length) return report.insects.length
    ? `${report.insects.length} lanternfl${report.insects.length === 1 ? 'y' : 'ies'} detected` : 'No active insect boxes';
  return !result ? 'Lanternfly identification not run'
    : result.status === 'processing' ? 'Identification in progress'
    : result.status === 'failed' ? 'Identification unavailable'
    : result.status === 'not_detected' ? 'No lanternfly detected'
    : `${result.detections.length} lanternfl${result.detections.length === 1 ? 'y' : 'ies'} detected`;
}

export function IdentificationResultsModal({ report, onClose, error }: {
  report: Report | null;
  onClose: () => void;
  error?: string;
}) {
  if (!report) return null;
  const result = report.identification;
  const photoResult = photoCheckResult(report);
  const authoritative = report.insects_ready || report.insects.length > 0;
  const boxes = authoritative ? report.insects.map(insect => insect.box) : result?.detections ?? [];
  const hasBoxes = result && result.image_width && result.image_height;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.dialog} accessibilityViewIsModal>
        <View style={styles.dialogHeader}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>PHOTO RESULTS</Text>
            <Text accessibilityRole="header" style={styles.dialogTitle}>{error ? 'Identification unavailable' : identificationTitle(report)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close identification results" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.dialogContent}>
          <Text style={styles.note}>Lanternfly detection and community verification are separate checks.</Text>
          {photoResult ? <View style={styles.resultSummary}>
            <Text style={styles.title}>{photoResult.title}</Text>
            <Text style={styles.note}>{photoResult.explanation}</Text>
            <Text style={styles.title}>What happens next</Text>
            <Text style={styles.note}>{photoResult.nextSteps}</Text>
          </View> : null}
          {report.photo_url ? <View style={{ width: '100%', aspectRatio: hasBoxes ? result.image_width! / result.image_height! : 4 / 3 }}>
            <Image source={{ uri: report.photo_url }} resizeMode={hasBoxes ? 'stretch' : 'contain'} style={StyleSheet.absoluteFill} accessibilityLabel="Submitted photo with numbered lanternfly detection boxes" />
            {hasBoxes ? boxes.map((box, index) => <View key={index} pointerEvents="none" style={[styles.box, {
              left: `${box.x / result.image_width! * 100}%`, top: `${box.y / result.image_height! * 100}%`,
              width: `${box.width / result.image_width! * 100}%`, height: `${box.height / result.image_height! * 100}%`,
            }]}><Text style={styles.boxNumber}>{index + 1}</Text></View>) : null}
          </View> : null}
          {authoritative ? report.insects.map((insect, index) => <Text key={insect.id} style={styles.note}>
            {index + 1}. {insect.label === 'pending' ? 'Awaiting alive/dead review' : insect.label === 'dead' ? 'Verified dead' : 'Verified alive'}
          </Text>) : result?.detections.map((box, index) => <Text key={index} style={styles.note}>
            {index + 1}. {box.label} · {Math.round(box.confidence * 100)}% detection confidence
          </Text>)}
          {result?.status === 'detected' || result?.status === 'not_detected' ? <Text style={styles.note}>
            Detection threshold: {Math.round((result.confidence_threshold ?? 0) * 100)}%. This measures identification, not death.
          </Text> : null}
          {identificationActionLabel(report) === 'Processing' ? <Text style={styles.note}>Photo checks are pending. Close these results and refresh the feed or report list for updates.</Text> : null}
          {error || result?.error_message ? <Text accessibilityRole="alert" style={styles.error}>{error || result?.error_message}</Text> : null}
          {(!result || result.status === 'failed') && !photoResult ? <Text style={styles.note}>Results are not available yet. For technical failures, the report owner can retry checks from My submissions after 15 minutes.</Text> : null}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.doneButton}><Text style={styles.doneText}>Done</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

export function ReportIdentification({ report, onChanged, actionsOnly = false }: {
  report: Report;
  onChanged?: () => Promise<void>;
  actionsOnly?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const result = report.identification;
  const complete = report.processing?.status !== 'duplicate' && report.workflow_status !== 'pending_detection'
    && (result?.status === 'detected' || result?.status === 'not_detected');
  const processing = result?.status === 'processing';
  const title = identificationTitle(report);
  const photoResult = photoCheckResult(report);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await identifyReport(report.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Identification failed. Please retry.');
    } finally {
      try {
        await onChanged?.();
      } catch {
        setError('Could not refresh identification. Refresh your reports to try again.');
      } finally { setBusy(false); }
    }
  }

  const canRetry = report.processing?.status === 'failed' && onChanged;
  if (actionsOnly && !canRetry && !error && !photoResult) return null;

  return <View style={styles.section}>
    {actionsOnly && photoResult ? <>
      <Text style={styles.eyebrow}>RESULTS</Text>
      <Text accessibilityLiveRegion="polite" style={styles.title}>{photoResult.title}</Text>
      <Text style={styles.note}>{photoResult.explanation}</Text>
      <Text style={styles.title}>What happens next</Text>
      <Text style={styles.note}>{photoResult.nextSteps}</Text>
    </> : null}
    {!actionsOnly ? <>
      <Text accessibilityLiveRegion="polite" style={styles.title}>{busy ? 'Requesting retry…' : title}</Text>
      {onChanged ? <Text style={styles.note}>{reportProcessingMessage(report.workflow_status, report.processing)}</Text> : null}
      {result?.status === 'failed' && result.error_message ? <Text style={styles.note}>{result.error_message}</Text> : null}
      {processing ? <Text style={styles.note}>Background processing continues after you leave this screen.</Text> : null}
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {canRetry ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void retry()} style={styles.action}>
      {busy ? <ActivityIndicator color="#F72D33" /> : <Text style={styles.link}>{'Retry background checks'}</Text>}
    </Pressable> : null}
    {complete && !actionsOnly ? <>
      <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} style={styles.action}>
        <Text style={styles.link}>View identification results</Text>
      </Pressable>
      <IdentificationResultsModal report={expanded ? report : null} onClose={() => setExpanded(false)} />
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: 16, overflow: 'hidden', flexShrink: 1 },
  dialogHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E2E2' },
  headingCopy: { flex: 1, gap: 6 },
  eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 1, color: '#696969' },
  dialogTitle: { fontSize: 21, fontWeight: '700', color: '#111111' },
  closeButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 13, color: '#696969' },
  dialogContent: { padding: 20, gap: 12 },
  doneButton: { minHeight: 48, margin: 20, marginTop: 8, backgroundColor: '#F72D33', alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  doneText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  section: { padding: 12, gap: 6, borderTopWidth: 1, borderTopColor: '#E2E2E2' },
  resultSummary: { padding: 12, gap: 8, backgroundColor: '#F5F5F5', borderRadius: 10 },
  title: { fontSize: 13, fontWeight: '700', color: '#111111' },
  note: { fontSize: 12, lineHeight: 18, color: '#696969' },
  error: { fontSize: 12, color: '#F72D33' },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { fontSize: 12, fontWeight: '700', color: '#F72D33' },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#F72D33' },
  boxNumber: { color: '#FFFFFF', backgroundColor: '#111111', fontSize: 12, alignSelf: 'flex-start', paddingHorizontal: 3 },
});
