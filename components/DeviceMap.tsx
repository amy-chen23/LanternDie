import type { CSSProperties } from 'react';
import type { DeviceCoordinates } from '../hooks/useDeviceLocation';
import { locationMapUrl } from '../lib/location-map-url';

export function DeviceMap({
  coordinate,
  recenterKey,
}: {
  coordinate: DeviceCoordinates;
  recenterKey: number;
}) {
  return (
    <iframe
      key={recenterKey}
      title="Map centered on your location"
      src={locationMapUrl(coordinate)}
      allowFullScreen
      style={styles.frame}
    />
  );
}

const styles: { frame: CSSProperties } = {
  frame: { width: '100%', height: '100%', border: 0, display: 'block' },
};
