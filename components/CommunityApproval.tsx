import { StyleSheet, Text, View } from 'react-native';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleX from 'lucide-react-native/icons/circle-x';
import Clock from 'lucide-react-native/icons/clock';

export function CommunityApproval({ status, counts }: { status: 'approved' | 'pending' | 'rejected'; counts: { alive: number; dead: number } | null }) {
  const Icon = status === 'rejected' ? CircleX : status === 'approved' ? CircleCheck : Clock;
  const label = status === 'rejected' ? 'Rejected' : status === 'approved' ? 'Approved' : 'Awaiting approval';
  return <View style={styles.tags}><View accessibilityLabel={label} style={styles.badge}>
    <Icon size={15} color="#626262" />
    <Text style={styles.label}>{label}</Text>
  </View>
    {status === 'approved' && counts ? (['alive', 'dead'] as const).map(kind => counts[kind] > 0 ? <View key={kind} style={styles.resultTag}>
      <Text style={styles.resultText}>{kind === 'alive' ? 'Alive' : 'Dead'} · {counts[kind]}</Text>
    </View> : null) : null}
  </View>;
}
const styles = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10 },
  resultTag: { borderWidth: 1, borderColor: '#D4D4D4', borderRadius: 16, paddingHorizontal: 9, paddingVertical: 6 },
  resultText: { color: '#333', fontSize: 12, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F5F5F5' },
  label: { fontSize: 12, fontWeight: '700', color: '#333' },
});
