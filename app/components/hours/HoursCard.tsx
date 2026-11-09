import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatDuration, useLogOverview } from '../../lib/useServiceLog';
import { monthName } from '../../lib/aux-application';
import type { ServiceLogMonth } from '../../lib/api';
import { LogSheet } from './LogSheet';
import { paceHours } from '../../lib/hours-pace';

const INTRO_KEY = 'mycongregation.hours-intro-seen';

/** Days left in the month after today, today included. */
export function daysLeft(today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - d + 1;
}

/**
 * The hours of this month on Home — one row (9 November 2026, Home variant
 * Б): what is written, against the goal where there is one, how far the
 * plan expects by today, and the button to write more. It used to be a large
 * tile above «Ваше ближайшее», which pushed the person's next assignment off
 * the first screen of a phone. Only for those whose report asks for hours.
 *
 * The first time it appears it carries «Новое» (29 October 2026: written
 * after every outing, summed into the report); a tap on the row or on
 * «+ Время» settles it. The lock says it is his alone.
 */
export function HoursCard({
  onSaved,
}: {
  onSaved?: (id: string, isNew: boolean, minutes: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { months } = useLogOverview();
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState(false);
  const shown = !!months && months.length > 0;
  useEffect(() => {
    if (!shown) return;
    void AsyncStorage.getItem(INTRO_KEY)
      .then((v) => {
        if (!v) setIntro(true);
      })
      .catch(() => undefined);
  }, [shown]);
  const seen = () => {
    if (!intro) return;
    setIntro(false);
    void AsyncStorage.setItem(INTRO_KEY, '1').catch(() => undefined);
  };
  if (!months || months.length === 0) return null;
  // This month first; the previous one only while it is still his to finish.
  const m: ServiceLogMonth & { pendingIds: string[] } =
    months.find((x) => x.month === x.today.slice(0, 7)) ?? months[0];
  const isCurrent = m.month === m.today.slice(0, 7);
  const aux = m.role === 'aux' || m.role === 'aux_pending';
  const h = Math.floor(m.fieldMinutes / 60);
  const min = m.fieldMinutes % 60;
  const share = m.goal ? Math.min(1, m.fieldMinutes / (m.goal * 60)) : 0;
  const done = !!m.goal && m.fieldMinutes >= m.goal * 60;
  const month = monthName(m.month, i18n.language, false);
  const pace = m.goal && isCurrent && !done ? paceHours(m.goal, m.today) : null;
  const paceShare = pace !== null && m.goal ? Math.min(1, pace / m.goal) : null;
  const sub = done
    ? t('hoursLog.home.goalReached')
    : !isCurrent
      ? t('hoursLog.home.reportDue')
      : pace !== null
        ? t('hoursLog.home.pace', { n: pace })
        : t('hoursLog.home.toReport', { month });

  return (
    <View style={[styles.card, aux && styles.cardAux]}>
      <Pressable
        style={styles.main}
        onPress={() => {
          seen();
          router.push(`/cart/my-hours?month=${m.month}` as never);
        }}
        accessibilityRole="button"
        testID="hours-card"
      >
        <View style={styles.topRow}>
          <Text style={styles.big}>
            {min > 0
              ? t('hoursLog.home.hm', { h, m: min })
              : t('hoursLog.home.h', { h })}
          </Text>
          <Text style={styles.of}>
            {m.goal
              ? t('hoursLog.home.ofMonth', { n: m.goal, month })
              : t('hoursLog.home.forMonth', { month })}
          </Text>
          <Ionicons
            name="lock-closed-outline"
            size={12}
            color="#94a3b8"
            accessibilityLabel={t('hoursLog.onlyYou')}
          />
          {intro ? (
            <View style={styles.newTag}>
              <Text style={styles.newTagText}>{t('hoursLog.intro.badge')}</Text>
            </View>
          ) : null}
        </View>
        {m.goal ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
            {paceShare !== null && paceShare > 0 ? (
              <View style={[styles.paceMark, { left: `${Math.round(paceShare * 100)}%` }]} />
            ) : null}
          </View>
        ) : null}
        <Text style={styles.sub}>
          {aux ? `${t('hoursLog.home.kickerAux')} · ` : ''}
          {sub}
          {m.creditMinutes > 0
            ? ` · ${t('hoursLog.home.credit', { dur: formatDuration(m.creditMinutes, t) })}`
            : ''}
        </Text>
      </Pressable>
      {m.open ? (
        <Pressable
          onPress={() => {
            seen();
            setOpen(true);
          }}
          style={({ pressed }) => [styles.plus, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          hitSlop={6}
          testID="hours-add"
        >
          <Ionicons name="add" size={18} color="#0e5f75" />
          <Text style={styles.plusText}>{t('hoursLog.home.add')}</Text>
        </Pressable>
      ) : m.report ? (
        <Text style={styles.reported}>
          {t('hoursLog.home.reported', { n: m.report.hours ?? 0 })}
        </Text>
      ) : null}
      <LogSheet visible={open} onClose={() => setOpen(false)} today={m.today} onSaved={onSaved} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardAux: { borderColor: '#99f6e4' },
  main: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 2 },
  big: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 19,
    color: '#0f172a',
    fontVariant: ['tabular-nums'],
  },
  of: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#475569' },
  newTag: { backgroundColor: '#0e7490', borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8 },
  newTagText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, color: '#fff', letterSpacing: 0.3 },
  track: {
    height: 6,
    borderRadius: 99,
    backgroundColor: '#e2e8f0',
    marginTop: 8,
  },
  fill: { height: '100%', backgroundColor: '#0e7490', borderRadius: 99 },
  paceMark: { position: 'absolute', top: -3, bottom: -3, width: 2, marginLeft: -1, backgroundColor: '#b45309' },
  sub: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: '#475569', marginTop: 6 },
  plus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    backgroundColor: '#e6f4f7',
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  plusText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#0e5f75' },
  reported: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: '#166534' },
});
