import type { DeviceCoordinates } from '../hooks/useDeviceLocation';
import type { CommunityMapLocation } from './community-map-locations';

export function communityMapHtml(
  center: DeviceCoordinates,
  locations: readonly CommunityMapLocation[],
): string {
  const mapData = JSON.stringify({
    center: [center.latitude, center.longitude],
    communityPins: locations.map(location => [location.latitude, location.longitude]),
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <style>html,body,#map{height:100%;margin:0}.leaflet-container{font-family:Arial,sans-serif}</style>
</head>
<body>
  <div id="map" role="application" aria-label="Map showing your location and community photo locations"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const mapData = ${mapData};
    const map = L.map('map', { preferCanvas: true }).setView(mapData.center, 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(map);
    L.circleMarker(mapData.center, {
      radius: 8, color: '#FFFFFF', weight: 2, fillColor: '#2364D2', fillOpacity: 1
    }).addTo(map).bindPopup('Your location');
    for (const point of mapData.communityPins) {
      L.circleMarker(point, {
        radius: 5, color: '#FFFFFF', weight: 1, fillColor: '#F72D33', fillOpacity: 0.9,
        interactive: false
      }).addTo(map);
    }
    document.getElementById('map').setAttribute('data-community-pin-count', String(mapData.communityPins.length));
  </script>
</body>
</html>`;
}
