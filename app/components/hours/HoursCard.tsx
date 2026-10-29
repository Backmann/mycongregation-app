import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatDuration, useLogOverview } from '../../lib/useServiceLog';
import { capitalize, monthName } from '../../lib/aux-application';
import type { ServiceLogMonth } from '../../lib/api';
import { LogSheet } from './LogSheet';

const INTRO_KEY = 'mycongregation.hours-intro-seen';

/** Days left in the month after today, today included. */
export function daysLeft(today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - d + 1;
}

/**
 * «ОКТЯБРЬ · МОЙ УЧЁТ» on Home (29 October 2026, mockup screen 1): what is
 * written this month, against the goal where there is one, and the button
 * to write more. Only for those whose report asks for hours; nothing for
 * anybody else. A quiet line under it says it is his alone.
 */
export function HoursCard({
  onSaved,
}: {
  onSaved?: (id: string, isNew: boolean, minutes: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const { months } = useLogOverview();
  const [open, setOpen] = useState(false);
  // The first time the card appears, one line on what it is for (Lionel,
  // 29 October 2026): written after every outing, summed into the report.
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
  const closeIntro = () => {
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
  const kicker = `${capitalize(monthName(m.month, i18n.language, false))} · ${t(
    aux ? 'hoursLog.home.kickerAux' : 'hoursLog.home.kicker',
  )}`;
  const sub = [
    m.goal ? t('hoursLog.home.of', { n: m.goal }) : null,
    done
      ? t('hoursLog.home.goalReached')
      : isCurrent
        ? t('hoursLog.home.daysLeft', { count: daysLeft(m.today) })
        : t('hoursLog.home.reportDue'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      {intro ? (
        <View style={styles.intro}>
          <View style={styles.introHead}>
            <View style={styles.introBadge}>
              <Text style={styles.introBadgeText}>{t('hoursLog.intro.badge')}</Text>
            </View>
            <Text style={styles.introTitle}>{t('hoursLog.intro.title')}</Text>
          </View>
          <Text style={styles.introText}>{t('hoursLog.intro.text')}</Text>
          <Pressable onPress={closeIntro} accessibilityRole="button" hitSlop={6}>
            <Text style={styles.introOk}>{t('hoursLog.intro.ok')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={[styles.hero, aux && styles.heroAux]}>
      <Pressable
        onPress={() => router.push(`/cart/my-hours?month=${m.month}` as never)}
        accessibilityRole="button"
        testID="hours-card"
      >
        <View style={styles.kickRow}>
          <Text style={styles.kicker}>{kicker}</Text>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.7)" />
        </View>
        <View style={styles.bigRow}>
          <Text style={styles.big}>{h}</Text>
          <Text style={styles.unit}>{t('hoursLog.unitH')}</Text>
          <Text style={[styles.big, { marginLeft: 8 }]}>{min}</Text>
          <Text style={styles.unit}>{t('hoursLog.unitM')}</Text>
        </View>
        <Text style={styles.sub}>{sub}</Text>
        {m.goal ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(share * 100)}%` }]} />
          </View>
        ) : null}
      </Pressable>
        <View style={styles.row}>
          {m.creditMinutes > 0 ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {t('hoursLog.home.credit', { dur: formatDuration(m.creditMinutes, t) })}
              </Text>
            </View>
          ) : (
            <View />
          )}
          {m.open ? (
            <Pressable
              onPress={() => setOpen(true)}
              style={styles.plus}
              accessibilityRole="button"
              hitSlop={6}
              testID="hours-add"
            >
              <Ionicons name="add" size={18} color="#0e7490" />
              <Text style={styles.plusText}>{t('hoursLog.home.add')}</Text>
            </Pressable>
          ) : m.report ? (
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                {t('hoursLog.home.reported', { n: m.report.hours ?? 0 })}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.lock}>
        <Ionicons name="lock-closed-outline" size={12} color="#94a3b8" />
        <Text style={styles.lockText}>{t('hoursLog.onlyYou')}</Text>
      </View>
      <LogSheet visible={open} onClose={() => setOpen(false)} today={m.today} onSaved={onSaved} />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    gap: 6,
  },
  introHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  introBadge: { backgroundColor: '#0e7490', borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  introBadgeText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, color: '#fff', letterSpacing: 0.4 },
  introTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#0f172a', flex: 1 },
  introText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: '#334155', lineHeight: 20 },
  introOk: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: '#0e7490', alignSelf: 'flex-end' },
  hero: {
    backgroundColor: '#0e7490',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#0e7490',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    backgroundImage: 'linear-gradient(160deg, #0e7490, #0b5a70)',
  } as object,
  heroAux: {
    backgroundColor: '#0f766e',
    backgroundImage: 'linear-gradient(160deg, #0f766e, #115e59)',
  } as object,
  kickRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.75)',
  },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  big: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 40,
    color: '#fff',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 17,
    color: 'rgba(255,255,255,0.72)',
    marginLeft: 4,
  },
  sub: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: 'rgba(255,255,255,0.88)', marginTop: 4 },
  track: {
    height: 8,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.22)',
    marginTop: 12,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#67e8f9', borderRadius: 5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  pill: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11 },
  pillText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12, color: '#fff' },
  plus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  plusText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#0e7490' },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7, marginLeft: 4 },
  lockText: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, color: '#94a3b8' },
});
