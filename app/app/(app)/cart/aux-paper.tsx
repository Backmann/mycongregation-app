import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  auxApplicationsApi,
  auxiliaryPioneersApi,
  extractErrorMessage,
  COMMITTEE_SEATS,
  type CommitteeSeat,
} from '../../../lib/api';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { DateField } from '../../../components/DateField';
import { useAllPublishers } from '../../../lib/useAllPublishers';
import { formatDateISO } from '../../../lib/dates';
import { failsScreen } from '../../../lib/screen-failure';
import { addMonths, byYear, capitalize, monthName } from '../../../lib/aux-application';
import { INK, MUTED, BRAND } from '../../../components/reports/ReportBits';

/**
 * A SIGNED PAPER, ENTERED (29 October 2026). The S-205b still comes on
 * paper too: the secretary — or an admin — enters it as it was signed, with
 * the brothers who signed it and the day. It is approved as it stands; the
 * app asks nobody again. At least two signatures, each brother once.
 */
export default function AuxPaperScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const thisMonth = formatDateISO(new Date()).slice(0, 7);
  const offered = useMemo(
    () => Array.from({ length: 18 }, (_, i) => addMonths(thisMonth, i - 6)),
    [thisMonth],
  );
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [untilCancelled, setUntilCancelled] = useState(false);
  const [reduced, setReduced] = useState<string[]>([]);
  const [paperDate, setPaperDate] = useState(formatDateISO(new Date()));
  const [signers, setSigners] = useState<Record<CommitteeSeat, string | null>>({
    body_coordinator: null,
    secretary: null,
    service_overseer: null,
  });
  const [error, setError] = useState<string | null>(null);
  const { data: everyone } = useAllPublishers();
  const nameOf = (id: string) => everyone?.data.find((p) => p.id === id)?.displayName ?? '';

  const reducibleQ = useQuery({
    queryKey: ['aux-pioneers', 'reducible', offered[0], offered[offered.length - 1]],
    queryFn: () =>
      auxiliaryPioneersApi.reducible(`${offered[0]}-01`, `${offered[offered.length - 1]}-01`),
    throwOnError: failsScreen,
  });
  const allows15 = (m: string) => !!reducibleQ.data?.some((x) => x.month === m);
  const chosen = untilCancelled ? [...months].sort().slice(0, 1) : [...months].sort();
  const named = COMMITTEE_SEATS.filter((s) => signers[s]);
  const ready = !!publisherId && chosen.length > 0 && named.length >= 2 && !!paperDate;

  const save = useMutation({
    mutationFn: () =>
      auxApplicationsApi.paper({
        publisherId: publisherId!,
        months: chosen,
        untilCancelled,
        reducedMonths: reduced.filter((m) => chosen.includes(m) || untilCancelled),
        paperDate,
        signers: named.map((s) => ({ seat: s, name: nameOf(signers[s]!) })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['aux-pioneers'] });
      void qc.invalidateQueries({ queryKey: ['aux-applications'] });
      router.back();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content}>
        <PublisherSelector
          label={t('auxPioneer.publisher')}
          value={publisherId}
          onChange={setPublisherId}
          excludeAppointments={['student', 'unbaptized_publisher']}
          boxed
        />
        <Text style={styles.kicker}>{t('auxApp.form.months')}</Text>
        {byYear(offered).map((g) => (
          <View key={g.year}>
            <Text style={styles.year}>{g.year}</Text>
            <View style={styles.tiles}>
              {g.months.map((m) => {
                const on = chosen.includes(m);
                return (
                  <Pressable
                    key={m}
                    onPress={() =>
                      setMonths((cur) =>
                        untilCancelled ? [m] : cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m],
                      )
                    }
                    style={[styles.tile, on && styles.tileOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.tileMonth, on && { color: BRAND }]}>
                      {capitalize(monthName(m, lang, false))}
                    </Text>
                    <Text style={styles.tileSub}>{allows15(m) ? t('auxApp.form.may15') : ' '}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        {chosen.filter(allows15).map((m) => (
          <View key={m} style={styles.switchRow}>
            <Text style={styles.switchTitle}>{capitalize(monthName(m, lang))}</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[15, 30].map((h) => {
                const active = (h === 15) === reduced.includes(m);
                return (
                  <Pressable
                    key={h}
                    onPress={() =>
                      setReduced((r) => (h === 15 ? [...new Set([...r, m])] : r.filter((x) => x !== m)))
                    }
                    style={[styles.seg, active && styles.segOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.segText, active && { color: '#fff' }]}>
                      {t('auxApp.form.hours', { n: h })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
        <View style={styles.switchRow}>
          <Text style={styles.switchTitle}>{t('auxApp.form.untilCancelled')}</Text>
          <Switch value={untilCancelled} onValueChange={setUntilCancelled} />
        </View>
        <DateField label={t('auxApp.paper.date')} value={paperDate} onChange={setPaperDate} />
        <Text style={[styles.kicker, { marginTop: 14 }]}>{t('auxApp.paper.signed')}</Text>
        {COMMITTEE_SEATS.map((s) => (
          <PublisherSelector
            key={s}
            label={t(`auxApp.seat.${s}`)}
            value={signers[s]}
            onChange={(v) => setSigners((cur) => ({ ...cur, [s]: v }))}
            appointmentFilter="elder"
            excludeIds={COMMITTEE_SEATS.filter((x) => x !== s)
              .map((x) => signers[x])
              .filter((x): x is string => !!x)}
            boxed
          />
        ))}
        <Text style={styles.hint}>{t('auxApp.paper.hint')}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={[styles.btn, !ready && { opacity: 0.45 }]}
          disabled={!ready || save.isPending}
          onPress={() => save.mutate()}
          accessibilityRole="button"
        >
          {save.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>{t('auxApp.paper.save')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 14, paddingBottom: 24, gap: 8 },
  kicker: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginTop: 8,
    marginLeft: 2,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  year: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 13,
    color: MUTED,
    marginTop: 6,
    marginBottom: 6,
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
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  tileOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  tileMonth: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: INK },
  tileSub: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#b45309', marginTop: 2 },
  seg: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#f1f5f9' },
  segOn: { backgroundColor: BRAND },
  segText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: MUTED },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
  },
  switchTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  hint: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: MUTED },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5 },
});
