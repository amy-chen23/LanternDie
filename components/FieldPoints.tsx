import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../lib/typography';
import { loadFieldPoints } from '../lib/field-points';

export function FieldPoints({ userId }: { userId: string | null }) {
  const [result, setResult] = useState<{ userId: string; points: number | null; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    if (!userId) return;
    loadFieldPoints(userId).then(points => {
      if (!cancelled) setResult({ userId, points, error: false });
    }).catch(() => {
      if (!cancelled) setResult({ userId, points: null, error: true });
    });
    return () => { cancelled = true; };
  }, [userId, attempt]);
  const current = result?.userId === userId ? result : null;
  return <View>
    <View style={styles.row}>
      <Text style={styles.label}>FIELD POINTS</Text>
      <Text style={styles.value}>{!userId ? '0' : current?.error ? 'Unavailable' : current?.points != null ? String(current.points) : 'Loading...'}</Text>
    </View>
    {current?.error ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading field points" onPress={() => setAttempt(value => value + 1)}>
      <Text style={styles.retry}>Could not load field points. Tap to retry.</Text>
    </Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E2E2' },
  label: { color: '#696969', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  value: { color: '#111111', fontSize: 24, fontWeight: '700' },
  retry: { color: '#F72D33', fontSize: 14, paddingVertical: 12 },
});
