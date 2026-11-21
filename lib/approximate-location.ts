export type ApproximateCoordinates = {
  latitude: number;
  longitude: number;
};

const coordinatePrecision = 100;

export function approximateCoordinates(latitude: number, longitude: number): ApproximateCoordinates {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new Error('Latitude must be between -90 and 90.');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new Error('Longitude must be between -180 and 180.');
  }
  const roundCoordinate = (value: number) => {
    const rounded = Math.round(value * coordinatePrecision) / coordinatePrecision;
    return rounded === 0 ? 0 : rounded;
  };
  return { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) };
}
