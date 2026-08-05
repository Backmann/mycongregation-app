import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

/**
 * «Удалено. Отменить» — the second half of every destructive tap.
 *
 * Almost every mis-tap is noticed in the same second it happens, and until now
 * the only way back from one was the change journal, or a decrypted backup.
 * A strip that lives for a few seconds costs the reader nothing and catches
 * nearly all of them.
 *
 * Deliberately not a confirmation dialog INSTEAD of this: a dialog asks
 * everybody every time about a thing they almost always meant, and the price
 * of that is paid on every correct deletion. This is paid only by the person
 * who erred, and only for a moment.
 */
export function UndoBar({
  visible,
  message,
  onUndo,
  onDismiss,
  seconds = 10,
}: {
  visible: boolean;
  message: string;
  onUndo: () => void | Promise<void>;
  onDismiss: () => void;
  /** Ten seconds: long enough to read the strip, notice, and reach it. */
  seconds?: number;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  /**
   * Seconds left, shown as a number and as a draining line.
   *
   * A strip that vanishes on its own leaves the reader guessing whether it is
   * about to: he starts reading, looks away, and it is gone. Counting down in
   * plain sight turns «успею ли» into a fact he can see.
   */
  const [left, setLeft] = useState(seconds);
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
    if (tick.current) clearInterval(tick.current);
    if (visible) {
      setLeft(seconds);
      timer.current = setTimeout(onDismiss, seconds * 1000);
      tick.current = setInterval(() => {
        setLeft((n) => (n > 0 ? n - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (tick.current) clearInterval(tick.current);
    };
    // onDismiss is stable enough here; re-arming on every render would mean
    // the strip never times out while the screen is busy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, seconds]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity: fade }]} pointerEvents="box-none">
      <View style={styles.bar}>
        <Ionicons name="trash-outline" size={16} color="#e2e8f0" />
        <Text style={styles.text} numberOfLines={2}>
          {message}
        </Text>
        <Pressable
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onUndo();
            } finally {
              setBusy(false);
              onDismiss();
            }
          }}
          hitSlop={8}
        >
          <Text style={styles.action}>
            {busy ? t('common.undoing') : t('common.undo')}
            {!busy && left > 0 ? ` · ${left}` : ''}
          </Text>
        </Pressable>
      </View>
      {/* The same countdown without numbers, for the corner of the eye. */}
      <View style={styles.trackWrap}>
        <View
          style={[
            styles.track,
            { width: `${Math.max(0, (left / seconds) * 100)}%` },
          ]}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    // Above the tab bar, not under it.
    bottom: 86,
    alignItems: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 520,
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  text: { flex: 1, color: '#e2e8f0', fontSize: 13.5, lineHeight: 18 },
  trackWrap: {
    width: '100%',
    maxWidth: 520,
    height: 3,
    marginTop: -3,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(148,163,184,0.25)',
  },
  track: { height: 3, backgroundColor: '#38bdf8' },
  action: {
    color: '#38bdf8',
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
