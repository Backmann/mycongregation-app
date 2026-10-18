import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { conductLiveApi, conductRunsApi, meApi, meetingSettingsApi, serverClockOffset, specialEventsApi } from '../lib/api';
import { effectiveVersionFor } from '../lib/meeting-schedule';
import { weekRules } from '../lib/week-rules';
import { fromWire, isConductOverseer, runLeftHanging } from '../lib/conduct-live';
import { usePermissions } from '../lib/permissions';
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
/** Which meeting (18 October 2026). The route says so with ?kind=weekend. */
type Kind = 'midweek' | 'weekend';
const conductHref = (week: string, kind: Kind) =>
  kind === 'weekend' ? `/schedule/conduct?week=${week}&kind=weekend` : `/schedule/conduct?week=${week}`;

export function ConductEntry({
  week,
  chairmanPublisherId,
  kind = 'midweek',
}: {
  /** Monday of the week, 'YYYY-MM-DD'. */
  week: string;
  /** Who is chairing this meeting, if anybody is yet. */
  chairmanPublisherId: string | null;
  kind?: Kind;
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
  }).dateOf(kind);
  const over = week < thisWeek || (!!meetingDay && meetingDay < formatDateISO(new Date()));
  if ((!isChairman && !isAdmin) || over) {
    return <ConductResultLink week={week} chairmanPublisherId={chairmanPublisherId} kind={kind} />;
  }

  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push(conductHref(week, kind) as any)}
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
 * Shown to whoever may read it — the admins, the counsel brother and the
 * Life and Ministry overseer (the server holds the same rule,
 * common/conduct-overseer.ts) — and only when there IS a result:
 * a link to an empty page would be a promise the screen cannot keep. Asked
 * of the server once per meeting the reader opens; never kept on the device.
 */
