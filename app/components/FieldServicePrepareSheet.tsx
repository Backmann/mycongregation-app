import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FieldServicePlannedRow,
  fieldServiceTemplateApi,
  hallsApi,
} from '../lib/api';
import { resolveHallAddress } from '../lib/hallAddress';
import { notify } from '../lib/error-bus';
import { Sheet } from './Sheet';

/**
 * «Подготовить месяц» (October 2026, stage 3b).
 *
 * The result first: the month as the server will make it — every slot's
 * Saturday with the brother it would put there and why, and every day it
 * leaves alone with the reason (a convention, the circuit overseer's week,
 * a meeting already standing there, a day gone). What the old window
 * promised («Будет создано (4)») was counted in the app without looking at
 * the calendar or at what already existed, and the server then did
 * something else.
 *
 * One tap makes the month as a DRAFT: the planners see it, nobody else
 * does, and the conductors are told once, when the month is published.
 */
export function FieldServicePrepareSheet({
  visible,
  onClose,
  initialMonthKey,
  onEditTemplate,
}: {
  visible: boolean;
  onClose: () => void;
  /** "YYYY-MM" the window opens on. */
  initialMonthKey: string;
  /** Opens the template editor; the window closes first. */
  onEditTemplate: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [monthKey, setMonthKey] = useState(initialMonthKey);
  useEffect(() => {
    if (visible) setMonthKey(initialMonthKey);
  }, [visible, initialMonthKey]);
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));

  const hallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    staleTime: 5 * 60 * 1000,
    enabled: visible,
  });
  const halls = hallsQuery.data ?? [];
  const previewQuery = useQuery({
    queryKey: ['field-service-template', 'preview', monthKey],
    queryFn: () => fieldServiceTemplateApi.preview({ year, month }),
    enabled: visible,
    staleTime: 0,
  });
  const rows = previewQuery.data?.rows ?? [];
  const toCreate = rows.filter((r) => r.status === 'create');

  const prepareM = useMutation({
    mutationFn: () => fieldServiceTemplateApi.prepare({ year, month }),
    onSuccess: (out) => {
      qc.invalidateQueries({ queryKey: ['field-service'] });
      qc.invalidateQueries({ queryKey: ['field-service-template'] });
      notify(
        t('fieldService.prepare.doneTitle'),
        out.withoutConductor
          ? t('fieldService.prepare.doneSome', {
              count: out.created,
              left: out.withoutConductor,
            })
          : t('fieldService.prepare.doneAll', { count: out.created }),
        'success',
      );
      onClose();
    },
  });

  const monthTitle = (() => {
    const s = dayjs(`${monthKey}-01`)
      .toDate()
      .toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();
  const step = (n: number) =>
    setMonthKey(dayjs(`${monthKey}-01`).add(n, 'month').format('YYYY-MM'));
  const fmtDay = (iso: string) => {
    const s = dayjs(iso).locale(i18n.language).format('dd D');
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const fmtDayMonth = (iso: string) =>
    dayjs(iso).locale(i18n.language).format('D MMMM');

  const whose = (r: FieldServicePlannedRow) =>
    r.groupName
      ? t('fieldService.row.group', { group: r.groupName })
      : t('fieldService.generalBadge');
  const reason = (r: FieldServicePlannedRow) => {
    const c = r.conductor;
    if (!c) return null;
    switch (c.reason) {
      case 'group_overseer':
        return t('fieldService.why.groupOverseer');
      case 'group_assistant':
        return t('fieldService.why.groupAssistant');
      case 'never_led':
        return t('fieldService.why.neverLed');
      case 'last_led':
        return c.lastDate
          ? t('fieldService.why.lastLed', { date: fmtDayMonth(c.lastDate) })
          : t('fieldService.why.neverLed');
      case 'upcoming':
        return c.lastDate
          ? t('fieldService.why.upcoming', { date: fmtDayMonth(c.lastDate) })
          : null;
      default:
        return null;
    }
  };
  const skippedText = (r: FieldServicePlannedRow) => {
    switch (r.status) {
      case 'assembly':
        return t('fieldService.prepare.skipAssembly', { title: r.because ?? '' });
      case 'co_visit':
        return t('fieldService.prepare.skipCoVisit');
      case 'exists':
        return t('fieldService.prepare.skipExists');
      case 'past':
        return t('fieldService.prepare.skipPast');
      default:
        return '';
    }
  };
  const noConductorText = (r: FieldServicePlannedRow) => {
    switch (r.noConductor) {
      case 'nobody_free':
        return t('fieldService.prepare.nobodyFree');
      case 'no_overseer':
        return t('fieldService.prepare.noOverseer');
      case 'rule_none':
        return t('fieldService.prepare.ruleNone');
      default:
        return '';
    }
  };

  return (
    <Sheet
      visible={visible}
      variant="bottom"
      title={t('fieldService.prepare.title')}
      onClose={onClose}
      closeLabel={t('common.close')}
      hideClose
      footer={
        <View style={styles.footer}>
          <Text style={styles.footerNote}>{t('fieldService.prepare.draftNote')}</Text>
          <View style={styles.footerRow}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.primaryBtn,
                (toCreate.length === 0 || prepareM.isPending) && styles.primaryBtnOff,
              ]}
              disabled={toCreate.length === 0 || prepareM.isPending}
              onPress={() => prepareM.mutate()}
            >
              {prepareM.isPending ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {t('fieldService.prepare.create', { count: toCreate.length })}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      }
    >
      <View style={styles.monthRow}>
        <Pressable style={styles.stepBtn} onPress={() => step(-1)} hitSlop={6}
          accessibilityLabel={t('fieldService.prepare.prevMonth')}>
          <Ionicons name="chevron-back" size={20} color="#0f172a" />
        </Pressable>
        <Text style={styles.monthTitle}>{monthTitle}</Text>
        <Pressable style={styles.stepBtn} onPress={() => step(1)} hitSlop={6}
          accessibilityLabel={t('fieldService.prepare.nextMonth')}>
          <Ionicons name="chevron-forward" size={20} color="#0f172a" />
        </Pressable>
      </View>
      <Text style={styles.hint}>{t('fieldService.prepare.hint')}</Text>

      {previewQuery.isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color="#0369a1" />
        </View>
      ) : previewQuery.isError ? (
        <Text style={styles.empty}>{t('fieldService.prepare.failed')}</Text>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>{t('fieldService.prepare.emptyTemplate')}</Text>
      ) : (
        <View style={styles.card}>
          {rows.map((r, i) => {
            const last = i === rows.length - 1;
            const skipped = r.status !== 'create';
            return (
              <View
                key={`${r.date}-${r.startTime}-${r.serviceGroupId ?? 'g'}`}
                style={[styles.row, last && styles.rowLast, skipped && styles.rowSkipped]}
              >
                <View style={styles.rowWhen}>
                  <Text style={[styles.rowDay, skipped && styles.muted]}>{fmtDay(r.date)}</Text>
                  {!skipped ? <Text style={styles.rowTime}>{r.startTime}</Text> : null}
                </View>
                <View style={styles.rowBody}>
                  {skipped ? (
                    <>
                      <Text style={styles.rowSkippedText}>{skippedText(r)}</Text>
                      <Text style={styles.rowSub}>
                        {whose(r)} · {r.startTime}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.rowTitle}>
                        {whose(r)}
                        {r.address ? ` · ${resolveHallAddress(r.address, halls)}` : ''}
                      </Text>
                      {r.conductor ? (
                        <Text style={styles.rowSub}>
                          {r.conductor.name}
                          {reason(r) ? ` · ${reason(r)}` : ''}
                        </Text>
                      ) : (
                        <Text style={[styles.rowSub, r.noConductor !== 'rule_none' && styles.warn]}>
                          {noConductorText(r)}
                        </Text>
                      )}
                    </>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Pressable
        style={styles.linkBtn}
        onPress={() => {
          onClose();
          onEditTemplate();
        }}
      >
        <Text style={styles.linkText}>{t('fieldService.prepare.editTemplate')}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  stepBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: '#dde3e8',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  monthTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    color: '#0f172a',
  },
  hint: { fontSize: 13.5, color: '#64748b', marginTop: 12, marginBottom: 8, fontFamily: 'Manrope_500Medium' },
  loading: { paddingVertical: 24, alignItems: 'center' },
  empty: { fontSize: 14, color: '#64748b', paddingVertical: 16, fontFamily: 'Manrope_500Medium' },
  card: { borderWidth: 1, borderColor: '#dde3e8', borderRadius: 14, overflow: 'hidden', backgroundColor: '#ffffff' },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f4',
  },
  rowLast: { borderBottomWidth: 0 },
  rowSkipped: { backgroundColor: '#f4f6f8' },
  rowWhen: { width: 58 },
  rowDay: { fontSize: 15, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  rowTime: { fontSize: 13.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14.5, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  rowSub: { fontSize: 13.5, color: '#3c4a55', fontFamily: 'Manrope_500Medium' },
  rowSkippedText: { fontSize: 14.5, color: '#55636e', fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  muted: { color: '#64748b' },
  warn: { color: '#a14a00', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  linkBtn: { paddingVertical: 12 },
  linkText: { fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0369a1' },
  footer: { gap: 8 },
  footerNote: { fontSize: 13, color: '#64748b', textAlign: 'center', fontFamily: 'Manrope_500Medium' },
  footerRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#334155', fontFamily: 'Manrope_600SemiBold' },
  primaryBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0369a1' },
  primaryBtnOff: { opacity: 0.45 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff', fontFamily: 'Manrope_700Bold' },
});
