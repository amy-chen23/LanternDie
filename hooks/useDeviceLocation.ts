import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export type DeviceCoordinates = {
  latitude: number;
  longitude: number;
};

export type DeviceLocationStatus = 'idle' | 'loading' | 'ready' | 'permission-denied' | 'unavailable';

export function useDeviceLocation(active: boolean) {
  const [coordinates, setCoordinates] = useState<DeviceCoordinates | null>(null);
  const [status, setStatus] = useState<DeviceLocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const requestedOnFirstOpen = useRef(false);
  const requestInFlight = useRef(false);

  const requestLocation = useCallback(async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setStatus('loading');
    setError(null);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setStatus('permission-denied');
        return;
      }

      const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCoordinates({ latitude: fix.coords.latitude, longitude: fix.coords.longitude });
      setRevision(current => current + 1);
      setStatus('ready');
    } catch (cause) {
      setStatus('unavailable');
      setError(cause instanceof Error ? cause.message : 'The device could not provide a location fix.');
    } finally {
      requestInFlight.current = false;
    }
  }, []);

  const recenter = useCallback(() => {
    if (coordinates) {
      setRevision(current => current + 1);
      return;
    }
    void requestLocation();
  }, [coordinates, requestLocation]);

  useEffect(() => {
    if (!active || requestedOnFirstOpen.current) return;
    requestedOnFirstOpen.current = true;
    void requestLocation();
  }, [active, requestLocation]);

  return { coordinates, status, error, revision, recenter };
}
