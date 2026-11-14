import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * «Вы здесь» on the map of a division (13 November 2026): the walker's own
 * place, asked for only when he taps it, drawn on his own screen and sent
 * nowhere — never to the server, never to the other pairs.
 *
 * Web only, like the map itself; on a phone without the map nothing is asked.
 */
export function useHere() {
  const [here, setHere] = useState<[number, number] | null>(null);
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);
  const watch = useRef<number | null>(null);
  const available =
    Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.geolocation;

  const stop = useCallback(() => {
    if (watch.current !== null && available) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setOn(false);
    setHere(null);
  }, [available]);

  const start = useCallback(() => {
    if (!available) return;
    setFailed(false);
    setOn(true);
    watch.current = navigator.geolocation.watchPosition(
      (p) => setHere([p.coords.longitude, p.coords.latitude]),
      () => {
        setFailed(true);
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
    );
  }, [available, stop]);

  useEffect(() => stop, [stop]);

  return { available, here, on, failed, toggle: on ? stop : start };
}
