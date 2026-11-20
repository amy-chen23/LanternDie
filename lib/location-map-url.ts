import type { DeviceCoordinates } from '../hooks/useDeviceLocation';

const mapPadding = 0.012;

export function locationMapUrl(coordinate: DeviceCoordinates): string {
  const south = coordinate.latitude - mapPadding;
  const west = coordinate.longitude - mapPadding;
  const north = coordinate.latitude + mapPadding;
  const east = coordinate.longitude + mapPadding;
  const marker = encodeURIComponent(`${coordinate.latitude},${coordinate.longitude}`);
  const bbox = encodeURIComponent(`${west},${south},${east},${north}`);
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
}
