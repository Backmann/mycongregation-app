import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../lib/auth';
import {
  assignmentsApi,
  authApi,
  meetingSettingsApi,
  publishersApi,
  specialEventsApi,
} from '../lib/api';
import { addDays, formatDateISO, parseISODate, startOfWeekMonday } from '../lib/dates';
import { effectiveVersionFor } from '../lib/meeting-schedule';
import { weekRules, type MeetingKind } from '../lib/week-rules';
import ConductScreen from './(app)/schedule/conduct';

/**
 * THE SCREEN ON THE STAGE (20 October 2026).
 *
 * The laptop at the lectern signs in with an account of its own, role
 * `stage` (made in User management, components/StageScreenSheets.tsx). It
 * lands here and nowhere else (app/index.tsx, app/(app)/_layout.tsx):
 *
 *  - on a meeting's day: the chairman's screen of that meeting, watching the
 *    timekeeper (app/(app)/schedule/conduct.tsx, which the account reaches
 *    as a watcher — the server lets it read the meeting and nothing else,
 *    server common/stage.ts);
 *  - between meetings: the clock and the next meeting.
 *
 * No tabs, no menus of the app. One small button opens this screen's own
 * menu, and only with the digits the brothers who set it up know — checked by
 * the server, a few tries a minute — so a child tapping the laptop gets
 * nowhere (Lionel: «чтобы ничего лишнего… не увидел»).
 */

const KINDS: MeetingKind[] = ['midweek', 'weekend'];
/** The menu closes itself when nobody touches it. */
const MENU_IDLE_MS = 20_000;

function statusOf(e: unknown): number | undefined {
  return (e as { response?: { status?: number } } | null)?.response?.status;
}

