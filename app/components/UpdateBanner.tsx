import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { appVersionApi } from '../lib/api';

/**
 * «Вышла новая версия» — now a badge in the header, not a bar above everything.
 *
 * The first version was a full-width strip at the very top of the app. It
 * worked, and it was in the way: it pushed every screen down by its own height,
 * sat above the header where nothing else lives, and put its button at the
 * furthest reach of a thumb. An invitation nobody minds ignoring should not
 * cost the whole app a centimetre.
 *
 * So the ordinary case became a small pill in the header — present, tappable,
 * and costing nothing when unread.
 *
 * The BLOCKING case keeps the strip, and deliberately. When a build is too old
 * to talk to this server it gives wrong answers rather than none, and that is
 * not something to mention discreetly in a corner.
 */

/** What the server expects, judged against what this build is. */
export function useUpdateStatus(): {
  outdated: boolean;
  blocked: boolean;
  downloadUrl: string | null;
} {
  const mine = Constants.expoConfig?.version ?? null;

  const { data } = useQuery({
    queryKey: ['app-version'],
    queryFn: () => appVersionApi.get(),
    staleTime: 60 * 60 * 1000,
    retry: false,
    // A browser reloads the newest build every time: nothing to install and
    // nothing to warn about.
    enabled: Platform.OS !== 'web',
  });

  if (Platform.OS === 'web' || !mine || !data) {
    return { outdated: false, blocked: false, downloadUrl: null };
  }

  const behind = (target: string | null) =>
    !!target && compareVersions(mine, target) < 0;

  const blocked = behind(data.minimum);
  return {
    outdated: blocked || behind(data.current),
    blocked,
    downloadUrl: data.downloadUrl,
  };
}

/**
 * The pill that lives in a header.
 *
 * White on the brand colour, which is the only tone that carries there — the
 * same reason the header's own icons are white. Nothing at all when the build
 * is current, so the header is not holding space for a message that is usually
 * absent.
 */
export function UpdateChip() {
  const { t } = useTranslation();
  const { outdated, downloadUrl } = useUpdateStatus();
  if (!outdated || !downloadUrl) return null;

  return (
    <Pressable
      onPress={() => void Linking.openURL(downloadUrl)}
      hitSlop={8}
      style={({ pressed }) => [styles.chip, pressed && { opacity: 0.75 }]}
      accessibilityLabel={t('update.available')}
    >
      <Ionicons name="arrow-down-circle" size={15} color="#0e7490" />
      <Text style={styles.chipText}>{t('update.get')}</Text>
    </Pressable>
  );
}

/**
 * The strip, kept for the one case that earns it: a build the server can no
 * longer talk to. There is no dismissing this one.
 */
export function UpdateBanner() {
  const { t } = useTranslation();
  const { blocked, downloadUrl } = useUpdateStatus();
  if (!blocked || !downloadUrl) return null;

  return (
    <View style={styles.bar}>
      <Ionicons name="alert-circle" size={18} color="#7f1d1d" />
      <Text style={styles.text}>{t('update.required')}</Text>
      <Pressable onPress={() => void Linking.openURL(downloadUrl)} hitSlop={8}>
        <Text style={styles.action}>{t('update.get')}</Text>
      </Pressable>
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingLeft: 8,
    paddingRight: 11,
    paddingVertical: 5,
  },
  chipText: {
    color: '#0e7490',
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderBottomWidth: 1,
    borderBottomColor: '#fecaca',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  text: { flex: 1, fontSize: 13, color: '#7f1d1d', lineHeight: 18 },
  action: {
    fontSize: 13.5,
    color: '#b91c1c',
    fontFamily: 'Manrope_700Bold',
  },
});
