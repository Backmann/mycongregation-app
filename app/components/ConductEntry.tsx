import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { conductLiveApi, conductRunsApi, meApi, meetingSettingsApi, serverClockOffset, specialEventsApi } from '../lib/api';
import { effectiveVersionFor } from '../lib/meeting-schedule';
import { weekRules } from '../lib/week-rules';
import { fromWire, isAppointedBrother } from '../lib/conduct-live';
import { clock } from './ConductSummary';
import { addDays } from '../lib/dates';
import { useAuth } from '../lib/auth';
import { formatDateISO, startOfWeekMonday } from '../lib/dates';

/**
 * THE DOOR INTO CONDUCT MODE — an offer, not a route anyone has to take.
 *
 * Not every chairman will want a screen counting his minutes; plenty will
 * simply read the programme as they always have. So this stays a quiet
 * secondary button rather than anything that announces itself, it is never
 * made more prominent for somebody who has not used it, and conduct mode is
 * never opened in anybody's place.
 *
 * IT DECIDES FOR ITSELF WHETHER TO APPEAR. The screen that hosts it passes the
 * week and who is chairing it, and nothing else — no visibility flags, no
 * permission checks copied into the caller. That is deliberate: the schedule
 * is about to be rebuilt into a feed of days, and this button then moves onto
 * the midweek day's row. When it does, the move is one line at the call site
 * and nothing here changes.
 *
 * WHO SEES IT: the chairman named in that week's programme, and an admin.
 * Once the meeting's day has passed (not only its week — 16 October 2026)
 * there is no "conduct" button: a meeting that has been held cannot be
 * conducted; what is offered is the result link (ConductResultLink).
 *
 * There is NO time window on purpose. A chairman may well open the run sheet
 * the night before to see where the evening is tight, and a button that
 * appears an hour before the meeting would have to be worked out from the
 * device's clock rather than the congregation's — a quiet untruth for the sake
 * of hiding something harmless.
 */
export function ConductEntry({
  week,
  chairmanPublisherId,
}: {
  /** Monday of the week, 'YYYY-MM-DD'. */
  week: string;
  /** Who is chairing this midweek meeting, if anybody is yet. */
  chairmanPublisherId: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();

  // Same key conduct mode uses, so this costs no request of its own.
  const { data } = useQuery({
    queryKey: ['me-publisher'],
    queryFn: () => meApi.publisher(),
  });

  // The meeting's day: once it has passed, the meeting is not conducted
  // again — only its result is offered (16 October 2026). Same keys as the
  // duties sheet, so no request of their own.
  const { data: settings } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });
  const { data: events } = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
    staleTime: 60 * 60 * 1000,
  });
  const myPublisherId = data?.publisher?.id ?? null;
  const isChairman = !!chairmanPublisherId && chairmanPublisherId === myPublisherId;
  const isAdmin = user?.role === 'admin';
  // Both sides are 'YYYY-MM-DD', which compares correctly as text.
  const thisWeek = formatDateISO(startOfWeekMonday(new Date()));
  const meetingDay = weekRules({
    weekStartISO: week,
    version: effectiveVersionFor(settings?.versions, week),
    events: events ?? [],
  }).dateOf('midweek');
  const over = week < thisWeek || (!!meetingDay && meetingDay < formatDateISO(new Date()));
  if ((!isChairman && !isAdmin) || over) {
    return <ConductResultLink week={week} chairmanPublisherId={chairmanPublisherId} />;
  }

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push(`/schedule/conduct?week=${week}` as any)}
      accessibilityRole="button"
    >
      <Ionicons name="play-circle-outline" size={18} color="#0369a1" />
      <Text style={styles.label}>{t('conduct.open')}</Text>
    </Pressable>
  );
}

