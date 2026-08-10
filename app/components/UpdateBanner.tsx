import React from 'react';
import { View, Text, Pressable, StyleSheet, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { appVersionApi } from '../lib/api';

/**
 * «Вышла новая версия приложения» — said by the app that is behind.
 *
 * Written now, on purpose, ahead of the rebuild it exists for: after the next
 * native build everyone has to install a new APK, and an app that can announce
 * that itself saves announcing it to each brother by hand. Shipped over the
 * air today, it will already be sitting on every phone when the day comes.
 *
 * Two strengths, and the server decides which:
 *   current — a strip that can be dismissed. Most updates are worth having and
 *     nothing breaks without them.
 *   minimum — no dismissing. An app too old to understand this server gives
 *     wrong answers rather than no answers, which is worse.
 *
 * Web is exempt: a browser reloads the newest build every time, so there is
 * nothing to install and nothing to warn about.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = React.useState(false);

  const mine = Constants.expoConfig?.version ?? null;

  const { data } = useQuery({
    queryKey: ['app-version'],
    queryFn: () => appVersionApi.get(),
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: Platform.OS !== 'web',
  });

  if (Platform.OS === 'web' || !mine || !data) return null;

  const behind = (target: string | null) =>
    !!target && compareVersions(mine, target) < 0;

  const blocked = behind(data.minimum);
  const outdated = blocked || behind(data.current);
  if (!outdated || (dismissed && !blocked)) return null;

  return (
    <View style={[styles.bar, blocked && styles.barBlocking]}>
      <Ionicons
        name={blocked ? 'alert-circle' : 'arrow-up-circle-outline'}
        size={18}
        color={blocked ? '#7f1d1d' : '#0c4a6e'}
      />
      <Text style={[styles.text, blocked && styles.textBlocking]}>
        {blocked ? t('update.required') : t('update.available')}
      </Text>
      <Pressable
        onPress={() => void Linking.openURL(data.downloadUrl)}
        hitSlop={8}
      >
        <Text style={[styles.action, blocked && styles.actionBlocking]}>
          {t('update.get')}
        </Text>
      </Pressable>
      {blocked ? null : (
        <Pressable onPress={() => setDismissed(true)} hitSlop={8}>
          <Ionicons name="close" size={16} color="#0369a1" />
        </Pressable>
      )}
    </View>
  );
}

/**
 * «1.2.10» is newer than «1.2.9», which a string comparison gets wrong — the
 * one place this could quietly mislead, so it compares numbers.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderBottomWidth: 1,
    borderBottomColor: '#bae6fd',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  barBlocking: { backgroundColor: '#fef2f2', borderBottomColor: '#fecaca' },
  text: { flex: 1, fontSize: 13, color: '#0c4a6e', lineHeight: 18 },
  textBlocking: { color: '#7f1d1d' },
  action: {
    fontSize: 13.5,
    color: '#0ea5e9',
    fontFamily: 'Manrope_700Bold',
  },
  actionBlocking: { color: '#b91c1c' },
});
