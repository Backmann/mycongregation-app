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
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import {
  Assignment,
  assignmentsApi,
  conductRunsApi,
  ConductRunSegment,
  meApi,
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
  reconcileKeys,
  readRunRecord,
  RunState,
  writeRunRecord,
} from '../../../lib/conduct-run-record';

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
 * The chairman taps «Следующая» when the student finishes; the counsel minute
 * then runs on its own, and the next part's clock starts by itself a minute
 * later — or at once, with «Начать сейчас», when there was no counsel. The
 * counsel is never a phase the chairman has to tap through (Lionel: «совет
 * не нужно фиксировать… это уже будет путать»); its seconds are only kept so
 * the meeting's drift stays true.
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

function storageKey(week: string) {
  return `conduct:midweek:${week}`;
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
        // кнопкой «Начать заново».
        const { state: kept, verdict } = readRunRecord(raw, segKeys, Date.now());
        if (verdict === 'legacy-dropped' || verdict === 'unreadable') {
          AsyncStorage.removeItem(key).catch(() => undefined);
        } else if (verdict === 'legacy-continued') {
          // Written back at once in the new shape: the next opening reads v2.
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
  }, [loaded, segKeys, persist]);

  const ticking = state.finishedAt === null && (state.startedAt !== null || state.pausedAt !== null);
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

  const finished = state.index >= segments.length && segments.length > 0;
  const current = finished ? null : (segments[state.index] ?? null);
  const next = finished ? null : (segments[state.index + 1] ?? null);

  // The counsel minute after a student part: the next part is on screen, its
  // clock not yet started.
  const inCounsel =
    state.counselFrom !== null && state.startedAt !== null && now < state.startedAt;
  const counselElapsed = inCounsel && state.counselFrom !== null ? (now - state.counselFrom) / 1000 : 0;
  const currentElapsed =
    state.carried +
    (state.startedAt !== null && now > state.startedAt ? (now - state.startedAt) / 1000 : 0);

  /**
   * ОТСТАВАНИЕ. Сделанные части сравниваются со своими минутами вместе с
   * минутой совета; пока совет идёт, в план входит только прошедшая его часть.
   * Пауза — время встречи, которого не было в программе, и потому идёт в
   * отставание, а не в чью-то часть. Перерасход ТЕКУЩЕЙ части входит в
   * отставание, её опережение — нет: пока часть идёт, сэкономленное может уйти
   * обратно, просроченное не вернётся.
   */
  const lastDone = state.index - 1;
  const plannedSoFar = segments.slice(0, state.index).reduce((sum, s, i) => {
    const counselPlan =
      i === lastDone && inCounsel ? Math.min(counselElapsed, s.counselMin * 60) : s.counselMin * 60;
    return sum + s.partMin * 60 + counselPlan;
  }, 0);
  const counselSoFar = state.counsel
    .slice(0, state.index)
    .reduce<number>((sum, c, i) => sum + (i === lastDone && inCounsel ? counselElapsed : (c ?? 0)), 0);
  const pausedSoFar = state.pausedSec + (state.pausedAt !== null ? (now - state.pausedAt) / 1000 : 0);
  const actualSoFar =
    state.spent.slice(0, state.index).reduce((sum, s) => sum + s, 0) + counselSoFar + pausedSoFar;
  const currentOverrun = current ? Math.max(0, currentElapsed - current.partMin * 60) : 0;
  const driftSec = Math.round(actualSoFar - plannedSoFar + currentOverrun);
  const started = state.meetingStartedAt !== null;

  const start = () => {
    const at = Date.now();
    apply({ ...EMPTY, startedAt: at, meetingStartedAt: at, keys: [...segKeys], prev: snapshot(state) });
  };
  const pause = () => {
    const at = Date.now();
    apply({ ...state, carried: currentElapsed, startedAt: null, pausedAt: at, prev: snapshot(state) });
  };
  const resume = () => {
    const at = Date.now();
    apply({
      ...state,
      startedAt: at,
      pausedAt: null,
      pausedSec: state.pausedSec + (state.pausedAt !== null ? (at - state.pausedAt) / 1000 : 0),
      prev: snapshot(state),
    });
  };

  const advance = () => {
    if (!current) return;
    const at = Date.now();
    const spent = [...state.spent];
    spent[state.index] = currentElapsed;
    const counsel = [...state.counsel];
    const nextIndex = state.index + 1;
    const last = nextIndex >= segments.length;
    // A pause still open is closed by the tap: the meeting goes on.
    const pausedSec =
      state.pausedSec + (state.pausedAt !== null ? (at - state.pausedAt) / 1000 : 0);
    const withCounsel = current.counselMin > 0 && !last;
    counsel[state.index] = withCounsel ? current.counselMin * 60 : null;
    apply({
      ...state,
      index: nextIndex,
      spent,
      counsel,
      carried: 0,
      pausedSec,
      pausedAt: null,
      counselFrom: withCounsel ? at : null,
      startedAt: last ? null : withCounsel ? at + current.counselMin * 60 * 1000 : at,
      finishedAt: last ? at : null,
      saved: false,
      prev: snapshot(state),
    });
  };

  /** No counsel, or a short one: the next part starts now. */
  const startNow = () => {
    if (state.counselFrom === null) return;
    const at = Date.now();
    const counsel = [...state.counsel];
    counsel[state.index - 1] = (at - state.counselFrom) / 1000;
    apply({ ...state, counsel, startedAt: at, counselFrom: null, prev: snapshot(state) });
  };

  /** One tap back: a «Следующая» pressed too early must not cost anybody time. */
  const undo = () => {
    if (!state.prev) return;
    apply({ ...state.prev, prev: null });
  };

  const reset = async () => {
    const ok = await confirm({
      title: t('conduct.againTitle'),
      body: t('conduct.againBody'),
      confirmLabel: t('conduct.again'),
      danger: true,
    });
    if (ok) apply(EMPTY);
  };

  // --- итог ----------------------------------------------------------
  const local: ConductSummaryData | null = useMemo(() => {
    if (!finished || state.finishedAt === null || state.meetingStartedAt === null) return null;
    // Parts timed by the version before 14 October hold the counsel minute
    // inside: they are compared with part + counsel, and carry no counsel.
    const legacy = new Set(state.legacyKeys);
    const segs: ConductRunSegment[] = segments.map((s, i) => {
      const row = s.assignmentId ? byId.get(s.assignmentId) : undefined;
      const old = legacy.has(s.key);
      return {
        key: s.key,
        assignmentId: s.assignmentId,
        publisherIds: [row?.publisherId, row?.assistantPublisherId].filter(
          (x): x is string => !!x,
        ),
        plannedSec: (s.partMin + (old ? s.counselMin : 0)) * 60,
        actualSec: Math.round(state.spent[i] ?? 0),
        counselSec:
          !old && s.counselMin > 0 && state.counsel[i] != null ? Math.round(state.counsel[i] ?? 0) : null,
      };
    });
    return {
      segments: segs,
      totalSec: Math.round((state.finishedAt - state.meetingStartedAt) / 1000),
      plannedSec: totalRunMinutes(segments) * 60,
    };
  }, [finished, state, segments, byId]);

  const save = useMutation({
    mutationFn: (data: ConductSummaryData) =>
      conductRunsApi.save({ weekStartDate: week, ...data }),
    onSuccess: () => {
      setState((s) => {
        const n = { ...s, saved: true };
        persist(n);
        return n;
      });
      void runQuery.refetch();
    },
  });
  // Sent once when the meeting ends — and again on the next opening if it
  // did not reach the server (no signal in the hall).
  const triedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!local || state.saved || !canRun || state.finishedAt === null) return;
    if (triedFor.current === state.finishedAt) return;
    triedFor.current = state.finishedAt;
    save.mutate(local);
  }, [local, state.saved, state.finishedAt, canRun, save]);

  const titleOf = (id: string | null) => (id ? (byId.get(id)?.partTitle ?? null) : null);

  /** A segment key as the run sheet names it — also for a part that is gone. */
  const keyLabel = (key: string) => {
    const seg = segments.find((s) => s.key === key);
    const row = seg?.assignmentId ? byId.get(seg.assignmentId) : undefined;
    return partDisplay(key, row?.partTitle ?? null).label;
  };
  const changedNote = state.changed ? (
    <View style={styles.changedNote}>
      <Text style={styles.changedTitle}>{t('conduct.changed.title')}</Text>
      {state.changed.added.length > 0 ? (
        <Text style={styles.changedLine}>
          {t('conduct.changed.added', { parts: state.changed.added.map(keyLabel).join(', ') })}
        </Text>
      ) : null}
      {state.changed.removed.length > 0 ? (
        <Text style={styles.changedLine}>
          {t('conduct.changed.removed', { parts: state.changed.removed.map(keyLabel).join(', ') })}
        </Text>
      ) : null}
      <Text style={styles.changedLine}>{t('conduct.changed.note')}</Text>
    </View>
  ) : null;
  const legacyNote =
    state.legacyKeys.length > 0 ? (
      <Text style={styles.keepNote}>{t('conduct.result.legacyNote', { n: state.legacyKeys.length })}</Text>
    ) : null;
  const nameOf = (id: string) => nameById.get(id) ?? null;
  const chairmanName = chairmanRow?.publisherId ? (nameById.get(chairmanRow.publisherId) ?? null) : null;

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
  const remote = runQuery.data ?? null;
  const showLocal = !!local && canRun;
  const reading = !showLocal && (!canRun || pastWeek);
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
          <Text style={styles.overline}>{t('conduct.finished')}</Text>
          {changedNote}
          <ConductSummary data={local} titleOf={titleOf} nameOf={nameOf} chairmanName={chairmanName} />
          {legacyNote}
          <Text style={[styles.keepNote, save.isError && styles.keepNoteError]}>
            {state.saved
              ? t('conduct.result.saved')
              : save.isError
                ? t('conduct.result.notSaved')
                : t('conduct.result.saving')}
          </Text>
          {save.isError && !state.saved ? (
            <Pressable style={styles.ghostBtn} onPress={() => save.mutate(local)}>
              <Text style={styles.ghostBtnText}>{t('conduct.result.retry')}</Text>
            </Pressable>
          ) : null}
          <View style={styles.rowBtns}>
            {state.prev ? (
              <Pressable style={styles.ghostBtn} onPress={undo}>
                <Ionicons name="arrow-undo" size={16} color="#0369a1" />
                <Text style={styles.ghostBtnText}>{t('conduct.undo')}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.ghostBtn} onPress={() => void reset()}>
              <Text style={styles.ghostBtnText}>{t('conduct.again')}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    );
  }

  const nowCard = current ? (
    <View style={styles.nowCard}>
      <Text style={styles.overline}>{inCounsel ? t('conduct.upNow') : t('conduct.now')}</Text>
      <SegmentHeadline
        segment={current}
        row={current.assignmentId ? byId.get(current.assignmentId) : undefined}
        nameById={nameById}
        big
      />
      {inCounsel && state.startedAt !== null ? (
        <>
          <Text style={[styles.countdown, styles.countdownWaiting]}>{mmss(current.partMin * 60)}</Text>
          <Text style={styles.counselLine}>
            {t('conduct.startsIn', { time: mmss((state.startedAt - now) / 1000) })}
          </Text>
        </>
      ) : (
        <>
          <Text
            style={[
              styles.countdown,
              current.partMin * 60 - currentElapsed < 0 && styles.countdownOver,
            ]}
          >
            {formatCountdown(current.partMin * 60 - currentElapsed)}
          </Text>
          <Text style={styles.planned}>
            {t('conduct.planned', { minutes: current.partMin })}
          </Text>
        </>
      )}
    </View>
  ) : null;

  const controls = (
    <View style={styles.controls}>
      {!started ? (
        <Pressable style={styles.primaryBtn} onPress={start}>
          <Text style={styles.primaryBtnText}>{t('conduct.start')}</Text>
        </Pressable>
      ) : inCounsel ? (
        <Pressable style={styles.primaryBtn} onPress={startNow}>
          <Text style={styles.primaryBtnText}>{t('conduct.startNow')}</Text>
        </Pressable>
      ) : (
        <>
          <Pressable style={styles.primaryBtn} onPress={advance}>
            <Text style={styles.primaryBtnText}>
              {state.index === segments.length - 1
                ? t('conduct.finish')
                : t('conduct.nextPart')}
            </Text>
          </Pressable>
          <Pressable
            style={styles.ghostBtn}
            onPress={state.startedAt === null ? resume : pause}
          >
            <Ionicons
              name={state.startedAt === null ? 'play' : 'pause'}
              size={18}
              color="#0369a1"
            />
            <Text style={styles.ghostBtnText}>
              {state.startedAt === null ? t('conduct.resume') : t('conduct.pause')}
            </Text>
          </Pressable>
        </>
      )}

      {started ? (
        <View style={styles.rowBtns}>
          {state.prev ? (
            <Pressable style={styles.ghostBtn} onPress={undo}>
              <Ionicons name="arrow-undo" size={16} color="#0369a1" />
              <Text style={styles.ghostBtnText}>{t('conduct.undo')}</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.ghostBtn} onPress={() => void reset()}>
            <Text style={styles.ghostBtnText}>{t('conduct.again')}</Text>
          </Pressable>
        </View>
      ) : null}

      {started ? (
        <Text style={[styles.drift, driftStyle(driftSec)]}>
          {driftLabel(driftSec, t)}
        </Text>
      ) : null}
    </View>
  );

  const upNext = next ? (
    <View style={styles.nextCard}>
      <Text style={styles.overline}>{t('conduct.next')}</Text>
      <SegmentHeadline
        segment={next}
        row={next.assignmentId ? byId.get(next.assignmentId) : undefined}
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
            style={[styles.sheetRow, i < state.index && styles.sheetRowDone]}
          >
            <Text style={styles.sheetMin}>
              {s.partMin}
              {s.counselMin > 0 ? <Text style={styles.sheetCounsel}>{` +${s.counselMin}`}</Text> : null}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetLabel} numberOfLines={1}>
                {d.label}
              </Text>
              {person ? <Text style={styles.sheetPerson}>{person}</Text> : null}
            </View>
            {i === state.index && !finished ? (
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
  countdown: {
    fontSize: 56,
    fontFamily: 'Manrope_700Bold',
    color: '#0369a1',
    marginTop: 16,
    fontVariant: ['tabular-nums'],
  },
  countdownOver: { color: '#b91c1c' },
  countdownWaiting: { color: '#94a3b8' },
  counselLine: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#0369a1' },
  planned: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b' },

  controls: { marginTop: 16, gap: 10 },
  primaryBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#ffffff', fontSize: 20, fontFamily: 'Manrope_700Bold' },
  ghostBtn: {
    flexDirection: 'row',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: '#0369a1', fontSize: 15, fontFamily: 'Manrope_600SemiBold' },

  drift: { textAlign: 'center', fontSize: 16, fontFamily: 'Manrope_600SemiBold', marginTop: 4 },
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
  sheetNote: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#94a3b8', marginTop: 8 },
  rowBtns: { flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap' },
  resultWrap: { width: '100%', maxWidth: 640, alignSelf: 'center' },
  keepNote: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b', marginTop: 10, textAlign: 'center' },
  keepNoteError: { color: '#b91c1c' },

  notice: { fontFamily: 'Manrope_400Regular', fontSize: 16, color: '#475569', textAlign: 'center' },

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