/**
 * «ИТОГ ВСТРЕЧИ» — how a midweek meeting ran, for its seven days
 * (14 October 2026).
 *
 * Shown to whoever may read it — the chairman of that week and every
 * appointed brother, by role or by card (the server holds the same rule,
 * common/appointed-brother.ts) — and only when there IS a result:
 * a link to an empty page would be a promise the screen cannot keep. Asked
 * of the server once per meeting the reader opens; never kept on the device.
 */
export function ConductResultLink({
  week,
  chairmanPublisherId,
}: {
  week: string;
  chairmanPublisherId: string | null;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: me } = useQuery({
    queryKey: ['me-publisher'],
    queryFn: () => meApi.publisher(),
  });
  const isChairman =
    !!chairmanPublisherId && chairmanPublisherId === (me?.publisher?.id ?? null);
  const mayRead = isAppointedBrother(user?.role, me?.publisher?.appointment) || isChairman;
  const thisWeek = formatDateISO(startOfWeekMonday(new Date()));
  const { data: run } = useQuery({
    queryKey: ['conduct-run', week],
    queryFn: () => conductRunsApi.get(week),
    enabled: mayRead && week <= thisWeek,
    retry: false,
  });
  if (!mayRead || !run) return null;
  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push(`/schedule/conduct?week=${week}` as any)}
      accessibilityRole="button"
    >
      <Ionicons name="stats-chart-outline" size={17} color="#0369a1" />
      <Text style={styles.label}>{t('conduct.result.open')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  label: { color: '#0369a1', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  liveCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    padding: 16,
    gap: 4,
  },
  resultCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
    padding: 16,
    gap: 4,
  },
  resultKeep: { fontSize: 13, fontFamily: 'Manrope_400Regular', color: '#94a3b8' },
  liveHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16a34a' },
  liveTitle: { fontSize: 17, fontFamily: 'Manrope_700Bold', color: '#0f172a', flex: 1 },
  liveSub: { fontSize: 14, fontFamily: 'Manrope_400Regular', color: '#475569' },
  liveAction: { fontSize: 14, fontFamily: 'Manrope_700Bold', color: '#0369a1', marginTop: 4 },
});

/**
 * «ИДЁТ ВСТРЕЧА · LIVE» on the home screen (15 October 2026) — for the
 * appointed brothers, who may watch the meeting run (Lionel), and the door
 * into conduct mode for the timekeeper, who has no schedule editor to find it
 * in. The server decides who gets an answer: a publisher who is neither is
 * refused once, and the card never asks again.
 *
 * Asked once a minute while home is open — enough to appear soon after the
 * meeting starts; the conduct screen itself asks every two seconds.
 */
export function ConductLiveCard() {
  const { t } = useTranslation();
  const week = formatDateISO(startOfWeekMonday(new Date()));
  const { data } = useQuery({
    queryKey: ['conduct-live-home', week],
    queryFn: () => conductLiveApi.get(week),
    retry: false,
    refetchInterval: (q) => {
      const st = (q.state.error as { response?: { status?: number } } | null)?.response?.status;
      return st === 403 || st === 404 ? false : 60_000;
    },
  });
  // The meeting's day, so the timekeeper's card is gone once it is over —
  // the live row itself lasts only a day, and after it the week goes on.
  const { data: settings } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });
  if (!data) return null;
  const meetingDay = weekRules({
    weekStartISO: week,
    version: effectiveVersionFor(settings?.versions, week),
    events: [],
  }).dateOf('midweek');
  const today = formatDateISO(new Date());
  const run = data.live ? fromWire(data.live.state, serverClockOffset()) : null;
  const running = !!run && run.meetingStartedAt !== null && run.finishedAt === null;
  const keeperToCome =
    !running && !!data.roles?.isTimekeeper && !(run && run.finishedAt !== null) && !!meetingDay && today <= meetingDay;
  if (!running && !keeperToCome) return null;
  const mine = !!data.live?.mine;
  return (
    <Pressable
      style={styles.liveCard}
      onPress={() => router.push(`/schedule/conduct?week=${week}` as any)}
      accessibilityRole="button"
    >
      <View style={styles.liveHead}>
        {running ? <View style={styles.liveDot} /> : <Ionicons name="stopwatch-outline" size={18} color="#ea580c" />}
        <Text style={styles.liveTitle}>{running ? t('conduct.live.cardRunning') : t('conduct.live.cardKeeper')}</Text>
      </View>
      <Text style={styles.liveSub}>
        {running
          ? mine
            ? t('conduct.live.cardYou')
            : t('conduct.live.cardBy', { name: data.live?.controllerName ?? t('conduct.live.someone') })
          : t('conduct.live.cardKeeperHint')}
      </Text>
      <Text style={styles.liveAction}>
        {running && !mine ? t('conduct.live.watch') : t('conduct.live.open')}
      </Text>
    </Pressable>
  );
}

