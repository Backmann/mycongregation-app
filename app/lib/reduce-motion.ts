import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * The device's «reduce motion» setting, followed as it changes.
 *
 * Read through AccessibilityInfo rather than once at start-up: on the web it
 * is the `prefers-reduced-motion` media query; on Android it is the system's
 * animation scale (React Native reads TRANSITION_ANIMATION_SCALE == 0), which
 * the phone walk-through sets for the length of a run.
 *
 * Every looping animation in the app asks this hook (11 October 2026): the
 * «breathing» rows and dots never let the screen settle, and on Android that
 * is why `uiautomator dump` could not read a page with the person's own row
 * on it — the screenshot was taken, the markup was the previous screen's.
 * Someone who asked their device for less motion deserves a still screen too.
 */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setOn(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOn);
    return () => {
      alive = false;
      // react-native-web returns nothing when the browser has no matchMedia.
      sub?.remove();
    };
  }, []);
  return on;
}
