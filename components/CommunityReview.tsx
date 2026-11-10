import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Report } from '../lib/reports';
import { loadReportReview, releaseReportReview, saveInsectReview } from '../lib/reviews';
import { reviewActionMessage, reviewFinished } from '../lib/community-review';
import type { ReviewInsect, ReviewLabel } from '../lib/community-review';

// Mount this when a member opens a pending report. No second "Verify" step.
export function CommunityReview({ report, onClose, onChanged }: {
  report: Report; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const [insects, setInsects] = useState<ReviewInsect[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoReady, setPhotoReady] = useState(false);
  const [dimensions, setDimensions] = useState({ width: report.identification?.image_width ?? 4, height: report.identification?.image_height ?? 3 });
  const alive = useRef(true);
  const inFlight = useRef(false);
  const readVersion = useRef(0);

  async function refresh(claim = false) {
    const version = ++readVersion.current;
    const next = await loadReportReview(report.id, claim);
    if (alive.current && version === readVersion.current) setInsects(next);
  }
  useEffect(() => {
    alive.current = true;
    void refresh(true).catch(cause => { if (alive.current) setError(cause.message); })
      .finally(() => { if (alive.current) setLoading(false); });
    const timer = setInterval(() => {
      if (inFlight.current || AppState.currentState !== 'active') return;
      void refresh().catch(cause => { if (alive.current) setError(cause.message); });
    }, 15_000);
    return () => {
      alive.current = false;
      readVersion.current++;
      clearInterval(timer);
      // Covers navigation/unmount as well as Close. RPC is idempotent; leases
      // also expire after 15 minutes if the device disappears without cleanup.
      void releaseReportReview(report.id).catch(() => {});
    };
  }, [report.id]);

  async function vote(insect: ReviewInsect, label: ReviewLabel | null) {
    if (inFlight.current || !photoReady) return;
    inFlight.current = true; setBusy(true); setError(''); readVersion.current++;
    try {
      await saveInsectReview(insect, label);
      await refresh();
      // Keep the popup mounted while results refresh, including finalization.
      await onChanged();
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not save label.');
      try { await refresh(); } catch { /* Preserve the original actionable error. */ }
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  async function reclaim() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await refresh(true); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Review unavailable.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!inFlight.current) onClose(); }}>
    <View style={styles.backdrop}><View style={styles.dialog} accessibilityViewIsModal>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Alive or dead?</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close review" disabled={busy} onPress={() => { if (!inFlight.current) onClose(); }} style={styles.button}><Text>Close</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.note}>Review each numbered lanternfly. Choose Uncertain when the photo does not show enough evidence. You can skip by closing this review.</Text>
        {report.photo_url ? <View style={{ width: '100%', aspectRatio: dimensions.width / dimensions.height }}>
          <Image source={{ uri: report.photo_url }} resizeMode="stretch" style={StyleSheet.absoluteFill}
            accessibilityLabel="Report photo with numbered insect boxes"
            onLoad={event => {
              const source = event.nativeEvent.source;
              if (source?.width > 0 && source?.height > 0) setDimensions({ width: source.width, height: source.height });
              setPhotoReady(true);
            }} onError={() => { setPhotoReady(false); setError('Photo could not load. Close and reopen this review before voting.'); }} />
          {insects.map((insect, index) => <View key={insect.insect_id} pointerEvents="none" style={[styles.box, {
            left: `${insect.box.x / dimensions.width * 100}%`, top: `${insect.box.y / dimensions.height * 100}%`,
            width: `${insect.box.width / dimensions.width * 100}%`, height: `${insect.box.height / dimensions.height * 100}%`,
          }]}><Text style={styles.number}>{index + 1}</Text></View>)}
        </View> : <Text style={styles.error}>Photo unavailable. Please close this review and try again later.</Text>}
        {loading ? <ActivityIndicator /> : insects.map((insect, index) => <View key={`${insect.insect_id}:${insect.revision}`} style={styles.insect}>
          <Text style={styles.heading}>Insect {index + 1}</Text>
          <Text style={styles.note}>{reviewActionMessage(insect)}</Text>
          {!insect.final_label && insect.can_vote ? <View style={styles.row}>
            {(['alive', 'dead', 'uncertain'] as const).map(label => <Pressable key={label} accessibilityRole="button"
              accessibilityLabel={`Insect ${index + 1}: ${label}`} accessibilityState={{ selected: insect.my_vote === label }}
              disabled={busy || !photoReady} onPress={() => void vote(insect, label)} style={[styles.button, insect.my_vote === label && styles.selected]}>
              <Text>{label === 'alive' ? 'Alive' : label === 'dead' ? 'Dead' : 'Uncertain'}</Text>
            </Pressable>)}
          </View> : null}
          {!insect.final_label && insect.my_vote ? <Pressable accessibilityRole="button" disabled={busy} style={styles.button}
            onPress={() => void vote(insect, null)}><Text>Remove my label for insect {index + 1}</Text></Pressable> : null}
          {insect.feedback ? <Text style={styles.note}>
            Review labels: {insect.feedback.alive_votes} alive · {insect.feedback.dead_votes} dead · {insect.feedback.uncertain_votes} uncertain
            {insect.feedback.model_score !== null ? ` · experimental model score ${insect.feedback.model_score.toFixed(3)}` : ''}
          </Text> : null}
        </View>)}
        {!loading && !insects.length ? <Text style={styles.note}>No insects are available for review.</Text> : null}
        {reviewFinished(insects) ? <Text accessibilityLiveRegion="polite" style={styles.heading}>Every insect has a final decision. Thank you for reviewing.</Text> : null}
        {insects.some(insect => !insect.final_label && !insect.can_vote) ? <Pressable accessibilityRole="button" disabled={busy || !photoReady} onPress={() => void reclaim()} style={styles.button}><Text>Claim an available review seat</Text></Pressable> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {busy ? <ActivityIndicator /> : null}
      </ScrollView>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 620, maxHeight: '90%', backgroundColor: '#FFF', borderRadius: 12, flexShrink: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: '#DDD' },
  title: { fontSize: 24, fontWeight: '700', color: '#111' }, heading: { fontSize: 15, fontWeight: '700', color: '#111' },
  content: { padding: 16, gap: 14 }, note: { color: '#626262', fontSize: 13, lineHeight: 20 },
  insect: { gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#DDD' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, padding: 12, borderWidth: 1, borderColor: '#CCC', borderRadius: 5, justifyContent: 'center' },
  selected: { borderColor: '#F72D33', backgroundColor: '#FFF0F0' }, error: { color: '#B00020', fontSize: 13, lineHeight: 20 },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#F72D33' }, number: { alignSelf: 'flex-start', color: '#FFF', backgroundColor: '#111', paddingHorizontal: 4, fontSize: 13 },
});