/**
 * «ИТОГ ВСТРЕЧИ» ON THE HOME SCREEN (15 October 2026) — for every appointed
 * brother, for the seven days the result is kept, then it goes by itself
 * (Lionel: «чтобы итог хранился в удобном месте и его 7 дней видели все
 * назначенные братья»). The last midweek meeting with a result: this week's,
 * or last week's while it is still kept. Nothing to show — no card.
 */
export function ConductResultCard() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { data: me } = useQuery({
    queryKey: ['me-publisher'],
    queryFn: () => meApi.publisher(),
  });
  const appointed = isAppointedBrother(user?.role, me?.publisher?.appointment);
  const monday = startOfWeekMonday(new Date());
  const thisWeek = formatDateISO(monday);
  const lastWeek = formatDateISO(addDays(monday, -7));
  // The same keys the conduct screen and the result link use: one request each.
  const thisQ = useQuery({
    queryKey: ['conduct-run', thisWeek],
    queryFn: () => conductRunsApi.get(thisWeek),
    enabled: appointed,
    retry: false,
  });
  const lastQ = useQuery({
    queryKey: ['conduct-run', lastWeek],
    queryFn: () => conductRunsApi.get(lastWeek),
    enabled: appointed && !thisQ.isPending && !thisQ.data,
    retry: false,
  });
  const { data: settings } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });
  const run = thisQ.data ?? lastQ.data ?? null;
  if (!appointed || !run) return null;
  const meetingDay = weekRules({
    weekStartISO: run.weekStartDate,
    version: effectiveVersionFor(settings?.versions, run.weekStartDate),
    events: [],
  }).dateOf('midweek');
  const dayLabel = (d: Date, withWeekday: boolean) =>
    d.toLocaleDateString(i18n.language, {
      ...(withWeekday ? { weekday: 'long' as const } : {}),
      day: 'numeric',
      month: 'long',
    });
  const keepUntil = new Date(new Date(run.savedAt).getTime() + 7 * 24 * 60 * 60 * 1000);
  return (
    <Pressable
      style={styles.resultCard}
      onPress={() => router.push(`/schedule/conduct?week=${run.weekStartDate}` as any)}
      accessibilityRole="button"
    >
      <View style={styles.liveHead}>
        <Ionicons name="stats-chart-outline" size={18} color="#0369a1" />
        <Text style={styles.liveTitle}>
          {t('conduct.result.cardTitle', {
            day: meetingDay ? dayLabel(new Date(`${meetingDay}T00:00:00`), true) : run.weekStartDate,
          })}
        </Text>
      </View>
      <Text style={styles.liveSub}>
        {`${t('conduct.result.took', { time: clock(run.totalSec) })} · ${t('conduct.result.planned', { time: clock(run.plannedSec) })}`}
      </Text>
      <Text style={styles.resultKeep}>{t('conduct.result.cardKeep', { day: dayLabel(keepUntil, false) })}</Text>
      <Text style={styles.liveAction}>{t('conduct.result.cardOpen')}</Text>
    </Pressable>
  );
}
