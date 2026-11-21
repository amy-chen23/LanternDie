import type { CSSProperties } from 'react';
import type { DeviceCoordinates } from '../hooks/useDeviceLocation';
import { locationMapUrl } from '../lib/location-map-url';

export function DeviceMap({
  coordinate,
  recenterKey,
  title = 'Map centered on your location',
}: {
  coordinate: DeviceCoordinates;
  recenterKey: number;
  title?: string;
}) {
  return (
    <iframe
      key={recenterKey}
      title={title}
      src={locationMapUrl(coordinate)}
      allowFullScreen
      style={styles.frame}
    />
  );
}

const styles: { frame: CSSProperties } = {
  frame: { width: '100%', height: '100%', border: 0, display: 'block' },
};
