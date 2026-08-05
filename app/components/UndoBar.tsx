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
  seconds = 8,
}: {
  visible: boolean;
  message: string;
  onUndo: () => void | Promise<void>;
  onDismiss: () => void;
  seconds?: number;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
    if (visible) {
      timer.current = setTimeout(onDismiss, seconds * 1000);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
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
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
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
  action: {
    color: '#38bdf8',
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
