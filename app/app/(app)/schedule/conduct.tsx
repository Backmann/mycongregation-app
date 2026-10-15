import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  Assignment,
  assignmentsApi,
  conductRunsApi,
  ConductRunSegment,
  meApi,
  meetingSettingsApi,
  publishersApi,
} from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { buildMidweekRunOrder, RunSegment, totalRunMinutes } from '../../../lib/run-order';
import { partDisplay } from '../../../lib/part-display';
import { failsScreen } from '../../../lib/screen-failure';
import { keptMeetingRows } from '../../../lib/offline-keep-rules';
import { keptMe, keptPieces } from '../../../lib/offline-keep';
import { KeptNotice } from '../../../components/ConnectionState';
import { ConductSummary, ConductSummaryData, mmss } from '../../../components/ConductSummary';
import { confirm } from '../../../components/ConfirmHost';
import { formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import {
  EMPTY_RUN as EMPTY,
  inCounsel,
  isExpiredRecord,
  reconcileKeys,
  readRunRecord,
  RECORD_PREFIX,
  RUN_RECORD_VERSION,
  RunState,
  writeRunRecord,
} from '../../../lib/conduct-run-record';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { HeaderMenu } from '../../../components/HeaderMenu';
import { HEADER_ICON } from '../../../lib/header';
import { tapSaved } from '../../../lib/haptics';

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
 * WHO MAY RUN IT: the chairman named in this week's programme, and an admin.
 * Not the elders in general — the screen is a tool for the man running the
 * meeting, and two people advancing the same parts would help nobody. The
 * elders may READ the result once it is saved, for its seven days.
 */

// THE RUN AS KEPT ON THE DEVICE — its shape, every older shape and how they
// are read, and how a run follows a programme that changed under it — lives
// in lib/conduct-run-record.ts (15 October 2026).

/** One second, the only cadence this screen needs. */
const TICK_MS = 1000;

/** After a tap the big button does not answer for this long (a double tap). */
const TAP_LOCK_MS = 1500;
/** The last stretch of a part, shown amber and in words. */
const LAST_SECONDS = 30;
/** A counsel shorter than this was no counsel — it is not shown. */
const MIN_COUNSEL_SEC = 3;

function storageKey(week: string) {
  return `${RECORD_PREFIX}${week}`;
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
function snapshot(s: RunState): Omit<RunState, 'prev'> {
  const { prev: _prev, ...rest } = s;
  return rest;
}

export default function ConductScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ week?: string }>();
  const week = typeof params.week === 'string' ? params.week : '';
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  // WITH NO SIGNAL IN THE HALL (9 October 2026): the meeting's rows as kept on
  // the device with the programme of the coming weeks (lib/offline-keep.ts).
  // Read once, when the screen opens — they are what was there to begin with.
  // Read from what is KEPT (not the query cache, which lets go of an answer
  // nobody has looked at for five minutes) — every piece, this Monday's and
  // the ones before it that still reach this week.
  const kept = useMemo(
    () => (week ? keptMeetingRows(keptPieces<Assignment>('assignments', user?.id), week, 'midweek') : null),
    [week, user?.id],
  );

  const assignmentsQuery = useQuery({
    // «Не удалось загрузить» only when nothing is kept for this meeting.
    throwOnError: (error, query) => !kept && failsScreen(error, query),
    queryKey: ['conduct-assignments', week],
    // The server's filter semantics for weekStart are not relied on here: we
    // ask for the week and then keep only the rows that say they belong to it.
    queryFn: () =>
      assignmentsApi.list({ weekStart: week, eventType: 'midweek', limit: 200 }),
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
      buildMidweekRunOrder(
        rows.map((a) => ({
          id: a.id,
          partKey: a.partKey,
          partDurationMin: a.partDurationMin,
          partTitle: a.partTitle,
        })),
      ),
    [rows],
  );

  const segKeys = useMemo(() => segments.map((s) => s.key), [segments]);

  const byId = useMemo(() => {
    const m = new Map<string, Assignment>();
    for (const a of rows) m.set(a.id, a);
    return m;
  }, [rows]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of rosterQuery.data?.data ?? []) m.set(p.id, p.displayName);
    return m;
  }, [rosterQuery.data]);

  const chairmanRow = rows.find((a) => a.partKey === 'midweek_chairman');
  // Who is asking: the server's answer, or — with no signal — one's own card
  // as kept (who, never the contacts). Without it every chairman read «you
  // are not the chairman» in a hall with no signal.
  const keptMyId = keptMe(user?.id)?.id ?? null;
  const myPublisherId = meQuery.data?.publisher?.id ?? keptMyId;
  const isAdmin = user?.role === 'admin';
  const isChairman =
    !!chairmanRow?.publisherId && chairmanRow.publisherId === myPublisherId;
  const canRun = isChairman || isAdmin;
  // The result is read by the chairman and the elders (the server says the same).
  const canRead = canRun || user?.role === 'elder';
  const thisWeek = formatDateISO(startOfWeekMonday(new Date()));
  const pastWeek = !!week && week < thisWeek;

  // The saved result — what an elder reads, and what a chairman sees again
  // on another device. Never kept on the device (lib/offline-keep-rules).
  const runQuery = useQuery({
    queryKey: ['conduct-run', week],
    queryFn: () => conductRunsApi.get(week),
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
    if (!week || segKeys.length === 0 || loadedFor.current === week) return;
    loadedFor.current = week;
    const key = storageKey(week);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (loadedFor.current !== week) return;
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
        if (loadedFor.current === week) setLoaded(true);
      });
  }, [week, segKeys]);

  const persist = useCallback(
    (next: RunState) => {
      if (!week) return;
      AsyncStorage.setItem(storageKey(week), writeRunRecord(next)).catch(() => {
        // Не удалось сохранить — встреча всё равно идёт.
      });
    },
    [week],
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
  const run = practice ?? state;
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
  const ticking =
    run.finishedAt === null && (run.startedAt !== null || run.pausedAt !== null || counselling);
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [ticking]);

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
    if (Platform.OS === 'web' || !ticking) return;
    const TAG = 'conduct-mode';
    let keep: {
      activateKeepAwakeAsync: (tag?: string) => Promise<void>;
      deactivateKeepAwake: (tag?: string) => Promise<void>;
    } | null = null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      keep = require('expo-keep-awake');
      void keep?.activateKeepAwakeAsync(TAG).catch(() => undefined);
    } catch {
      keep = null;
    }
    return () => {
      void keep?.deactivateKeepAwake(TAG).catch(() => undefined);
    };
  }, [ticking]);
  // В браузере — его собственным средством.
  useEffect(() => {
    if (Platform.OS !== 'web' || !ticking) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<typeof lock> };
    };
    nav.wakeLock
      ?.request('screen')
      .then((l) => {
        lock = l;
      })
      .catch(() => {
        // Старый Safari или отказ пользователя — просто без этого.
      });
    return () => {
      lock?.release().catch(() => undefined);
    };
  }, [ticking]);

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
  const meetingTime = effectiveVersionFor(settingsQuery.data?.versions, week)?.midweekTime ?? null;
  const plannedEnd = meetingTime ? addMinutes(meetingTime, totalRunMinutes(segments)) : null;

  // ONE TAP, ONE STEP. The big button changes its meaning under the finger
  // («Закончено» → «Следующая»), so a double tap on stage would skip the
  // counsel. For 1.5 s after a tap the big button does not answer — and says
  // so by fading.
  const lockedUntil = useRef(0);
  const [locked, setLocked] = useState(false);
  const guarded = (fn: () => void) => () => {
    const at = Date.now();
    if (at < lockedUntil.current) return;
    lockedUntil.current = at + TAP_LOCK_MS;
    setLocked(true);
    setTimeout(() => setLocked(false), TAP_LOCK_MS);
    // The hand on the stage knows it took without the eyes leaving the hall.
    tapSaved();
    fn();
  };

  const start = () => {
    const at = Date.now();
    applyRun({ ...EMPTY, startedAt: at, meetingStartedAt: at, keys: [...segKeys], prev: snapshot(run) });
  };
  const closePause = (at: number) =>
    run.pausedSec + (run.pausedAt !== null ? (at - run.pausedAt) / 1000 : 0);
  const pause = () => {
    const at = Date.now();
    applyRun({ ...run, carried: currentElapsed, startedAt: null, pausedAt: at, prev: snapshot(run) });
  };
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
  const advance = () => {
    if (!current) return;
    const at = Date.now();
    const spent = [...run.spent];
    const counsel = [...run.counsel];
    if (counselling && run.counselFrom !== null) {
      counsel[run.index] = (at - run.counselFrom) / 1000;
    } else {
      spent[run.index] = currentElapsed;
      counsel[run.index] = null;
    }
    const nextIndex = run.index + 1;
    const last = nextIndex >= segments.length;
    applyRun({
      ...run,
      index: nextIndex,
      spent,
      counsel,
      carried: 0,
      pausedSec: closePause(at),
      pausedAt: null,
      counselFrom: null,
      startedAt: last ? null : at,
      finishedAt: last ? at : null,
      saved: false,
      pending: null,
      prev: snapshot(run),
    });
  };

  /** One tap back: a tap pressed too early must not cost anybody time. */
  const undo = () => {
    if (!run.prev) return;
    applyRun({ ...run.prev, prev: null });
  };

  const reset = async () => {
    const ok = await confirm({
      title: t('conduct.againTitle'),
      body: practice ? t('conduct.practice.againBody') : t('conduct.againBody'),
      confirmLabel: t('conduct.again'),
      danger: true,
    });
    if (ok) applyRun(EMPTY);
  };

  // --- итог ----------------------------------------------------------
  const local: ConductSummaryData | null = useMemo(() => {
    if (!finished || run.finishedAt === null || run.meetingStartedAt === null) return null;
    // Parts timed by the version before 14 October hold the counsel minute
    // inside: they are compared with part + counsel, and carry no counsel.
    const legacy = new Set(run.legacyKeys);
    const segs: ConductRunSegment[] = segments.map((s, i) => {
      const row = s.assignmentId ? byId.get(s.assignmentId) : undefined;
      const old = legacy.has(s.key);
      const counselSec = run.counsel[i];
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
      };
    });
    return {
      segments: segs,
      totalSec: Math.round((run.finishedAt - run.meetingStartedAt) / 1000),
      plannedSec: totalRunMinutes(segments) * 60,
    };
  }, [finished, run, segments, byId]);

  // Kept with the run until it reaches the server, so it can go from any
  // screen the moment there is a signal (lib/conduct-resend.ts).
  useEffect(() => {
    if (practice || !local || state.saved || state.pending || state.finishedAt === null) return;
    apply({ ...state, pending: local });
  }, [practice, local, state, apply]);

  const save = useMutation({
    mutationFn: (data: ConductSummaryData) =>
      conductRunsApi.save({ weekStartDate: week, ...data }),
    onSuccess: () => {
      setState((s) => {
        const n = { ...s, saved: true, pending: null };
        persist(n);
        return n;
      });
      void runQuery.refetch();
    },
  });
  // Sent once when the meeting ends — and again on the next opening if it
  // did not reach the server (no signal in the hall). Never from practice.
  const triedFor = useRef<number | null>(null);
  useEffect(() => {
    if (practice || !local || state.saved || !canRun || state.finishedAt === null) return;
    if (triedFor.current === state.finishedAt) return;
    triedFor.current = state.finishedAt;
    save.mutate(local);
  }, [practice, local, state.saved, state.finishedAt, canRun, save]);

  const titleOf = (id: string | null) => (id ? (byId.get(id)?.partTitle ?? null) : null);

  /** A segment key as the run sheet names it — also for a part that is gone. */
  const keyLabel = (key: string) => {
    const seg = segments.find((s) => s.key === key);
    const row = seg?.assignmentId ? byId.get(seg.assignmentId) : undefined;
    return partDisplay(key, row?.partTitle ?? null).label;
  };
  /** «Анна Вебер · Мария Кох — Начинаем разговор»: what the chairman announces. */
  const announce = (seg: RunSegment) => {
    const row = seg.assignmentId ? byId.get(seg.assignmentId) : undefined;
    const label = partDisplay(seg.key, row?.partTitle ?? null).label;
    const people = [row?.publisherId, row?.assistantPublisherId]
      .map((id) => (id ? nameById.get(id) : null))
      .filter((x): x is string => !!x);
    return people.length > 0 ? `${people.join(' · ')} — ${label}` : label;
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
  const chairmanName = chairmanRow?.publisherId ? (nameById.get(chairmanRow.publisherId) ?? null) : null;

  // The remote result is what a reader sees; the menu is the runner's.
  const remote = runQuery.data ?? null;
  const showLocal = !!local && (canRun || !!practice);
  const reading = !showLocal && !practice && (!canRun || pastWeek);

  // «⋯» in the header: practice, and «Начать заново» — away from «Вернуть»,
  // which is pressed often, while this wipes the meeting.
  const navigation = useNavigation();
  const menuOpen = canRun && !reading && segments.length > 0;
  useEffect(() => {
    navigation.setOptions({
      headerRight: !menuOpen
        ? undefined
        : () => (
            <HeaderMenu
              title={t('conduct.title')}
              color={HEADER_ICON}
              items={[
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
                ...(run.meetingStartedAt !== null
                  ? [
                      {
                        key: 'again',
                        icon: 'refresh' as const,
                        title: t('conduct.again'),
                        subtitle: t('conduct.againHint'),
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
  }, [navigation, menuOpen, practice, run.meetingStartedAt, t]);

  // --- что показывать -------------------------------------------------
  if (!week) {
    return <Notice text={t('conduct.noWeek')} />;
  }
  if ((assignmentsQuery.isLoading && !kept) || (meQuery.isLoading && !keptMyId)) {
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
    if (!canRead) return <Notice text={t('conduct.notChairman')} />;
    if (runQuery.isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color="#0ea5e9" />
        </View>
      );
    }
    if (!remote) return <Notice text={t('conduct.result.none')} />;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.resultWrap}>
          <Text style={styles.overline}>{t('conduct.result.title')}</Text>
          <ConductSummary data={remote} titleOf={titleOf} nameOf={nameOf} chairmanName={chairmanName} />
          <Text style={styles.keepNote}>{t('conduct.result.keep')}</Text>
        </View>
      </ScrollView>
    );
  }

  if (!chairmanRow?.publisherId) {
    return (
      <Notice
        text={t('conduct.noChairman')}
        action={{ label: t('conduct.toSchedule'), onPress: () => router.back() }}
      />
    );
  }

  if (showLocal && local) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.resultWrap}>
          {practiceNote}
          <Text style={styles.overline}>{t('conduct.finished')}</Text>
          {changedNote}
          <ConductSummary data={local} titleOf={titleOf} nameOf={nameOf} chairmanName={chairmanName} />
          {legacyNote}
          {practice ? (
            <Text style={styles.keepNote}>{t('conduct.practice.notSaved')}</Text>
          ) : (
            <Text style={[styles.keepNote, save.isError && styles.keepNoteError]}>
              {state.saved
                ? t('conduct.result.saved')
                : save.isError
                  ? t('conduct.result.notSaved')
                  : t('conduct.result.saving')}
            </Text>
          )}
          {!practice && save.isError && !state.saved ? (
            <Pressable style={styles.ghostBtn} onPress={() => save.mutate(local)}>
              <Text style={styles.ghostBtnText}>{t('conduct.result.retry')}</Text>
            </Pressable>
          ) : null}
          <View style={styles.rowBtns}>
            {run.prev ? (
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
  const tone: 'calm' | 'soon' | 'over' = left < 0 ? 'over' : left <= LAST_SECONDS ? 'soon' : 'calm';
  const counselLong = current ? counselElapsed > current.counselMin * 60 : false;
  const big = wide ? styles.countdownWide : styles.countdown;

  const nowCard = current ? (
    counselling ? (
      <View style={[styles.nowCard, styles.counselCard]}>
        <Text style={styles.overline}>
          {t('conduct.counsel.title', { part: keyLabel(current.key) })}
        </Text>
        <CounselledHeadline row={current.assignmentId ? byId.get(current.assignmentId) : undefined} nameById={nameById} />
        <Text style={styles.subtitle}>
          {t('conduct.counsel.took', { time: mmss(run.spent[run.index] ?? 0) })}
        </Text>
        <Text style={[big, counselLong && styles.toneSoon]}>{mmss(counselElapsed)}</Text>
        {counselLong ? <Text style={[styles.stateLine, styles.toneSoon]}>{t('conduct.counsel.long')}</Text> : null}
        <Text style={styles.planned}>{t('conduct.counsel.note')}</Text>
      </View>
    ) : (
      <View style={styles.nowCard}>
        <Text style={styles.overline}>{isStudent ? t('conduct.nowStudent') : t('conduct.now')}</Text>
        <SegmentHeadline
          segment={current}
          row={current.assignmentId ? byId.get(current.assignmentId) : undefined}
          nameById={nameById}
          big
        />
        <Text style={[big, tone === 'soon' && styles.toneSoon, tone === 'over' && styles.toneOver]}>
          {formatCountdown(left)}
        </Text>
        {started && tone === 'soon' ? (
          <Text style={[styles.stateLine, styles.toneSoon]}>{t('conduct.lastSeconds')}</Text>
        ) : null}
        {started && tone === 'over' ? (
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
  const primary: { label: string; sub: string | null; onPress: () => void } = !started
    ? { label: t('conduct.start'), sub: null, onPress: start }
    : isStudent && !counselling
      ? { label: t('conduct.partDone'), sub: null, onPress: finishPart }
      : last
        ? { label: t('conduct.finish'), sub: null, onPress: advance }
        : { label: t('conduct.nextPart'), sub: next ? announce(next) : null, onPress: advance };

  const controls = (
    <View style={styles.controls}>
      <Pressable
        style={[styles.primaryBtn, locked && styles.primaryBtnLocked]}
        onPress={guarded(primary.onPress)}
        accessibilityRole="button"
      >
        <Text style={styles.primaryBtnText}>{primary.label}</Text>
        {primary.sub ? (
          <Text style={styles.primaryBtnSub} numberOfLines={2}>
            {primary.sub}
          </Text>
        ) : null}
      </Pressable>

      {started ? (
        <View style={styles.rowBtns}>
          {!counselling ? (
            <Pressable style={styles.ghostBtn} onPress={run.startedAt === null ? resume : pause}>
              <Ionicons name={run.startedAt === null ? 'play' : 'pause'} size={18} color="#0369a1" />
              <Text style={styles.ghostBtnText}>
                {run.startedAt === null ? t('conduct.resume') : t('conduct.pause')}
              </Text>
            </Pressable>
          ) : null}
          {run.prev ? (
            <Pressable style={styles.ghostBtn} onPress={undo}>
              <Ionicons name="arrow-undo" size={16} color="#0369a1" />
              <Text style={styles.ghostBtnText}>{t('conduct.undo')}</Text>
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
          <Text style={[styles.drift, driftStyle(driftSec)]}>{driftLabel(driftSec, t)}</Text>
        </View>
      ) : null}
    </View>
  );

  // During the counsel the next part is on the button; the card shows the one after.
  const upcoming = counselling ? afterNext : next;
  const upNext = upcoming ? (
    <View style={styles.nextCard}>
      <Text style={styles.overline}>{counselling ? t('conduct.then') : t('conduct.next')}</Text>
      <SegmentHeadline
        segment={upcoming}
        row={upcoming.assignmentId ? byId.get(upcoming.assignmentId) : undefined}
        nameById={nameById}
      />
    </View>
  ) : null;

  const sheet = (
    <View style={styles.sheet}>
      <Text style={styles.overline}>{t('conduct.runSheet')}</Text>
      {segments.map((s, i) => {
        const row = s.assignmentId ? byId.get(s.assignmentId) : undefined;
        const d = partDisplay(s.key, row?.partTitle ?? null);
        const person = row?.publisherId ? nameById.get(row.publisherId) : null;
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
              <Text style={styles.sheetLabel} numberOfLines={1}>
                {d.label}
                {i === run.index && counselling ? (
                  <Text style={styles.sheetCounselNow}>{` · ${t('conduct.counsel.short')}`}</Text>
                ) : null}
              </Text>
              {person ? <Text style={styles.sheetPerson}>{person}</Text> : null}
            </View>
            {i === run.index && !finished ? (
              <Ionicons name="caret-forward" size={16} color="#0ea5e9" />
            ) : null}
          </View>
        );
      })}
      <Text style={styles.sheetNote}>{t('conduct.counselNote')}</Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {practiceNote}
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
          {nowCard}
          {controls}
          {upNext}
        </View>
        <View style={wide ? styles.colSide : undefined}>{sheet}</View>
      </View>
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
function SegmentHeadline({
  segment,
  row,
  nameById,
  big,
}: {
  segment: RunSegment;
  row: Assignment | undefined;
  nameById: Map<string, string>;
  big?: boolean;
}) {
  const d = partDisplay(segment.key, row?.partTitle ?? null);
  const person = row?.publisherId ? nameById.get(row.publisherId) : null;
  const assistant = row?.assistantPublisherId
    ? nameById.get(row.assistantPublisherId)
    : null;
  return (
    <View>
      {person ? (
        <Text style={big ? styles.personBig : styles.personSmall}>
          {assistant ? `${person} · ${assistant}` : person}
        </Text>
      ) : null}
      <Text style={big ? styles.partBig : styles.partSmall}>{d.label}</Text>
      {d.subtitle ? <Text style={styles.subtitle}>{d.subtitle}</Text> : null}
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
  twoCol: { flexDirection: 'row', gap: 20, maxWidth: 1000, alignSelf: 'center' },
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
  personSmall: { fontSize: 20, fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  partBig: { fontFamily: 'Manrope_400Regular', fontSize: 26, color: '#334155', marginTop: 4 },
  partSmall: { fontFamily: 'Manrope_400Regular', fontSize: 16, color: '#475569', marginTop: 2 },
  subtitle: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#64748b', marginTop: 4 },
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
  sheetPerson: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b' },
  sheetCounsel: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: '#94a3b8' },
  sheetCounselNow: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0369a1' },
  sheetNote: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#94a3b8', marginTop: 8 },
  rowBtns: { flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap' },
  resultWrap: { width: '100%', maxWidth: 640, alignSelf: 'center' },
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
  changedTitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#92400e' },
  changedLine: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#78350f' },
});
