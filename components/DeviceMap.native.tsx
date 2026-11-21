import { WebView } from 'react-native-webview';
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
    <WebView
      key={recenterKey}
      accessibilityLabel={title}
      source={{ html: communityMapHtml(coordinate, communityLocations), baseUrl: 'https://www.openstreetmap.org' }}
      style={{ flex: 1 }}
    />
  );
}
