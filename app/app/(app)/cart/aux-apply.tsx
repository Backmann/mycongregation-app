import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  auxApplicationsApi,
  auxiliaryPioneersApi,
  extractErrorMessage,
} from '../../../lib/api';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { formatDateISO } from '../../../lib/dates';
import { failsScreen } from '../../../lib/screen-failure';
import { addMonths, byYear, capitalize, monthName } from '../../../lib/aux-application';
import { INK, MUTED, BRAND } from '../../../components/reports/ReportBits';

/** Months offered at first; «Ещё» shows as many again. */
const FIRST = 6;

/**
 * THE APPLICATION — the S-205b form, online (29 October 2026).
 *
 * Months as tiles from the current one — the current month says how late it
 * is; a month that allows 15 hours asks 15 or 30 and says why; «until
 * cancelled» makes the chosen tile the first month and dims the rest. The
 * form's own words follow, in his or her grammar, and «Подтверждаю» stands
 * for the signature. Name and date are his account's and today's. With
 * `?id=` it changes an application nobody has answered yet.
 */
export default function AuxApplyScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { myPublisher } = useMyPublisher();
  const today = formatDateISO(new Date());
  const thisMonth = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));

  const [more, setMore] = useState(false);
  const offered = useMemo(
    () => Array.from({ length: more ? FIRST * 2 : FIRST }, (_, i) => addMonths(thisMonth, i)),
    [thisMonth, more],
  );
  const [months, setMonths] = useState<string[]>([]);
  const [untilCancelled, setUntilCancelled] = useState(false);
  const [reduced, setReduced] = useState<string[] | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mineQ = useQuery({
    queryKey: ['aux-applications', 'mine'],
    queryFn: () => auxApplicationsApi.mine(),
    throwOnError: failsScreen,
  });
  const editing = id ? mineQ.data?.applications.find((a) => a.id === id) : undefined;
  useEffect(() => {
    if (!editing) return;
    setMonths(editing.months);
    setUntilCancelled(editing.untilCancelled);
    setReduced(editing.reducedMonths);
  }, [editing]);

  const servingQ = useQuery({
    queryKey: ['aux-pioneers', 'mine', `${thisMonth}-01`],
    queryFn: () => auxiliaryPioneersApi.mine(`${thisMonth}-01`),
  });
  // A month already served, or about to be: not offered again.
  const taken = new Set<string>();
  const cur = servingQ.data?.current;
  if (cur && !cur.untilCancelled) {
    let m = cur.startMonth.slice(0, 7);
    const end = (cur.endMonth ?? cur.startMonth).slice(0, 7);
    while (m <= end) {
      taken.add(m);
      m = addMonths(m, 1);
    }
  }
  const up = servingQ.data?.upcoming;
  if (up && !up.untilCancelled) {
    let m = up.startMonth.slice(0, 7);
    const end = (up.endMonth ?? up.startMonth).slice(0, 7);
    while (m <= end) {
      taken.add(m);
      m = addMonths(m, 1);
    }
  }

  const reducibleQ = useQuery({
    queryKey: ['aux-pioneers', 'reducible', thisMonth, addMonths(thisMonth, 23)],
    queryFn: () => auxiliaryPioneersApi.reducible(`${thisMonth}-01`, `${addMonths(thisMonth, 23)}-01`),
    staleTime: 60 * 1000,
  });
  const reasonsOf = (m: string) =>
    reducibleQ.data?.find((x) => x.month === m)?.reasons ?? [];
  const chosen = untilCancelled ? months.slice(0, 1) : [...months].sort();
  // The months whose goal is asked: chosen ones that allow 15; for «until
  // cancelled», those of the next year.
  const asked = (untilCancelled && chosen[0]
    ? Array.from({ length: 12 }, (_, i) => addMonths(chosen[0], i))
    : chosen
  ).filter((m) => reasonsOf(m).length > 0);
  const takes15 = (m: string) => (reduced === null ? true : reduced.includes(m));
  const setGoal = (m: string, fifteen: boolean) => {
    const base = reduced === null ? asked : reduced;
    setReduced(fifteen ? [...new Set([...base, m])] : base.filter((x) => x !== m));
  };

  const toggle = (m: string) => {
    setError(null);
    if (untilCancelled) {
      setMonths([m]);
      return;
    }
    setMonths((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  };

  const send = useMutation({
    mutationFn: () => {
      const input = {
        months: chosen,
        untilCancelled,
        reducedMonths: asked.filter((m) => takes15(m)),
        confirmed,
      };
      return editing
        ? auxApplicationsApi.change(editing.id, input)
        : auxApplicationsApi.apply(input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['aux-applications'] });
      router.replace('/cart/my-aux' as never);
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  if (mineQ.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }

  const sister = myPublisher?.gender === 'sister';
  const ready = chosen.length > 0 && confirmed && !send.isPending;
  const late = chosen.includes(thisMonth);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{t('auxApp.form.months')}</Text>
        {byYear(offered).map((g, gi, groups) => (
          <View key={g.year}>
            {groups.length > 1 ? (
              <Text style={[styles.year, gi > 0 && { marginTop: 14 }]}>{g.year}</Text>
            ) : null}
            <View style={styles.tiles}>
              {g.months.map((m) => {
                const on = chosen.includes(m);
                const off = taken.has(m);
                const rs = reasonsOf(m);
                const dim = untilCancelled && chosen.length > 0 && !on;
                return (
                  <Pressable
                    key={m}
                    disabled={off}
                    onPress={() => toggle(m)}
                    style={[styles.tile, on && styles.tileOn, (off || dim) && styles.tileOff]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: off }}
                  >
                    <Text style={[styles.tileMonth, on && { color: BRAND }]}>
                      {capitalize(monthName(m, lang, false))}
                    </Text>
                    <Text style={[styles.tileSub, rs.length > 0 && !off && styles.tileSub15]}>
                      {off
                        ? t('auxApp.form.alreadyServing')
                        : m === thisMonth && dayOfMonth > 10
                          ? t('auxApp.form.late', { day: dayOfMonth })
                          : rs.length > 0
                            ? t('auxApp.form.may15')
                            : t('auxApp.form.hours', { n: 30 })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        {!more ? (
          <Pressable onPress={() => setMore(true)} style={styles.moreBtn} accessibilityRole="button">
            <Text style={styles.moreText}>{t('auxApp.form.more')}</Text>
          </Pressable>
        ) : null}

        <View style={styles.switchCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>{t('auxApp.form.untilCancelled')}</Text>
            <Text style={styles.switchSub}>{t('auxApp.form.untilCancelledHint')}</Text>
          </View>
          <Switch
            value={untilCancelled}
            onValueChange={(on) => {
              setUntilCancelled(on);
              if (on) setMonths((cur) => [...cur].sort().slice(0, 1));
            }}
          />
        </View>

        {asked.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('auxApp.form.goalTitle')}</Text>
            {asked.map((m) => (
              <View key={m} style={styles.goalRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalMonth}>{capitalize(monthName(m, lang))}</Text>
                  <Text style={styles.goalWhy}>
                    {reasonsOf(m)
                      .map((r) => t(`auxPioneer.reason.${r}`))
                      .join(', ')}
                  </Text>
                </View>
                <View style={styles.seg}>
                  {[15, 30].map((h) => {
                    const active = (h === 15) === takes15(m);
                    return (
                      <Pressable
                        key={h}
                        onPress={() => setGoal(m, h === 15)}
                        style={[styles.segItem, active && styles.segOn]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text style={[styles.segText, active && styles.segTextOn]}>
                          {t('auxApp.form.hours', { n: h })}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.paper}>
          <Text style={styles.paperText}>{t('auxApp.form.words1')}</Text>
          <Text style={[styles.paperText, { marginTop: 8 }]}>
            {t(sister ? 'auxApp.form.words2Sister' : 'auxApp.form.words2')}
          </Text>
        </View>
        <Pressable
          style={styles.check}
          onPress={() => setConfirmed((c) => !c)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
        >
          <View style={[styles.box, confirmed && styles.boxOn]}>
            {confirmed ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.checkText}>{t('auxApp.form.confirm')}</Text>
            <Text style={styles.checkSub}>
              {(myPublisher?.displayName ?? '') +
                ' · ' +
                new Date(`${today}T12:00:00`).toLocaleDateString(lang, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
            </Text>
          </View>
        </Pressable>
        {late ? <Text style={styles.warn}>{t('auxApp.form.lateHint')}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={[styles.btn, !ready && styles.btnOff]}
          disabled={!ready}
          onPress={() => send.mutate()}
          accessibilityRole="button"
        >
          {send.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {editing ? t('auxApp.form.save') : t('auxApp.form.send')}
            </Text>
          )}
        </Pressable>
        {!chosen.length ? (
          <Text style={styles.footHint}>{t('auxApp.form.pickMonths')}</Text>
        ) : !confirmed ? (
          <Text style={styles.footHint}>{t('auxApp.form.pickConfirm')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14, paddingBottom: 24 },
  kicker: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginLeft: 2,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  year: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 13,
    color: MUTED,
    marginTop: 8,
    marginLeft: 2,
  },
  tile: {
    // Three in a row filling it; a short last row keeps the same width.
    flexBasis: '30%',
    flexGrow: 1,
    maxWidth: '32.5%',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  tileOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  tileOff: { opacity: 0.45, backgroundColor: '#f8fafc' },
  tileMonth: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  tileSub: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: MUTED, marginTop: 2 },
  tileSub15: { color: '#b45309' },
  moreBtn: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  moreText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: BRAND },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
  },
  switchTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  switchSub: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: MUTED, marginTop: 2 },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
  },
  cardTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK, marginBottom: 4 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  goalMonth: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  goalWhy: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: '#b45309', marginTop: 1 },
  seg: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3 },
  segItem: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 8 },
  segOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  segText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: MUTED },
  segTextOn: { color: INK },
  paper: {
    backgroundColor: '#fafaf9',
    borderWidth: 1,
    borderColor: '#e7e5e4',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  paperText: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#44403c', lineHeight: 19 },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 12 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  boxOn: { backgroundColor: BRAND, borderColor: BRAND },
  checkText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  checkSub: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: MUTED, marginTop: 2 },
  warn: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#b45309', marginTop: 10 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 10 },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnOff: { opacity: 0.45 },
  btnText: { color: '#fff', fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5 },
  footHint: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#b45309', textAlign: 'center', marginTop: 8 },
});
