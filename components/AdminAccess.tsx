import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../lib/typography';
import type { Report } from '../lib/reports';
import { loadAdminReports } from '../lib/reports';
import { ReportIdentification } from './ReportIdentification';
import { AdminModeration } from './AdminModeration';
import { PageHeader } from './PageHeader';

export function AdminAccess({ userId, checkAccess, onModerated }: { userId: string; checkAccess: () => Promise<boolean>; onModerated: () => Promise<void> }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [all, setAll] = useState(false);
  const [lookup, setLookup] = useState('');
  const [filterId, setFilterId] = useState('');
  const [selected, setSelected] = useState<Report | null>(null);
  const alive = useRef(true);
  const version = useRef(0);
  async function refresh() {
    const request = ++version.current;
    setLoading(true); setError('');
    try {
      // Recheck role before fetching sensitive queue rows. RLS independently
      // checks membership on EVERY database/storage request, including revocation.
      if (!await checkAccess()) { if (alive.current) setReports([]); return; }
      const next = await loadAdminReports(userId, all, filterId || undefined);
      if (alive.current && request === version.current) setReports(next);
    } catch {
      if (alive.current && request === version.current) { setReports([]); setError('Could not load the admin queue. Refresh to try again.'); }
    } finally { if (alive.current && request === version.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    return () => { alive.current = false; version.current++; };
  }, [userId, all, filterId]);
  return <><ScrollView contentContainerStyle={styles.page}>
    <PageHeader label="ADMIN" />
    <Text accessibilityRole="header" style={styles.title}>Report moderation</Text>
    <Text style={styles.note}>Review insects awaiting an alive/dead decision, missed detections, and failed photo checks. Lists show up to 10 reports; use an ID to find an older submission.</Text>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" style={styles.button} accessibilityState={{ selected: !all }} onPress={() => { setLookup(''); setFilterId(''); if (!all && !filterId) void refresh(); setAll(false); }}><Text>Needs attention</Text></Pressable>
      <Pressable accessibilityRole="button" style={styles.button} accessibilityState={{ selected: all }} onPress={() => { setLookup(''); setFilterId(''); if (all && !filterId) void refresh(); setAll(true); }}><Text>All reports</Text></Pressable>
    </View>
    <TextInput accessibilityLabel="Find report by ID" placeholder="Report UUID" placeholderTextColor="#777" value={lookup} onChangeText={setLookup} autoCapitalize="none" style={styles.input} />
    <Pressable accessibilityRole="button" disabled={loading} style={styles.button} onPress={() => {
      const id = lookup.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { setError('Enter a valid report ID.'); return; }
      if (filterId === id) void refresh(); else setFilterId(id);
    }}><Text>Find report</Text></Pressable>
    <Pressable accessibilityRole="button" disabled={loading} style={styles.button} onPress={() => void refresh()}><Text>Refresh admin queue</Text></Pressable>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator /> : reports.length ? reports.map(report => <View key={report.id} style={styles.card}>
      {report.photo_url ? <Image accessibilityLabel="Submitted report photo" source={{ uri: report.photo_url }} style={styles.photo} resizeMode="contain" /> : <Text style={styles.note}>Photo unavailable.</Text>}
      <Text style={styles.heading}>{report.author_name}</Text>
      <Text style={styles.note}>{all || filterId ? report.workflow_status.replaceAll('_', ' ') : report.workflow_status === 'admin_review' ? 'Needs admin review' : 'Alive/dead decision needed'}</Text>
      <Text style={styles.note}>Observed {report.observed_on}{report.place_name ? ` · ${report.place_name}` : ''}</Text>
      {report.caption ? <Text style={styles.note}>{report.caption}</Text> : null}
      <ReportIdentification report={report} />
      <Pressable accessibilityRole="button" style={styles.button} onPress={() => setSelected(report)}><Text>Moderate report</Text></Pressable>
    </View>) : <Text style={styles.note}>No matching reports.</Text>}
  </ScrollView>
    {selected ? <AdminModeration key={selected.id} report={selected} checkAccess={checkAccess}
      onClose={() => setSelected(null)} onChanged={async () => { await refresh(); await onModerated(); }} /> : null}
  </>;
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, input: { borderRadius: 8, minHeight: 44, borderWidth: 1, borderColor: '#CCC', padding: 12 },
  page: { padding: 24, gap: 16, paddingBottom: 40 }, eyebrow: { color: '#666', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: '#111', fontSize: 28, fontWeight: '700' }, note: { color: '#666', fontSize: 13, lineHeight: 20 },
  heading: { color: '#111', fontWeight: '700', fontSize: 16 }, button: { borderRadius: 8, minHeight: 44, padding: 12, borderWidth: 1, borderColor: '#CCC', justifyContent: 'center' },
  card: { borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderColor: '#DDD', backgroundColor: '#FFF' }, photo: { borderRadius: 8, width: '100%', height: 220 }, error: { color: '#B00020', fontSize: 13 },
});
