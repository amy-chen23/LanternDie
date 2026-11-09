import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Report } from '../lib/reports';
import { assessReportLocally, setVerificationVote } from '../lib/death-assessment';
import type { VerificationLabel } from '../lib/death-assessment';
import { canScoreLocally } from '../lib/death-runtime';

export function DeathAssessmentStatus({ report, onChanged }: { report: Report; onChanged?: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const gate = report.identification;
  if (gate?.status !== 'detected' || !gate.detections.length) return null;
  const assessment = report.death_assessment;
  const available = canScoreLocally();
  async function retry() {
    setBusy(true); setError('');
    try { await assessReportLocally(report.id); await onChanged?.(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not assess report.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.section}>
    <Text style={styles.title}>Community verification pending</Text>
    {onChanged ? <>
      {assessment?.status === 'complete' ? <>
        <Text style={styles.note}>Photo assessment recorded. Community review is required while the model is being evaluated.</Text>
        {assessment.scores.map((score, index) => <Text key={index} style={styles.note}>
          Insect {index + 1}: dead score {score.toFixed(3)} · {score >= assessment.threshold ? 'above' : 'below'} review cutoff {assessment.threshold.toFixed(2)}
        </Text>)}
        <Text style={styles.note}>Scores are experimental, not probabilities of death.</Text>
      </> : <Text style={styles.note}>{Platform.OS === 'web'
        ? 'The photo assessment runs in the phone app. Community members can still review this report.'
        : !available ? 'Photo assessment requires a custom LanternDie app build. Expo Go supports community review.'
        : 'The phone assessment has not completed. You can retry here.'}</Text>}
      {assessment?.status !== 'complete' && available ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void retry()} style={styles.button}>
        {busy ? <ActivityIndicator /> : <Text>Retry photo assessment</Text>}
      </Pressable> : null}
      {report.visibility === 'private' ? <Text style={styles.note}>This report is private. Change its audience to public to request community review.</Text> : null}
    </> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

export function VerificationVoting({ report, userId, onChanged }: { report: Report; userId: string | null; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const gate = report.identification;
  if (!userId || report.user_id === userId || report.visibility !== 'public' || gate?.status !== 'detected') return null;
  async function vote(index: number, label: VerificationLabel | null) {
    if (busy || !gate) return;
    setBusy(true); setError('');
    try { await setVerificationVote(report.id, gate.updated_at, index, label); await onChanged(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save verification vote.'); }
    finally { setBusy(false); }
  }
  return <View style={styles.section}>
    <Text style={styles.title}>Verify the lanternflies</Text>
    <Text style={styles.note}>Open identification results to see the numbered boxes. Choose uncertain if the photo does not show enough evidence.</Text>
    {gate.detections.map((_, index) => {
      const mine = report.verification_votes.find(v => v.detector_updated_at === gate.updated_at && v.detection_index === index)?.label;
      return <View key={index} style={styles.section}>
        <Text style={styles.title}>Insect {index + 1}</Text>
        <View style={styles.row}>{(['alive', 'dead', 'uncertain'] as const).map(label => <Pressable key={label}
          accessibilityRole="button" accessibilityLabel={`Insect ${index + 1}: ${label}`} accessibilityState={{ selected: mine === label }}
          disabled={busy} onPress={() => void vote(index, label)} style={[styles.button, mine === label && styles.selected]}>
          <Text>{label === 'alive' ? 'Alive' : label === 'dead' ? 'Dead' : 'Uncertain'}</Text>
        </Pressable>)}</View>
        {mine ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void vote(index, null)} style={styles.button}><Text>Remove my label</Text></Pressable> : null}
      </View>;
    })}
    <Text style={styles.note}>Your labels help identify examples for review. Community votes do not automatically verify reports or retrain the model.</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 8, paddingVertical: 10 }, title: { fontSize: 13, fontWeight: '700', color: '#111111' },
  note: { fontSize: 12, lineHeight: 18, color: '#696969' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, padding: 10, justifyContent: 'center', borderWidth: 1, borderColor: '#D0D0D0', borderRadius: 4 },
  selected: { borderColor: '#F72D33', backgroundColor: '#FFF0F0' }, error: { fontSize: 12, color: '#B00020' },
});
