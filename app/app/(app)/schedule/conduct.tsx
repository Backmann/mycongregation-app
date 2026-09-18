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
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Assignment, assignmentsApi, meApi } from '../../../lib/api';
import { useAllPublishers } from '../../../lib/useAllPublishers';
import { useAuth } from '../../../lib/auth';
import { buildMidweekRunOrder, RunSegment } from '../../../lib/run-order';
import { partDisplay } from '../../../lib/part-display';

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
 * NOTHING IS WRITTEN TO THE SERVER. How a meeting actually ran is not a record
 * the congregation keeps, and a half-finished run left on the server would
 * show up on somebody else's screen as fact. The run lives on this device
 * only — but it DOES live there: an iPad that reloads the tab mid-meeting
 * (Safari does, coming back from the background) would otherwise lose the
 * count with no way to recover it.
 *
 * THE MINUTES COME FROM lib/run-order.ts and THE NAMES FROM lib/part-display.ts,
 * the same two places the schedule sheet reads. The chairman announces what he
 * sees here out loud; if it differed from the sheet by a word, one of the two
 * would be wrong in front of the whole congregation.
 *
 * WHO MAY OPEN IT: the chairman named in this week's programme, and an admin.
 * Not the elders in general — the screen is a tool for the man running the
 * meeting, and two people advancing the same parts would help nobody.
 */

interface RunState {
  /** Which segment is running; equals segments.length once the meeting ends. */
  index: number;
  /** Seconds already spent on each finished segment, by position. */
  spent: number[];
  /** When the current segment started running, epoch ms; null while paused. */
  startedAt: number | null;
  /** Seconds accumulated on the CURRENT segment before the latest pause. */
  carried: number;
}

const EMPTY: RunState = { index: 0, spent: [], startedAt: null, carried: 0 };

/** One second, the only cadence this screen needs. */
const TICK_MS = 1000;

function storageKey(week: string) {
  return `conduct:midweek:${week}`;
}

