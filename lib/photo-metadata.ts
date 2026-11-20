export type ReportLocationSource = 'photo_exif' | 'device';

export type ReportLocationMetadata = {
  latitude: number | null;
  longitude: number | null;
  source: ReportLocationSource | null;
  photoTakenAtLocal: string | null;
  deviceLocationCapturedAt: string | null;
  accuracyMeters: number | null;
  shareApproximate: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExifNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const text = value.trim();
    const fraction = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(text);
    if (fraction) {
      const numerator = Number(fraction[1]);
      const denominator = Number(fraction[2]);
      return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
        ? numerator / denominator
        : null;
    }
    const number = Number(text);
    return text && Number.isFinite(number) ? number : null;
  }
  if (isRecord(value) && 'numerator' in value && 'denominator' in value) {
    return parseExifNumber(`${String(value.numerator)}/${String(value.denominator)}`);
  }
  return null;
}

function parseExifCoordinate(value: unknown, reference: unknown, limit: number): number | null {
  let coordinate: number | null;
  if (Array.isArray(value)) {
    if (value.length === 1) {
      coordinate = parseExifNumber(value[0]);
    } else if (value.length >= 3) {
      const [degrees, minutes, seconds] = value.slice(0, 3).map(parseExifNumber);
      if (degrees === null || minutes === null || seconds === null || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
        return null;
      }
      coordinate = Math.abs(degrees) + minutes / 60 + seconds / 3600;
      if (degrees < 0) coordinate *= -1;
    } else {
      return null;
    }
  } else {
    coordinate = parseExifNumber(value);
  }
  if (coordinate === null) return null;

  if (reference !== undefined && reference !== null) {
    if (typeof reference !== 'string') return null;
    const hemisphere = reference.trim().toUpperCase();
    if (hemisphere === 'S' || hemisphere === 'W') coordinate = -Math.abs(coordinate);
    else if (hemisphere === 'N' || hemisphere === 'E') coordinate = Math.abs(coordinate);
    else return null;
  }
  return Math.abs(coordinate) <= limit ? coordinate : null;
}

function parsePhotoTakenAtLocal(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (
    check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day ||
    check.getUTCHours() !== hour || check.getUTCMinutes() !== minute || check.getUTCSeconds() !== second
  ) return null;
  return `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}`;
}

export function extractPhotoMetadata(exif: Record<string, unknown> | null | undefined): ReportLocationMetadata {
  if (!exif) {
    return {
      latitude: null,
      longitude: null,
      source: null,
      photoTakenAtLocal: null,
      deviceLocationCapturedAt: null,
      accuracyMeters: null,
      shareApproximate: false,
    };
  }

  const latitude = parseExifCoordinate(exif.GPSLatitude, exif.GPSLatitudeRef, 90);
  const longitude = parseExifCoordinate(exif.GPSLongitude, exif.GPSLongitudeRef, 180);
  const hasCoordinates = latitude !== null && longitude !== null;
  const photoTakenAtLocal = [
    exif.DateTimeOriginal,
    exif.DateTimeDigitized,
    exif.DateTime,
  ].map(parsePhotoTakenAtLocal).find(value => value !== null) ?? null;

  return {
    latitude: hasCoordinates ? latitude : null,
    longitude: hasCoordinates ? longitude : null,
    source: hasCoordinates ? 'photo_exif' : null,
    photoTakenAtLocal,
    deviceLocationCapturedAt: null,
    accuracyMeters: null,
    shareApproximate: false,
  };
}
