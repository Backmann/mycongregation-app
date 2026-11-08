import { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  CalendarFeedOptions,
  CalendarFeedView,
  meApi,
} from '../../../lib/api';
import { LoadError } from '../../../components/LoadError';
import { confirm } from '../../../components/ConfirmHost';
import { notify } from '../../../lib/error-bus';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { failsScreen } from '../../../lib/screen-failure';

/**
 * «Профиль → Календарь» (8 November 2026): the person's assignments in the
 * calendar of their phone, through a live subscription the server keeps
 * (mycongregation-server: /me/calendar-feed, /calendar/<token>.ics).
 *
 * Three states: not connected (where is your calendar?), connected (when it
 * last fetched, what is in it, a new link, off), and switched off for the
 * person (the password changed) — said as that, with the way back.
 */

export const CALENDAR_FEED_KEY = ['calendar-feed'] as const;

/** A calendar that has not read the link for this long is worth a word. */
const STALE_DAYS = 3;

type Target = 'apple' | 'google' | 'other';

/** Google's own «add a calendar by its address» page. */
export function googleAddUrl(webcalUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function CalendarScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { myPublisher, asked } = useMyPublisher({ kept: false });
  const q = useQuery({
    throwOnError: failsScreen,
    queryKey: CALENDAR_FEED_KEY,
    queryFn: () => meApi.calendarFeed(),
  });
  const [showTargets, setShowTargets] = useState(false);
  const [googleHelp, setGoogleHelp] = useState(false);
  const [linkShown, setLinkShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<Target | 'rotate' | 'off' | null>(null);

  const put = (v: CalendarFeedView) => qc.setQueryData(CALENDAR_FEED_KEY, v);

  const options = useMutation({
    mutationFn: (patch: Partial<CalendarFeedOptions>) =>
      meApi.setCalendarFeedOptions(patch),
    onMutate: async (patch) => {
      const before = qc.getQueryData<CalendarFeedView>(CALENDAR_FEED_KEY);
      if (before) put({ ...before, options: { ...before.options, ...patch } });
      return { before };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.before) put(ctx.before);
      notify(t('calendarFeed.failed'));
    },
    onSuccess: put,
  });

  const lang = i18n.language?.split('-')[0] || 'ru';
  const fmtTime = (d: Date) =>
    new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' }).format(d);
  const fmtDate = (d: Date, withTime = false) =>
    new Intl.DateTimeFormat(lang, {
      day: 'numeric',
      month: 'long',
      ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    }).format(d);

  /**
   * Connects if needed, then hands the link to the chosen calendar. On the
   * web a window must be opened inside the tap itself, or the browser blocks
   * it: so Google's page gets an empty window first, filled once the link is
   * known.
   */
  const open = async (target: Target) => {
    if (busy) return;
    const pre =
      Platform.OS === 'web' && target === 'google' && typeof window !== 'undefined'
        ? window.open('', '_blank')
        : null;
    setBusy(target);
    try {
      const view =
        q.data?.connected && q.data.url
          ? q.data
          : await meApi.connectCalendarFeed();
      put(view);
      const url = view.url;
      const webcal = view.webcalUrl;
      // The server always sends both for a connected link; anything else
      // falls to the «did not work» toast below.
      if (!url || !webcal) throw new TypeError();
      if (target === 'apple') {
        if (Platform.OS === 'web') window.location.href = webcal;
        else await Linking.openURL(webcal);
      } else if (target === 'google') {
        setGoogleHelp(true);
        const g = googleAddUrl(webcal);
        if (pre) pre.location.href = g;
        else await Linking.openURL(g);
      } else {
        setLinkShown(url);
        await copyOrShare(url);
      }
      setShowTargets(false);
    } catch {
      pre?.close();
      notify(t('calendarFeed.failed'));
    } finally {
      setBusy(null);
    }
  };

  const copyOrShare = async (url: string) => {
    if (
      Platform.OS === 'web' &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard
    ) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        return;
      } catch {
        // No clipboard here: the link stays on the screen to copy by hand.
      }
    }
    if (Platform.OS !== 'web') {
      await Share.share({ message: t('calendarFeed.shareMessage', { url }) });
    }
  };

  const rotate = async () => {
    const ok = await confirm({
      title: t('calendarFeed.rotateConfirmTitle'),
      body: t('calendarFeed.rotateConfirmBody'),
      confirmLabel: t('calendarFeed.rotateConfirm'),
    });
    if (!ok) return;
    setBusy('rotate');
    try {
      put(await meApi.rotateCalendarFeed());
      setLinkShown(null);
      setCopied(false);
      setShowTargets(true);
    } catch {
      notify(t('calendarFeed.failed'));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    const ok = await confirm({
      title: t('calendarFeed.disconnectConfirmTitle'),
      body: t('calendarFeed.disconnectConfirmBody'),
      confirmLabel: t('calendarFeed.disconnectConfirm'),
      danger: true,
    });
    if (!ok) return;
    setBusy('off');
    try {
      put(await meApi.disconnectCalendarFeed());
      setLinkShown(null);
      setCopied(false);
      setGoogleHelp(false);
    } catch {
      notify(t('calendarFeed.failed'));
    } finally {
      setBusy(null);
    }
  };

  if (q.isError) {
    return <LoadError onRetry={() => void q.refetch()} />;
  }
  if (!q.data || !asked) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color="#0e7490" />
      </View>
    );
  }
  const v = q.data;
  const connected = v.connected;

  const targets = (
    <View style={styles.card}>
      {(
        [
          ['apple', 'phone-portrait-outline'],
          ['google', 'logo-google'],
          ['other', 'copy-outline'],
        ] as const
      ).map(([target, icon], i) => (
        <Pressable
          key={target}
          accessibilityRole="button"
          disabled={!!busy}
          onPress={() => void open(target)}
          style={({ pressed }) => [
            styles.row,
            i > 0 && styles.rowDivided,
            pressed && styles.rowPressed,
          ]}
        >
          <View style={styles.rowIcon}>
            <Ionicons name={icon} size={20} color="#334155" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t(`calendarFeed.${target}`)}</Text>
            <Text style={styles.rowSubtitle}>
              {t(`calendarFeed.${target}Hint`)}
            </Text>
          </View>
          {busy === target ? (
            <ActivityIndicator color="#0e7490" />
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          )}
        </Pressable>
      ))}
    </View>
  );

  const fetched = v.lastFetchedAt ? new Date(v.lastFetchedAt) : null;
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const client = v.lastClient
    ? ` (${t(`calendarFeed.client.${v.lastClient}`, { defaultValue: v.lastClient })})`
    : '';
  const fetchedLine = !fetched
    ? t('calendarFeed.fetchedNever')
    : (sameLocalDay(fetched, now)
        ? t('calendarFeed.fetchedToday', { time: fmtTime(fetched) })
        : sameLocalDay(fetched, yesterday)
          ? t('calendarFeed.fetchedYesterday', { time: fmtTime(fetched) })
          : t('calendarFeed.fetchedOn', { date: fmtDate(fetched, true) })) +
      client;
  const created = v.createdAt ? new Date(v.createdAt) : null;
  // Stale: read long ago — or never, though connected for days.
  const stale =
    (fetched && now.getTime() - fetched.getTime() > STALE_DAYS * 86_400_000) ||
    (!fetched &&
      created &&
      now.getTime() - created.getTime() > STALE_DAYS * 86_400_000);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {!myPublisher ? (
        <Text style={styles.note}>{t('calendarFeed.noCard')}</Text>
      ) : null}

      {connected ? (
        <View style={styles.okCard}>
          <View style={styles.okTop}>
            <View style={styles.okIcon}>
              <Ionicons name="checkmark" size={24} color="#166534" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.okTitle} accessibilityRole="header">
                {t('calendarFeed.connectedTitle')}
              </Text>
              {created ? (
                <Text style={styles.okSub}>
                  {t('calendarFeed.connectedSince', { date: fmtDate(created) })}
                </Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.fetch}>{fetchedLine}</Text>
          {stale ? (
            <Text style={styles.warn}>{t('calendarFeed.staleWarn')}</Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.intro}>
          {v.revokedReason ? (
            <View style={styles.stopped}>
              <Text style={styles.stoppedTitle} accessibilityRole="header">
                {t('calendarFeed.stoppedTitle')}
              </Text>
              <Text style={styles.stoppedText}>
                {v.revokedReason === 'sessions_ended'
                  ? t('calendarFeed.stopped_sessions_ended')
                  : t('calendarFeed.stopped_other')}
              </Text>
            </View>
          ) : null}
          <View style={styles.introIcon}>
            <Ionicons name="calendar-outline" size={26} color="#0e5f75" />
          </View>
          <Text style={styles.introTitle} accessibilityRole="header">
            {t('calendarFeed.introTitle')}
          </Text>
          <Text style={styles.introText}>{t('calendarFeed.introText')}</Text>
        </View>
      )}

      {googleHelp ? (
        <Text style={styles.help}>{t('calendarFeed.googleSteps')}</Text>
      ) : null}
      {linkShown ? (
        <View style={styles.linkBox}>
          <Text style={styles.label}>{t('calendarFeed.linkLabel')}</Text>
          <Text selectable style={styles.link}>
            {linkShown}
          </Text>
          <Text style={styles.linkWarn}>
            {copied ? `${t('calendarFeed.copied')}. ` : ''}
            {t('calendarFeed.linkWarn')}
          </Text>
        </View>
      ) : null}

      {!connected || showTargets ? (
        <>
          <Text style={styles.label} accessibilityRole="header">
            {t('calendarFeed.whereLabel')}
          </Text>
          {targets}
        </>
      ) : null}

      <Text style={styles.label} accessibilityRole="header">
        {t('calendarFeed.whatLabel')}
      </Text>
      <View style={styles.card}>
        {(['mine', 'events', 'names'] as const).map((key, i) => {
          const name = key[0].toUpperCase() + key.slice(1);
          return (
            <View key={key} style={[styles.row, i > 0 && styles.rowDivided]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t(`calendarFeed.opt${name}`)}</Text>
                <Text style={styles.rowSubtitle}>
                  {t(`calendarFeed.opt${name}Hint`)}
                </Text>
              </View>
              {/* Before connecting there is nothing to switch yet: a grey,
                  disabled switch read as «off». So a plain tick says what
                  the calendar WILL hold; the switches come with the link. */}
              {connected ? (
                <Switch
                  value={v.options[key]}
                  accessibilityLabel={t(`calendarFeed.opt${name}`)}
                  onValueChange={(next: boolean) =>
                    options.mutate({ [key]: next })
                  }
                />
              ) : (
                <Ionicons name="checkmark-circle" size={24} color="#0e7490" />
              )}
            </View>
          );
        })}
      </View>

      {connected ? (
        <>
          <Text style={styles.label} accessibilityRole="header">
            {t('calendarFeed.manageLabel')}
          </Text>
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowTargets((x) => !x)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t('calendarFeed.addDevice')}</Text>
                <Text style={styles.rowSubtitle}>
                  {t('calendarFeed.addDeviceHint')}
                </Text>
              </View>
              <Ionicons
                name={showTargets ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#94a3b8"
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!!busy}
              onPress={() => void rotate()}
              style={({ pressed }) => [
                styles.row,
                styles.rowDivided,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t('calendarFeed.rotate')}</Text>
                <Text style={styles.rowSubtitle}>
                  {t('calendarFeed.rotateHint')}
                </Text>
              </View>
              {busy === 'rotate' ? <ActivityIndicator color="#0e7490" /> : null}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={!!busy}
              onPress={() => void disconnect()}
              style={({ pressed }) => [
                styles.row,
                styles.rowDivided,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, styles.danger]}>
                  {t('calendarFeed.disconnect')}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {t('calendarFeed.disconnectHint')}
                </Text>
              </View>
              {busy === 'off' ? <ActivityIndicator color="#b91c1c" /> : null}
            </Pressable>
          </View>
        </>
      ) : null}

      <View style={styles.noteRow}>
        <Ionicons name="time-outline" size={18} color="#0e7490" />
        <Text style={styles.note}>{t('calendarFeed.noteRefresh')}</Text>
      </View>
      <View style={styles.noteRow}>
        <Ionicons name="lock-closed-outline" size={18} color="#0e7490" />
        <Text style={styles.note}>{t('calendarFeed.noteStorage')}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  intro: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 8 },
  introIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#e6f4f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 20,
    lineHeight: 26,
    color: '#0f172a',
  },
  introText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    lineHeight: 22,
    color: '#334155',
  },
  stopped: {
    backgroundColor: '#fff4e0',
    borderRadius: 12,
    padding: 12,
    gap: 4,
    marginBottom: 4,
  },
  stoppedTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#7c2d12' },
  stoppedText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#7c2d12',
  },
  okCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, gap: 10 },
  okTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  okIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#e3f6e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  okTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: '#0f172a' },
  okSub: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#475569' },
  fetch: {
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 10,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
  },
  warn: {
    backgroundColor: '#fff4e0',
    borderRadius: 10,
    padding: 10,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#7c2d12',
  },
  help: {
    backgroundColor: '#e0f2fe',
    borderRadius: 12,
    padding: 12,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#0c4a6e',
  },
  linkBox: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 6 },
  link: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    color: '#0f172a',
  },
  linkWarn: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 18,
    color: '#7c2d12',
  },
  label: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 10,
    marginLeft: 4,
  },
  card: { backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  rowPressed: { opacity: 0.7 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15.5, color: '#0f172a' },
  rowSubtitle: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    color: '#475569',
    marginTop: 2,
  },
  danger: { color: '#b91c1c' },
  noteRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, marginTop: 4 },
  note: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
  },
});
