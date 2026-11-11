import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, territoriesApi } from '../../lib/api';
import { formatDayShort, siteOrigin } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

/**
 * «Открыть карту» in the phone app (11 November 2026): the app has no map
 * of its own yet, so it asks the server for a two-hour link and opens the
 * territory's map in the phone's browser — no second login there.
 */
export function OpenMapButton({ assignmentId }: { assignmentId: string }) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const open = useMutation({
    mutationFn: () => territoriesApi.viewLink(assignmentId),
    onSuccess: (r) => {
      setError(null);
      void WebBrowser.openBrowserAsync(`${siteOrigin()}${r.path}`);
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  return (
    <View>
      <Pressable
        onPress={() => open.mutate()}
        disabled={open.isPending}
        style={({ pressed }) => [s.mapLink, pressed && { opacity: 0.7 }]}
        accessibilityRole="link"
      >
        <Ionicons name="map-outline" size={20} color={BRAND} />
        <View style={{ flex: 1 }}>
          <Text style={s.mapLinkTitle}>{t('territories.my.openMap')}</Text>
          <Text style={s.mapLinkHint}>{t('territories.my.openMapHint')}</Text>
        </View>
        {open.isPending ? (
          <ActivityIndicator color={BRAND} />
        ) : (
          <Ionicons name="open-outline" size={16} color={MUTED} />
        )}
      </Pressable>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * «Ссылка без входа»: for a holder without the app, or the partner he walks
 * with. Shows the map only, works until the day the territory is due, and
 * stops the moment it comes back. A new link replaces the last one.
 */
export function ShareLink({ assignmentId }: { assignmentId: string }) {
  const { t, i18n } = useTranslation();
  const [link, setLink] = useState<{ url: string; dueOn: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const make = useMutation({
    mutationFn: () => territoriesApi.shareLink(assignmentId),
    onSuccess: (r) => {
      setError(null);
      setCopied(false);
      setLink({ url: `${siteOrigin()}${r.path}`, dueOn: r.dueOn });
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: () => territoriesApi.revokeShareLink(assignmentId),
    onSuccess: () => setLink(null),
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const give = (text: string) => {
    // On a computer the clipboard; on a phone the share sheet, to a
    // messenger (as components/StageScreenSheets.tsx does).
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard
        .writeText(text)
        .then(() => setCopied(true))
        .catch(() => void Share.share({ message: text }));
    } else {
      void Share.share({ message: text });
    }
  };

  if (!link) {
    return (
      <View style={s.box}>
        <Pressable
          onPress={() => make.mutate()}
          disabled={make.isPending}
          style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Ionicons name="link-outline" size={17} color={INK} />
          <Text style={s.btnText}>{t('territories.link.make')}</Text>
          {make.isPending ? <ActivityIndicator color={BRAND} /> : null}
        </Pressable>
        <Text style={s.hint}>{t('territories.link.makeHint')}</Text>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    );
  }
  return (
    <View style={[s.box, s.made]}>
      <Text style={s.url} selectable>
        {link.url}
      </Text>
      <Text style={s.hint}>
        {link.dueOn
          ? t('territories.link.until', { date: formatDayShort(link.dueOn, i18n.language) })
          : t('territories.link.untilBack')}
      </Text>
      <View style={s.row}>
        <Pressable onPress={() => give(link.url)} style={[s.btn, s.btnPrimary]} accessibilityRole="button">
          <Ionicons
            name={Platform.OS === 'web' ? (copied ? 'checkmark' : 'copy-outline') : 'share-outline'}
            size={17}
            color="#fff"
          />
          <Text style={[s.btnText, { color: '#fff' }]}>
            {Platform.OS === 'web'
              ? copied
                ? t('territories.link.copied')
                : t('territories.link.copy')
              : t('territories.link.send')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => revoke.mutate()}
          disabled={revoke.isPending}
          style={s.btn}
          accessibilityRole="button"
        >
          <Text style={s.btnText}>{t('territories.link.revoke')}</Text>
        </Pressable>
      </View>
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  mapLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ecfeff',
    borderColor: '#a5f3fc',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  mapLinkTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  mapLinkHint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  box: { marginTop: 14, gap: 6 },
  made: { borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 12, backgroundColor: '#f8fafc' },
  url: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#fff',
  },
  btnPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  btnText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 4 },
});
