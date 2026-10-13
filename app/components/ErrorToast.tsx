import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  enterToastLayer,
  isTopToastLayer,
  leaveToastLayerHandingOver,
  onToast,
  ShownMessage,
  ToastTone,
} from '../lib/error-bus';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const VISIBLE_MS = 6000;

/**
 * A strip along the bottom of the screen for transient messages.
 *
 * It began as errors only — most requests failed in silence, so a person could
 * not tell a slow network from a refused action. It now also carries quiet
 * successes: an action that works but changes nothing visible (a password
 * changed, a setting saved) left people unsure it had happened, and on the web
 * React Native's Alert does not show at all, so the confirmation these screens
 * intended never appeared.
 *
 * One strip, two tones — never two at once. Tapping dismisses it; otherwise it
 * fades on its own.
 *
 * `layer`: this strip belongs to an open window (Sheet, Dialog, a screen's
 * own Modal) and is drawn at its TOP — the bottom of a window is its Save
 * button. Only the topmost open strip speaks (lib/error-bus).
 */
export function Toast({ layer = false }: { layer?: boolean } = {}) {
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<ToastTone>('error');
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const id = useRef<number>(0);
  // What this strip is saying now, so a closing window can pass it on.
  const shown = useRef<ShownMessage | null>(null);

  useEffect(() => {
    if (!layer) return;
    id.current = enterToastLayer();
    return () => leaveToastLayerHandingOver(id.current, shown.current);
  }, [layer]);

  useEffect(() => {
    return onToast((m, t) => {
      if (!isTopToastLayer(id.current)) return;
      shown.current = { message: m, tone: t, at: Date.now() };
      setMessage(m);
      setTone(t);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        shown.current = null;
        setMessage(null);
      }, VISIBLE_MS);
    });
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [message, opacity]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!message) return null;

  const success = tone === 'success';

  return (
    <Animated.View
      style={[
        styles.wrap,
        layer ? { top: insets.top + 12, bottom: undefined } : null,
        { opacity },
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        style={[styles.toast, success ? styles.success : styles.error]}
        onPress={() => {
          shown.current = null;
          setMessage(null);
        }}
      >
        <Ionicons
          name={success ? 'checkmark-circle' : 'alert-circle'}
          size={18}
          color={success ? '#bbf7d0' : '#fecaca'}
        />
        <Text style={styles.text} numberOfLines={3}>
          {message}
        </Text>
        <Ionicons
          name="close"
          size={16}
          color={success ? '#bbf7d0' : '#fecaca'}
        />
      </Pressable>
    </Animated.View>
  );
}

/** @deprecated renamed to Toast; kept so the existing import keeps working. */
export const ErrorToast = Toast;

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.OS === 'web' ? 78 : 88,
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    width: '100%',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  error: { backgroundColor: '#7f1d1d' },
  success: { backgroundColor: '#14532d' },
  text: { flex: 1, color: '#fff', fontSize: 13.5, lineHeight: 19 },
});
