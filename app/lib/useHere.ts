import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { easeAngle, headingOf } from './way';

/**
 * «Вы здесь» on the map of a division (13 November 2026): the walker's own
 * place, asked for only when he taps it, drawn on his own screen and sent
 * nowhere — never to the server, never to the other pairs.
 *
 * 14 November 2026, «куда идти»: also how sure the place is (`accuracy`, m),
 * where the phone points (`heading`, 0 = north) — from its compass, else
 * from the way it moves — and the screen kept awake while it is on, so it
 * does not go dark between two houses. All of it stays on the phone.
 *
 * Web only, like the map itself; on a phone without the map nothing is asked.
 */
export function useHere() {
  const [here, setHere] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);
  const watch = useRef<number | null>(null);
  const compass = useRef<((e: Event) => void) | null>(null);
  const hasCompass = useRef(false);
  const eased = useRef<number | null>(null);
  const awake = useRef<{ release: () => Promise<void> } | null>(null);
  const available = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!navigator.geolocation;

  const stop = useCallback(() => {
    if (watch.current !== null && available) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    if (compass.current && typeof window !== 'undefined') {
      window.removeEventListener('deviceorientationabsolute', compass.current);
      window.removeEventListener('deviceorientation', compass.current);
    }
    compass.current = null;
    hasCompass.current = false;
    eased.current = null;
    void awake.current?.release().catch(() => undefined);
    awake.current = null;
    setOn(false);
    setHere(null);
    setAccuracy(null);
    setHeading(null);
  }, [available]);

  const start = useCallback(() => {
    if (!available) return;
    setFailed(false);
    setOn(true);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        setHere([p.coords.longitude, p.coords.latitude]);
        setAccuracy(Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null);
        // The way one moves, when the phone has no compass to say it.
        const h = p.coords.heading;
        if (!hasCompass.current && typeof h === 'number' && !Number.isNaN(h) && (p.coords.speed ?? 0) > 0.5) {
          eased.current = easeAngle(eased.current, h, 0.5);
          setHeading(eased.current);
        }
      },
      (err) => {
        // Only a refusal ends it. A phone that stands still at a door gives
        // no new place for a while — that is no failure (14 November 2026:
        // a 30-second limit turned «Вы здесь» off while one stood talking).
        if (err.code !== err.PERMISSION_DENIED) return;
        setFailed(true);
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    if (typeof window === 'undefined') return;
    // The compass. Safari asks once — inside this tap, or it refuses.
    const listen = () => {
      const fn = (e: Event) => {
        const angle = (typeof screen !== 'undefined' && screen.orientation?.angle) || 0;
        const h = headingOf(e as unknown as { webkitCompassHeading?: number; alpha?: number; absolute?: boolean }, angle);
        if (h === null) return;
        hasCompass.current = true;
        eased.current = easeAngle(eased.current, h);
        // A compass speaks sixty times a second: the screen hears of a turn
        // of a few degrees, not of every tremble.
        const e2 = eased.current;
        setHeading((was) => (was === null || Math.abs(((e2 - was + 540) % 360) - 180) >= 4 ? e2 : was));
      };
      compass.current = fn;
      const w = window as Window;
      w.addEventListener('ondeviceorientationabsolute' in w ? 'deviceorientationabsolute' : 'deviceorientation', fn);
    };
    const DO = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceOrientationEvent;
    // Listen always: readings come only where they are allowed. Safari
    // allows them after its question; Chrome answers «prompt» and simply
    // sends them (14 November 2026: waiting for «granted» lost the compass).
    if (DO) listen();
    DO?.requestPermission?.().catch(() => undefined);
    // Keep the screen on while walking; refused or unknown: no matter.
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } })
      .wakeLock;
    wl?.request('screen')
      .then((l) => {
        awake.current = l;
      })
      .catch(() => undefined);
  }, [available, stop]);

  useEffect(() => stop, [stop]);

  // A phone that went dark lets go of the lock: take it again on return.
  useEffect(() => {
    if (!on || typeof document === 'undefined') return;
    const back = () => {
      if (document.visibilityState !== 'visible' || awake.current) return;
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } })
        .wakeLock;
      wl?.request('screen')
        .then((l) => {
          awake.current = l;
        })
        .catch(() => undefined);
    };
    const gone = () => {
      if (document.visibilityState === 'hidden') awake.current = null;
    };
    document.addEventListener('visibilitychange', gone);
    document.addEventListener('visibilitychange', back);
    return () => {
      document.removeEventListener('visibilitychange', gone);
      document.removeEventListener('visibilitychange', back);
    };
  }, [on]);

  return { available, here, accuracy, heading, on, failed, toggle: on ? stop : start };
}
