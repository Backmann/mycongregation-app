import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onErrorReported } from '../lib/error-bus';

const VISIBLE_MS = 6000;

/**
 * A strip along the bottom of the screen saying what failed. Until now most
 * requests failed in silence — the screen simply did not change — so a person
 * could not tell a slow network from a refused action. Tapping dismisses it;
 * otherwise it fades away on its own.
 */
export function ErrorToast() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return onErrorReported((m) => {
      setMessage(m);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(null), VISIBLE_MS);
    });
  }, []);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [message, opacity]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!message) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity }]} pointerEvents="box-none">
      <Pressable style={styles.toast} onPress={() => setMessage(null)}>
        <Ionicons name="alert-circle" size={18} color="#fecaca" />
        <Text style={styles.text} numberOfLines={3}>
          {message}
        </Text>
        <Ionicons name="close" size={16} color="#fecaca" />
      </Pressable>
    </Animated.View>
  );
}

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
    backgroundColor: '#7f1d1d',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { flex: 1, color: '#fff', fontSize: 13.5, lineHeight: 19 },
});
