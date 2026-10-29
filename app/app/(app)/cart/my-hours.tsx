import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { formatDuration, useLogMonth, useLogQueue } from '../../../lib/useServiceLog';
import { addMonths, capitalize, monthName } from '../../../lib/aux-application';
import type { ServiceLogEntry } from '../../../lib/api';
import { LogSheet } from '../../../components/hours/LogSheet';
import { useLogUndo } from '../../../components/hours/useLogUndo';
import { daysLeft } from '../../../components/hours/HoursCard';
import { LoadFailure } from '../../../components/LoadFailure';
import { failsScreen } from '../../../lib/screen-failure';

const INK = '#0f172a';
const MUTED = '#64748b';
const BRAND = '#0e7490';
const HINT_KEY = 'mycongregation.hours-hint-seen';

/**
 * «МОЙ УЧЁТ ЧАСОВ» (29 October 2026, mockup screen 3). The month at the top
 * — the ministry against the goal, credited hours apart, what the report
 * would say — and below it the entries day by day. An entry is changed or
 * removed by tapping it, until the month's report is in; from then the
 * report speaks for the month and the entries are shown as they were.
 */
export default function MyHoursScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const params = useLocalSearchParams<{ month?: string }>();
  const [month, setMonth] = useState<string | undefined>(
    typeof params.month === 'string' && /^\d{4}-\d{2}$/.test(params.month) ? params.month : undefined,
  );
  const q = useLogMonth(month, { throwOnError: failsScreen });
  const { refusals } = useLogQueue();
  const { undoBar, saved, removed } = useLogUndo();
  const [sheet, setSheet] = useState<{ entry: ServiceLogEntry | null } | null>(null);
  const [hint, setHint] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(HINT_KEY)
      .then((v) => {
        if (!v) setHint(true);
      })
      .catch(() => undefined);
  }, []);
  const closeHint = () => {
    setHint(false);
    void AsyncStorage.setItem(HINT_KEY, '1').catch(() => undefined);
  };

  if (q.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error || !q.data) {
    return (
      <View style={styles.centre}>
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} />
      </View>
    );
  }
  const m = q.data;
  const current = m.today.slice(0, 7);
  const pending = new Set(m.pendingIds);
  const byDay = new Map<string, ServiceLogEntry[]>();
  for (const e of m.entries) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  const dayLabel = (d: string) => {
    const date = new Date(`${d}T12:00:00`);
    const dm = date.toLocaleDateString(lang, { day: 'numeric', month: 'long' });
    if (d === m.today) return `${t('hoursLog.sheet.today')}, ${dm}`;
    return `${date.toLocaleDateString(lang, { weekday: 'long' })}, ${dm}`;
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.monthBar}>
          <Pressable
            onPress={() => setMonth(addMonths(m.month, -1))}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('hoursLog.month.prev')}
          >
            <Ionicons name="chevron-back" size={22} color={MUTED} />
          </Pressable>
          <Text style={styles.monthTitle}>{capitalize(monthName(m.month, lang))}</Text>
          <Pressable
            onPress={() => setMonth(addMonths(m.month, 1))}
            disabled={m.month >= current}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('hoursLog.month.next')}
            style={{ opacity: m.month >= current ? 0.25 : 1 }}
          >
            <Ionicons name="chevron-forward" size={22} color={MUTED} />
          </Pressable>
        </View>

        {hint ? (
          <Pressable style={styles.hint} onPress={closeHint} accessibilityRole="button">
            <Ionicons name="lock-closed-outline" size={16} color={BRAND} />
            <Text style={styles.hintText}>{t('hoursLog.hint')}</Text>
            <Ionicons name="close" size={16} color="#94a3b8" />
          </Pressable>
        ) : null}

        {m.role === null ? (
          <View style={styles.card}>
            <Text style={styles.quiet}>{t('hoursLog.month.notYours')}</Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Line
              label={t('hoursLog.kind.field')}
              value={formatDuration(m.fieldMinutes, t)}
              extra={m.goal ? t('hoursLog.home.of', { n: m.goal }) : undefined}
              first
            />
            {m.creditMinutes > 0 ? (
              <Line label={t('hoursLog.kind.credit')} value={formatDuration(m.creditMinutes, t)} />
            ) : null}
            {m.report ? (
              <Line
                label={t('hoursLog.month.inReport')}
                value={t('hoursLog.month.hours', { n: m.report.hours ?? 0 })}
                accent
              />
            ) : (
              <Line
                label={t('hoursLog.month.toReport')}
                value={t('hoursLog.month.hours', { n: m.reportHours })}
                accent
              />
            )}
            {!m.report && m.fieldMinutes % 60 > 0 ? (
              <Text style={styles.small}>{t('hoursLog.month.rounding')}</Text>
            ) : null}
            {m.month === current && m.open ? (
              <Text style={styles.small}>{t('hoursLog.home.daysLeft', { count: daysLeft(m.today) })}</Text>
            ) : null}
          </View>
        )}

        {m.report?.byOther && m.report.hours !== m.reportHours && m.entries.length > 0 ? (
          <View style={styles.quietBox}>
            <Text style={styles.quietBoxText}>
              {t('hoursLog.month.byOther', {
                n: m.report.hours ?? 0,
                dur: formatDuration(m.fieldMinutes, t),
              })}
            </Text>
          </View>
        ) : null}

        {refusals.map((r, i) => (
          <View key={i} style={styles.refused}>
            <Ionicons name="alert-circle-outline" size={16} color="#b91c1c" />
            <Text style={styles.refusedText}>{t('hoursLog.refused', { why: r })}</Text>
          </View>
        ))}

        {[...byDay.entries()].map(([d, list]) => (
          <View key={d}>
            <Text style={styles.day}>{capitalize(dayLabel(d))}</Text>
            {list.map((e) => (
              <Pressable
                key={e.id}
                style={styles.entry}
                disabled={!m.open}
                onPress={() => setSheet({ entry: e })}
                accessibilityRole="button"
              >
                <View style={[styles.dot, e.kind === 'credit' && styles.dotCredit]} />
                <Text style={styles.entryDur}>{formatDuration(e.minutes, t)}</Text>
                <Text style={styles.entryNote} numberOfLines={1}>
                  {[e.kind === 'credit' ? t('hoursLog.kind.creditShort') : null, e.note]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {pending.has(e.id) ? (
                  <Ionicons name="cloud-upload-outline" size={16} color="#94a3b8" />
                ) : null}
              </Pressable>
            ))}
          </View>
        ))}
        {m.role !== null && m.entries.length === 0 ? (
          <Text style={styles.empty}>{t('hoursLog.month.empty')}</Text>
        ) : null}
        {pending.size > 0 ? (
          <Text style={styles.small}>{t('hoursLog.month.pending', { count: pending.size })}</Text>
        ) : null}
      </ScrollView>

      {m.open ? (
        <View style={styles.footer}>
          {m.month < current ? (
            // The month is over: its report is the thing now; a late entry
            // is still possible below it until the report goes in.
            <>
              <Pressable
                style={styles.btn}
                onPress={() => router.push(`/service-reports/new?reportMonth=${m.month}-01` as never)}
                accessibilityRole="button"
                testID="hours-submit"
              >
                <Ionicons name="paper-plane-outline" size={18} color="#fff" />
                <Text style={styles.btnText}>
                  {t('hoursLog.report.submitFor', { month: monthName(m.month, lang, false) })}
                </Text>
              </Pressable>
              <Pressable onPress={() => setSheet({ entry: null })} accessibilityRole="button" hitSlop={6}>
                <Text style={styles.lateLink}>{t('hoursLog.sheet.title')}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              style={styles.btn}
              onPress={() => setSheet({ entry: null })}
              accessibilityRole="button"
              testID="hours-write"
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.btnText}>{t('hoursLog.sheet.title')}</Text>
            </Pressable>
          )}
        </View>
      ) : null}

      <LogSheet
        visible={!!sheet}
        onClose={() => setSheet(null)}
        today={m.today}
        entry={sheet?.entry ?? null}
        onSaved={saved}
        onRemoved={removed}
      />
      {undoBar}
    </View>
  );
}

