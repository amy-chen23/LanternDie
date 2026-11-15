import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../lib/typography';
import type { Report } from '../lib/reports';
import { loadReportVoteSummary } from '../lib/reviews';
import { voteDistribution, type InsectVoteSummary } from '../lib/community-votes';

export function CommunityVotes({ report, viewerId, refreshVersion }: { report: Report; viewerId: string; refreshVersion: number }) {
  const [expanded, setExpanded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<{ report: Report; viewerId: string; refreshVersion: number; rows: InsectVoteSummary[]; error: string } | null>(null);
  const current = result?.report === report && result.viewerId === viewerId && result.refreshVersion === refreshVersion ? result : null;
  useEffect(() => {
    if (!expanded) return;
    let active = true;
    setResult(null);
    void loadReportVoteSummary(report.id).then(rows => {
      if (active) setResult({ report, viewerId, refreshVersion, rows, error: '' });
    }).catch(cause => {
      if (active) setResult({ report, viewerId, refreshVersion, rows: [], error: cause instanceof Error ? cause.message : 'Community votes could not load. Please retry.' });
    });
    return () => { active = false; };
  }, [expanded, report, viewerId, refreshVersion, retry]);

  return <View style={styles.panel}>
    <Pressable accessibilityRole="button" accessibilityLabel="Community votes" accessibilityState={{ expanded }} aria-expanded={expanded}
      onPress={() => setExpanded(value => !value)} style={styles.disclosure}>
      <Text style={styles.heading}>Community votes</Text><Text>{expanded ? '−' : '+'}</Text>
    </Pressable>
    {expanded ? <View style={styles.results}>
      <Text style={styles.note}>Responses are per lanternfly. The confirmed decision is shown separately.</Text>
      {!current ? <ActivityIndicator accessibilityLabel="Loading community votes" /> : current.error ? <View>
        <Text accessibilityRole="alert" style={styles.error}>{current.error}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Retry community votes" onPress={() => setRetry(value => value + 1)} style={styles.disclosure}><Text>Retry</Text></Pressable>
      </View> : report.insects.map((insect, index) => {
        const row = current.rows.find(item => item.insect_id === insect.id && item.revision === insect.revision);
        const distribution = row ? voteDistribution(row) : null;
        return <View key={`${insect.id}:${insect.revision}`} style={styles.insect}>
          <Text style={styles.heading}>Lanternfly {index + 1}</Text>
          {insect.label !== 'pending' ? <Text style={styles.note}>Confirmed: {insect.label === 'alive' ? 'Alive' : 'Dead'}</Text> : null}
          {!row ? <Text style={styles.note}>Results changed. Refresh the feed to see the latest review.</Text>
            : !distribution ? <Text style={styles.note}>{report.user_id === viewerId
              ? 'Community votes will be available after approval.' : 'Submit your response to see community votes.'}</Text>
              : !distribution.total ? <Text style={styles.note}>No community votes recorded.</Text>
                : <View style={styles.options}>
                  <Text style={styles.note}>{distribution.total} {distribution.total === 1 ? 'response' : 'responses'}</Text>
                  {distribution.options.map(option => <View key={option.label} style={styles.option}>
                    <Text style={styles.note}>{option.label === 'alive' ? 'Alive' : option.label === 'dead' ? 'Dead' : 'Uncertain'}: {option.count} ({option.percent}%)</Text>
                    <View accessible={false} style={styles.track}><View style={[styles.fill, { width: `${option.percent}%` }]} /></View>
                  </View>)}
                </View>}
        </View>;
      })}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  panel: { marginTop: 12, borderTopWidth: 1, borderColor: '#E2E2E2' },
  disclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 13, fontWeight: '700', color: '#222' },
  note: { fontSize: 12, color: '#555', lineHeight: 18 },
  results: { gap: 12, paddingBottom: 8 }, insect: { gap: 6 }, options: { gap: 8 }, option: { gap: 4 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#EEE', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: '#626262' }, error: { fontSize: 12, color: '#A52832' },
});
