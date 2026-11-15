import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Trophy from 'lucide-react-native/icons/trophy';
import type { PublicationCelebration as Celebration } from '../lib/publication-celebration';

export function PublicationCelebration({ celebration, onClose }: { celebration: Celebration | null; onClose: () => void }) {
  if (!celebration) return null;
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.dialog} accessibilityViewIsModal>
        <View style={styles.icon}><Trophy size={38} color="#F72D33" /></View>
        <Text accessibilityRole="header" style={styles.title}>Congratulations!</Text>
        <Text style={styles.message}>Your dead sighting is now approved in the community feed.</Text>
        <Text style={styles.count}>{celebration.deadCount} DEAD lanternfl{celebration.deadCount === 1 ? 'y' : 'ies'} added to your record</Text>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.button}><Text style={styles.buttonText}>Great!</Text></Pressable>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 380, padding: 28, borderRadius: 16, backgroundColor: '#FFF', alignItems: 'center', gap: 16 },
  icon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FDE8E9', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: '#111', textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 23, color: '#696969', textAlign: 'center' },
  count: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: '#111', textAlign: 'center' },
  button: { alignSelf: 'stretch', minHeight: 48, borderRadius: 6, backgroundColor: '#F72D33', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
