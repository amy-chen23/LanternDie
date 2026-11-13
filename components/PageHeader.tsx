import type { ReactNode } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../lib/typography';

export function PageHeader({ label, action }: { label: string; action?: ReactNode }) {
  return <View style={styles.header}>
    <View style={styles.brand}>
      <Image accessibilityLabel="LanternDie logo" source={require('../assets/logo.png')} resizeMode="contain" style={styles.logo} />
      <Text style={styles.label}>LANTERNDIE  /  {label}</Text>
    </View>
    {action}
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 22 },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 48, height: 48 },
  label: { flexShrink: 1, color: '#696969', fontSize: 12, fontWeight: '700', letterSpacing: 1.5 },
});
