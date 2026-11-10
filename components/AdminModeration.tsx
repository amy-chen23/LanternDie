import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Report } from '../lib/reports';
import { loadModeration, moderateReport } from '../lib/moderation';
import type { AdminInsect, AuditEvent, ModerationAction, ModerationSnapshot } from '../lib/moderation';
import type { Box } from '../lib/moderation-geometry';
import { ModerationBoxEditor } from './ModerationBoxEditor';

function auditTitle(event: AuditEvent) {
  if (event.action === 'admin_box_edit') return 'Admin corrected a box';
  if (event.action === 'admin_reject') return 'Admin rejected report';
  if (event.action === 'admin_publish') return 'Admin published report';
  if (event.action.startsWith('review_vote:')) return event.action.endsWith('DELETE') ? 'Review label removed' : 'Review label recorded';
  if (event.action.startsWith('report_kill_credits:')) return 'Kill credit updated';
  if (event.action.startsWith('report_insects:')) return 'Insect decision or box updated';
  return 'Report status updated';
}

export function AdminModeration({ report, checkAccess, onChanged, onClose }: {
  report: Report; checkAccess: () => Promise<boolean>; onChanged: () => Promise<void>; onClose: () => void;
}) {
  const [snapshot, setSnapshot] = useState<ModerationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [proposal, setProposal] = useState<ModerationAction | null>(null);
  const [reason, setReason] = useState('');
  const [editor, setEditor] = useState<{ insect?: AdminInsect; draft?: Box } | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const [actualSize, setActualSize] = useState<{ width: number; height: number } | null>(null);
  const alive = useRef(true);
  const inFlight = useRef(false);
  const version = useRef(0);
  async function refresh() {
    if (inFlight.current) return;
    const request = ++version.current;
    setLoading(true); setError(''); setNotice(''); setProposal(null); setEditor(null);
    try {
      if (!await checkAccess()) { if (alive.current) setSnapshot(null); return; }
      const next = await loadModeration(report.id);
      if (alive.current && request === version.current) { setSnapshot(next); setNeedsRefresh(false); }
    } catch (cause) {
      if (alive.current && request === version.current) { setError(cause instanceof Error ? cause.message : 'Could not load moderation.'); setNeedsRefresh(true); }
    } finally { if (alive.current && request === version.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    return () => { alive.current = false; version.current++; };
  }, [report.id]);
  function stage(action: ModerationAction) { setProposal(action); setReason(''); setError(''); setNotice(''); }
  async function confirm() {
    if (!snapshot || !proposal || !reason.trim() || reason.length > 1000 || inFlight.current || needsRefresh) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      // SQL rechecks membership, snapshot version, box revision and publication
      // prerequisites inside one transaction. This client check is convenience.
      if (!await checkAccess()) return;
      const next = await moderateReport(snapshot, proposal, reason);
      if (alive.current) { setSnapshot(next); setProposal(null); setEditor(null); setReason(''); setNotice('Change saved.'); }
      try { await onChanged(); } catch { if (alive.current) setNotice('Change saved. Refresh the admin list to see the latest queue.'); }
    } catch (cause) {
      if (alive.current) { setError(cause instanceof Error ? cause.message : 'Could not save moderation.'); setNeedsRefresh(true); setProposal(null); }
      // A role revocation closes the admin surface through the parent hook.
      await checkAccess();
    } finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  const active = snapshot?.insects.filter(insect => insect.active) ?? [];
  const width = snapshot?.photo_width ?? actualSize?.width ?? 4;
  const height = snapshot?.photo_height ?? actualSize?.height ?? 3;
  const locked = loading || busy || needsRefresh;
  const publishable = Boolean(snapshot?.photo_registered && active.length && active.every(insect => insect.label !== 'pending'));
  return <Modal visible transparent animationType="fade" onRequestClose={() => { if (!inFlight.current) onClose(); }}>
    <View style={styles.backdrop}><View style={styles.dialog} accessibilityViewIsModal>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>Moderate report</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => { if (!inFlight.current) onClose(); }} style={styles.button}><Text>Close</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text selectable style={styles.note}>Report {report.id}</Text>
        <Text style={styles.heading}>{report.author_name}</Text>
        {report.processing?.status === 'failed' ? <Text style={styles.note}>Background photo checks could not finish.</Text> : report.identification?.status === 'not_detected' ? <Text style={styles.note}>The detector found no lanternflies. Inspect the photo for missed insects.</Text> : null}
        {snapshot ? <Text style={styles.note}>Status: {snapshot.status.replaceAll('_', ' ')} · {snapshot.kill_credits} kill credits</Text> : null}
        <Pressable accessibilityRole="button" disabled={busy || loading} onPress={() => void refresh()} style={styles.button}><Text>Refresh report</Text></Pressable>
        {loading ? <ActivityIndicator /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.heading}>{notice}</Text> : null}
        {report.photo_url ? <View style={{ width: '100%', aspectRatio: width / height }}>
          <Image source={{ uri: report.photo_url }} resizeMode="stretch" accessibilityLabel="Report photo with current numbered insect boxes" style={StyleSheet.absoluteFill}
            onLoad={event => { const source = event.nativeEvent.source; if (source?.width > 0 && source?.height > 0) setActualSize({ width: source.width, height: source.height }); setPhotoReady(true); }}
            onError={() => { setPhotoReady(false); setError('Photo could not load. Refresh before making visual decisions.'); }} />
          {active.map((insect, index) => <View key={insect.id} pointerEvents="none" style={[styles.box, {
            left: `${insect.box.x / width * 100}%`, top: `${insect.box.y / height * 100}%`, width: `${insect.box.width / width * 100}%`, height: `${insect.box.height / height * 100}%`,
          }]}><Text style={styles.number}>{index + 1}</Text></View>)}
        </View> : <Text style={styles.error}>Photo unavailable. Visual decisions and box corrections are disabled.</Text>}
        {snapshot && !loading ? <>
          {editor && report.photo_url && photoReady && !proposal && !needsRefresh ? <ModerationBoxEditor key={`${editor.insect?.id ?? 'new'}:${editor.insect?.revision ?? 0}`}
            photo={report.photo_url} width={width} height={height} insects={snapshot.insects} selected={editor.insect} initialBox={editor.draft}
            onCancel={() => setEditor(null)} onSave={box => { setEditor(current => current ? { ...current, draft: box } : current); stage({ action: 'box_save', insect: editor.insect, box, imageWidth: width, imageHeight: height,
              description: editor.insect ? 'Save this box correction. Its previous votes and decision will be replaced by a fresh review.' : 'Add this insect box. It will need an alive/dead decision before initial publication.' }); }} /> : null}
          {!editor && !proposal ? <Pressable accessibilityRole="button" disabled={locked || !photoReady} style={styles.button} onPress={() => setEditor({})}><Text>Add insect box</Text></Pressable> : null}
          {active.map((insect, index) => <View key={insect.id} style={styles.card}>
            <Text style={styles.heading}>Insect {index + 1}: {insect.label === 'pending' ? 'Awaiting decision' : insect.label === 'dead' ? 'Dead' : 'Alive'}</Text>
            <Text style={styles.note}>Review labels: {insect.alive_votes} alive · {insect.dead_votes} dead · {insect.uncertain_votes} uncertain</Text>
            {insect.source ? <Text style={styles.note}>Decision by {insect.source}</Text> : null}
            {insect.reason ? <Text style={styles.note}>Reason: {insect.reason}</Text> : null}
            {insect.model_score !== null ? <Text style={styles.note}>Experimental model score: {insect.model_score.toFixed(3)}</Text> : null}
            <View style={styles.row}>
              {(['alive', 'dead'] as const).map(label => <Pressable key={label} accessibilityRole="button" disabled={locked || !photoReady || Boolean(proposal) || Boolean(editor)} style={styles.button}
                onPress={() => stage({ action: label === 'dead' ? 'decide_dead' : 'decide_alive', insect,
                  description: `Finalize insect ${index + 1} as ${label}. This overrides any existing decision and updates kill credit when all insects are resolved. The last decision may publish this report automatically.` })}>
                <Text>Mark {label === 'dead' ? 'Dead' : 'Alive'}</Text>
              </Pressable>)}
              <Pressable accessibilityRole="button" disabled={locked || !photoReady || Boolean(proposal) || Boolean(editor)} style={styles.button} onPress={() => setEditor({ insect })}><Text>Edit box</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={locked || Boolean(proposal) || Boolean(editor)} style={styles.button}
                onPress={() => stage({ action: 'box_remove', insect, description: `Remove insect ${index + 1} from this report. It will no longer count toward verified kills. Published reports remain visible.` })}><Text>Remove box</Text></Pressable>
            </View>
          </View>)}
          {!active.length ? <Text style={styles.note}>No active insect boxes. Add any missed lanternflies or reject the report.</Text> : null}
          {!proposal && !editor ? <View style={styles.row}>
            {snapshot.status !== 'published' ? <Pressable accessibilityRole="button" disabled={locked || !publishable} style={styles.button}
              onPress={() => stage({ action: 'publish', description: snapshot.status === 'rejected' ? 'Restore this report to the public feed and recalculate its verified kill credit.' : 'Publish this report and award one credit for each verified dead insect.' })}><Text>{snapshot.status === 'rejected' ? 'Restore publication' : 'Publish report'}</Text></Pressable> : null}
            {snapshot.status !== 'rejected' ? <Pressable accessibilityRole="button" disabled={locked} style={styles.button}
              onPress={() => stage({ action: 'reject', description: `Reject this report, remove it from the feed, and remove its ${snapshot.kill_credits} kill credits. The photo stays blocked against duplicate uploads.` })}><Text>Reject report</Text></Pressable> : null}
          </View> : null}
          {!publishable && snapshot.status !== 'published' ? <Text style={styles.note}>Publication requires completed photo checks and a final decision for every active insect.</Text> : null}
          {proposal ? <View style={styles.confirmation}>
            <Text style={styles.heading}>Review action</Text><Text style={styles.note}>{proposal.description}</Text>
            {proposal.box ? <Text style={styles.note}>Box: x {proposal.box.x}, y {proposal.box.y}, width {proposal.box.width}, height {proposal.box.height}</Text> : null}
            <TextInput accessibilityLabel="Moderation reason" placeholder="Reason (required)" placeholderTextColor="#777" multiline value={reason} onChangeText={setReason} maxLength={1000} editable={!busy} style={styles.input} />
            <Text style={styles.note}>Your account, reason, and the change will be recorded. Admin decisions have no appeal.</Text>
            <View style={styles.row}>
              <Pressable accessibilityRole="button" disabled={locked || !reason.trim()} style={styles.button} onPress={() => void confirm()}><Text>Confirm change</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => setProposal(null)}><Text>Cancel</Text></Pressable>
            </View>
          </View> : null}
          {busy ? <ActivityIndicator /> : null}
          <Text style={styles.heading}>Audit history · latest 50 events</Text>
          {snapshot.audit.map(event => <View key={event.id} style={styles.audit}>
            <Text style={styles.heading}>{auditTitle(event)}</Text>
            <Text style={styles.note}>{new Date(event.created_at).toLocaleString()}</Text>
            <Text selectable style={styles.note}>{event.actor_id ? `Account: ${event.actor_id}` : 'Background processing'}</Text>
            {typeof event.new_data?.reason === 'string' ? <Text style={styles.note}>Reason: {event.new_data.reason}</Text> : null}
            {event.old_data?.label !== undefined || event.new_data?.label !== undefined ? <Text style={styles.note}>Label: {String(event.old_data?.label ?? 'none')} → {String(event.new_data?.label ?? 'removed')}</Text> : null}
            {event.old_data?.dead_insects !== undefined || event.new_data?.dead_insects !== undefined ? <Text style={styles.note}>Kill credits: {String(event.old_data?.dead_insects ?? 0)} → {String(event.new_data?.dead_insects ?? 0)}</Text> : null}
          </View>)}
        </> : null}
      </ScrollView>
    </View></View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  dialog: { width: '100%', maxWidth: 760, maxHeight: '94%', backgroundColor: '#FFF', borderRadius: 10, overflow: 'hidden', flexShrink: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#DDD' },
  title: { fontSize: 22, fontWeight: '700' }, content: { padding: 16, gap: 14 }, heading: { fontSize: 14, fontWeight: '700', color: '#111' },
  note: { fontSize: 12, lineHeight: 19, color: '#666' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: '#CCC', justifyContent: 'center' },
  input: { minHeight: 80, padding: 12, borderWidth: 1, borderColor: '#AAA', color: '#111' },
  card: { padding: 12, gap: 8, borderWidth: 1, borderColor: '#DDD' }, confirmation: { borderWidth: 2, borderColor: '#F72D33', padding: 14, gap: 12 },
  audit: { gap: 5, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#EEE' }, error: { color: '#B00020', fontSize: 13, lineHeight: 20 },
  box: { position: 'absolute', borderWidth: 2, borderColor: '#F72D33' }, number: { backgroundColor: '#111', color: '#FFF', fontSize: 12, paddingHorizontal: 4, alignSelf: 'flex-start' },
});
