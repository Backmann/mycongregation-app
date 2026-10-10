import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  FieldServicePrepareLead,
  FieldServiceSettings,
  FieldServiceUnpublishedPolicy,
  fieldServiceTemplateApi,
} from '../lib/api';
import { Sheet } from './Sheet';

/**
 * «Автоматически» (October 2026, stage 3c): how a month should be prepared
 * without being asked, and what to do with a draft nobody published.
 *
 * The switches are STORED now and READ by stage 5, when the server learns
 * to prepare and publish on its own; the window says so in one line, so
 * nobody turns it on and waits for a month that never comes.
 */
export function FieldServiceAutoSheet({
  visible,
  settings,
  onClose,
}: {
  visible: boolean;
  settings: FieldServiceSettings | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [autoPrepare, setAutoPrepare] = useState(false);
  const [lead, setLead] = useState<FieldServicePrepareLead>('1m');
  const [pick, setPick] = useState(true);
  const [policy, setPolicy] = useState<FieldServiceUnpublishedPolicy>('publish_7d');

  useEffect(() => {
    if (!visible || !settings) return;
    setAutoPrepare(settings.autoPrepare);
    setLead(settings.prepareLead);
    setPick(settings.autoPickConductors);
    setPolicy(settings.unpublishedPolicy);
  }, [visible, settings]);

  const saveM = useMutation({
    mutationFn: () =>
      fieldServiceTemplateApi.updateSettings({
        autoPrepare,
        prepareLead: lead,
        autoPickConductors: pick,
        unpublishedPolicy: policy,
      }),
    onSuccess: () => {
      // The settings only: the rules query sits under the same prefix, and
      // refreshing it would re-seed the template window over rules the
      // person has edited and not yet saved.
      qc.invalidateQueries({ queryKey: ['field-service-template', 'settings'] });
      onClose();
    },
  });

  // The walk-through for the next month, with real dates.
  // Prepared on the 1st, a month or two ahead — or two weeks before.
  const next = dayjs().add(1, 'month').startOf('month');
  const prepared =
    lead === '2w'
      ? next.subtract(14, 'day')
      : next.subtract(lead === '1m' ? 1 : 2, 'month');
  const remind = next.subtract(8, 'day');
  const published = next.subtract(7, 'day');
  const fmt = (d: dayjs.Dayjs) => d.locale(i18n.language).format('D MMM');
  const monthName = next.locale(i18n.language).format('MMMM');

  return (
    <Sheet
      visible={visible}
      variant="bottom"
      title={t('fieldService.template.auto.title')}
      onClose={onClose}
      closeLabel={t('common.close')}
      hideClose
      footer={
        <View style={styles.footerRow}>
          <Pressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
          </Pressable>
          <Pressable
            style={[styles.saveBtn, saveM.isPending && styles.saveBtnOff]}
            disabled={saveM.isPending}
            onPress={() => saveM.mutate()}
          >
            <Text style={styles.saveBtnText}>{t('fieldService.form.save')}</Text>
          </Pressable>
        </View>
      }
    >

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>{t('fieldService.template.auto.prepare')}</Text>
          <Text style={styles.toggleHint}>{t('fieldService.template.auto.prepareHint')}</Text>
        </View>
        <Switch value={autoPrepare} onValueChange={setAutoPrepare} trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }} />
      </View>

      <Text style={styles.label}>{t('fieldService.template.auto.when')}</Text>
      <View style={styles.segmentTrack}>
        {(['2w', '1m', '2m'] as FieldServicePrepareLead[]).map((k) => {
          const on = lead === k;
          return (
            <Pressable key={k} onPress={() => setLead(k)} style={[styles.segment, on && styles.segmentOn]} accessibilityState={{ selected: on }}>
              <Text style={[styles.segmentText, on && styles.segmentTextOn]}>
                {t(`fieldService.template.auto.lead.${k}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>{t('fieldService.template.auto.pick')}</Text>
          <Text style={styles.toggleHint}>{t('fieldService.template.auto.pickHint')}</Text>
        </View>
        <Switch value={pick} onValueChange={setPick} trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }} />
      </View>

      <Text style={styles.label}>{t('fieldService.template.auto.unpublished')}</Text>
      <View style={styles.listCard}>
        {(['publish_7d', 'remind'] as FieldServiceUnpublishedPolicy[]).map((k, i) => {
          const on = policy === k;
          return (
            <Pressable key={k} onPress={() => setPolicy(k)} style={[styles.option, on && styles.optionOn, i === 1 && styles.optionLast]} accessibilityState={{ selected: on }}>
              <Text style={styles.optionTitle}>{t(`fieldService.template.auto.policy.${k}`)}</Text>
              <Text style={styles.optionSub}>{t(`fieldService.template.auto.policyHint.${k}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>{t('fieldService.template.auto.walkTitle', { month: monthName })}</Text>
      <View style={styles.walk}>
        <WalkRow when={fmt(prepared)} text={t('fieldService.template.auto.walk1', { month: monthName })} />
        <WalkRow when={`${fmt(prepared)} – ${fmt(remind)}`} text={t('fieldService.template.auto.walk2')} />
        {policy === 'publish_7d' ? (
          <>
            <WalkRow when={fmt(remind)} text={t('fieldService.template.auto.walk3')} />
            <WalkRow when={fmt(published)} text={t('fieldService.template.auto.walk4')} />
          </>
        ) : (
          <WalkRow when={fmt(remind)} text={t('fieldService.template.auto.walk3remind')} />
        )}
        <WalkRow when={t('fieldService.template.auto.later')} text={t('fieldService.template.auto.walk5')} />
      </View>
    </Sheet>
  );
}

function WalkRow({ when, text }: { when: string; text: string }) {
  return (
    <View style={styles.walkRow}>
      <Text style={styles.walkWhen}>{when}</Text>
      <Text style={styles.walkText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#64748b', marginTop: 16, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  toggleLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  toggleHint: { fontSize: 12.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  segmentTrack: { flexDirection: 'row', backgroundColor: '#e9eef4', borderRadius: 12, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 4 },
  segmentOn: { backgroundColor: '#ffffff', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 13.5, color: '#334155', fontFamily: 'Manrope_500Medium' },
  segmentTextOn: { color: '#0f172a', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  listCard: { borderWidth: 1, borderColor: '#dbe3ea', borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff' },
  option: { paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#eef2f6' },
  optionOn: { backgroundColor: '#e0f2fe' },
  optionLast: { borderBottomWidth: 0 },
  optionTitle: { fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  optionSub: { fontSize: 12.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  walk: { gap: 10, marginBottom: 8 },
  walkRow: { flexDirection: 'row', gap: 10 },
  walkWhen: { width: 92, fontSize: 14, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  walkText: { flex: 1, fontSize: 14, color: '#334155', fontFamily: 'Manrope_500Medium' },
  footerRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#ffffff' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#334155', fontFamily: 'Manrope_600SemiBold' },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0369a1' },
  saveBtnOff: { opacity: 0.45 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff', fontFamily: 'Manrope_700Bold' },
});
