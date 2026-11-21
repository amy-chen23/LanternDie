import type { CSSProperties } from 'react';
import type { DeviceCoordinates } from '../hooks/useDeviceLocation';
import type { CommunityMapLocation } from '../lib/community-map-locations';
import { communityMapHtml } from '../lib/community-map-html';

export function DeviceMap({
  coordinate,
  recenterKey,
  communityLocations = [],
  title = 'Map centered on your location',
}: {
  coordinate: DeviceCoordinates;
  recenterKey: number;
  communityLocations?: readonly CommunityMapLocation[];
  title?: string;
}) {
  return (
    <iframe
      key={recenterKey}
      title={title}
      srcDoc={communityMapHtml(coordinate, communityLocations)}
      allowFullScreen
      style={styles.frame}
    />
  );
}

const styles: { frame: CSSProperties } = {
  frame: { width: '100%', height: '100%', border: 0, display: 'block' },
};
