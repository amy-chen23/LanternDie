import { StyleSheet, Text, View } from 'react-native';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleX from 'lucide-react-native/icons/circle-x';
import Clock from 'lucide-react-native/icons/clock';

export function CommunityApproval({ status, tone }: { status: 'approved' | 'pending' | 'rejected'; tone: 'dead' | 'neutral' | 'rejected' }) {
  const Icon = status === 'rejected' ? CircleX : status === 'approved' ? CircleCheck : Clock;
  const label = status === 'rejected' ? 'Rejected' : status === 'approved' ? 'Approved' : 'Awaiting approval';
  const color = tone === 'rejected' ? '#A52832' : tone === 'dead' ? '#287347' : '#88670D';
  return <View accessibilityLabel={label} style={[styles.badge, tone === 'rejected' ? styles.rejected : tone === 'dead' ? styles.dead : styles.neutral]}>
    <Icon size={15} color={color} />
    <Text style={[styles.label, { color }]}>{label}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 16, marginBottom: 10 },
  dead: { backgroundColor: '#DFEFE4' }, neutral: { backgroundColor: '#FFF0C3' }, rejected: { backgroundColor: '#FBE2E4' },
  label: { fontSize: 12, fontWeight: '700' },
});
