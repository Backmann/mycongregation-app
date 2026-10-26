import { goBack } from '../../../components/NavHistory';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { notify } from '../../../lib/error-bus';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  Assignment,
  assignmentsApi,
  conductLiveApi,
  ConductLiveAnswer,
  conductRunsApi,
  ConductRunSegment,
  extractErrorMessage,
  meApi,
  meetingSettingsApi,
  publishersApi,
  serverClockOffset,
  specialEventsApi,
} from '../../../lib/api';
import { weekRules } from '../../../lib/week-rules';
import {
  fromWire,
  isConductOverseer,
  isSilent,
  keptRunIsNewer,
  lastMoment,
  liveMode,
  runLeftHanging,
  LIVE_POLL_MS,
  toWire,
  watchUnsure,
} from '../../../lib/conduct-live';
import { usePermissions } from '../../../lib/permissions';
import { useAuth } from '../../../lib/auth';
import { buildMidweekRunOrder, buildWeekendRunOrder, RunSegment, totalRunMinutes } from '../../../lib/run-order';
import { partDisplay, songFromTitle } from '../../../lib/part-display';
import { useSongsMap } from '../../../lib/songs';
import { failsScreen } from '../../../lib/screen-failure';
import { keptMeetingRows } from '../../../lib/offline-keep-rules';
import { keptMe, keptPieces } from '../../../lib/offline-keep';
import { KeptNotice } from '../../../components/ConnectionState';
import { ConductSummaryData, mmss } from '../../../components/ConductSummary';
import { ConductReport } from '../../../components/ConductReport';
import { QuickReplaceSheet } from '../../../components/QuickReplaceSheet';
import { confirm } from '../../../components/ConfirmHost';
import { formatDateISO, parseISODate, startOfWeekMonday } from '../../../lib/dates';
import { ConductStage, STAGE_SECTION_COLORS, type StagePart } from '../../../components/ConductStage';
import { demoFrame, endDriftSec, stageTone, untilStartSec, warnSecFor } from '../../../lib/conduct-stage';
import { resolveSubsection, SUBSECTIONS } from '../../../lib/parts';
import {
  EMPTY_RUN as EMPTY,
  inCounsel,
  isExpiredRecord,
  beginPart,
  inEntrance,
  reconcileKeys,
  readRunRecord,
  settleEntrance,
  recordPrefix,
  RUN_RECORD_VERSION,
  RunState,
  RunSnapshot,
  writeRunRecord,
} from '../../../lib/conduct-run-record';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { HeaderMenu } from '../../../components/HeaderMenu';
import { HEADER_ICON } from '../../../lib/header';
import { tapSaved } from '../../../lib/haptics';
import { NoAccess } from '../../../components/NoAccess';

/**
 * CONDUCT MODE — what the chairman keeps open on a tablet while the midweek
 * meeting runs.
 *
 * THE CLOCK IS NOT SHOWN. Planned times lie the moment a meeting slips: a part
 * that starts four minutes late still shows 19:06 on the sheet, and a chairman
 * reading that number is worse off than one reading nothing. What he needs is
 * how long THIS part has left and how far the meeting as a whole has drifted,
 * so that is what the screen says.
 *
 * WHILE IT RUNS, IT LIVES ON THIS DEVICE: a half-finished run left on the
 * server would show up on somebody else's screen as fact. But it DOES live
 * there: an iPad that reloads the tab mid-meeting (Safari does, coming back
 * from the background) would otherwise lose the count with no way back.
 *
 * WHEN IT ENDS, IT GOES TO THE SERVER FOR SEVEN DAYS (14 October 2026).
 * Lionel wanted the chairman — and the elders — to see afterwards who had
 * how much time, and decided it is kept a week and then deleted. The
 * server checks who sends it and who reads it (conduct-runs).
 *
 * THE STUDENT COUNTS DOWN FROM THE PROGRAMME'S OWN MINUTES. A four-minute
 * reading shows 4:00, not 5:00: the fifth minute is the chairman's counsel.
 *
 * VARIANT A (15 October 2026). When the student is done the chairman taps
 * «Закончено»: the part's clock stops, the screen shows whom the counsel is
 * for, and the counsel counts UP — it starts nothing by itself. «Следующая»
 * (with the names to announce on it) starts the next part. Until then the
 * counsel ran a minute on its own and started the next part itself; on
 * 14 October all three counsels ran ~1:13 and that minute had to be overtaken
 * by hand every time. A discussion led by an elder has no counsel: after it
 * the button is «Следующая» straight away.
 *
 * THE MINUTES COME FROM lib/run-order.ts and THE NAMES FROM lib/part-display.ts,
 * the same two places the schedule sheet reads. The chairman announces what he
 * sees here out loud; if it differed from the sheet by a word, one of the two
 * would be wrong in front of the whole congregation.
 *
 * WHO MAY RUN IT: the chairman named in this week's programme, the
 * timekeeper named in its duties («Ведущий времени»), and an admin — ONE of
 * them at a time. Not the elders in general — two people advancing the same
 * parts would help nobody. The elders may READ the result once it is saved,
 * for its seven days.
 *
 * LIVE (15 October 2026). Lionel: a brother keeps the time so the chairman
 * does not have to lead and tap at once. The one who runs it sends every tap
 * to the server (conduct-live); the chairman's iPad and every appointed
 * brother who opens the screen WATCH the same run, asking every two seconds.
 * With a timekeeper named, the chairman opens watching; «Взять ведение» moves
 * the taps to him (or back) and the server refuses the other's from then on.
 * With no answer from the server at all, the screen runs on the device as
 * before — the meeting does not wait for the network (lib/conduct-live.ts).
 */

/** An HTTP status out of a failed request, if there was one. */
function statusOf(e: unknown): number | undefined {
  return (e as { response?: { status?: number } } | null)?.response?.status;
}

/** A first answer about Live waited for at most this long before the screen opens without it. */
const LIVE_FIRST_WAIT_MS = 4000;

// THE RUN AS KEPT ON THE DEVICE — its shape, every older shape and how they
// are read, and how a run follows a programme that changed under it — lives
// in lib/conduct-run-record.ts (15 October 2026).

/** One second, the only cadence this screen needs. */
const TICK_MS = 1000;

/** After a tap the big button does not answer for this long (a double tap). */
const TAP_LOCK_MS = 1500;
/** How long an early «Закончено» waits for its second tap. */
const EARLY_ARM_MS = 4000;
/** A bounce of the finger is no second tap. */
const EARLY_BOUNCE_MS = 600;
/** How long «Вернуть» stands out after a tap. */
const UNDO_LOUD_MS = 10_000;
/** Ending a part before this share of its minutes is «early». */
const EARLY_SHARE = 1 / 3;
/** …and never earlier than this many seconds. */
const EARLY_MIN_SEC = 20;
/* The last stretch of a part (amber) — lib/conduct-stage.ts warnSecFor. */
/** A counsel shorter than this was no counsel — it is not shown. */
const MIN_COUNSEL_SEC = 3;

function storageKey(week: string, kind: 'midweek' | 'weekend') {
  return `${recordPrefix(kind)}${week}`;
}

