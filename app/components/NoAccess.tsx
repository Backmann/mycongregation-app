import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';

/**
 * «Not yours» — said one way, wherever it is said.
 *
 * It was said in eleven: «Доступно только администратору», «Раздел доступен
 * старейшинам», «Снимать речи может координатор…», and on some screens not
 * said at all — an empty list stood where the refusal should have been, and
 * read as «there are no tasks».
 *
 * Used by the gate that stands before every screen (ScreenGate) and by
 * LoadFailure when it is the server that says no. No button to try again:
 * trying again cannot help.
 */
export function NoAccess({ hint }: { hint?: string } = {}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // «Обратитесь к старейшинам» said to an elder or the administrator sent
  // him to himself (audit, 22 October 2026).
  const leads = user?.role === 'admin' || user?.role === 'elder';
  return (
    <View style={styles.box}>
      <Ionicons name="lock-closed-outline" size={28} color="#94a3b8" />
      <Text style={styles.title}>{t('common.noAccessTitle')}</Text>
      <Text style={styles.hint}>{hint ?? t(leads ? 'common.noAccessHintLead' : 'common.noAccessHint')}</Text>
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
    fontFamily: 'Manrope_400Regular',
    fontSize: 13.5,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
  },
});