export function ConductResultLink({
  week,
  kind = 'midweek',
}: {
  week: string;
  chairmanPublisherId?: string | null;
  kind?: Kind;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { responsibilities } = usePermissions();
  const mayRead = isConductOverseer(user?.role, responsibilities, kind);
  const thisWeek = formatDateISO(startOfWeekMonday(new Date()));
  const { data: run } = useQuery({
    queryKey: ['conduct-run', week, kind],
    queryFn: () => conductRunsApi.get(week, kind),
    enabled: mayRead && week <= thisWeek,
    retry: false,
  });
  if (!mayRead || !run) return null;
  return (
    <Pressable
      style={styles.button}
      onPress={() => router.push(conductHref(week, kind) as any)}
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
  hangingCard: { borderColor: '#fed7aa', backgroundColor: '#fffbf5' },
  chairCard: { borderColor: '#bae6fd' },
});

/**
 * "MEETING IN PROGRESS · LIVE" on the home screen (15 October 2026) — for
 * those who may watch the meeting run (the admins, the overseers of that
 * meeting, and since 18 October 2026 every elder) and for its chairman and
 * timekeeper; for the timekeeper it is also the door into conduct mode, as
 * he has no schedule editor to find it in. The server decides who gets an
 * answer: anybody else is refused once, and the card never asks again.
 *
 * Asked once a minute while home is open — enough to appear soon after the
 * meeting starts; the conduct screen itself asks every two seconds.
 */
export function ConductLiveCard({ kind = 'midweek' }: { kind?: Kind }) {
  const { t } = useTranslation();
  const week = formatDateISO(startOfWeekMonday(new Date()));
  const { data } = useQuery({
    queryKey: ['conduct-live-home', week, kind],
    queryFn: () => conductLiveApi.get(week, kind),
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
  }).dateOf(kind);
  const card = liveCardOf({
    live: data.live,
    run: data.live ? fromWire(data.live.state, serverClockOffset()) : null,
    roles: data.roles ?? null,
    today: formatDateISO(new Date()),
    meetingDay,
    nowMs: Date.now(),
  });
  if (!card) return null;
  const name = data.live?.controllerName ?? t('conduct.live.someone');
  const texts: Record<LiveCardKind, { title: string; sub: string; action: string }> = {
    running: {
      title: t('conduct.live.cardRunning'),
      sub: data.live?.mine
        ? t('conduct.live.cardYou')
        : data.live?.mineElsewhere
          ? t('conduct.live.cardYouElsewhere')
          : t('conduct.live.cardBy', { name }),
      action: data.live?.mine ? t('conduct.live.open') : data.roles?.isChairman ? t('conduct.live.openStage') : t('conduct.live.watch'),
    },
    hanging: {
      title: t('conduct.live.cardHanging'),
      sub: t('conduct.live.cardHangingSub'),
      action: t('conduct.live.open'),
    },
    keeper: {
      title: t('conduct.live.cardKeeper'),
      sub: t('conduct.live.cardKeeperHint'),
      action: t('conduct.live.open'),
    },
    chairman: {
      title: t('conduct.live.cardChairman'),
      sub: data.roles?.hasTimekeeper
        ? data.roles.timekeeperName
          ? t('conduct.live.cardChairmanKeeper', { name: data.roles.timekeeperName })
          : t('conduct.live.cardChairmanKeeperNoName')
        : t('conduct.live.cardChairmanAlone'),
      action: data.roles?.hasTimekeeper ? t('conduct.live.openStage') : t('conduct.live.open'),
    },
  };
  const x = texts[card];
  return (
    <Pressable
      style={[styles.liveCard, card === 'hanging' && styles.hangingCard, card === 'chairman' && styles.chairCard]}
      onPress={() => router.push(conductHref(week, kind) as any)}
      accessibilityRole="button"
    >
      <View style={styles.liveHead}>
        {card === 'running' ? (
          <View style={styles.liveDot} />
        ) : (
          <Ionicons
            name={card === 'hanging' ? 'alert-circle-outline' : card === 'chairman' ? 'easel-outline' : 'stopwatch-outline'}
            size={18}
            color={card === 'chairman' ? '#0369a1' : '#ea580c'}
          />
        )}
        <Text style={styles.liveTitle}>{x.title}</Text>
      </View>
      <Text style={styles.liveSub}>{x.sub}</Text>
      <Text style={styles.liveAction}>{x.action}</Text>
    </Pressable>
  );
}

type LiveCardKind = 'running' | 'hanging' | 'keeper' | 'chairman';

/**
 * WHICH CARD, IF ANY (Lionel, 18 October 2026):
 *
 * - «Идёт встреча» while it runs — for every elder, the overseers, the
 *   chairman and the timekeeper (the server says who gets an answer at all).
 * - Nobody pressed «Завершить» and no tap for longer than any part lasts
 *   (runLeftHanging): gone for those who watch; for the account that ran it,
 *   «Встреча не завершена», which leads to finishing it. On 18 October the
 *   card said «Идёт встреча» until midnight.
 * - Before the start: the timekeeper's card for his week, as before; the
 *   chairman's on the meeting's day only — «Сегодня вы председатель».
 */
export function liveCardOf(input: {
  live: { mine: boolean; mineElsewhere?: boolean } | null;
  run: Parameters<typeof runLeftHanging>[0] | null;
  roles: { isTimekeeper: boolean; isChairman: boolean } | null;
  today: string;
  meetingDay: string | null;
  nowMs: number;
}): LiveCardKind | null {
  const { live, run, roles, today, meetingDay, nowMs } = input;
  const started = !!run && run.meetingStartedAt !== null;
  const finished = !!run && run.finishedAt !== null;
  if (started && !finished) {
    if (!runLeftHanging(run, nowMs)) return 'running';
    return live && (live.mine || live.mineElsewhere) ? 'hanging' : null;
  }
  if (finished || !meetingDay) return null;
  if (roles?.isTimekeeper && today <= meetingDay) return 'keeper';
  if (roles?.isChairman && today === meetingDay) return 'chairman';
  return null;
}

/**
 * THE RESULT ON THE HOME SCREEN (15 October 2026) — for the admins, the
 * counsel brother and the Life and Ministry overseer (Lionel, 16 October
 * 2026), for the seven days the result is kept; then it goes by itself.
 * The last midweek meeting with a result: this week's,
 * or last week's while it is still kept. Nothing to show — no card.
 */
export function ConductResultCard({ kind = 'midweek' }: { kind?: Kind }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { responsibilities } = usePermissions();
  const overseer = isConductOverseer(user?.role, responsibilities, kind);
  const monday = startOfWeekMonday(new Date());
  const thisWeek = formatDateISO(monday);
  const lastWeek = formatDateISO(addDays(monday, -7));
  // The same keys the conduct screen and the result link use: one request each.
  const thisQ = useQuery({
    queryKey: ['conduct-run', thisWeek, kind],
    queryFn: () => conductRunsApi.get(thisWeek, kind),
    enabled: overseer,
    retry: false,
  });
  const lastQ = useQuery({
    queryKey: ['conduct-run', lastWeek, kind],
    queryFn: () => conductRunsApi.get(lastWeek, kind),
    enabled: overseer && !thisQ.isPending && !thisQ.data,
    retry: false,
  });
  const { data: settings } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });
  const run = thisQ.data ?? lastQ.data ?? null;
  if (!overseer || !run) return null;
  const meetingDay = weekRules({
    weekStartISO: run.weekStartDate,
    version: effectiveVersionFor(settings?.versions, run.weekStartDate),
    events: [],
  }).dateOf(kind);
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
      onPress={() => router.push(conductHref(run.weekStartDate, kind) as any)}
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