/** «20:46» — the device's local time. */
function clockOf(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** «19:00» + 105 min → «20:45». */
function addMinutes(hhmm: string, minutes: number): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  const h = Math.floor(total / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** m:ss, or −m:ss once a part has run over. */
function formatCountdown(seconds: number): string {
  const over = seconds < 0;
  const s = Math.abs(Math.round(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${over ? '−' : ''}${mm}:${String(ss).padStart(2, '0')}`;
}

/** The state as it stood, to come back to with «Вернуть». */
/**
 * The run before a tap, keeping ONE more step under it (22 October 2026):
 * «Вернуть» goes back two taps, so a second mistaken tap does not lock in
 * the first.
 */
function snapshot(s: RunState): RunSnapshot {
  const { prev, ...rest } = s;
  if (!prev) return { ...rest, prev: null };
  const { prev: _older, ...under } = prev;
  return { ...rest, prev: under };
}

/**
 * `stageCheckAt` — the screen on the stage (app/stage.tsx) starts «Проверить
 * экран» from its own menu, opened with its digits: it has no header with
 * this screen's menu in it.
 */
export default function ConductScreen({
  stageCheckAt,
  onStageFinished,
}: {
  stageCheckAt?: number | null;
  /**
   * The screen on the stage is told when the meeting it watches has ended
   * (the run's end, ms) — or that it has not, after an «Вернуть» — and shows
   * its own calm screen instead of the result (21 October 2026).
   */
  onStageFinished?: (done: { endedAt: number | null } | null) => void;
} = {}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ week?: string; kind?: string }>();
  const week = typeof params.week === 'string' ? params.week : '';
  // WHICH MEETING (18 October 2026): the midweek one, or the weekend one with
  // ?kind=weekend. Everything below that names «the meeting» takes it.
  const kind: 'midweek' | 'weekend' = params.kind === 'weekend' ? 'weekend' : 'midweek';
  const weekend = kind === 'weekend';
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  // WITH NO SIGNAL IN THE HALL (9 October 2026): the meeting's rows as kept on
  // the device with the programme of the coming weeks (lib/offline-keep.ts).
  // Read once, when the screen opens — they are what was there to begin with.
  // Read from what is KEPT (not the query cache, which lets go of an answer
  // nobody has looked at for five minutes) — every piece, this Monday's and
  // the ones before it that still reach this week.
  const kept = useMemo(
    () => (week ? keptMeetingRows(keptPieces<Assignment>('assignments', user?.id), week, kind) : null),
    [week, user?.id, kind],
  );

  const assignmentsQuery = useQuery({
    // «Не удалось загрузить» only when nothing is kept for this meeting.
    throwOnError: (error, query) => !kept && failsScreen(error, query),
    queryKey: ['conduct-assignments', week, kind],
    // The server's filter semantics for weekStart are not relied on here: we
    // ask for the week and then keep only the rows that say they belong to it.
    queryFn: () =>
      assignmentsApi.list({ weekStart: week, eventType: kind, limit: 200 }),
    enabled: week.length > 0,
  });
  const meQuery = useQuery({
    queryKey: ['me-publisher'],
    queryFn: () => meApi.publisher(),
  });
  // Names from the roster: open to every member (the full directory is not —
  // a chairman who is not an elder saw no names), and kept on the device.
  const rosterQuery = useQuery({
    queryKey: ['publishers', 'roster'],
    queryFn: () => publishersApi.roster(),
    staleTime: 5 * 60 * 1000,
  });

  // The meeting's start time, for «по программе 20:44». Open to every member
  // and kept on the device for a hall with no signal (lib/offline-keep-rules).
  const settingsQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });

  const fromKept = !assignmentsQuery.data && !!kept;
  const rows: Assignment[] = useMemo(
    () =>
      assignmentsQuery.data
        ? assignmentsQuery.data.data.filter((a) => a.weekStartDate === week && !a.deletedAt)
        : (kept?.rows ?? []),
    [assignmentsQuery.data, week, kept],
  );

  const segments: RunSegment[] = useMemo(
    () =>
      (weekend ? buildWeekendRunOrder : buildMidweekRunOrder)(
        rows.map((a) => ({
          id: a.id,
          partKey: a.partKey,
          partDurationMin: a.partDurationMin,
          partTitle: a.partTitle,
          partOrder: a.partOrder,
        })),
      ),
    [rows, weekend],
  );

  const segKeys = useMemo(() => segments.map((s) => s.key), [segments]);

  const byId = useMemo(() => {
    const m = new Map<string, Assignment>();
    for (const a of rows) m.set(a.id, a);
    return m;
  }, [rows]);

  /**
   * WHERE ANOTHER BROTHER COMES OUT (Lionel, 22 October 2026). «Следующая»
   * there calls him up — «Выходит: …» — and his own clock begins with
   * «Начал», or by itself after thirty seconds; the walk to the stage is
   * nobody's minutes. Not when the same brother goes on (the study
   * conductor after the song he announced).
   */
  const entranceAt = useMemo(() => {
    const personOf = (seg: RunSegment): string | null => {
      const row =
        weekend && seg.key === 'weekend_song'
          ? rows.find((a) => a.partKey === 'watchtower_conductor')
          : seg.assignmentId
            ? byId.get(seg.assignmentId)
            : undefined;
      const who = [row?.publisherId, row?.assistantPublisherId, row?.speakerName]
        .filter((x): x is string => !!x)
        .sort()
        .join('+');
      return who || null;
    };
    // WHO WALKS UP (Lionel, 22 October 2026): after the public talk the
    // chairman comes back for the thanks and announcements; after them the
    // study conductor comes up and announces his song. So the chairman's
    // words are called up too when someone else stood there — not after a
    // song, which he himself announced — and so is the song before the study.
    // A midweek song is announced by whoever is already on the stage.
    return segments.map((seg, i) => {
      if (i === 0) return false;
      const prev = segments[i - 1];
      if (seg.soft && !(weekend && seg.key === 'weekend_song')) return false;
      if (seg.chairmanWords && prev.soft) return false;
      const who = personOf(seg);
      return !!who && who !== personOf(prev);
    });
  }, [segments, rows, byId, weekend]);

  const songTitles = useSongsMap();
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of rosterQuery.data?.data ?? []) m.set(p.id, p.displayName);
    return m;
  }, [rosterQuery.data]);

  const chairmanRow = rows.find((a) => a.partKey === (weekend ? 'weekend_chairman' : 'midweek_chairman'));
  // Who is asking: the server's answer, or — with no signal — one's own card
  // as kept (who, never the contacts). Without it every chairman read «you
  // are not the chairman» in a hall with no signal.
  const keptMyId = keptMe(user?.id)?.id ?? null;
  const myPublisherId = meQuery.data?.publisher?.id ?? keptMyId;
  const thisWeek = formatDateISO(startOfWeekMonday(new Date()));
  const pastWeek = !!week && week < thisWeek;

  // THE MEETING IS OVER once its day has passed — not only once its week has
  // (16 October 2026). A run started on a phone the evening after the
  // meeting, as a try-out, sat in a counsel overnight; the next morning it
  // went to the server as the meeting «as it runs» and was nearly saved as
  // the result in place of Wednesday's. After the day the screen only shows
  // the result; the server refuses the rest (conduct-runs/meeting-day).
  // The same key the duties sheet reads the events by.
  const eventsQuery = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
    staleTime: 60 * 60 * 1000,
  });
  const meetingDay = useMemo(
    () =>
      week
        ? weekRules({
            weekStartISO: week,
            version: effectiveVersionFor(settingsQuery.data?.versions, week),
            events: eventsQuery.data ?? [],
          }).dateOf(kind)
        : null,
    [week, settingsQuery.data, eventsQuery.data, kind],
  );
  const meetingOver = pastWeek || (!!meetingDay && meetingDay < formatDateISO(new Date()));

  // THE MEETING AS IT RUNS, from the server — and who this account is for it
  // (the timekeeper is named in the duties, which this screen does not read).
  // Asked every two seconds; not at all for a past week. A refusal (a
  // publisher who is not appointed) or an older server stops the asking.
  const queryClient = useQueryClient();
  const liveKey = useMemo(() => ['conduct-live', week, kind], [week, kind]);
  const liveQuery = useQuery({
    queryKey: liveKey,
    queryFn: () => conductLiveApi.get(week, kind),
    enabled: week.length > 0 && !meetingOver,
    retry: false,
    staleTime: 0,
    refetchInterval: (q) => {
      const st = statusOf(q.state.error);
      return st === 403 || st === 404 ? false : LIVE_POLL_MS;
    },
  });
  // A change to the programme while the meeting runs — a brother put in at
  // the last minute — is on every screen at the next ask (22 October 2026):
  // the answer says when the programme last changed, and a newer one is read.
  const programmeStamp = liveQuery.data?.programmeStamp ?? null;
  const seenStamp = useRef<string | null>(null);
  useEffect(() => {
    if (!programmeStamp) return;
    if (seenStamp.current !== null && seenStamp.current !== programmeStamp) {
      void queryClient.invalidateQueries({ queryKey: ['conduct-assignments', week, kind] });
    }
    seenStamp.current = programmeStamp;
  }, [programmeStamp, queryClient, week, kind]);

  // Back on screen — the phone woken from the pocket, the app brought up: ask
  // at once, not at the next tick. The chairman opens it when he wants, and
  // what it shows must be the meeting as it is (Lionel, 18 October 2026). On
  // the web the library asks by itself when the page is seen again.
  const refetchLive = liveQuery.refetch;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && week && !meetingOver) void refetchLive();
    });
    return () => sub.remove();
  }, [refetchLive, week, meetingOver]);
  const liveData = liveQuery.data ?? null;
  const live = liveData?.live ?? null;
  const roles = liveData?.roles ?? null;
  // The first answer is waited for — briefly: with no signal the screen opens
  // without it, as before Live.
  const [liveGaveUp, setLiveGaveUp] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setLiveGaveUp(true), LIVE_FIRST_WAIT_MS);
    return () => clearTimeout(id);
  }, []);
  /** An answer from put/take carries no roles: keep the ones read before. */
  const putLive = useCallback(
    (ans: ConductLiveAnswer) =>
      queryClient.setQueryData<ConductLiveAnswer>(liveKey, (old) => ({ ...ans, roles: ans.roles ?? old?.roles })),
    [queryClient, liveKey],
  );

  const isAdmin = user?.role === 'admin';
  const isChairman =
    !!chairmanRow?.publisherId && chairmanRow.publisherId === myPublisherId;
  const canRun = isChairman || isAdmin || !!roles?.mayRun;
  // The result is read by the admins, the counsel brother and the Life and
  // Ministry overseer — not by the chairman afterwards: he sees it here when
  // the meeting ends (the server says the same, common/conduct-overseer.ts).
  const perms = usePermissions();
  const { responsibilities } = perms;
  const canRead = isConductOverseer(user?.role, responsibilities, kind);
  // «Приехал другой докладчик» — on the meeting day, for those who answer
  // for the talks (Lionel, 23 October 2026): in a minute, from here.
  const [replaceOpen, setReplaceOpen] = useState(false);
  const mayReplaceSpeaker =
    weekend && perms.canCoordinatePublicTalks && !!meetingDay && meetingDay === formatDateISO(new Date());

  // The saved result — what an elder reads, and what a chairman sees again
  // on another device. Never kept on the device (lib/offline-keep-rules).
  const runQuery = useQuery({
    queryKey: ['conduct-run', week, kind],
    queryFn: () => conductRunsApi.get(week, kind),
    enabled: week.length > 0 && canRead,
    retry: 1,
  });

  // --- ход встречи ---------------------------------------------------
  const [state, setState] = useState<RunState>(EMPTY);
  const [now, setNow] = useState(() => Date.now());
  const loadedFor = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Read once the programme is on screen: an old record is understood
    // against the segments it was timed on (lib/conduct-run-record.ts).
    const key = storageKey(week, kind);
    if (!week || segKeys.length === 0 || loadedFor.current === key) return;
    loadedFor.current = key;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (loadedFor.current !== key) return;
        // Поднимаем ход КАК ЕСТЬ, вместе со временем начала части. Встреча
        // идёт по стенным часам и не останавливается оттого, что вкладка
        // перезагрузилась; обнулять отсчёт значило бы врать. Сбросить можно
        // в меню «⋯» — «Начать заново».
        const at = Date.now();
        if (isExpiredRecord(raw, week, at)) {
          // Older than the seven days the server keeps the result: gone.
          AsyncStorage.removeItem(key).catch(() => undefined);
          return;
        }
        const { state: kept, verdict } = readRunRecord(raw, segKeys, at);
        if (verdict === 'legacy-dropped' || verdict === 'unreadable') {
          AsyncStorage.removeItem(key).catch(() => undefined);
        } else if (verdict === 'legacy-continued' || (raw !== null && !raw.includes(`"v":${RUN_RECORD_VERSION}`))) {
          // Written back at once in the current shape.
          AsyncStorage.setItem(key, writeRunRecord(kept)).catch(() => undefined);
        }
        setState(kept);
      })
      .catch(() => {
        // Хранилище может не ответить — на ходе встречи это не сказывается.
      })
      .finally(() => {
        if (loadedFor.current === key) setLoaded(true);
      });
  }, [week, segKeys, kind]);

  const persist = useCallback(
    (next: RunState) => {
      if (!week) return;
      AsyncStorage.setItem(storageKey(week, kind), writeRunRecord(next)).catch(() => {
        // Не удалось сохранить — встреча всё равно идёт.
      });
    },
    [week, kind],
  );

  const apply = useCallback(
    (next: RunState) => {
      setState(next);
      persist(next);
    },
    [persist],
  );

  // ТРЕНИРОВКА (15 октября 2026). Председатель проходит встречу дома, как на
  // сцене, — и ничего не остаётся: ход живёт только в памяти этого экрана, на
  // сервер не уходит, настоящий ход недели (если он есть) не трогается и
  // возвращается, как только тренировка закончена или экран закрыт. Иначе
  // пробная встреча, доведённая до «Завершить», семь дней висела бы итогом у
  // старейшин.
  const [practice, setPractice] = useState<RunState | null>(null);
  // «Проверить экран»: when it began (this device only, nothing saved).
  const [check, setCheck] = useState<number | null>(null);
  useEffect(() => {
    if (stageCheckAt) setCheck(stageCheckAt);
  }, [stageCheckAt]);
  // After «Взять ведение» from the chairman's screen: keep that screen, with buttons.
  const [stageRun, setStageRun] = useState(false);
  // Whether the screen is being kept awake — «Проверить экран» says so.
  const [awakeOk, setAwakeOk] = useState<boolean | null>(null);

  // WHO TAPS ON THIS DEVICE (lib/conduct-live.ts liveMode). Watching, the run
  // shown is the controller's, read from the server and moved to this
  // device's clock; nothing of it is kept here.
  const mode = liveMode({
    practice: !!practice,
    canRunLocally: canRun,
    answered: !!liveData,
    live,
    roles,
    localStarted: state.meetingStartedAt !== null,
  });
  const watching = mode === 'watch';
  const offset = serverClockOffset();
  const watched = useMemo(() => (live ? fromWire(live.state, offset) : null) ?? EMPTY, [live, offset]);
  // A forgotten «Начал» has begun the part by itself (lib/conduct-run-record
  // settleEntrance): the same answer on every device, from the same run.
  const run = settleEntrance(practice ?? (watching ? watched : state), now);
  const applyRun = useCallback(
    (next: RunState) => {
      if (practice) setPractice(next);
      else apply(next);
    },
    [practice, apply],
  );

  // THE PROGRAMME CHANGED UNDER A RUNNING MEETING — the kept rows were
  // replaced by the server's, and a part came or went. The run follows by
  // key, not by position (lib/conduct-run-record.ts reconcileKeys).
  useEffect(() => {
    if (!loaded || segKeys.length === 0) return;
    setState((s) => {
      const n = reconcileKeys(s, segKeys, Date.now());
      if (n !== s) persist(n);
      return n;
    });
    setPractice((p) => (p ? reconcileKeys(p, segKeys, Date.now()) : p));
  }, [loaded, segKeys, persist]);

  const counselling = inCounsel(run);
  const entering = inEntrance(run);
  const ticking =
    run.finishedAt === null && (run.startedAt !== null || run.pausedAt !== null || counselling || entering);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [ticking]);

  // Awake while the meeting runs — and while this device watches a meeting
  // somebody else runs, even before the first part has started (17 October
  // 2026): the chairman's iPad waiting for the timekeeper went dark before.
  // And during «Проверить экран», which shows that it is.
  const keepAwake = ticking || (watching && !meetingOver) || check !== null;
  // The chairman's screen shows the wall clock and the time to the start,
  // before anything ticks.
  // A chairman who took the taps over from the timekeeper keeps his screen —
  // also after reopening it (the server says the taps are his now).
  // The timekeeper's own second device (his phone while the iPad taps) is not
  // the chairman's: it watches on the timekeeper's screen (18 October 2026).
  const onStage =
    (watching && !live?.mineElsewhere) || stageRun || (!!live?.mine && !!roles?.hasTimekeeper && !roles?.isTimekeeper);
  const stageClockOn = onStage;
  useEffect(() => {
    if (!stageClockOn || ticking) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [stageClockOn, ticking]);
  // «Проверить экран» runs on its own clock.
  useEffect(() => {
    if (check === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [check]);

  // Экран не должен гаснуть, пока идёт встреча.
  //
  // В ПРИЛОЖЕНИИ (8 октября 2026). Раньше здесь было написано, что
  // expo-keep-awake «в дереве пока нет» и для него нужна новая сборка APK. Это
  // было неверно: модуль приходит вместе с самим expo и уже вшит в
  // установленную сборку — он стоит в списке автоподключения
  // (`npx expo-modules-autolinking resolve -p android`) и в отпечатке
  // (node_modules/expo-keep-awake/android). Значит, это доезжает по воздуху.
  //
  // Подключается ЛЕНИВО и под try: модуль при подключении сразу ищет свою
  // нативную часть и бросает исключение, если её нет. Сборка, где её вдруг не
  // окажется, должна просто гаснуть, как раньше, а не терять весь экран.
  useEffect(() => {
    if (Platform.OS === 'web' || !keepAwake) return;
    const TAG = 'conduct-mode';
    let keep: {
      activateKeepAwakeAsync: (tag?: string) => Promise<void>;
      deactivateKeepAwake: (tag?: string) => Promise<void>;
    } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      keep = require('expo-keep-awake');
      void keep
        ?.activateKeepAwakeAsync(TAG)
        .then(() => setAwakeOk(true))
        .catch(() => setAwakeOk(false));
    } catch {
      keep = null;
      setAwakeOk(false);
    }
    return () => {
      void keep?.deactivateKeepAwake(TAG).catch(() => undefined);
    };
  }, [keepAwake]);
  // В браузере — его собственным средством.
  //
  // БРАУЗЕР СНИМАЕТ ЗАПРЕТ САМ (17 октября 2026), как только страница уходит
  // из виду: пришло уведомление, экран мигнул блокировкой, переключили
  // вкладку. Раньше запрет брался один раз при старте — после первого такого
  // случая экран гас посреди встречи. Теперь он берётся заново, когда
  // страница снова видна. И запрет, пришедший уже после ухода с экрана,
  // сразу отпускается, а не остаётся висеть.
  useEffect(() => {
    if (Platform.OS !== 'web' || !keepAwake) return;
    type Lock = { release: () => Promise<void>; addEventListener?: (t: 'release', f: () => void) => void };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Lock> } };
    if (!nav.wakeLock) {
      setAwakeOk(false); // старый Safari — просто без этого
      return;
    }
    let lock: Lock | null = null;
    let done = false;
    const take = () => {
      if (done || lock || document.visibilityState !== 'visible') return;
      nav.wakeLock
        ?.request('screen')
        .then((l) => {
          if (done) {
            l.release().catch(() => undefined);
            return;
          }
          lock = l;
          setAwakeOk(true);
          l.addEventListener?.('release', () => {
            if (lock === l) lock = null;
          });
        })
        .catch(() => {
          // Отказ (например, режим энергосбережения) — без этого.
          setAwakeOk(false);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') take();
    };
    take();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => undefined);
      lock = null;
    };
  }, [keepAwake]);

  const finished = run.index >= segments.length && segments.length > 0;
  const current = finished ? null : (segments[run.index] ?? null);
  const next = finished ? null : (segments[run.index + 1] ?? null);
  const afterNext = finished ? null : (segments[run.index + 2] ?? null);

  const counselElapsed = counselling && run.counselFrom !== null ? Math.max(0, (now - run.counselFrom) / 1000) : 0;
  const currentElapsed =
    run.carried + (run.startedAt !== null && now > run.startedAt ? (now - run.startedAt) / 1000 : 0);
  const isStudent = !!current && current.counselMin > 0;

  /**
   * ОТСТАВАНИЕ. Сделанные части сравниваются со своими минутами вместе с
   * минутой совета; пока совет идёт, в план входит только прошедшая его часть.
   * Пауза — время встречи, которого не было в программе, и потому идёт в
   * отставание, а не в чью-то часть. Перерасход ТЕКУЩЕЙ части входит в
   * отставание, её опережение — нет: пока часть идёт, сэкономленное может уйти
   * обратно, просроченное не вернётся.
   */
  const done = segments.slice(0, run.index);
  let plannedSoFar = done.reduce((sum, s) => sum + (s.partMin + s.counselMin) * 60, 0);
  let actualSoFar = done.reduce((sum, _s, i) => sum + (run.spent[i] ?? 0) + (run.counsel[i] ?? 0), 0);
  actualSoFar += run.pausedSec + (run.pausedAt !== null ? (now - run.pausedAt) / 1000 : 0);
  // The walk to the platform is meeting time the programme has no minute for.
  const entranceElapsed = entering && run.enteringFrom != null ? Math.max(0, (now - run.enteringFrom) / 1000) : 0;
  actualSoFar += entranceElapsed;
  if (counselling && current) {
    plannedSoFar += current.partMin * 60 + Math.min(counselElapsed, current.counselMin * 60);
    actualSoFar += (run.spent[run.index] ?? 0) + counselElapsed;
  }
  const currentOverrun = current && !counselling ? Math.max(0, currentElapsed - current.partMin * 60) : 0;
  const driftSec = Math.round(actualSoFar - plannedSoFar + currentOverrun);
  const started = run.meetingStartedAt !== null;

  /**
   * ОКОНЧАНИЕ ≈ — сейчас плюс то, что осталось по программе: остаток текущей
   * части (не меньше нуля — сверх времени уже прошло), её совет, все
   * следующие части. Председатель так видит, когда встреча кончится, а не
   * абстрактное «отстаём на 2 минуты». Рядом мелко — когда по программе:
   * время начала из настроек встреч плюс вся программа.
   */
  const remainingSec = current
    ? (counselling
        ? Math.max(0, current.counselMin * 60 - counselElapsed)
        : Math.max(0, current.partMin * 60 - currentElapsed) + current.counselMin * 60) +
      segments.slice(run.index + 1).reduce((sum, s) => sum + s.minutes * 60, 0)
    : 0;
  const endsAt = clockOf(new Date(now + remainingSec * 1000));
  const meetingTime = (weekend ? effectiveVersionFor(settingsQuery.data?.versions, week)?.weekendTime : effectiveVersionFor(settingsQuery.data?.versions, week)?.midweekTime) ?? null;
  const plannedEnd = meetingTime ? addMinutes(meetingTime, totalRunMinutes(segments)) : null;
  // Behind or ahead of the programme's END — a late start counts (18 October 2026).
  const shownDriftSec = endDriftSec(now + remainingSec * 1000, plannedEnd, meetingDay, driftSec);

  // ONE TAP, ONE STEP. The big button changes its meaning under the finger
  // («Закончено» → «Следующая»), so a double tap on stage would skip the
  // counsel. For 1.5 s after a tap the big button does not answer — and says
  // so by fading.
  const lockedUntil = useRef(0);
  const [locked, setLocked] = useState(false);
  // «НАЖАТО РАНО» (Lionel, 22 October 2026): ending a part in its first
  // third asks for a second tap within EARLY_ARM_MS; the button says so.
  const [armedUntil, setArmedUntil] = useState<number | null>(null);
  // The last tap — «Вернуть» stands out for UNDO_LOUD_MS after it.
  const [lastTapAt, setLastTapAt] = useState<number | null>(null);
  const guarded = (fn: () => void, early = false) => () => {
    const at = Date.now();
    if (at < lockedUntil.current) return;
    if (early && !(armedUntil !== null && at < armedUntil)) {
      setArmedUntil(at + EARLY_ARM_MS);
      setNow(at);
      // Not 1.5 s: the second, meant tap may follow quickly — but not a bounce.
      lockedUntil.current = at + EARLY_BOUNCE_MS;
      setTimeout(() => setNow(Date.now()), EARLY_ARM_MS + 50);
      return;
    }
    setArmedUntil(null);
    setLastTapAt(at);
    setTimeout(() => setNow(Date.now()), UNDO_LOUD_MS + 50);
    lockedUntil.current = at + TAP_LOCK_MS;
    setLocked(true);
    setTimeout(() => setLocked(false), TAP_LOCK_MS);
    // The hand on the stage knows it took without the eyes leaving the hall.
    tapSaved();
    fn();
  };

  const start = () => {
    const at = Date.now();
    applyRun({ ...EMPTY, startedAt: at, meetingStartedAt: at, starts: [at], keys: [...segKeys], prev: snapshot(run) });
  };
  const closePause = (at: number) =>
    run.pausedSec + (run.pausedAt !== null ? (at - run.pausedAt) / 1000 : 0);
  const resume = () => {
    const at = Date.now();
    applyRun({ ...run, startedAt: at, pausedAt: null, pausedSec: closePause(at), prev: snapshot(run) });
  };

  /** «Закончено» — the student is done; the counsel begins and counts up. */
  const finishPart = () => {
    if (!current) return;
    const at = Date.now();
    const spent = [...run.spent];
    spent[run.index] = currentElapsed;
    applyRun({
      ...run,
      spent,
      carried: 0,
      startedAt: null,
      pausedSec: closePause(at),
      pausedAt: null,
      counselFrom: at,
      prev: snapshot(run),
    });
  };

  /**
   * «Следующая» — after the counsel, or after a part with none. The next part
   * starts NOW: nothing starts by itself (variant A, 15 October 2026 — on
   * 14 October all three counsels ran ~1:13 and the minute that started the
   * next part by itself had to be overtaken by hand every time).
   */
  const advance = () => advanceAt(Date.now());
  /** «Следующая» as if tapped at `at` — now, or a forgotten «Завершить» (finishLate). */
  const advanceAt = (at: number) => {
    if (!current) return;
    const spent = [...run.spent];
    const counsel = [...run.counsel];
    if (counselling && run.counselFrom !== null) {
      counsel[run.index] = Math.max(0, (at - run.counselFrom) / 1000);
    } else {
      spent[run.index] = run.carried + (run.startedAt !== null && at > run.startedAt ? (at - run.startedAt) / 1000 : 0);
      counsel[run.index] = null;
    }
    const nextIndex = run.index + 1;
    const last = nextIndex >= segments.length;
    // Another brother comes out: he is called now, his clock begins later.
    const calls = !last && !!entranceAt[nextIndex];
    // When each part began — so the result can place the pauses between them.
    const starts = run.starts.slice(0, nextIndex);
    while (starts.length < nextIndex) starts.push(null);
    if (!last) starts.push(calls ? null : at);
    applyRun({
      ...run,
      index: nextIndex,
      spent,
      counsel,
      starts,
      carried: 0,
      pausedSec: closePause(at),
      pausedAt: null,
      counselFrom: null,
      enteringFrom: calls ? at : null,
      startedAt: last || calls ? null : at,
      finishedAt: last ? at : null,
      saved: false,
      pending: null,
      prev: snapshot(run),
    });
  };

  /** «Начал»: the brother called up has begun; his clock starts now. */
  const begin = () => {
    if (!entering) return;
    applyRun({ ...beginPart(run, Date.now()), prev: snapshot(run) });
  };

  /**
   * «ЗАВЕРШИТЬ» FORGOTTEN (Lionel, 18 October 2026): the last part was begun
   * and nobody tapped again. Finished when that part was due to end — its own
   * minutes after it began — not «now», which may be the evening. Offered
   * only on the last part: a run that stopped earlier says nothing true about
   * the rest of the meeting, and is let go instead (dropHanging).
   */
  const lateEndAt = (): number | null => {
    if (!current || run.index !== segments.length - 1) return null;
    if (run.startedAt === null) return run.pausedAt;
    return run.startedAt + Math.max(0, current.partMin * 60 - run.carried) * 1000;
  };
  const finishLate = () => {
    const at = lateEndAt();
    if (at !== null) advanceAt(at);
  };
  const dropHanging = async () => {
    const ok = await confirm({
      title: t('conduct.hanging.dropTitle'),
      body: t('conduct.hanging.dropBody'),
      confirmLabel: t('conduct.hanging.drop'),
      danger: true,
    });
    if (ok) applyRun(EMPTY);
  };

  // What to do once the taps are here (ownHanging on the other device).
  const [afterTake, setAfterTake] = useState<'finish' | 'drop' | null>(null);
  useEffect(() => {
    if (!afterTake || mode !== 'run') return;
    const what = afterTake;
    setAfterTake(null);
    if (what === 'finish') finishLate();
    else void dropHanging();
    // finishLate and dropHanging read the run just taken over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterTake, mode, state]);

  /** One tap back: a tap pressed too early must not cost anybody time. */
  const undo = () => {
    if (!run.prev) return;
    applyRun({ ...run.prev, prev: run.prev.prev ?? null });
    setLastTapAt(null);
  };

  /**
   * «Начать заново». In practice only this device's run. For real (25 October
   * 2026) it wipes on the server too — the result and the run — so a run
   * tried out on the meeting's day leaves nothing behind and the meeting can
   * be run from the start; refused once the day is over (the result is then
   * the meeting's), and then nothing is wiped here either.
   */
  const reset = async () => {
    const ok = await confirm({
      title: practice ? t('conduct.againTitle') : t('conduct.wipe.title'),
      body: practice ? t('conduct.practice.againBody') : t('conduct.wipe.body'),
      confirmLabel: practice ? t('conduct.again') : t('conduct.wipe.confirm'),
      danger: true,
    });
    if (!ok) return;
    if (!practice) {
      try {
        await conductRunsApi.drop(week, kind);
      } catch (e) {
        notify(t('conduct.wipe.failed'), extractErrorMessage(e));
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['conduct-run', week, kind] });
      void queryClient.invalidateQueries({ queryKey: liveKey });
    }
    applyRun(EMPTY);
  };

  // --- live: the controller's taps to the server ----------------------
  /** The run (in this device's time) the server last took from us. */
  const pushedRef = useRef<string | null>(null);
  /** The server's updatedAt we know of — older answers do not move us back. */
  const knownUpdatedAt = useRef<string | null>(null);
  const pushingRef = useRef(false);
  const wasMine = useRef(false);
  const [pushTick, setPushTick] = useState(0);
  const [takenBy, setTakenBy] = useState<string | null>(null);
  const [takeFailed, setTakeFailed] = useState(false);
  const controlling = !!liveData && !practice && !meetingOver && mode === 'run';

  // Every change of the run goes up. A failure is tried again on the next
  // ask (every two seconds) — not at once, which would hammer a dead network.
  useEffect(() => {
    if (!controlling || !loaded) return;
    if (live && !live.mine) return;
    if (!live && state.meetingStartedAt === null) return; // nothing to say yet
    const json = JSON.stringify(toWire(state, 0));
    if (json === pushedRef.current || pushingRef.current) return;
    // Just opened, with a run kept here and one on the server: an older kept
    // run is not sent up — the server's is taken below (18 October 2026).
    if (pushedRef.current === null && live && !keptRunIsNewer(state, fromWire(live.state, serverClockOffset()))) return;
    pushingRef.current = true;
    conductLiveApi
      .put(
        {
          weekStartDate: week,
          epoch: live ? live.epoch : 0,
          // Beside the run: how long the part on screen is, for the home card.
          state: { ...toWire(state, serverClockOffset()), partMin: segments[state.index]?.minutes ?? null },
        },
        kind,
      )
      .then((ans) => {
        pushedRef.current = json;
        wasMine.current = true;
        if (ans.live) knownUpdatedAt.current = ans.live.updatedAt;
        putLive(ans);
        setPushTick((n) => n + 1);
      })
      .catch((e) => {
        // Somebody took it over: the next answer says who, and this device watches.
        if (statusOf(e) === 409) void liveQuery.refetch();
      })
      .finally(() => {
        pushingRef.current = false;
      });
    // liveQuery is a new object every render; its two moments are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlling, loaded, state, live, week, pushTick, putLive, liveQuery.dataUpdatedAt, liveQuery.errorUpdatedAt]);

  // OURS ON THE SERVER IS NEWER THAN OURS HERE — the same account on another
  // device, or this one reloaded: taken from the server, unless there are
  // taps here it has not had yet (those go up next).
  useEffect(() => {
    if (!loaded || practice || !live?.mine) return;
    if (knownUpdatedAt.current !== null && live.updatedAt <= knownUpdatedAt.current) return;
    knownUpdatedAt.current = live.updatedAt;
    wasMine.current = true;
    const here = JSON.stringify(toWire(state, 0));
    const theirs = fromWire(live.state, serverClockOffset()) ?? EMPTY;
    // Taps here the server has not had: after a push, anything changed since;
    // on opening, a kept run only if it is the later one (keptRunIsNewer —
    // the phone's half-hour-old run went up over the iPad's, 18 October).
    const dirty = pushedRef.current !== null ? here !== pushedRef.current : keptRunIsNewer(state, theirs);
    if (dirty) return;
    const next: RunState = { ...theirs, prev: null };
    pushedRef.current = JSON.stringify(toWire(next, 0));
    apply(next);
    // state is read, not followed: a tap here must not pull the server's back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, loaded, practice, apply]);

  // SOMEBODY ELSE RUNS IT NOW. What this device counted is no longer the
  // meeting: it is let go, so it can neither come back as «Продолжить» nor be
  // sent as the result.
  useEffect(() => {
    if (!loaded || practice || !live || live.mine) return;
    if (wasMine.current) {
      wasMine.current = false;
      // To another of this account's devices: not «Ведение взял Лионель» to Lionel.
      setTakenBy(live.mineElsewhere ? '' : (live.controllerName ?? t('conduct.live.someone')));
    }
    if (state.meetingStartedAt !== null) {
      pushedRef.current = null;
      apply(EMPTY);
    }
  }, [live, loaded, practice, state.meetingStartedAt, apply, t]);

  /** «Взять ведение»: the taps move to this device; the server refuses the other's. */
  const takeOver = async () => {
    const who = live?.controllerName ?? (live ? null : roles?.timekeeperName) ?? null;
    const ok = await confirm({
      title: t('conduct.live.takeTitle'),
      body: live?.mineElsewhere
        ? t('conduct.live.takeBodyElsewhere')
        : who
          ? t('conduct.live.takeBody', { name: who })
          : t('conduct.live.takeBodyNobody'),
      confirmLabel: t('conduct.live.take'),
    });
    if (!ok) return;
    await takeNow();
  };
  /** The take itself — also without asking, for this account's own hanging run. */
  const takeNow = async (): Promise<boolean> => {
    try {
      const ans = await conductLiveApi.take(week, kind);
      setTakeFailed(false);
      setTakenBy(null);
      if (ans.live) {
        const next: RunState = { ...(fromWire(ans.live.state, serverClockOffset()) ?? EMPTY), prev: null };
        knownUpdatedAt.current = ans.live.updatedAt;
        pushedRef.current = JSON.stringify(toWire(next, 0));
        wasMine.current = true;
        apply(next);
      }
      putLive(ans);
      if (watching && !roles?.isTimekeeper) setStageRun(true);
      return true;
    } catch {
      setTakeFailed(true);
      return false;
    }
  };

  // --- итог ----------------------------------------------------------
  const local: ConductSummaryData | null = useMemo(() => {
    if (!finished || run.finishedAt === null || run.meetingStartedAt === null) return null;
    // Parts timed by the version before 14 October hold the counsel minute
    // inside: they are compared with part + counsel, and carry no counsel.
    const legacy = new Set(run.legacyKeys);
    const meetingStart = run.meetingStartedAt;
    const segs: ConductRunSegment[] = segments.map((s, i) => {
      // The weekend song is the study conductor's line (19 October 2026): it is
      // his name the result shows, not the song's empty one.
      const row =
        weekend && s.key === 'weekend_song'
          ? rows.find((a) => a.partKey === 'watchtower_conductor')
          : s.assignmentId
            ? byId.get(s.assignmentId)
            : undefined;
      const old = legacy.has(s.key);
      const counselSec = run.counsel[i];
      const began = run.starts[i];
      return {
        key: s.key,
        assignmentId: s.assignmentId,
        publisherIds: [row?.publisherId, row?.assistantPublisherId].filter(
          (x): x is string => !!x,
        ),
        plannedSec: (s.partMin + (old ? s.counselMin : 0)) * 60,
        actualSec: Math.round(run.spent[i] ?? 0),
        // A counsel of a moment is no counsel: «Следующая» pressed straight
        // after «Закончено» — a discussion the workbook did not mark, say.
        counselSec:
          !old && s.counselMin > 0 && counselSec != null && counselSec >= MIN_COUNSEL_SEC
            ? Math.round(counselSec)
            : null,
        // When the part began, seconds from the meeting's start — where the
        // pauses between parts fell (16 October 2026). Null when not known.
        startSec: typeof began === 'number' ? Math.max(0, Math.round((began - meetingStart) / 1000)) : null,
      };
    });
    return {
      segments: segs,
      totalSec: Math.round((run.finishedAt - run.meetingStartedAt) / 1000),
      plannedSec: totalRunMinutes(segments) * 60,
      startedAt: new Date(run.meetingStartedAt).toISOString(),
    };
  }, [finished, run, segments, byId, weekend, rows]);

  // Kept with the run until it reaches the server, so it can go from any
  // screen the moment there is a signal (lib/conduct-resend.ts).
  // Only the device whose taps counted: a watcher's `local` is somebody else's run.
  useEffect(() => {
    if (practice || watching || meetingOver || !local || state.saved || state.pending || state.finishedAt === null) return;
    apply({ ...state, pending: local });
  }, [practice, watching, meetingOver, local, state, apply]);

  // A RUN LEFT UNFINISHED PAST THE MEETING'S DAY is not the meeting: it is
  // let go. A FINISHED one waiting to be sent stays — the hall may have had
  // no signal, and lib/conduct-resend.ts sends it when there is one.
  useEffect(() => {
    if (!loaded || !meetingOver || state.meetingStartedAt === null || state.finishedAt !== null) return;
    setState(EMPTY);
    AsyncStorage.removeItem(storageKey(week, kind)).catch(() => undefined);
  }, [loaded, meetingOver, state.meetingStartedAt, state.finishedAt, week]);

  const save = useMutation({
    mutationFn: (data: ConductSummaryData) =>
      conductRunsApi.save({ weekStartDate: week, ...data, ...(weekend ? { eventType: 'weekend' as const } : {}) }),
    onSuccess: () => {
      setState((s) => {
        const n = { ...s, saved: true, pending: null };
        persist(n);
        return n;
      });
      if (canRead) void runQuery.refetch();
    },
  });
  // Sent once when the meeting ends — and again on the next opening if it
  // did not reach the server (no signal in the hall). Never from practice.
  const triedFor = useRef<number | null>(null);
  // The server ANSWERED and said no — not the same as no signal, and saying
  // «нет связи» for it (as on 16 October) sends a man looking for Wi-Fi.
  const saveRefused = statusOf(save.error) !== undefined;
  useEffect(() => {
    if (practice || watching || meetingOver || !local || state.saved || !canRun || state.finishedAt === null) return;
    if (triedFor.current === state.finishedAt) return;
    triedFor.current = state.finishedAt;
    save.mutate(local);
  }, [practice, watching, meetingOver, local, state.saved, state.finishedAt, canRun, save]);

  const titleOf = (id: string | null) => (id ? (byId.get(id)?.partTitle ?? null) : null);
  /** The programme's counsel after a part, seconds — the report's plan for it. */
  const counselPlannedOf = useCallback(
    (key: string) => {
      const seg = segments.find((s) => s.key === key);
      return seg ? seg.counselMin * 60 : null;
    },
    [segments],
  );

  const chairmanName = chairmanRow?.publisherId ? (nameById.get(chairmanRow.publisherId) ?? null) : null;
  /**
   * How a part is named and whom it shows, on every conduct screen.
   *
   * The weekend as Lionel set it out (18 October 2026):
   *   13:00  the chairman — song and prayer
   *   13:05  the public talk
   *   13:35  the chairman again — thanks for the talk, announcements; he
   *          calls the study conductor, who announces song 129 (19 October:
   *          the song is the conductor's, said on the screen)
   *   13:40  the study itself, sixty minutes, no song inside
   *   14:40  the conductor announces the closing song and who prays
   * In the circuit overseer's week: the study 13:40–14:10 with no reader,
   * his concluding talk 14:10–14:40, then he announces the song and prayer.
   * The schedule's own names («Вступительная молитва», «Песня 129») said
   * nothing about who stands there, and put the song in the wrong place.
   */
  const runViewBase = (seg: RunSegment): SegView => {
    const row = seg.assignmentId ? byId.get(seg.assignmentId) : undefined;
    const d = partDisplay(seg.key, row?.partTitle ?? null);
    const names = [row?.publisherId, row?.assistantPublisherId]
      .map((id) => (id ? nameById.get(id) : null))
      .filter((x): x is string => !!x);
    // A visiting speaker — the public talk, the circuit overseer's talk — has
    // no card: his name as the programme keeps it.
    const person =
      names.length > 0
        ? names.join(' · ')
        : row?.speakerName
          ? [row.speakerName, row.speakerCongregation].filter(Boolean).join(' · ')
          : null;
    if (!weekend) {
      // STEPS OF THEIR OWN (Lionel, 22 October 2026): song and prayer, then
      // the chairman's words — and at the end the other way round. The song
      // is in the prayer's imported title («Песня 88 и молитва | …»).
      if (seg.key === 'midweek_opening_prayer' || seg.key === 'midweek_closing_prayer') {
        const opening = seg.key === 'midweek_opening_prayer';
        // In the circuit overseer's week the closing song is a row of its own,
        // the later of two midweek songs — the visit took it off the prayer,
        // and he picks it (co-visit-template on the server).
        const midSongs = rows
          .filter((a) => a.partKey === 'mid_song')
          .sort((a, b) => (a.partOrder ?? 0) - (b.partOrder ?? 0));
        const ownClosing = !opening && midSongs.length > 1 ? midSongs[midSongs.length - 1].partTitle : null;
        const song = ownClosing
          ? songFromTitle(ownClosing)
          : row?.partTitle
            ? songFromTitle(row.partTitle)
            : null;
        // The chairman announces the song; who prays, when it is another.
        const prayer = person && person !== chairmanName ? t('conduct.weekendRun.prayerBy', { name: person }) : null;
        return {
          label: song
            ? t('conduct.midweekRun.songAndPrayer', { song })
            : t(opening ? 'conduct.midweekRun.opening' : 'conduct.midweekRun.closing'),
          subtitle: null,
          person: [chairmanName, prayer].filter(Boolean).join(' · ') || null,
          song: null,
        };
      }
      if (seg.key === 'midweek_opening_words' || seg.key === 'midweek_closing_words') {
        return {
          label: t(seg.key === 'midweek_opening_words' ? 'conduct.midweekRun.openingWords' : 'conduct.midweekRun.closingWords'),
          subtitle: null,
          person,
          song: null,
        };
      }
      // The congregation Bible study: who conducts and who reads.
      if (seg.key === 'cbs_conductor' && person) {
        const reader = rows.find((a) => a.partKey === 'cbs_reader');
        const readerName = reader?.publisherId ? nameById.get(reader.publisherId) : null;
        return {
          label: d.label,
          subtitle: d.subtitle ?? null,
          person: readerName
            ? t('conduct.stage.wtPeople', { conductor: person, reader: readerName })
            : t('conduct.stage.wtConductor', { conductor: person }),
          song: null,
        };
      }
      return { label: d.label, subtitle: d.subtitle ?? null, person, song: null };
    }
    const songOf = (key: string) => {
      const r = rows.find((a) => a.partKey === key);
      return r ? partDisplay(key, r.partTitle ?? null).label : null;
    };
    // Two weekend songs in a visit week: before the study, and the closing one
    // after the overseer's talk — told apart by the programme's order.
    const weekendSongs = rows
      .filter((a) => a.partKey === 'weekend_song')
      .sort((a, b) => (a.partOrder ?? 0) - (b.partOrder ?? 0));
    const songLabel = (r: (typeof rows)[number] | undefined) =>
      r ? partDisplay('weekend_song', r.partTitle ?? null).label : null;
    if (seg.key === 'weekend_opening_prayer') {
      const prayer = person && person !== chairmanName ? t('conduct.weekendRun.prayerBy', { name: person }) : null;
      // The opening song's own row; else the number in the prayer's title.
      const prayerRow = rows.find((a) => a.partKey === 'weekend_opening_prayer');
      const song = songOf('weekend_opening_song') ?? (prayerRow?.partTitle ? songFromTitle(prayerRow.partTitle) : null);
      return {
        label: song ? t('conduct.weekendRun.openingSong', { song }) : t('conduct.weekendRun.opening'),
        subtitle: null,
        person: [chairmanName, prayer].filter(Boolean).join(' · ') || null,
        song: null,
      };
    }
    // Who stands up after the chairman (Lionel, 19 October 2026): the study
    // conductor announces the song before the study and, after it, the
    // closing song and who prays. In the circuit overseer's week it is he who
    // announces the closing song and the prayer, after his talk.
    const nameOfRow = (key: string) => {
      const r = rows.find((a) => a.partKey === key);
      return (r?.publisherId ? nameById.get(r.publisherId) : null) ?? r?.speakerName ?? null;
    };
    const conductor = nameOfRow('watchtower_conductor');
    // Variant A (Lionel, 19 October 2026): the chairman's line has no song in
    // it — he thanks, announces and calls the conductor; the song is the
    // conductor's own line, the first thing he says.
    if (seg.key === 'weekend_announcements') {
      return { label: t('conduct.weekendRun.between'), subtitle: null, person: chairmanName, song: null };
    }
    // He welcomes and introduces the speaker (variant A, 22 October 2026).
    if (seg.key === 'weekend_opening_words') {
      return { label: t('conduct.midweekRun.openingWords'), subtitle: null, person: chairmanName, song: null };
    }
    if (seg.key === 'weekend_song') {
      return {
        label: songLabel(weekendSongs[0]) ?? t('conduct.weekendRun.song'),
        subtitle: null,
        person: conductor,
        song: null,
      };
    }
    if (seg.key === 'weekend_closing_prayer') {
      const coWeek = segments.some((x) => x.key === 'co_concluding_talk');
      const announcer = coWeek ? nameOfRow('co_concluding_talk') : conductor;
      // THREE SONGS (Lionel, 19 October 2026): before the talk, before the
      // study, after it. The third is kept where the import puts it — in the
      // closing prayer's own title, «Песня 151 и молитва» (lib/wt-parser.ts);
      // in a visit week it may be a second weekend song of its own.
      const numberIn = (title: string | null | undefined) => /(\d{1,3})/.exec(title ?? '')?.[1] ?? null;
      const closingNo =
        (weekendSongs.length > 1 ? numberIn(weekendSongs[weekendSongs.length - 1].partTitle) : null) ??
        numberIn(rows.find((a) => a.partKey === 'weekend_closing_prayer')?.partTitle);
      const closingSong = closingNo ? t('conduct.weekendRun.songNo', { n: closingNo }) : null;
      return {
        label: closingSong ? t('conduct.weekendRun.closingSong', { song: closingSong }) : t('conduct.weekendRun.closing'),
        subtitle: null,
        person:
          [
            announcer ? t('conduct.weekendRun.announcedBy', { name: announcer }) : null,
            person ? t('conduct.weekendRun.prayerBy', { name: person }) : null,
          ]
            .filter(Boolean)
            .join(' · ') || null,
        song: null,
      };
    }
    // The talk, the study, the overseer's talk: what it is on top, its theme
    // under it (25 October 2026) — the bare theme said nothing of the part.
    const named: Record<string, string> = {
      public_talk_speaker: 'conduct.weekendRun.publicTalk',
      watchtower_conductor: 'conduct.weekendRun.watchtower',
      co_concluding_talk: 'conduct.weekendRun.coTalk',
    };
    if (named[seg.key]) {
      const theme = row?.partTitle?.trim() ? d.label : null;
      return { label: t(named[seg.key]), subtitle: null, person, song: null, theme };
    }
    return { label: d.label, subtitle: d.subtitle ?? null, person, song: null };
  };
  /**
   * THE SONG'S NAME (Lionel, 22 October 2026): a song step names its song by
   * number in its label; the catalog (Программа → песни) gives the words.
   */
  const runView = (seg: RunSegment): SegView => {
    const v = runViewBase(seg);
    if (!seg.soft) return v;
    const n = /(\d{1,3})/.exec(v.label)?.[1];
    const name = n ? songTitles.get(parseInt(n, 10)) : undefined;
    return name ? { ...v, song: name } : v;
  };
  /**
   * How a step heads a card. A midweek song is the song first, then who
   * prays (22 October 2026 — «молитва: …» stood above the song as if it
   * were the part); the weekend keeps the chairman first, as approved.
   */
  // One order on both meetings since 25 October 2026: what is on, then who.
  const headView = (seg: RunSegment): SegView => runView(seg);
  /** A segment key as the run sheet names it — also for a part that is gone. */
  const keyLabel = (key: string) => {
    const seg = segments.find((s) => s.key === key);
    if (seg) return runView(seg).label;
    // A result saved while the weekend opening was two steps (22–25 October).
    if (key === 'weekend_opening_words') return t('conduct.midweekRun.openingWords');
    return partDisplay(key, null).label;
  };
  /** Who a part shows when its card names nobody (the result's table, the weekend). */
  const keyPerson = (key: string) => {
    const seg = segments.find((s) => s.key === key);
    return seg ? runView(seg).person : null;
  };
  /** «Анна Вебер · Мария Кох — Начинаем разговор»: what the chairman announces. */
  const announce = (seg: RunSegment) => {
    const v = runView(seg);
    // «Заключительная песня и молитва · молитва: …», not the prayer before the part.
    if ((weekend && seg.key === 'weekend_closing_prayer') || (!weekend && seg.soft))
      return [v.label, v.person].filter(Boolean).join(' · ');
    return v.person ? `${v.person} — ${v.label}` : v.label;
  };
  const changedNote = run.changed ? (
    <View style={styles.changedNote}>
      <Text style={styles.changedTitle}>{t('conduct.changed.title')}</Text>
      {run.changed.added.length > 0 ? (
        <Text style={styles.changedLine}>
          {t('conduct.changed.added', { parts: run.changed.added.map(keyLabel).join(', ') })}
        </Text>
      ) : null}
      {run.changed.removed.length > 0 ? (
        <Text style={styles.changedLine}>
          {t('conduct.changed.removed', { parts: run.changed.removed.map(keyLabel).join(', ') })}
        </Text>
      ) : null}
      <Text style={styles.changedLine}>{t('conduct.changed.note')}</Text>
    </View>
  ) : null;
  const legacyNote =
    run.legacyKeys.length > 0 ? (
      <Text style={styles.keepNote}>{t('conduct.result.legacyNote', { n: run.legacyKeys.length })}</Text>
    ) : null;
  const practiceNote = practice ? (
    <View style={styles.practiceNote}>
      <Ionicons name="school-outline" size={18} color="#075985" />
      <Text style={styles.practiceText}>{t('conduct.practice.banner')}</Text>
      {/* The way out is on the banner itself: in the header it would be a
          lone cap icon before the practice has begun, which says nothing. */}
      <Pressable onPress={() => setPractice(null)} hitSlop={8} accessibilityRole="button">
        <Text style={styles.practiceEnd}>{t('conduct.practice.endShort')}</Text>
      </Pressable>
    </View>
  ) : null;
  const nameOf = (id: string) => nameById.get(id) ?? null;

  // The remote result is what a reader sees; the menu is the runner's.
  const remote = runQuery.data ?? null;
  // An appointed brother watching a meeting that is running sees it run.
  const watchingLive = watching && !!live && !meetingOver;
  const showLocal = !meetingOver && !!local && (canRun || !!practice || watchingLive);
  // The screen on the stage (app/stage.tsx) is opened only on the meeting's
  // day and only to watch: before the timekeeper starts it shows the
  // chairman's «Начало в 19:00», never a result it may not read.
  const stageDisplay = user?.role === 'stage';
  const reading =
    !stageDisplay && !showLocal && !practice && !watchingLive && (!canRun || meetingOver);

  // AFTER «ЗАВЕРШИТЬ», THE STAGE IS NOT A READER (21 October 2026). The
  // screen at the lectern used to turn into the whole result — every
  // brother's minutes, on a laptop anybody passing can look at, while the
  // result is the admins', the counsel brother's and the overseer's to read
  // (Lionel, 16 October 2026) — headed by «Ведущий не на связи», since the
  // timekeeper's device had rightly gone quiet. app/stage.tsx shows the
  // clock and the next meeting instead, with the time this one ended.
  // Not run in the app at all, and its end by the programme has passed: the
  // stage goes back to the clock instead of counting a delay all evening
  // (22 October 2026 — «Начало задерживается +211:58»).
  const stageEnded = stageDisplay && showLocal && local ? run.finishedAt : null;
  const notRunAndOver =
    stageDisplay &&
    run.meetingStartedAt === null &&
    (untilStartSec(plannedEnd, meetingDay, now) ?? 1) < 0;
  useEffect(() => {
    if (!stageDisplay) return;
    onStageFinished?.(stageEnded !== null ? { endedAt: stageEnded } : notRunAndOver ? { endedAt: null } : null);
  }, [stageDisplay, stageEnded, notRunAndOver, onStageFinished]);

  // «⋯» in the header: practice, and «Начать заново» — away from «Вернуть»,
  // which is pressed often, while this wipes the meeting.
  const navigation = useNavigation();
  const menuOpen = (canRun || watching) && !reading && segments.length > 0;
  useEffect(() => {
    navigation.setOptions({
      headerRight: !menuOpen
        ? undefined
        : () => (
            <HeaderMenu
              title={t('conduct.title')}
              color={HEADER_ICON}
              items={[
                check === null
                  ? {
                      key: 'check',
                      icon: 'tv-outline' as const,
                      title: t('conduct.stage.check.menu'),
                      subtitle: t('conduct.stage.check.menuHint'),
                      onPress: () => setCheck(Date.now()),
                    }
                  : {
                      key: 'check-end',
                      icon: 'tv-outline' as const,
                      title: t('conduct.stage.check.end'),
                      subtitle: t('conduct.stage.check.sub'),
                      onPress: () => setCheck(null),
                    },
                ...(canRun ? [
                practice
                  ? {
                      key: 'practice-end',
                      icon: 'school-outline' as const,
                      title: t('conduct.practice.end'),
                      subtitle: t('conduct.practice.endHint'),
                      onPress: () => setPractice(null),
                    }
                  : {
                      key: 'practice',
                      icon: 'school-outline' as const,
                      title: t('conduct.practice.start'),
                      subtitle: t('conduct.practice.hint'),
                      onPress: () => setPractice(EMPTY),
                    },
                ] : []),
                // Practice: this device's run. For real: until the day is over,
                // also from another device once that run has ended there (a
                // trial finished on the iPad, wiped from the phone).
                ...(canRun &&
                (practice
                  ? !watching && run.meetingStartedAt !== null
                  : !meetingOver &&
                    (run.meetingStartedAt !== null || !!runQuery.data) &&
                    (!watching || run.finishedAt !== null))
                  ? [
                      {
                        key: 'again',
                        icon: 'refresh' as const,
                        title: practice ? t('conduct.again') : t('conduct.wipe.menu'),
                        subtitle: practice ? t('conduct.againHint') : t('conduct.wipe.hint'),
                        onPress: () => void reset(),
                        tint: '#b91c1c',
                        tintBg: '#fee2e2',
                      },
                    ]
                  : []),
              ]}
            />
          ),
    });
    // reset is recreated each render; what it reads is in the deps below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, menuOpen, practice, run.meetingStartedAt, run.finishedAt, watching, check, canRun, t, meetingOver, runQuery.data]);

  // The line that says who runs the meeting and whether everybody is there.
  const serverNowEst = Date.now() + offset;
  // Begun, never finished, no tap for longer than any part (18 October 2026).
  const hanging =
    !practice && check === null && segments.length > 0 && runLeftHanging(run, now, current ? current.minutes : null);
  const hangingSince = hanging ? lastMoment(run) : null;
  // No good answer, or none for a while (an ask still out) — see watchUnsure.
  const offline =
    !!liveData &&
    watchUnsure({ failed: liveQuery.isError, lastGoodAtMs: liveQuery.dataUpdatedAt, nowMs: Date.now(), controllerSilent: false });
  // The device that runs it has gone silent: its taps do not arrive either.
  // Once «Завершить» is pressed the device that ran it rightly goes quiet:
  // that is the end of the meeting, not a lost timekeeper (21 October 2026 —
  // «Ведущий не на связи с 20:44» stood over the finished meeting).
  const runEnded = run.finishedAt !== null;
  const controllerGone =
    !!live && !live.mine && !offline && !runEnded && isSilent(live.controllerSeenAt, serverNowEst);
  // What a watching device shows can no longer be trusted: grey, and words.
  const unsure = watching && (offline || controllerGone || hanging);
  const liveLines: { text: string; tone: 'live' | 'warn' | 'muted' }[] = [];
  if (!practice && liveData) {
    if (offline) {
      const at = clockOf(new Date(liveQuery.dataUpdatedAt));
      liveLines.push({
        text: watching ? t('conduct.live.offlineWatch', { time: at }) : t('conduct.live.offlineRun'),
        tone: 'warn',
      });
    }
    if (hanging && watching && hangingSince !== null)
      liveLines.push({ text: t('conduct.hanging.watch', { time: clockOf(new Date(hangingSince)) }), tone: 'warn' });
    if (takenBy !== null && watching)
      liveLines.push({
        text: takenBy === '' ? t('conduct.live.takenElsewhere') : t('conduct.live.taken', { name: takenBy }),
        tone: 'muted',
      });
    if (live?.mine) {
      liveLines.push({ text: t('conduct.live.runningYou'), tone: 'live' });
      // Whether the chairman looks is his affair (Lionel, 18 October 2026): he
      // opens the screen when he wants, and it must then simply be right. No
      // warning when his phone is off — only a quiet line while he looks.
      if (!roles?.isChairman && chairmanName && !isSilent(live.chairmanSeenAt, serverNowEst)) {
        liveLines.push({ text: t('conduct.live.chairmanWatching', { name: chairmanName }), tone: 'muted' });
      }
    } else if (live && runEnded && run.finishedAt !== null) {
      liveLines.push({ text: t('conduct.live.ended', { time: clockOf(new Date(run.finishedAt)) }), tone: 'muted' });
    } else if (live) {
      const name = live.controllerName ?? t('conduct.live.someone');
      const silent = controllerGone;
      // No green dot for a device that has stopped answering — nor while
      // this one cannot hear the server: then nobody knows.
      liveLines.push({
        text: live.mineElsewhere ? t('conduct.live.runningYouElsewhere') : t('conduct.live.runningBy', { name }),
        tone: silent || offline ? 'muted' : 'live',
      });
      if (silent) {
        const since = clockOf(new Date(Date.parse(live.controllerSeenAt) - offset));
        liveLines.push({ text: t('conduct.live.controllerSilent', { time: since }), tone: 'warn' });
      }
    } else if (watching) {
      liveLines.push({
        text: roles?.timekeeperName
          ? t('conduct.live.waitingTimekeeper', { name: roles.timekeeperName })
          : t('conduct.live.waitingNobody'),
        tone: 'muted',
      });
    }
    if (takeFailed) liveLines.push({ text: t('conduct.live.takeFailed'), tone: 'warn' });
  }
  const liveStrip =
    liveLines.length > 0 ? (
      <View style={styles.liveStrip}>
        {liveLines.map((l, i) => (
          <View key={i} style={styles.liveLine}>
            {l.tone === 'live' ? <View style={styles.liveDot} /> : null}
            <Text style={[styles.liveText, l.tone === 'warn' && styles.liveWarn, l.tone === 'muted' && styles.liveMuted]}>
              {l.text}
            </Text>
          </View>
        ))}
      </View>
    ) : null;
  // A watcher may take the taps over only if he is one of the three hands.
  const takeButton =
    watching && canRun && !practice && liveData ? (
      <Pressable style={styles.ghostBtn} onPress={() => void takeOver()} accessibilityRole="button">
        <Ionicons name="hand-left-outline" size={18} color="#0369a1" />
        <Text style={styles.ghostBtnText}>{t('conduct.live.take')}</Text>
      </Pressable>
    ) : null;

  // --- что показывать -------------------------------------------------
  if (!week) {
    return <Notice text={t('conduct.noWeek')} />;
  }
  if (
    (assignmentsQuery.isLoading && !kept) ||
    (meQuery.isLoading && !keptMyId) ||
    (liveQuery.isLoading && !liveGaveUp)
  ) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }
  if (segments.length === 0) {
    return <Notice text={t('conduct.noProgramme')} />;
  }

  // The result: this device's own run, or the one saved on the server.
  if (reading) {
    // Said the way every refusal is (audit, 22 October 2026), with who may.
    if (!canRead)
      return (
        <View style={styles.center}>
          <NoAccess
            hint={meetingOver ? t(weekend ? 'conduct.result.notYoursWeekend' : 'conduct.result.notYours') : t('conduct.notChairman')}
          />
        </View>
      );
    if (runQuery.isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color="#0ea5e9" />
        </View>
      );
    }
    if (!remote) return <Notice text={t('conduct.result.none')} />;
    return (
      <ScrollView
        key={`${week}-${kind}`}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.resultWrap}>
          <Text style={styles.overline}>{t('conduct.result.title')}</Text>
          <ConductReport data={remote} titleOf={titleOf} keyLabelOf={weekend ? keyLabel : undefined} keyPersonOf={weekend ? keyPerson : undefined} noteKey={weekend ? 'conduct.report.noteWeekend' : undefined} nameOf={nameOf} chairmanName={chairmanName} counselPlannedOf={counselPlannedOf} wide={wide} />
          <Text style={styles.keepNote}>{t(weekend ? 'conduct.result.keepWeekend' : 'conduct.result.keep')}</Text>
        </View>
      </ScrollView>
    );
  }

  if (!chairmanRow?.publisherId) {
    return (
      <Notice
        text={t('conduct.noChairman')}
        action={{ label: t('conduct.toSchedule'), onPress: () => goBack('/schedule') }}
      />
    );
  }

  if (stageDisplay && showLocal && local) {
    // app/stage.tsx covers this with its own screen; nothing of the result.
    return <View style={{ flex: 1, backgroundColor: '#0b1220' }} />;
  }

  if (showLocal && local) {
    return (
      <ScrollView
        key={`${week}-${kind}`}
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <View style={styles.resultWrap}>
          {practiceNote}
          {liveStrip}
          <Text style={styles.overline}>{t('conduct.finished')}</Text>
          {changedNote}
          <ConductReport data={local} titleOf={titleOf} keyLabelOf={weekend ? keyLabel : undefined} keyPersonOf={weekend ? keyPerson : undefined} noteKey={weekend ? 'conduct.report.noteWeekend' : undefined} nameOf={nameOf} chairmanName={chairmanName} counselPlannedOf={counselPlannedOf} wide={wide} />
          {legacyNote}
          {practice ? (
            <Text style={styles.keepNote}>{t('conduct.practice.notSaved')}</Text>
          ) : watching ? (
            <Text style={styles.keepNote}>
              {remote ? t(weekend ? 'conduct.result.savedWeekend' : 'conduct.result.saved') : t('conduct.live.resultByController')}
            </Text>
          ) : (
            <Text style={[styles.keepNote, save.isError && styles.keepNoteError]}>
              {state.saved
                ? t(weekend ? 'conduct.result.savedWeekend' : 'conduct.result.saved')
                : save.isError
                  ? saveRefused
                    ? t('conduct.result.refused', { reason: extractErrorMessage(save.error) })
                    : t('conduct.result.notSaved')
                  : t('conduct.result.saving')}
            </Text>
          )}
          {!practice && !watching && save.isError && !saveRefused && !state.saved ? (
            <Pressable style={styles.ghostBtn} onPress={() => save.mutate(local)}>
              <Text style={styles.ghostBtnText}>{t('conduct.result.retry')}</Text>
            </Pressable>
          ) : null}
          <View style={styles.rowBtns}>
            {run.prev && !watching ? (
              <Pressable style={styles.ghostBtn} onPress={undo}>
                <Ionicons name="arrow-undo" size={16} color="#0369a1" />
                <Text style={styles.ghostBtnText}>{t('conduct.undo')}</Text>
              </Pressable>
            ) : null}
            {practice ? (
              <Pressable style={styles.ghostBtn} onPress={() => setPractice(null)}>
                <Text style={styles.ghostBtnText}>{t('conduct.practice.end')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </ScrollView>
    );
  }

  // The countdown, and what it means in words as well as colour: about one man
  // in twelve tells amber from red badly, and a minus alone is easy to miss.
  const left = current ? current.partMin * 60 - currentElapsed : 0;
  const tone = current ? stageTone(left, current.partMin) : 'calm';
  const counselLong = !unsure && (current ? counselElapsed > current.counselMin * 60 : false);
  const big = [wide ? styles.countdownWide : styles.countdown, unsure && styles.countdownStale];
  // Instead of «сверх времени» on a screen that does not know.
  const unsureLine = unsure ? <Text style={[styles.stateLine, styles.unsureLine]}>{t('conduct.live.unsure')}</Text> : null;
  // HELD (18 October 2026): the countdown stood in red for twenty minutes and
  // only the small «Продолжить» said that it was not counting.
  const pausedText = started && !counselling && run.pausedAt !== null ? t('conduct.pausedSince', { time: clockOf(new Date(run.pausedAt)) }) : null;

  // BEFORE THE START (25 October 2026): not «Сейчас · 0:00» over a meeting
  // nothing of which is on yet, but when it begins and how soon.
  const untilStart = !started ? untilStartSec(meetingTime, meetingDay, now) : null;
  const startLine = (() => {
    if (started || !meetingTime) return null;
    if (untilStart !== null && untilStart > 0 && untilStart <= 6 * 3600) {
      const m = Math.ceil(untilStart / 60);
      const inText =
        m >= 60
          ? t('conduct.inHours', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') })
          : t('conduct.inMinutes', { m });
      return t('conduct.startsIn', { time: meetingTime, in: inText });
    }
    if (untilStart !== null && untilStart <= 0 && untilStart > -2 * 3600) {
      return t('conduct.startsLate', { time: meetingTime, m: Math.floor(-untilStart / 60) });
    }
    return t('conduct.startsAt', { time: meetingTime });
  })();

  const nowCard = current ? (
    !started ? (
      <View style={styles.nowCard}>
        <Text style={styles.overline}>{startLine ?? t('conduct.first')}</Text>
        <SegmentHeadline view={headView(current)} big whatFirst />
        <Text style={[styles.planned, { marginTop: 14 }]}>{t('conduct.countAfterStart')}</Text>
      </View>
    ) : counselling ? (
      <View style={[styles.nowCard, styles.counselCard]}>
        <Text style={styles.overline}>
          {t('conduct.counsel.title', { part: keyLabel(current.key) })}
        </Text>
        <CounselledHeadline row={current.assignmentId ? byId.get(current.assignmentId) : undefined} nameById={nameById} />
        <Text style={styles.subtitle}>
          {t('conduct.counsel.took', { time: mmss(run.spent[run.index] ?? 0) })}
        </Text>
        <Text style={[...big, counselLong && styles.toneSoon]}>{mmss(counselElapsed)}</Text>
        {counselLong ? <Text style={[styles.stateLine, styles.toneSoon]}>{t('conduct.counsel.long')}</Text> : null}
        {unsureLine}
        <Text style={styles.planned}>{t('conduct.counsel.note')}</Text>
      </View>
    ) : entering ? (
      // «ПЕРЕХОД · ВЫХОДИТ» (Lionel, 22 October 2026): the brother is on his
      // way; his minutes begin with «Начал», or by themselves after 30 s.
      <View style={styles.nowCard}>
        <Text style={styles.overline}>{t('conduct.entrance.overline')}</Text>
        <SegmentHeadline view={headView(current)} big whatFirst />
        {/* NO RUNNING SECONDS while he walks up (Lionel, 25 October 2026):
            they looked as if something were already being counted. The part's
            own minutes stand still, grey, as on the chairman's screen; the walk
            itself is still kept and shown in the result as «переход». */}
        {current.soft ? null : (
          <Text style={[...big, styles.countdownPaused]}>{mmss(current.partMin * 60)}</Text>
        )}
        {unsureLine}
        <Text style={styles.planned}>
          {t(current.soft ? 'conduct.entrance.noteSong' : 'conduct.entrance.note', { minutes: current.partMin })}
        </Text>
      </View>
    ) : current.soft ? (
      // A SONG: up from zero, no amber, no red (Lionel, 22 October 2026).
      <View style={styles.nowCard}>
        <Text style={styles.overline}>{t('conduct.now')}</Text>
        <SegmentHeadline view={headView(current)} big whatFirst />
        <Text style={[...big, styles.countdownPaused]}>{mmss(currentElapsed)}</Text>
        {unsureLine}
        <Text style={styles.planned}>{t('conduct.soft.note', { minutes: current.partMin })}</Text>
      </View>
    ) : (
      <View style={styles.nowCard}>
        <Text style={styles.overline}>{isStudent ? t('conduct.nowStudent') : t('conduct.now')}</Text>
        <SegmentHeadline view={headView(current)} big whatFirst />
        <Text
          style={[
            ...big,
            !unsure && !pausedText && tone === 'soon' && styles.toneSoon,
            !unsure && !pausedText && tone === 'over' && styles.toneOver,
            !unsure && !!pausedText && styles.countdownPaused,
          ]}
        >
          {formatCountdown(left)}
        </Text>
        {unsureLine}
        {!unsure && pausedText ? (
          <View style={styles.pausedLine}>
            <Ionicons name="pause" size={18} color="#475569" />
            <Text style={[styles.stateLine, styles.pausedText]}>{pausedText}</Text>
          </View>
        ) : null}
        {!unsure && !pausedText && started && tone === 'soon' ? (
          <Text style={[styles.stateLine, styles.toneSoon]}>
            {current && warnSecFor(current.partMin) >= 60 ? t('conduct.stage.lastMinute') : t('conduct.lastSeconds')}
          </Text>
        ) : null}
        {!unsure && !pausedText && started && tone === 'over' ? (
          <Text style={[styles.stateLine, styles.toneOver]}>{t('conduct.overtime')}</Text>
        ) : null}
        <Text style={styles.planned}>
          {isStudent
            ? t('conduct.plannedThenCounsel', { minutes: current.partMin, counsel: current.counselMin })
            : t('conduct.planned', { minutes: current.partMin })}
        </Text>
      </View>
    )
  ) : null;

  // What the big button does now, and whom it calls next.
  const last = run.index === segments.length - 1;
  const primaryBase: { label: string; sub: string | null; onPress: () => void } = !started
    ? { label: t('conduct.start'), sub: t('conduct.startSub'), onPress: start }
    : entering && current
      ? {
          label: current.soft
            ? t('conduct.entrance.beginSong')
            : t('conduct.entrance.begin', { time: mmss(current.partMin * 60) }),
          // That it starts by itself — said once, without seconds ticking.
          sub: t(current.soft ? 'conduct.entrance.autoSong' : 'conduct.entrance.auto'),
          onPress: begin,
        }
    : isStudent && !counselling
      ? { label: t('conduct.partDone'), sub: null, onPress: finishPart }
      : current
        ? // BOTH MEETINGS (Lionel, 25 October 2026): the button says what has
          // just happened in the hall — «Закончил», «Совет закончился»,
          // «Песня закончилась», «Молитва закончилась». What comes next is
          // said once, under it. A student's own part keeps «Закончено»: a
          // sister gives it as often as a brother.
          {
            label: last
              ? t('conduct.done.prayer')
              : counselling
                ? t('conduct.done.counsel')
                : current.key === 'weekend_opening_prayer' || current.chairmanWords
                  ? t('conduct.done.chairman')
                  : current.key === 'midweek_opening_prayer'
                    ? t('conduct.done.prayer')
                    : current.soft
                      ? t('conduct.done.song')
                      : t('conduct.done.part'),
            sub: last ? t('conduct.done.prayerSub') : null,
            onPress: advance,
          }
      : last
        ? { label: t('conduct.finish'), sub: null, onPress: advance }
        : {
            label: t('conduct.nextPart'),
            // «Выходит: …» when the tap calls a brother up to the stage.
            sub: next
              ? entranceAt[run.index + 1]
                ? t('conduct.entrance.callsUp', { who: announce(next) })
                : announce(next)
              : null,
            onPress: advance,
          };
  // A part ended in its first third (never a song: they run as they run).
  const earlyEnd =
    started &&
    !!current &&
    !current.soft &&
    !entering &&
    !counselling &&
    run.startedAt !== null &&
    currentElapsed < Math.max(EARLY_MIN_SEC, current.partMin * 60 * EARLY_SHARE);
  const armed = earlyEnd && armedUntil !== null && now < armedUntil;
  const primary = armed
    ? {
        ...primaryBase,
        label: t('conduct.early.again', { time: mmss(currentElapsed) }),
        sub: t('conduct.early.hint', { minutes: current?.partMin ?? 0 }),
      }
    : primaryBase;
  const pressPrimary = guarded(primary.onPress, earlyEnd);
  const undoLoud = !!run.prev && lastTapAt !== null && now - lastTapAt < UNDO_LOUD_MS;

  const controls = (
    <View style={styles.controls}>
      {watching ? (
        takeButton
      ) : (
      <Pressable
        style={[
          styles.primaryBtn,
          (!started || entering) && styles.primaryBtnBegin,
          started && !entering && last && styles.primaryBtnEnd,
          armed && styles.primaryBtnArmed,
          locked && !armed && styles.primaryBtnLocked,
        ]}
        onPress={pressPrimary}
        accessibilityRole="button"
      >
        <Text style={styles.primaryBtnText}>{primary.label}</Text>
        {primary.sub ? (
          <Text style={styles.primaryBtnSub}>
            {primary.sub}
          </Text>
        ) : null}
      </Pressable>
      )}

      {started && !watching ? (
        <View style={styles.rowBtns}>
          {/* NO PAUSE (Lionel, 18 October 2026): the meeting goes by the wall
              clock — start on time, and then as it goes. A pause tapped by
              mistake held the countdown for twenty minutes that day. A run
              held by an app from before still gets «Продолжить». */}
          {!counselling && run.pausedAt !== null ? (
            <Pressable style={styles.ghostBtn} onPress={resume}>
              <Ionicons name="play" size={18} color="#0369a1" />
              <Text style={styles.ghostBtnText}>{t('conduct.resume')}</Text>
            </Pressable>
          ) : null}
          {run.prev ? (
            // Loud for ten seconds after a tap: a mistake is noticed then.
            <Pressable style={[styles.ghostBtn, undoLoud && styles.undoLoud]} onPress={undo}>
              <Ionicons name="arrow-undo" size={undoLoud ? 18 : 16} color={undoLoud ? '#92400e' : '#0369a1'} />
              <Text style={[styles.ghostBtnText, undoLoud && styles.undoLoudText]}>
                {undoLoud ? t('conduct.undoLoud') : t('conduct.undo')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {started ? (
        <View style={styles.endBlock}>
          <Text style={styles.endLine}>
            {t('conduct.endsAt')} <Text style={styles.endTime}>{endsAt}</Text>
            {plannedEnd ? <Text style={styles.endPlanned}>{`  ${t('conduct.byProgramme', { time: plannedEnd })}`}</Text> : null}
          </Text>
          <Text style={[styles.drift, unsure ? styles.driftOk : driftStyle(shownDriftSec)]}>{driftLabel(shownDriftSec, t)}</Text>
        </View>
      ) : null}
    </View>
  );

  // What comes next, said once, under the button — also during the counsel:
  // the button no longer names it (25 October 2026).
  const upcoming = next;
  const upNext = upcoming ? (
    <View style={styles.nextCard}>
      <Text style={styles.overline}>{t('conduct.next')}</Text>
      <SegmentHeadline view={headView(upcoming)} whatFirst comesOut={!!entranceAt[run.index + 1]} />
    </View>
  ) : null;

  const sheet = (
    <View style={styles.sheet}>
      <Text style={styles.overline}>{t('conduct.runSheet')}</Text>
      {segments.map((s, i) => {
        const v = runView(s);
        const person = v.person;
        return (
          <View
            key={`${s.key}-${i}`}
            style={[styles.sheetRow, i < run.index && styles.sheetRowDone]}
          >
            <Text style={styles.sheetMin}>
              {s.partMin}
              {s.counselMin > 0 ? <Text style={styles.sheetCounsel}>{` +${s.counselMin}`}</Text> : null}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetLabel}>
                {v.label}
                {i === run.index && counselling ? (
                  <Text style={styles.sheetCounselNow}>{` · ${t('conduct.counsel.short')}`}</Text>
                ) : null}
              </Text>
              {/* Every song by its number AND its name (25 October 2026). */}
              {v.song ? <Text style={styles.sheetSong}>{t('common.quoted', { text: v.song })}</Text> : null}
              {v.theme ? <Text style={styles.sheetSong}>{t('common.quoted', { text: v.theme })}</Text> : null}
              {person ? <Text style={styles.sheetPerson}>{person}</Text> : null}
              {s.key === 'public_talk_speaker' && mayReplaceSpeaker ? (
                <Pressable
                  style={styles.replaceBtn}
                  onPress={() => setReplaceOpen(true)}
                  accessibilityRole="button"
                >
                  <Ionicons name="swap-horizontal" size={18} color="#ffffff" />
                  <Text style={styles.replaceBtnText}>{t('quickReplace.action')}</Text>
                </Pressable>
              ) : null}
            </View>
            {i === run.index && !finished ? (
              <Ionicons name="caret-forward" size={16} color="#0ea5e9" />
            ) : null}
          </View>
        );
      })}
      {/* The counsel minute is a midweek thing; the weekend has no student part. */}
      {segments.some((x) => x.counselMin > 0) ? <Text style={styles.sheetNote}>{t('conduct.counselNote')}</Text> : null}
    </View>
  );

  // ── THE CHAIRMAN'S SCREEN AT THE LECTERN (18 October 2026) ──────────────
  // components/ConductStage.tsx. On a device that watches the timekeeper's
  // taps, after «Взять ведение» from it, and in «Проверить экран».
  const stagePart = (seg: RunSegment | null | undefined): StagePart | null => {
    if (!seg) return null;
    const row = seg.assignmentId ? byId.get(seg.assignmentId) : undefined;
    // The chairman's words are no part of the programme's sections: the
    // opening ones stand with the opening, the concluding ones and the last
    // song with the close — no heading (22 October 2026).
    const sub =
      seg.key === 'midweek_closing_words' || seg.key === 'midweek_closing_prayer'
        ? 'closing'
        : resolveSubsection(
            seg.key === 'midweek_opening_words'
              ? 'midweek_opening_prayer'
              : seg.key === 'weekend_opening_words'
                ? 'weekend_opening_prayer'
                : seg.key,
          );
    const v = runView(seg);
    let person = v.person;
    // A visiting speaker has no card: his name and congregation as the
    // programme keeps them (18 October 2026).
    if (seg.key === 'public_talk_speaker' && !person && row?.speakerName) {
      person = [row.speakerName, row.speakerCongregation].filter(Boolean).join(' · ');
    }
    // The study: who conducts and who reads — no reader in the week of the
    // circuit overseer's visit (Lionel, 18 October 2026).
    if (seg.key === 'watchtower_conductor') {
      const reader = rows.find((a) => a.partKey === 'watchtower_reader');
      const readerName = reader?.publisherId ? nameById.get(reader.publisherId) : null;
      const coWeek = segments.some((x) => x.key === 'co_concluding_talk');
      person = person
        ? readerName && !coWeek
          ? t('conduct.stage.wtPeople', { conductor: person, reader: readerName })
          : t('conduct.stage.wtConductor', { conductor: person })
        : null;
    }
    return {
      // The closing group borrows the opening's name in the schedule (lib/parts.ts) — not here.
      // The chairman's thanks after the talk is no «Вступление».
      section:
        seg.key !== 'weekend_announcements' && sub !== 'closing' && SUBSECTIONS[sub] ? t(SUBSECTIONS[sub].i18nKey) : null,
      sectionColor: STAGE_SECTION_COLORS[sub] ?? '#94a3b8',
      // The chairman announces the theme: it stays the title there.
      title: v.theme ?? v.label,
      person,
      minutes: seg.partMin,
      soft: !!seg.soft,
      song: v.song,
    };
  };
  const stageHeading = (() => {
    const day = meetingDay
      ? parseISODate(meetingDay).toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })
      : null;
    const name = weekend ? t('conduct.stage.weekend') : t('conduct.stage.midweek');
    return day ? `${name} · ${day}` : name;
  })();
  const stageClock = clockOf(new Date(now));
  const stageDrift = (sec: number) => ({
    text: driftLabel(sec, t),
    tone: (Math.abs(sec) < 60 ? 'ok' : sec > 0 ? 'behind' : 'ahead') as 'ok' | 'behind' | 'ahead',
  });

  if (check !== null) {
    const frame = demoFrame(segments, now - check);
    const idx = frame.phase === 'done' ? segments.length - 1 : frame.index;
    const seg = segments[idx];
    const counsel = frame.phase === 'counsel';
    const nextSeg = segments[idx + 1];
    return (
      <ConductStage
        heading={stageHeading}
        clock={stageClock}
        who={null}
        banner={null}
        phase={counsel ? 'counsel' : 'part'}
        startAt={meetingTime}
        untilStart={null}
        current={stagePart(seg)}
        counselFor={counsel ? (() => { const sp = stagePart(seg); return sp ? { title: sp.title, person: sp.person } : null; })() : null}
        leftSec={frame.phase === 'part' ? frame.leftSec : 0}
        unsure={false}
        paused={null}
        next={stagePart(nextSeg)}
        then={counsel ? null : stagePart(segments[idx + 2])}
        endsAt={null}
        plannedEnd={plannedEnd}
        drift={null}
        onTake={null}
        controls={null}
        check={{
          online: liveData ? !offline : liveQuery.isError ? false : null,
          awake: awakeOk,
          done: frame.phase === 'done',
          onEnd: () => setCheck(null),
          onAgain: () => setCheck(Date.now()),
        }}
      />
    );
  }

  // THIS ACCOUNT'S OWN HANGING RUN, OPENED ON ITS OTHER DEVICE (19 October
  // 2026): finished or dropped right here — the taps are taken over without
  // asking first, it is the same brother; before, he had to «Взять ведение»
  // and only then saw the way to finish.
  const ownHanging = hanging && (!watching || !!live?.mineElsewhere);
  const lateEnd = ownHanging ? lateEndAt() : null;
  const hangingCard = (
    <View style={styles.hangingCard}>
      <Text style={styles.hangingTitle}>{t('conduct.hanging.title')}</Text>
      <Text style={styles.hangingText}>
        {lateEnd !== null
          ? t('conduct.hanging.lastPart', { part: current ? runView(current).label : '' })
          : t('conduct.hanging.stopped', {
              part: current ? runView(current).label : '',
              time: hangingSince !== null ? clockOf(new Date(hangingSince)) : '',
            })}
      </Text>
      {lateEnd !== null ? (
        <Pressable
          style={styles.hangingPrimary}
          onPress={() => (watching ? void takeNow().then((ok) => ok && setAfterTake('finish')) : finishLate())}
          accessibilityRole="button"
        >
          <Text style={styles.hangingPrimaryText}>{t('conduct.hanging.finish', { time: clockOf(new Date(lateEnd)) })}</Text>
        </Pressable>
      ) : null}
      <Pressable
        style={styles.ghostBtn}
        onPress={() => void (watching ? takeNow().then((ok) => ok && setAfterTake('drop')) : dropHanging())}
        accessibilityRole="button"
      >
        <Ionicons name="trash-outline" size={18} color="#b91c1c" />
        <Text style={[styles.ghostBtnText, { color: '#b91c1c' }]}>{t('conduct.hanging.drop')}</Text>
      </Pressable>
    </View>
  );

  // The one who ran a hanging run finishes it on the timekeeper's screen.
  if (!practice && onStage && !ownHanging) {
    const whoName = live?.controllerName ?? roles?.timekeeperName ?? null;
    const who = !watching
      ? { text: t('conduct.stage.youRun'), tone: 'mine' as const }
      : whoName
        ? {
            text: live?.mineElsewhere ? t('conduct.stage.youRunElsewhere') : t('conduct.stage.runBy', { name: whoName }),
            tone: (offline || controllerGone || !live ? 'muted' : 'live') as 'muted' | 'live',
          }
        : null;
    const banner =
      watching && hanging && hangingSince !== null
        ? t('conduct.hanging.watch', { time: clockOf(new Date(hangingSince)) })
        : watching && offline
        ? t('conduct.live.offlineWatch', { time: clockOf(new Date(liveQuery.dataUpdatedAt)) })
        : watching && controllerGone && live
          ? t('conduct.live.controllerSilent', { time: clockOf(new Date(Date.parse(live.controllerSeenAt) - offset)) })
          : null;
    const lastPart = run.index === segments.length - 1;
    const controls =
      !watching && started
        ? {
            primary: {
              label: primary.label,
              sub: entering || armed ? primary.sub : isStudent && !counselling ? null : lastPart ? null : next ? (stagePart(next)?.title ?? null) : null,
              onPress: pressPrimary,
              locked: locked && !armed,
            },
            // No pause; only a run held by an app from before is let go on.
            pause: !counselling && run.pausedAt !== null ? { label: t('conduct.resume'), onPress: resume } : null,
            undo: run.prev ? { label: undoLoud ? t('conduct.undoLoud') : t('conduct.undo'), onPress: undo } : null,
          }
        : !watching
          ? { primary: { label: t('conduct.start'), sub: null, onPress: guarded(start), locked }, pause: null, undo: null }
          : null;
    return (
      <ConductStage
        heading={stageHeading}
        clock={stageClock}
        who={who}
        banner={banner}
        phase={!started ? 'before' : counselling ? 'counsel' : entering ? 'entrance' : 'part'}
        startAt={meetingTime}
        untilStart={!started ? untilStartSec(meetingTime, meetingDay, now) : null}
        current={stagePart(current)}
        counselFor={counselling ? (() => { const sp = stagePart(current); return sp ? { title: sp.title, person: sp.person } : null; })() : null}
        leftSec={left}
        unsure={unsure}
        paused={pausedText}
        next={stagePart(!started ? segments[0] : next)}
        then={counselling ? null : stagePart(!started ? segments[1] : afterNext)}
        endsAt={started ? endsAt : null}
        plannedEnd={plannedEnd}
        drift={started ? stageDrift(shownDriftSec) : null}
        onTake={watching && canRun && liveData ? () => void takeOver() : null}
        controls={controls}
        check={null}
      />
    );
  }

  return (
    // A key per meeting (26 October 2026): the same screen opened by a link
    // for another meeting is reused, and kept the place it was scrolled to —
    // the new meeting opened halfway down.
    <ScrollView
      key={`${week}-${kind}`}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {practiceNote}
      {liveStrip}
      {fromKept && kept ? (
        <KeptNotice
          queries={[
            {
              data: kept.rows,
              isError: true,
              error: assignmentsQuery.error,
              dataUpdatedAt: kept.at,
            },
          ]}
          onRetry={() => void assignmentsQuery.refetch()}
          style={{ marginHorizontal: 0, marginTop: 0, marginBottom: 12 }}
        />
      ) : null}
      <View style={wide ? styles.twoCol : undefined}>
        <View style={wide ? styles.colMain : undefined}>
          {changedNote}
          {/* A hanging run: the card says what happened; a red «−176:10» under it would only shout. */}
          {ownHanging ? hangingCard : nowCard}
          {ownHanging ? null : controls}
          {upNext}
        </View>
        <View style={wide ? styles.colSide : undefined}>{sheet}</View>
      </View>
      {mayReplaceSpeaker ? (
        <QuickReplaceSheet
          visible={replaceOpen}
          weekStartDate={week}
          currentName={(() => {
            // The man alone, without his congregation: «… — did not come».
            const r = rows.find((a) => a.partKey === 'public_talk_speaker');
            return (r?.publisherId ? nameById.get(r.publisherId) : null) ?? r?.speakerName ?? null;
          })()}
          onClose={() => setReplaceOpen(false)}
          onDone={() => void queryClient.invalidateQueries({ queryKey: ['conduct-assignments', week, kind] })}
        />
      ) : null}
    </ScrollView>
  );
}

/** The one being counselled — the student; the assistant beside him. */
function CounselledHeadline({
  row,
  nameById,
}: {
  row: Assignment | undefined;
  nameById: Map<string, string>;
}) {
  const person = row?.publisherId ? nameById.get(row.publisherId) : null;
  const assistant = row?.assistantPublisherId ? nameById.get(row.assistantPublisherId) : null;
  if (!person) return null;
  return <Text style={styles.personBig}>{assistant ? `${person} · ${assistant}` : person}</Text>;
}

/** Имя человека крупнее названия: вслух объявляют прежде всего его. */
interface SegView {
  label: string;
  subtitle: string | null;
  person: string | null;
  /** A song step: the song's name from the catalog. */
  song: string | null;
  /** The weekend talk's or study's own theme, under the part's name. */
  theme?: string | null;
}

function SegmentHeadline({
  view,
  big,
  whatFirst,
  comesOut,
}: {
  view: SegView;
  big?: boolean;
  /**
   * The weekend (Lionel, 25 October 2026): what is on, then who — on every
   * step the same, so the eye does not look for it anew.
   */
  whatFirst?: boolean;
  /** «выходит …» before the name: another brother goes to the lectern. */
  comesOut?: boolean;
}) {
  const { t } = useTranslation();
  if (whatFirst) {
    return (
      <View>
        <Text style={big ? styles.whatBig : styles.whatSmall}>{view.label}</Text>
        {view.theme ? <Text style={big ? styles.songBig : styles.songSmall}>{t('common.quoted', { text: view.theme })}</Text> : null}
        {view.song ? <Text style={big ? styles.songBig : styles.songSmall}>{t('common.quoted', { text: view.song })}</Text> : null}
        {view.subtitle ? <Text style={styles.subtitle}>{view.subtitle}</Text> : null}
        {view.person ? (
          <Text style={big ? styles.whoBig : styles.whoSmall}>
            {comesOut ? t('conduct.comesOutWho', { who: view.person }) : view.person}
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <View>
      {view.person ? <Text style={big ? styles.personBig : styles.personSmall}>{view.person}</Text> : null}
      {/* With nobody named, the step's own name heads the card (a song). */}
      <Text style={view.person ? (big ? styles.partBig : styles.partSmall) : big ? styles.personBig : styles.personSmall}>
        {view.label}
      </Text>
      {view.song ? <Text style={big ? styles.songBig : styles.songSmall}>{t('common.quoted', { text: view.song })}</Text> : null}
      {view.subtitle ? <Text style={styles.subtitle}>{view.subtitle}</Text> : null}
    </View>
  );
}

function Notice({
  text,
  action,
}: {
  text: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.center}>
      <Text style={styles.notice}>{text}</Text>
      {action ? (
        <Pressable style={styles.ghostBtn} onPress={action.onPress}>
          <Text style={styles.ghostBtnText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function driftLabel(sec: number, t: TFunction): string {
  const minutes = Math.round(Math.abs(sec) / 60);
  if (minutes === 0) return t('conduct.onTime');
  return sec > 0
    ? t('conduct.behind', { minutes })
    : t('conduct.ahead', { minutes });
}

function driftStyle(sec: number) {
  if (Math.abs(sec) < 60) return styles.driftOk;
  return sec > 0 ? styles.driftBehind : styles.driftAhead;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 48 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#f8fafc',
  },
  // Full width up to the cap: shrunk to its text, the card moved and narrowed
  // from step to step (seen on the stand, 25 October 2026).
  twoCol: { flexDirection: 'row', gap: 20, width: '100%', maxWidth: 1000, alignSelf: 'center' },
  colMain: { flex: 3 },
  colSide: { flex: 2 },

  nowCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  nextCard: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    padding: 16,
    marginTop: 12,
  },
  overline: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 8,
  },
  personBig: { fontSize: 30, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  // The weekend's headline: the part, then the brother in blue.
  whatBig: { fontSize: 28, lineHeight: 34, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  whatSmall: { fontSize: 18, lineHeight: 23, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  whoBig: { fontSize: 22, lineHeight: 28, fontFamily: 'Manrope_600SemiBold', color: '#0369a1', marginTop: 6 },
  whoSmall: { fontSize: 15, lineHeight: 20, fontFamily: 'Manrope_600SemiBold', color: '#0369a1', marginTop: 3 },
  personSmall: { fontSize: 20, fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  partBig: { fontFamily: 'Manrope_400Regular', fontSize: 26, color: '#334155', marginTop: 4 },
  partSmall: { fontFamily: 'Manrope_400Regular', fontSize: 16, color: '#475569', marginTop: 2 },
  subtitle: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#64748b', marginTop: 4 },
  songBig: { fontFamily: 'Manrope_500Medium', fontSize: 17, color: '#334155', marginTop: 4 },
  songSmall: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#334155', marginTop: 2 },
  // Half as big again as on 14 October: read at a glance from the lectern.
  countdown: {
    fontSize: 84,
    fontFamily: 'Manrope_700Bold',
    color: '#0369a1',
    marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  countdownWide: {
    fontSize: 128,
    lineHeight: 136,
    fontFamily: 'Manrope_700Bold',
    color: '#0369a1',
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  // The watcher lost the signal: the number is a guess and looks like one.
  countdownStale: { color: '#94a3b8' },
  unsureLine: { color: '#64748b' },
  countdownPaused: { color: '#94a3b8' },
  hangingCard: {
    backgroundColor: '#fffbf5',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    marginBottom: 12,
  },
  hangingTitle: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#9a3412' },
  hangingText: { fontFamily: 'Manrope_400Regular', fontSize: 15, color: '#7c2d12', lineHeight: 21 },
  hangingPrimary: { backgroundColor: '#0ea5e9', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  hangingPrimaryText: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#ffffff' },
  pausedLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pausedText: { color: '#475569' },
  toneSoon: { color: '#b45309' },
  toneOver: { color: '#b91c1c' },
  stateLine: { fontFamily: 'Manrope_700Bold', fontSize: 16, marginTop: 2 },
  counselCard: { backgroundColor: '#f0f9ff', borderColor: '#bae6fd' },
  planned: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b' },

  controls: { marginTop: 16, gap: 10 },
  primaryBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#ffffff', fontSize: 22, fontFamily: 'Manrope_700Bold' },
  // Something begins (the meeting, «Начал»): green; the meeting's end: violet.
  primaryBtnBegin: { backgroundColor: '#0f766e' },
  primaryBtnEnd: { backgroundColor: '#7c3aed' },
  primaryBtnSub: {
    color: '#ffffff',
    fontSize: 15,
    fontFamily: 'Manrope_600SemiBold',
    opacity: 0.92,
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  // The 1.5 s after a tap when the button does not answer — and shows it.
  primaryBtnLocked: { opacity: 0.55 },
  primaryBtnArmed: { backgroundColor: '#d97706' },
  undoLoud: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#f59e0b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  undoLoudText: { color: '#92400e', fontFamily: 'Manrope_700Bold' },
  ghostBtn: {
    flexDirection: 'row',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: '#0369a1', fontSize: 15, fontFamily: 'Manrope_600SemiBold' },

  drift: { textAlign: 'center', fontSize: 15, fontFamily: 'Manrope_600SemiBold', marginTop: 2 },
  endBlock: { marginTop: 4 },
  endLine: { textAlign: 'center', fontFamily: 'Manrope_400Regular', fontSize: 16, color: '#334155' },
  endTime: { fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  endPlanned: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#94a3b8' },
  driftOk: { color: '#64748b' },
  driftBehind: { color: '#b91c1c' },
  driftAhead: { color: '#15803d' },

  sheet: { marginTop: 20 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  sheetRowDone: { opacity: 0.45 },
  sheetMin: {
    fontFamily: 'Manrope_400Regular',
    width: 40,
    textAlign: 'right',
    fontSize: 13,
    color: '#64748b',
    fontVariant: ['tabular-nums'],
  },
  sheetLabel: { fontFamily: 'Manrope_400Regular', fontSize: 15, color: '#0f172a' },
  sheetSong: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#475569', marginTop: 1 },
  sheetPerson: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b' },
  replaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ea580c',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    minHeight: 46,
  },
  replaceBtnText: { color: '#ffffff', fontSize: 15, fontFamily: 'Manrope_800ExtraBold' },
  sheetCounsel: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: '#94a3b8' },
  sheetCounselNow: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0369a1' },
  sheetNote: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#94a3b8', marginTop: 8 },
  rowBtns: { flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap' },
  resultWrap: { width: '100%', maxWidth: 1180, alignSelf: 'center' },
  keepNote: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b', marginTop: 10, textAlign: 'center' },
  keepNoteError: { color: '#b91c1c' },

  notice: { fontFamily: 'Manrope_400Regular', fontSize: 16, color: '#475569', textAlign: 'center' },

  practiceNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  practiceText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#075985' },
  practiceEnd: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0369a1', paddingHorizontal: 4 },
  changedNote: {
    backgroundColor: '#fffbeb',
    borderColor: '#fcd34d',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 2,
  },
  liveStrip: {
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 4,
  },
  liveLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16a34a' },
  liveText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#0f172a' },
  liveWarn: { color: '#b45309' },
  liveMuted: { fontFamily: 'Manrope_400Regular', color: '#475569' },
  changedTitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#92400e' },
  changedLine: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#78350f' },
});