/** m:ss, or -m:ss once a part has run over. */
function formatCountdown(seconds: number): string {
  const over = seconds < 0;
  const s = Math.abs(Math.round(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${over ? '−' : ''}${mm}:${String(ss).padStart(2, '0')}`;
}

export default function ConductScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ week?: string }>();
  const week = typeof params.week === 'string' ? params.week : '';
  const { width } = useWindowDimensions();
  const wide = width >= 900;

  const assignmentsQuery = useQuery({
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
  const publishersQuery = useAllPublishers();

  const rows: Assignment[] = useMemo(
    () =>
      (assignmentsQuery.data?.data ?? []).filter(
        (a) => a.weekStartDate === week && !a.deletedAt,
      ),
    [assignmentsQuery.data, week],
  );

  const segments: RunSegment[] = useMemo(
    () =>
      buildMidweekRunOrder(
        rows.map((a) => ({
          id: a.id,
          partKey: a.partKey,
          partDurationMin: a.partDurationMin,
        })),
      ),
    [rows],
  );

  const byId = useMemo(() => {
    const m = new Map<string, Assignment>();
    for (const a of rows) m.set(a.id, a);
    return m;
  }, [rows]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of publishersQuery.data?.data ?? []) m.set(p.id, p.displayName);
    return m;
  }, [publishersQuery.data]);

  const chairmanRow = rows.find((a) => a.partKey === 'midweek_chairman');
  const myPublisherId = meQuery.data?.publisher?.id ?? null;
  const isAdmin = user?.role === 'admin';
  const isChairman =
    !!chairmanRow?.publisherId && chairmanRow.publisherId === myPublisherId;

  // --- ход встречи ---------------------------------------------------
  const [state, setState] = useState<RunState>(EMPTY);
  const [now, setNow] = useState(() => Date.now());
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!week || loadedFor.current === week) return;
    loadedFor.current = week;
    let alive = true;
    AsyncStorage.getItem(storageKey(week))
      .then((raw) => {
        if (!alive || !raw) return;
        const saved = JSON.parse(raw) as RunState;
        // Поднимаем ход КАК ЕСТЬ, вместе со временем начала части. Встреча
        // идёт по стенным часам и не останавливается оттого, что вкладка
        // перезагрузилась; обнулять отсчёт значило бы врать. Сбросить можно
        // кнопкой «Начать заново».
        setState(saved);
      })
      .catch(() => {
        // Хранилище может не ответить — на ходе встречи это не сказывается.
      });
    return () => {
      alive = false;
    };
  }, [week]);

  const persist = useCallback(
    (next: RunState) => {
      if (!week) return;
      AsyncStorage.setItem(storageKey(week), JSON.stringify(next)).catch(() => {
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

  useEffect(() => {
    if (state.startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [state.startedAt]);

  // Экран не должен гаснуть. В браузере это умеет сам браузер; в сборке из
  // APK для этого нужен expo-keep-awake, которого в дереве пока нет — там
  // планшет придётся будить, и это не повод откладывать остальное.
  useEffect(() => {
    if (Platform.OS !== 'web' || state.startedAt === null) return;
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
  }, [state.startedAt]);

  const finished = state.index >= segments.length && segments.length > 0;
  const current = finished ? null : (segments[state.index] ?? null);
  const next = finished ? null : (segments[state.index + 1] ?? null);

  const currentElapsed =
    state.carried + (state.startedAt ? (now - state.startedAt) / 1000 : 0);
  const plannedSoFar = segments
    .slice(0, state.index)
    .reduce((sum, s) => sum + s.minutes * 60, 0);
  const actualSoFar = state.spent.reduce((sum, s) => sum + s, 0);
  /**
   * Перерасход ТЕКУЩЕЙ части входит в отставание, её опережение — нет. Пока
   * часть идёт, сэкономленное может уйти обратно; просроченное не вернётся, и
   * председателю надо видеть, как оно набегает, а не узнавать об этом скачком
   * при переходе к следующей.
   */
  const currentOverrun = current
    ? Math.max(0, currentElapsed - current.minutes * 60)
    : 0;
  const driftSec = Math.round(actualSoFar - plannedSoFar + currentOverrun);

  const start = () => apply({ ...state, startedAt: Date.now() });
  const pause = () =>
    apply({ ...state, carried: currentElapsed, startedAt: null });

  const advance = () => {
    const spent = [...state.spent];
    spent[state.index] = currentElapsed;
    apply({
      index: state.index + 1,
      spent,
      startedAt: state.index + 1 < segments.length ? Date.now() : null,
      carried: 0,
    });
  };

  const reset = () => apply(EMPTY);

  // --- что показывать -------------------------------------------------
  if (!week) {
    return <Notice text={t('conduct.noWeek')} />;
  }
  if (assignmentsQuery.isLoading || meQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }
  if (segments.length === 0) {
    return <Notice text={t('conduct.noProgramme')} />;
  }
  if (!chairmanRow?.publisherId) {
    return (
      <Notice
        text={t('conduct.noChairman')}
        action={{ label: t('conduct.toSchedule'), onPress: () => router.back() }}
      />
    );
  }
  if (!isChairman && !isAdmin) {
    return <Notice text={t('conduct.notChairman')} />;
  }

  const nowCard = current ? (
    <View style={styles.nowCard}>
      <Text style={styles.overline}>{t('conduct.now')}</Text>
      <SegmentHeadline
        segment={current}
        row={current.assignmentId ? byId.get(current.assignmentId) : undefined}
        nameById={nameById}
        big
      />
      <Text
        style={[
          styles.countdown,
          current.minutes * 60 - currentElapsed < 0 && styles.countdownOver,
        ]}
      >
        {formatCountdown(current.minutes * 60 - currentElapsed)}
      </Text>
      <Text style={styles.planned}>
        {t('conduct.planned', { minutes: current.minutes })}
      </Text>
    </View>
  ) : (
    <View style={styles.nowCard}>
      <Text style={styles.overline}>{t('conduct.finished')}</Text>
      <Text style={styles.summary}>
        {t('conduct.summary', {
          minutes: Math.round(actualSoFar / 60),
          drift: driftLabel(driftSec, t),
        })}
      </Text>
    </View>
  );

  const controls = (
    <View style={styles.controls}>
      {!finished && state.startedAt === null && state.index === 0 && state.carried === 0 ? (
        <Pressable style={styles.primaryBtn} onPress={start}>
          <Text style={styles.primaryBtnText}>{t('conduct.start')}</Text>
        </Pressable>
      ) : null}

      {!finished && (state.startedAt !== null || state.carried > 0 || state.index > 0) ? (
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
            onPress={state.startedAt === null ? start : pause}
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
      ) : null}

      {finished || state.index > 0 || state.startedAt !== null ? (
        <Pressable style={styles.ghostBtn} onPress={reset}>
          <Text style={styles.ghostBtnText}>{t('conduct.again')}</Text>
        </Pressable>
      ) : null}

      {state.index > 0 || state.startedAt !== null || state.carried > 0 ? (
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
            <Text style={styles.sheetMin}>{s.minutes}</Text>
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
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={wide ? styles.twoCol : undefined}>
        <View style={wide ? styles.colMain : undefined}>
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
  container: { flex: 1, backgroundColor: '#f8fafc' },
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
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 8,
  },
  personBig: { fontSize: 30, fontWeight: '700', color: '#0f172a' },
  personSmall: { fontSize: 20, fontWeight: '600', color: '#0f172a' },
  partBig: { fontSize: 26, color: '#334155', marginTop: 4 },
  partSmall: { fontSize: 16, color: '#475569', marginTop: 2 },
  subtitle: { fontSize: 14, color: '#64748b', marginTop: 4 },
  countdown: {
    fontSize: 56,
    fontWeight: '700',
    color: '#0369a1',
    marginTop: 16,
    fontVariant: ['tabular-nums'],
  },
  countdownOver: { color: '#b91c1c' },
  planned: { fontSize: 13, color: '#64748b' },
  summary: { fontSize: 20, color: '#0f172a' },

  controls: { marginTop: 16, gap: 10 },
  primaryBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#ffffff', fontSize: 20, fontWeight: '700' },
  ghostBtn: {
    flexDirection: 'row',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { color: '#0369a1', fontSize: 15, fontWeight: '600' },

  drift: { textAlign: 'center', fontSize: 16, fontWeight: '600', marginTop: 4 },
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
    width: 28,
    textAlign: 'right',
    fontSize: 13,
    color: '#64748b',
    fontVariant: ['tabular-nums'],
  },
  sheetLabel: { fontSize: 15, color: '#0f172a' },
  sheetPerson: { fontSize: 13, color: '#64748b' },

  notice: { fontSize: 16, color: '#475569', textAlign: 'center' },
});
