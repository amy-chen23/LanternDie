import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { PageHeader } from './PageHeader';
import { Text } from '../lib/typography';
import { DeviceMap } from './DeviceMap';
import type { DeviceCoordinates, DeviceLocationStatus } from '../hooks/useDeviceLocation';

export function LocationMap({
  coordinates,
  status,
  error,
  revision,
  recenter,
}: {
  coordinates: DeviceCoordinates | null;
  status: DeviceLocationStatus;
  error: string | null;
  revision: number;
  recenter: () => void;
}) {
  const statusText = status === 'permission-denied'
    ? 'Location permission is off. Allow location access to center the map.'
    : status === 'unavailable'
      ? coordinates
        ? 'Could not refresh your location. The map is still showing your last fix.'
        : error
          ? `Location unavailable. ${error}`
          : 'Location unavailable. Check your device settings and try again.'
      : 'Finding your current location…';

  return (
    <View style={styles.screen}>
      <PageHeader label="MAP" action={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={coordinates ? 'Recenter map' : 'Try location again'}
          disabled={status === 'loading'}
          onPress={recenter}
          style={({ pressed }) => [styles.recenterButton, pressed && styles.pressed, status === 'loading' && styles.disabled]}
        >
          <Text style={styles.recenterText}>
            {status === 'loading' && !coordinates ? 'Locating…' : coordinates ? 'Recenter' : 'Try again'}
          </Text>
        </Pressable>
      } />
      {status !== 'ready' && coordinates ? (
        <Text accessibilityLiveRegion="polite" style={styles.notice}>{statusText}</Text>
      ) : null}
      <View style={styles.mapFrame}>
        {coordinates ? (
          <DeviceMap coordinate={coordinates} recenterKey={revision} />
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.locationState}>
            {status === 'idle' || status === 'loading'
              ? <ActivityIndicator color="#F72D33" size="large" />
              : null}
            <Text style={styles.locationMessage}>{statusText}</Text>
          </View>
        )}
      </View>
      <Text style={styles.providerNotice}>
        OpenStreetMap receives the map center to render the map. LanternDie does not save your map-view location.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 12 },
  recenterButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#111111' },
  recenterText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.65 },
  notice: { color: '#696969', fontSize: 12, lineHeight: 18, marginBottom: 10 },
  mapFrame: { flex: 1, minHeight: 240, overflow: 'hidden', borderRadius: 12, backgroundColor: '#E8E8E8' },
  locationState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  locationMessage: { color: '#696969', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 12 },
  providerNotice: { color: '#696969', fontSize: 10, lineHeight: 15, marginTop: 8 },
});
