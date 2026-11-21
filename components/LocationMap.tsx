import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { PageHeader } from './PageHeader';
import { Text } from '../lib/typography';
import { DeviceMap } from './DeviceMap';
import type { DeviceCoordinates, DeviceLocationStatus } from '../hooks/useDeviceLocation';
import { loadCommunityMapLocations } from '../lib/report-map-locations';
import type { CommunityMapLocation } from '../lib/community-map-locations';

export function LocationMap({
  coordinates,
  status,
  error,
  revision,
  recenter,
  viewerId,
}: {
  coordinates: DeviceCoordinates | null;
  status: DeviceLocationStatus;
  error: string | null;
  revision: number;
  recenter: () => void;
  viewerId: string | null;
}) {
  const [communityLocations, setCommunityLocations] = useState<CommunityMapLocation[]>([]);
  const [pinsStatus, setPinsStatus] = useState<'loading' | 'ready' | 'error' | 'signed-out'>('loading');
  const [pinsError, setPinsError] = useState<string | null>(null);
  const [pinsRetry, setPinsRetry] = useState(0);

  useEffect(() => {
    let active = true;
    setCommunityLocations([]);
    setPinsError(null);
    if (!viewerId) {
      setPinsStatus('signed-out');
      return () => { active = false; };
    }

    setPinsStatus('loading');
    loadCommunityMapLocations().then(locations => {
      if (!active) return;
      setCommunityLocations(locations);
      setPinsStatus('ready');
    }).catch(loadError => {
      if (!active) return;
      setPinsError(loadError instanceof Error ? loadError.message : 'Unexpected response.');
      setPinsStatus('error');
    });

    return () => { active = false; };
  }, [viewerId, pinsRetry]);

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
          <DeviceMap coordinate={coordinates} recenterKey={revision} communityLocations={communityLocations} />
        ) : (
          <View accessibilityLiveRegion="polite" style={styles.locationState}>
            {status === 'idle' || status === 'loading'
              ? <ActivityIndicator color="#F72D33" size="large" />
              : null}
            <Text style={styles.locationMessage}>{statusText}</Text>
          </View>
        )}
      </View>
      <View style={styles.pinStatus}>
        <View style={styles.pinLegend}>
          <View style={styles.userPin} />
          <Text style={styles.pinLegendText}>You</Text>
          <View style={styles.communityPin} />
          <Text style={styles.pinLegendText}>Approximate shared photo locations</Text>
        </View>
        <Text accessibilityLiveRegion="polite" style={styles.providerNotice}>
          {pinsStatus === 'loading'
            ? 'Loading community pins…'
            : pinsStatus === 'error'
              ? `Community pins could not be loaded: ${pinsError}`
              : pinsStatus === 'signed-out'
                ? 'Sign in to see community pins.'
                : `${communityLocations.length} approximate community photo location${communityLocations.length === 1 ? '' : 's'}.`}
        </Text>
        {pinsStatus === 'error' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading community pins"
            onPress={() => setPinsRetry(value => value + 1)}
            style={styles.retryPins}
          >
            <Text style={styles.retryPinsText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.providerNotice}>
        OpenStreetMap and unpkg provide map rendering. OpenStreetMap receives the map center; LanternDie does not save your map-view location.
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
  pinStatus: { marginTop: 8 },
  pinLegend: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  userPin: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2364D2' },
  communityPin: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F72D33', marginLeft: 8 },
  pinLegendText: { color: '#696969', fontSize: 10, lineHeight: 14 },
  providerNotice: { color: '#696969', fontSize: 10, lineHeight: 15, marginTop: 8 },
  retryPins: { alignSelf: 'flex-start', marginTop: 4, paddingVertical: 4, paddingHorizontal: 8 },
  retryPinsText: { color: '#111111', fontSize: 11, fontWeight: '700' },
});
