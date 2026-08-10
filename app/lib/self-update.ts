import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';
import { AppState } from 'react-native';

/**
 * Fetch a waiting update and restart into it, instead of asking people to open
 * the app twice.
 *
 * That instruction has been on the install page and in every announcement since
 * July, and it exists only because the default behaviour downloads an update on
 * one launch and applies it on the next. Nobody ever understood why, and the
 * ones who opened the app once stayed a version behind without knowing.
 *
 * The restart happens while the person is looking at a «Обновляем…» screen and
 * only in two safe moments: at a cold start, and on returning to an app that
 * has been in the background a while. Never mid-task — a restart that eats a
 * half-typed report would be a worse bargain than the one it replaces.
 *
 * In development and on the web there is nothing to do: the web reloads the
 * newest build every time by its nature.
 */
export function useSelfApplyingUpdate(): { applying: boolean } {
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    let cancelled = false;

    const check = async () => {
      try {
        const found = await Updates.checkForUpdateAsync();
        if (!found.isAvailable || cancelled) return;
        await Updates.fetchUpdateAsync();
        if (cancelled) return;
        setApplying(true);
        await Updates.reloadAsync();
      } catch {
        // A failed check is not worth a word to anybody: the app keeps running
        // the bundle it has, which is exactly what happened before.
      }
    };

    void check();

    // Coming back after a long absence is the other safe moment. The threshold
    // is generous on purpose — nobody wants a restart for stepping into another
    // app for ten seconds.
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt = Date.now();
        return;
      }
      if (state === 'active' && leftAt && Date.now() - leftAt > 30 * 60 * 1000) {
        leftAt = null;
        void check();
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return { applying };
}
