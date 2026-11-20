import { WebView } from 'react-native-webview';
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
    <WebView
      key={recenterKey}
      source={{ uri: locationMapUrl(coordinate) }}
      style={{ flex: 1 }}
    />
  );
}
