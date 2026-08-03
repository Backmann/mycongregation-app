import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage } from '../lib/api';

/**
 * "We could not ask" — said as itself, and never as an answer.
 *
 * A screen that cannot reach the server knows only that it failed; it does not
 * know what the answer would have been. Reporting the failure as a fact about
 * the person is how «Ваш аккаунт не привязан к записи возвещателя» came to be
 * shown to publishers whose accounts were perfectly fine, sending them to an
 * elder over a lost connection.
 *
 * So: what happened, what to do, a button that tries again, and the technical
 * line kept small underneath — useful to whoever is asked for help, and not in
 * the way of whoever is not.
 */
export function LoadFailure({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const detail = extractErrorMessage(error);
  return (
    <View style={styles.box}>
      <Ionicons name="cloud-offline-outline" size={28} color="#94a3b8" />
      <Text style={styles.title}>{t('common.loadFailed')}</Text>
      <Text style={styles.hint}>{t('common.loadFailedHint')}</Text>
      {onRetry ? (
        <Pressable
          style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}
          onPress={onRetry}
        >
          <Ionicons name="refresh-outline" size={16} color="#fff" />
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', padding: 24, gap: 6 },
  title: {
    fontSize: 16,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    marginTop: 6,
  },
  hint: {
    fontSize: 13.5,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
  },
  retry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  detail: {
    fontSize: 11.5,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
});
