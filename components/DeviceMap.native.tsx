import { WebView } from 'react-native-webview';
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
    <WebView
      key={recenterKey}
      accessibilityLabel={title}
      source={{ uri: locationMapUrl(coordinate) }}
      style={{ flex: 1 }}
    />
  );
}