export default function StageScreen() {
  const { t, i18n } = useTranslation();
  const { user, isLoading, signOut } = useAuth();
  const params = useLocalSearchParams<{ week?: string; kind?: string }>();

  // The day, re-read every half minute: the screen stays open for weeks.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const today = formatDateISO(now);

  const isStage = user?.role === 'stage';
  const settingsQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
    enabled: isStage,
  });
  const eventsQuery = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
    staleTime: 60 * 60 * 1000,
    enabled: isStage,
  });

  /** The meetings of this week and the next three, by their real day. */
  const meetings = useMemo(() => {
    if (!settingsQuery.data) return [];
    const out: { week: string; kind: MeetingKind; date: string }[] = [];
    const monday = startOfWeekMonday(now);
    for (let w = 0; w < 4; w++) {
      const week = formatDateISO(addDays(monday, w * 7));
      const rules = weekRules({
        weekStartISO: week,
        version: effectiveVersionFor(settingsQuery.data.versions, week),
        events: eventsQuery.data ?? [],
      });
      for (const kind of KINDS) {
        const date = rules.dateOf(kind);
        if (date) out.push({ week, kind, date });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [settingsQuery.data, eventsQuery.data, now]);

  const todays = meetings.find((m) => m.date === today) ?? null;
  const next = meetings.find((m) => m.date > today) ?? null;

  // The meeting of the day is opened in place: its screen reads ?week&kind.
  useEffect(() => {
    if (!todays) return;
    if (params.week !== todays.week || params.kind !== todays.kind) {
      router.setParams({ week: todays.week, kind: todays.kind });
    }
  }, [todays, params.week, params.kind]);

  // ── the menu, behind the digits ───────────────────────────────────────
  const [menu, setMenu] = useState<'closed' | 'pin' | 'open'>('closed');
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkAt, setCheckAt] = useState<number | null>(null);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeMenu = useCallback(() => {
    setMenu('closed');
    setPin('');
    setPinError(null);
  }, []);
  const touch = useCallback(() => {
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(closeMenu, MENU_IDLE_MS);
  }, [closeMenu]);
  useEffect(() => {
    if (menu === 'closed') {
      if (idle.current) clearTimeout(idle.current);
      return;
    }
    touch();
    return () => {
      if (idle.current) clearTimeout(idle.current);
    };
  }, [menu, touch]);

  const unlock = async () => {
    if (busy) return;
    setBusy(true);
    setPinError(null);
    try {
      await authApi.stageUnlock(pin);
      setMenu('open');
    } catch (e) {
      setPinError(statusOf(e) === 429 ? t('stage.screen.tooMany') : t('stage.screen.wrongPin'));
    } finally {
      setPin('');
      setBusy(false);
      touch();
    }
  };

  if (isLoading) {
    return (
      <View style={[s.root, s.centre]}>
        <ActivityIndicator color="#94a3b8" />
      </View>
    );
  }
  if (!user) return <Redirect href="/(auth)/login" />;
  // A person never lands here: this is the stage screen's whole app.
  if (!isStage) return <Redirect href={'/(app)/home' as never} />;

  const label = user.displayLabel ?? t('stage.screen.title');
  const showMeeting = !!todays && params.week === todays.week && params.kind === todays.kind;

  return (
    <View style={s.root}>
      {showMeeting ? (
        <View style={{ flex: 1 }}>
          <ConductScreen stageCheckAt={checkAt} />
        </View>
      ) : (
        <Idle
          label={label}
          now={now}
          next={next}
          loading={settingsQuery.isLoading}
          language={i18n.language}
        />
      )}

      <Pressable
        onPress={() => setMenu('pin')}
        style={({ pressed }) => [s.menuBtn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={t('stage.screen.menu')}
      >
        <Ionicons name="ellipsis-horizontal" size={18} color="#475569" />
      </Pressable>

      {menu !== 'closed' ? (
        <View style={s.overlay} onTouchStart={touch}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>{t('stage.screen.menu')}</Text>
            {menu === 'pin' ? (
              <>
                <Text style={s.dialogText}>{t('stage.screen.pinHint')}</Text>
                <TextInput
                  style={s.pin}
                  value={pin}
                  onChangeText={(v) => {
                    setPin(v.replace(/\D/g, '').slice(0, 8));
                    touch();
                  }}
                  onSubmitEditing={() => void unlock()}
                  keyboardType="number-pad"
                  secureTextEntry
                  autoFocus
                  accessibilityLabel={t('stage.screen.pin')}
                  placeholder={t('stage.screen.pin')}
                  placeholderTextColor="#64748b"
                />
                {pinError ? <Text style={s.pinError}>{pinError}</Text> : null}
                <Pressable
                  onPress={() => void unlock()}
                  disabled={pin.length < 4 || busy}
                  style={[s.action, (pin.length < 4 || busy) && { opacity: 0.5 }]}
                  accessibilityRole="button"
                >
                  <Text style={s.actionText}>{t('stage.screen.open')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                {showMeeting ? (
                  <Pressable
                    onPress={() => {
                      setCheckAt(Date.now());
                      closeMenu();
                    }}
                    style={s.action}
                    accessibilityRole="button"
                  >
                    <Text style={s.actionText}>{t('stage.screen.check')}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => void signOut()}
                  style={[s.action, s.actionDanger]}
                  accessibilityRole="button"
                >
                  <Text style={[s.actionText, { color: '#fca5a5' }]}>{t('stage.screen.signOut')}</Text>
                </Pressable>
              </>
            )}
            <Pressable onPress={closeMenu} style={s.back} accessibilityRole="button">
              <Text style={s.backText}>{t('stage.screen.back')}</Text>
            </Pressable>
            <Text style={s.small}>{t('stage.screen.closesItself')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Between meetings: the clock, and what comes next. */
function Idle({
  label,
  now,
  next,
  loading,
  language,
}: {
  label: string;
  now: Date;
  next: { week: string; kind: MeetingKind; date: string } | null;
  loading: boolean;
  language: string;
}) {
  const { t } = useTranslation();
  // The minute, not the half minute the day is read at.
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 5_000);
    return () => clearInterval(id);
  }, []);

  const settings = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });
  const rows = useQuery({
    queryKey: ['stage-next', next?.week, next?.kind],
    queryFn: () => assignmentsApi.list({ weekStart: next!.week, eventType: next!.kind, limit: 200 }),
    enabled: !!next,
    staleTime: 10 * 60 * 1000,
  });
  const roster = useQuery({
    queryKey: ['publishers', 'roster'],
    queryFn: () => publishersApi.roster(),
    staleTime: 5 * 60 * 1000,
  });

  const version = next ? effectiveVersionFor(settings.data?.versions, next.week) : null;
  const time = next ? (next.kind === 'weekend' ? version?.weekendTime : version?.midweekTime) ?? null : null;
  const chairmanId = rows.data?.data.find(
    (a) => a.weekStartDate === next?.week && a.partKey === `${next?.kind}_chairman`,
  )?.publisherId;
  const chairman = chairmanId ? roster.data?.data.find((p) => p.id === chairmanId)?.displayName ?? null : null;

  return (
    <View style={[s.root, s.idle]}>
      <View style={s.header}>
        <View style={s.brandRow}>
          <View style={s.brand}>
            <Text style={s.brandText}>C</Text>
          </View>
          <Text style={s.headerLabel} numberOfLines={1}>
            {label}
          </Text>
        </View>
        <View style={s.pill}>
          <Ionicons name="eye-outline" size={17} color="#94a3b8" />
          <Text style={s.pillText}>{t('stage.screen.viewOnly')}</Text>
        </View>
      </View>

      <View style={s.centreCol}>
        <Text style={s.bigClock}>
          {clock.toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit', hour12: false })}
        </Text>
        <Text style={s.date}>
          {now.toLocaleDateString(language, { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        {loading ? null : next ? (
          <View style={s.nextCard}>
            <Text style={s.nextHead}>{t('stage.screen.next')}</Text>
            <Text style={s.nextTitle}>
              {t(next.kind === 'weekend' ? 'stage.screen.weekend' : 'stage.screen.midweek', {
                day: parseISODate(next.date).toLocaleDateString(language, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }),
              })}
            </Text>
            <Text style={s.nextSub}>
              {[time ? t('stage.screen.startsAt', { time }) : null, chairman ? t('stage.screen.chairman', { name: chairman }) : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ) : (
          <Text style={s.date}>{t('stage.screen.noNext')}</Text>
        )}
        <Text style={s.small}>{t('stage.screen.opensItself')}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  idle: { paddingHorizontal: 40, paddingTop: 28, paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24, minHeight: 44 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flexShrink: 1 },
  brand: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#0e7490', alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: '#ffffff' },
  headerLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 17, color: '#cbd5e1', flexShrink: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#121b2e',
    borderWidth: 1,
    borderColor: '#22304a',
  },
  pillText: { fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: '#cbd5e1' },
  centreCol: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  bigClock: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 180,
    lineHeight: 180,
    color: '#e2e8f0',
    fontVariant: ['tabular-nums'],
    letterSpacing: -5,
  },
  date: { fontFamily: 'Manrope_500Medium', fontSize: 26, color: '#94a3b8', textAlign: 'center' },
  nextCard: {
    marginTop: 30,
    backgroundColor: '#121b2e',
    borderWidth: 1,
    borderColor: '#22304a',
    borderRadius: 20,
    paddingHorizontal: 34,
    paddingVertical: 24,
    minWidth: 520,
    maxWidth: '100%',
  },
  nextHead: { fontFamily: 'Manrope_700Bold', fontSize: 14, letterSpacing: 1.6, color: '#94a3b8', textTransform: 'uppercase' },
  nextTitle: { fontFamily: 'Manrope_700Bold', fontSize: 30, color: '#f1f5f9', marginTop: 12 },
  nextSub: { fontFamily: 'Manrope_500Medium', fontSize: 21, color: '#94a3b8', marginTop: 8 },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 16, color: '#8592a8', textAlign: 'center' },
  // In the corner, inside the screen's own margin (40 wide on a laptop, 24
  // on a tablet): on top of nothing the chairman reads. At the bottom right
  // it covered the end time.
  menuBtn: {
    position: 'absolute',
    right: 2,
    top: 2,
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3,7,18,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  dialog: {
    width: 520,
    maxWidth: '100%',
    backgroundColor: '#121b2e',
    borderWidth: 1,
    borderColor: '#2c3b57',
    borderRadius: 22,
    paddingHorizontal: 32,
    paddingVertical: 30,
    gap: 14,
  },
  dialogTitle: { fontFamily: 'Manrope_700Bold', fontSize: 26, color: '#f8fafc' },
  dialogText: { fontFamily: 'Manrope_400Regular', fontSize: 17, lineHeight: 25, color: '#94a3b8' },
  pin: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c3b57',
    backgroundColor: '#0b1220',
    color: '#f1f5f9',
    paddingHorizontal: 16,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 22,
    letterSpacing: 6,
  },
  pinError: { fontFamily: 'Manrope_600SemiBold', fontSize: 16, color: '#fca5a5' },
  action: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2c3b57',
    backgroundColor: '#1a2740',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionDanger: { backgroundColor: 'transparent', borderColor: '#7f1d1d' },
  actionText: { fontFamily: 'Manrope_600SemiBold', fontSize: 17, color: '#e2e8f0' },
  back: { height: 46, alignItems: 'center', justifyContent: 'center' },
  backText: { fontFamily: 'Manrope_600SemiBold', fontSize: 17, color: '#94a3b8' },
});
