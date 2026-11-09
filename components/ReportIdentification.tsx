import { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { identifyReport } from '../lib/identification';
import type { Report } from '../lib/reports';
import { DeathAssessmentStatus } from './DeathAssessment';

function identificationTitle(report: Report) {
  const result = report.identification;
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
          <Text style={styles.note}>Your report is saved. Lanternfly detection and community verification are separate checks.</Text>
          {report.photo_url ? <View style={{ width: '100%', aspectRatio: hasBoxes ? result.image_width! / result.image_height! : 4 / 3 }}>
            <Image source={{ uri: report.photo_url }} resizeMode={hasBoxes ? 'stretch' : 'contain'} style={StyleSheet.absoluteFill} accessibilityLabel="Submitted photo with numbered lanternfly detection boxes" />
            {hasBoxes ? result.detections.map((box, index) => <View key={index} pointerEvents="none" style={[styles.box, {
              left: `${box.x / result.image_width! * 100}%`, top: `${box.y / result.image_height! * 100}%`,
              width: `${box.width / result.image_width! * 100}%`, height: `${box.height / result.image_height! * 100}%`,
            }]}><Text style={styles.boxNumber}>{index + 1}</Text></View>) : null}
          </View> : null}
          {result?.detections.map((box, index) => <Text key={index} style={styles.note}>
            {index + 1}. {box.label} · {Math.round(box.confidence * 100)}% detection confidence
          </Text>)}
          {result?.status === 'detected' || result?.status === 'not_detected' ? <Text style={styles.note}>
            Detection threshold: {Math.round((result.confidence_threshold ?? 0) * 100)}%. This measures identification, not death.
          </Text> : null}
          {result?.status === 'processing' ? <Text style={styles.note}>The check is still running. Refresh Recent activity to see the result.</Text> : null}
          {error || result?.error_message ? <Text accessibilityRole="alert" style={styles.error}>{error || result?.error_message}</Text> : null}
          {!result || result.status === 'failed' ? <Text style={styles.note}>Use Identify or Retry identification in Recent activity to check this saved photo.</Text> : null}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.doneButton}><Text style={styles.doneText}>Done</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

export function ReportIdentification({ report, onChanged }: {
  report: Report;
  onChanged?: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const result = report.identification;
  const complete = result?.status === 'detected' || result?.status === 'not_detected';
  const processing = result?.status === 'processing';
  const title = identificationTitle(report);

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

  return <View style={styles.section}>
    <Text accessibilityLiveRegion="polite" style={styles.title}>{busy ? 'Checking for lanternflies…' : title}</Text>
    <DeathAssessmentStatus report={report} onChanged={onChanged} />
    {result?.status === 'failed' && result.error_message ? <Text style={styles.note}>{result.error_message}</Text> : null}
    {processing ? <Text style={styles.note}>Refresh to see the result. If interrupted, retry after two minutes.</Text> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!complete && onChanged ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void retry()} style={styles.action}>
      {busy ? <ActivityIndicator color="#F72D33" /> : <Text style={styles.link}>{!result ? 'Identify lanternfly' : 'Retry identification'}</Text>}
    </Pressable> : null}
    {complete ? <>
      <Pressable accessibilityRole="button" onPress={() => setExpanded(true)} style={styles.action}>
        <Text style={styles.link}>View identification results</Text>
      </Pressable>
      <IdentificationResultsModal report={expanded ? report : null} onClose={() => setExpanded(false)} />
    </> : null}
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '90%', backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden', flexShrink: 1 },
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
  title: { fontSize: 13, fontWeight: '700', color: '#111111' },
  note: { fontSize: 12, lineHeight: 18, color: '#696969' },
  error: { fontSize: 12, color: '#F72D33' },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { fontSize: 12, fontWeight: '700', color: '#F72D33' },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#F72D33' },
  boxNumber: { color: '#FFFFFF', backgroundColor: '#111111', fontSize: 12, alignSelf: 'flex-start', paddingHorizontal: 3 },
});
