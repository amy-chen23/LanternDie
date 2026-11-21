export type CommunityMapLocation = {
  latitude: number;
  longitude: number;
};

function parseCoordinate(value: unknown, min: number, max: number, label: string): number {
  const coordinate = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim()
      ? Number(value)
      : Number.NaN;
  if (!Number.isFinite(coordinate) || coordinate < min || coordinate > max) {
    throw new Error(`Invalid ${label} in a community map location.`);
  }
  return coordinate;
}

export function parseCommunityMapLocations(data: unknown): CommunityMapLocation[] {
  if (!Array.isArray(data)) {
    throw new Error('Community map locations could not be read.');
  }

  return data.map(row => {
    if (row === null || typeof row !== 'object') {
      throw new Error('Community map locations could not be read.');
    }

    const location = row as Record<string, unknown>;
    return {
      latitude: parseCoordinate(location.latitude, -90, 90, 'latitude'),
      longitude: parseCoordinate(location.longitude, -180, 180, 'longitude'),
    };
  });
}
