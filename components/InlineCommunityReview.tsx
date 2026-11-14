import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../lib/typography';
import type { Report } from '../lib/reports';
import type { ReviewInsect, ReviewLabel } from '../lib/community-review';
import { nextInlineReview, validReviewBox } from '../lib/community-review';
import { loadReportReview, releaseReportReview, saveInsectReview } from '../lib/reviews';

/** Read-only until a response is clicked: browsing never reserves panel seats. */
export function InlineCommunityReview({ report, viewerId, eligible, onChanged, onOpenPhoto }: {
  report: Report; viewerId: string; eligible: boolean;
  onChanged: () => Promise<void>; onOpenPhoto: () => void;
}) {
  const [insects, setInsects] = useState<ReviewInsect[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [photoReady, setPhotoReady] = useState(false);
  const [dimensions, setDimensions] = useState({ width: report.identification?.image_width ?? 0, height: report.identification?.image_height ?? 0 });
  const [thanks, setThanks] = useState(false);
  const [open, setOpen] = useState(true);
  const mounted = useRef(false), inFlight = useRef(false), generation = useRef(0);
  const latestChanged = useRef(onChanged); latestChanged.current = onChanged;
  const revisionKey = report.insects.map(insect => `${insect.id}:${insect.revision}`).join(',');

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; };
  }, [report.id, viewerId]);
  useEffect(() => {
    const version = ++generation.current;
    if (!eligible || report.user_id === viewerId) return;
    void loadReportReview(report.id).then(rows => {
      if (mounted.current && generation.current === version && !inFlight.current) setInsects(rows);
    }).catch(() => { /* An unavailable queue seat never grants client-side eligibility. */ });
    return () => { generation.current++; };
  }, [report.id, viewerId, eligible, revisionKey]);
  useEffect(() => { setPhotoReady(false); }, [report.photo_url]);
  useEffect(() => {
    if (!thanks) return;
    const timer = setTimeout(() => { setThanks(false); setOpen(false); }, 1200);
    return () => clearTimeout(timer);
  }, [thanks]);

  const target = nextInlineReview(insects);
  const width = dimensions.width, height = dimensions.height;
  const photoValid = target && validReviewBox(target.box, width, height);

  async function vote(label: ReviewLabel) {
    if (!target || !eligible || !photoReady || !photoValid || inFlight.current || report.user_id === viewerId) return;
    inFlight.current = true; generation.current++; setBusy(true); setError('');
    try {
      // Claim on intent, then recheck the exact insect/revision and seat server-side.
      const rows = await loadReportReview(report.id, true);
      if (!mounted.current) return;
      const current = rows.find(row => row.insect_id === target.insect_id && row.revision === target.revision);
      if (!current || current.final_label || current.my_vote !== null || !current.can_vote) {
        setInsects(rows);
        throw new Error('This review changed or its seats are full. Refresh the feed before trying again.');
      }
      await saveInsectReview(current, label);
      if (!mounted.current) return;
      setInsects(rows.map(row => row.insect_id === current.insect_id ? { ...row, my_vote: label } : row));
      setThanks(true);
      // A saved label stays acknowledged even if the independent feed refresh fails.
      void latestChanged.current().catch(() => {});
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Could not save your response. Please retry.');
    } finally {
      // Release unvoted reservations. Decisive labels keep their existing DB panel seats.
      await releaseReportReview(report.id).catch(() => {});
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (thanks) return <View style={styles.panel}><Text accessibilityLiveRegion="polite" style={styles.question}>Thanks!</Text></View>;
  if (!eligible || !target || !report.photo_url) return null;
  if (!open) return <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={styles.next}>
    <Text style={styles.link}>Review another lanternfly</Text>
  </Pressable>;
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.question}>Is this lanternfly alive or dead?</Text>
    {insects.length > 1 ? <Text style={styles.note}>Lanternfly {insects.findIndex(row => row.insect_id === target.insect_id) + 1} of {insects.length} — highlighted below</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="View full photo for review" onPress={onOpenPhoto} style={styles.previewButton}>
      <View style={{ width: width > 0 && height > 0 ? Math.min(200, 180 * width / height) : 180, aspectRatio: width > 0 && height > 0 ? width / height : 1 }}>
        <Image source={{ uri: report.photo_url }} resizeMode="stretch" style={StyleSheet.absoluteFill}
          accessibilityLabel="Lanternfly selected for review" onLoad={event => {
            const source = event.nativeEvent.source;
            if (source?.width > 0 && source.height > 0) setDimensions({ width: source.width, height: source.height });
            setPhotoReady(true);
          }} onError={() => { setPhotoReady(false); setError('The photo could not load. Refresh the feed to try again.'); }} />
        {photoValid ? <View pointerEvents="none" style={[styles.box, {
          left: `${target.box.x / width * 100}%`, top: `${target.box.y / height * 100}%`,
          width: `${target.box.width / width * 100}%`, height: `${target.box.height / height * 100}%`,
        }]} /> : null}
      </View>
      <Text style={styles.link}>View full photo</Text>
    </Pressable>
    <View style={styles.actions}>
      {(['alive', 'dead', 'uncertain'] as const).map(label => <Pressable key={label} accessibilityRole="button"
        accessibilityLabel={`Answer ${label}`} disabled={busy || !photoReady || !photoValid}
        onPress={() => void vote(label)} style={[styles.answer, (busy || !photoReady || !photoValid) && styles.disabled]}>
        <Text style={styles.answerText}>{label === 'uncertain' ? 'Uncertain' : label === 'alive' ? 'Alive' : 'Dead'}</Text>
      </Pressable>)}
    </View>
    {busy ? <ActivityIndicator accessibilityLabel="Saving response" /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  panel: { marginTop: 12, padding: 12, gap: 10, borderWidth: 1, borderColor: '#DDD2B5', backgroundColor: '#FFFDF6', borderRadius: 12 },
  question: { fontSize: 15, fontWeight: '700', color: '#111' }, note: { fontSize: 12, color: '#626262' },
  previewButton: { alignItems: 'center', gap: 5 }, box: { position: 'absolute', borderWidth: 2, borderColor: '#F72D33' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, answer: { minHeight: 44, minWidth: 64, padding: 10, borderWidth: 1, borderColor: '#BFB59B', borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF' },
  answerText: { fontSize: 13, fontWeight: '700', color: '#111' }, disabled: { opacity: 0.5 },
  error: { color: '#A52832', fontSize: 12 }, next: { marginTop: 8, minHeight: 44, justifyContent: 'center' }, link: { color: '#A52329', fontSize: 12, fontWeight: '600' },
});
