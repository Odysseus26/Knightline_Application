import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

export type UserLocationStatus =
  | 'undetermined'
  | 'granted'
  | 'denied'
  | 'unavailable';

export type UserLocation = { lat: number; lng: number };

const MAX_ACCURACY_METERS = 100;

const FRESH_FIX_TIMEOUT_MS = 15_000;

const CACHE_MAX_AGE_MS = 3 * 60 * 1000;

export function useUserLocation() {
  const [status, setStatus] = useState<UserLocationStatus>('undetermined');
  const [position, setPosition] = useState<UserLocation | null>(null);
  const [lastFixAt, setLastFixAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const mountedRef = useRef(true);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const commitPosition = useCallback(
    (coords: Location.LocationObjectCoords) => {
      if (!mountedRef.current) return;

      if (coords.accuracy != null && coords.accuracy > MAX_ACCURACY_METERS) {
        console.log(
          '[useUserLocation] discarding coarse fix, accuracy =',
          coords.accuracy,
        );
        return;
      }

      console.log(
        '[useUserLocation] accepting fix, accuracy =',
        coords.accuracy,
        'lat =',
        coords.latitude,
        'lng =',
        coords.longitude,
      );
      setPosition({ lat: coords.latitude, lng: coords.longitude });
      setLastFixAt(Date.now());
    },
    [],
  );

  const startWatch = useCallback(async () => {
    if (subscriptionRef.current) return;
    try {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        (loc) => commitPosition(loc.coords),
      );

      if (!mountedRef.current) {
        sub.remove();
        return;
      }

      subscriptionRef.current = sub;
      console.log('[useUserLocation] watch subscription active');
    } catch (err) {
      console.error('[useUserLocation] watch failed:', err);
      subscriptionRef.current = null;
    }
  }, [commitPosition]);

  const stopWatch = useCallback(() => {
    if (!subscriptionRef.current) return;
    subscriptionRef.current.remove();
    subscriptionRef.current = null;
    console.log('[useUserLocation] watch subscription stopped');
  }, []);


  useEffect(() => {
    let cancelled = false;

    (async () => {
      console.log('[useUserLocation] requesting foreground permission…');
      const perm = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      console.log('[useUserLocation] permission result:', perm);

      if (!perm.granted) {
        console.warn(
          '[useUserLocation] permission NOT granted, status =',
          perm.status,
        );
        setStatus('denied');
        return;
      }
      setStatus('granted');

      try {
        const servicesEnabled = await Location.hasServicesEnabledAsync();
        if (cancelled) return;
        console.log('[useUserLocation] servicesEnabled:', servicesEnabled);
        if (!servicesEnabled) {
          console.warn(
            '[useUserLocation] location services reported disabled; will still try the watch',
          );
          setError('Location services are disabled');
        }
      } catch (err) {
        console.log('[useUserLocation] hasServicesEnabledAsync failed:', err);
      }

      try {
        const cached = await Location.getLastKnownPositionAsync({
          maxAge: CACHE_MAX_AGE_MS,
        });
        if (cancelled) return;
        if (cached) {
          console.log('[useUserLocation] cached fix:', cached.coords);
          commitPosition(cached.coords);
        } else {
          console.log(
            `[useUserLocation] no cached fix within ${CACHE_MAX_AGE_MS / 1000}s`,
          );
        }
      } catch (err) {
        console.log('[useUserLocation] cached fix lookup failed:', err);
      }

      try {
        const fresh = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('TIMEOUT')),
              FRESH_FIX_TIMEOUT_MS,
            ),
          ),
        ]);
        if (cancelled) return;
        console.log('[useUserLocation] fresh fix:', fresh.coords);
        commitPosition(fresh.coords);
      } catch (err) {
        if (cancelled) return;
        const isTimeout = (err as Error).message === 'TIMEOUT';
        if (isTimeout) {
          console.warn(
            `[useUserLocation] fresh fix timed out after ${FRESH_FIX_TIMEOUT_MS}ms; relying on watch`,
          );
        } else {
          console.warn(
            '[useUserLocation] initial fresh fix failed; relying on watch:',
            err,
          );
        }
      }

      if (cancelled) return;
      await startWatch();
    })();

    return () => {
      cancelled = true;
      stopWatch();
    };
  }, [commitPosition, startWatch, stopWatch]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const wasBackground = appStateRef.current.match(/inactive|background/);
      const isActive = next === 'active';
      appStateRef.current = next;

      if (wasBackground && isActive) {
        if (status === 'granted') {
          console.log('[useUserLocation] foregrounded; resuming watch');
          startWatch();
        }
      } else if (!isActive) {
        console.log('[useUserLocation] backgrounded; pausing watch');
        stopWatch();
      }
    });
    return () => sub.remove();
  }, [status, startWatch, stopWatch]);

  useEffect(() => {
    console.log(
      '[useUserLocation] state changed — status:',
      status,
      'position:',
      position,
      'lastFixAt:',
      lastFixAt,
      'error:',
      error,
    );
  }, [status, position, lastFixAt, error]);

  return { status, position, lastFixAt, error };
}