function Line({
  label,
  value,
  extra,
  accent,
  first,
}: {
  label: string;
  value: string;
  extra?: string;
  accent?: boolean;
  first?: boolean;
}) {
  return (
    <View style={[styles.line, !first && styles.lineBorder]}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, accent && { color: BRAND }]}>
        {value}
        {extra ? <Text style={styles.lineExtra}>{` ${extra}`}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 14, paddingBottom: 120 },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  monthTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16.5, color: INK },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  hintText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#155e75', lineHeight: 18 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 6,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 10 },
  lineBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  lineLabel: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  lineValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK, fontVariant: ['tabular-nums'] },
  lineExtra: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: MUTED },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 2, marginBottom: 8, marginLeft: 2 },
  quiet: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, paddingVertical: 10 },
  quietBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
  },
  quietBoxText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#475569', lineHeight: 19 },
  refused: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  refusedText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#991b1b' },
  day: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#94a3b8',
    marginTop: 16,
    marginBottom: 6,
    marginLeft: 4,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BRAND },
  dotCredit: { backgroundColor: '#f59e0b' },
  entryDur: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: INK, minWidth: 92 },
  entryNote: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED },
  empty: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  btn: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: BRAND,
    borderRadius: 14,
    paddingVertical: 14,
  },
  btnText: { color: '#fff', fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5 },
  lateLink: { textAlign: 'center', fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: BRAND, marginTop: 10 },
});
