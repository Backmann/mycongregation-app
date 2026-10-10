import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fieldServiceTemplateApi,
  hallsApi,
  serviceGroupsApi,
} from '../lib/api';
import { slotWhenPhrase } from '../lib/field-service-template-phrase';
import { resolveHallAddress } from '../lib/hallAddress';
import { notify } from '../lib/error-bus';
import { confirm } from './ConfirmHost';
import { Sheet } from './Sheet';
import { FieldServiceRuleSheet, RuleDraft } from './FieldServiceRuleSheet';
import { FieldServiceAutoSheet } from './FieldServiceAutoSheet';

/**
 * «Шаблон встреч» (October 2026, stage 3c): the rules of the recurring
 * meetings, each said as one phrase — «Каждую субботу, 10:30 · Общая ·
 * по очереди» — the two calendar switches, and the door to the automatic
 * preparation. Replaces the editor of numbered slots, which could not say
 * whose meeting a rule was or who conducts it.
 *
 * The rules are edited here and written in one go by «Сохранить»; the
 * calendar switches are written the moment they are flipped — they are
 * settings, not part of the template.
 */
export function FieldServiceTemplateSheet({
  visible,
  onClose,
  onPrepare,
}: {
  visible: boolean;
  onClose: () => void;
  /** «Подготовить месяц» from here: saves first, then hands over. */
  onPrepare: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const templateQuery = useQuery({
    queryKey: ['field-service-template'],
    queryFn: () => fieldServiceTemplateApi.getSlots(),
    enabled: visible,
  });
  const settingsQuery = useQuery({
    queryKey: ['field-service-template', 'settings'],
    queryFn: () => fieldServiceTemplateApi.getSettings(),
    enabled: visible,
  });
  const groupsQuery = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list({}),
    enabled: visible,
  });
  const groups = groupsQuery.data?.data ?? [];
  const hallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });
  const halls = hallsQuery.data ?? [];

  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [autoOpen, setAutoOpen] = useState(false);

  // Seed from the server each time the window opens.
  useEffect(() => {
    if (!visible || !templateQuery.data) return;
    setRules(
      templateQuery.data.map((s) => ({
        ordinals: s.ordinals?.length ? [...s.ordinals] : [s.ordinal],
        lastOnly: s.lastOnly === true,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        address: s.address ?? null,
        serviceGroupId: s.serviceGroupId ?? null,
        conductorRule: s.conductorRule ?? 'none',
      })),
    );
    setDirty(false);
  }, [visible, templateQuery.data]);

  const saveM = useMutation({
    mutationFn: () =>
      fieldServiceTemplateApi.replaceSlots(
        rules.map((r) => ({
          ...r,
          address: r.address ? resolveHallAddress(r.address, halls) : null,
        })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-service-template'] });
      setDirty(false);
    },
  });
  const settingsM = useMutation({
    mutationFn: (patch: { skipAssemblies?: boolean; coVisitFromSchedule?: boolean }) =>
      fieldServiceTemplateApi.updateSettings(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-service-template', 'settings'] });
      qc.invalidateQueries({ queryKey: ['field-service-template', 'preview'] });
    },
  });

  const groupName = (id: string | null | undefined) =>
    id ? (groups.find((g) => g.id === id)?.name ?? '') : '';
  const whoseText = (r: RuleDraft) =>
    r.serviceGroupId
      ? t('fieldService.row.group', { group: groupName(r.serviceGroupId) })
      : t('fieldService.generalBadge');
  const whereText = (r: RuleDraft) =>
    r.address
      ? resolveHallAddress(r.address, halls)
      : r.serviceGroupId
        ? t('fieldService.sheet.groupPlace')
        : '';
  const ruleText = (r: RuleDraft) =>
    t(`fieldService.template.conductorRule.${r.conductorRule ?? 'none'}`);

  const close = async () => {
    if (
      dirty &&
      !(await confirm({
        title: t('fieldService.template.discardTitle'),
        body: t('fieldService.template.discardBody'),
        confirmLabel: t('fieldService.template.discard'),
        danger: true,
      }))
    ) {
      return;
    }
    onClose();
  };
  const save = async (thenPrepare: boolean) => {
    try {
      if (dirty) {
        await saveM.mutateAsync();
        notify(t('fieldService.template.saved'), undefined, 'success');
      }
      if (thenPrepare) {
        onClose();
        onPrepare();
      }
    } catch {
      // Reported by the mutation cache; the window stays open.
    }
  };

  const settings = settingsQuery.data ?? null;

  return (
    <>
      <Sheet
        visible={visible}
        variant="bottom"
        title={t('fieldService.template.title')}
        onClose={() => void close()}
        closeLabel={t('common.close')}
        hideClose
        footer={
          <View style={styles.footerRow}>
            <Pressable
              style={[styles.cancelBtn, !dirty && styles.btnOff]}
              disabled={!dirty || saveM.isPending}
              onPress={() => void save(false)}
            >
              {saveM.isPending ? (
                <ActivityIndicator size="small" color="#0369a1" />
              ) : (
                <Text style={styles.cancelBtnText}>{t('fieldService.form.save')}</Text>
              )}
            </Pressable>
            <Pressable style={styles.saveBtn} disabled={saveM.isPending} onPress={() => void save(true)}>
              <Text style={styles.saveBtnText}>{t('fieldService.prepare.button')}</Text>
            </Pressable>
          </View>
        }
      >
        <Text style={styles.label}>{t('fieldService.template.rules')}</Text>
        {templateQuery.isLoading ? (
          <ActivityIndicator color="#0369a1" style={{ marginVertical: 12 }} />
        ) : (
          <>
            {rules.length === 0 ? (
              <Text style={styles.empty}>{t('fieldService.template.empty')}</Text>
            ) : null}
            {rules.map((r, i) => (
              <Pressable key={i} style={styles.ruleCard} onPress={() => setEditing({ index: i })}>
                <Text style={styles.ruleWhen}>{slotWhenPhrase(r, (k, o) => t(k, o))}</Text>
                <Text style={styles.ruleWhose}>
                  {whoseText(r)}
                  {whereText(r) ? ` · ${whereText(r)}` : ''}
                </Text>
                <Text style={styles.ruleWho}>
                  {t('fieldService.template.conductorLine', { rule: ruleText(r) })}
                </Text>
                {r.serviceGroupId ? (
                  <Text style={styles.ruleNote}>{t('fieldService.template.groupBusyNote')}</Text>
                ) : null}
              </Pressable>
            ))}
            <Pressable style={styles.addBtn} onPress={() => setEditing({ index: null })}>
              <Ionicons name="add" size={16} color="#0369a1" />
              <Text style={styles.addBtnText}>{t('fieldService.template.add')}</Text>
            </Pressable>
          </>
        )}

        <Text style={styles.label}>{t('fieldService.template.calendar')}</Text>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('fieldService.template.skipAssemblies')}</Text>
          <Switch
            value={settings?.skipAssemblies ?? true}
            disabled={!settings || settingsM.isPending}
            onValueChange={(v) => settingsM.mutate({ skipAssemblies: v })}
            trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
          />
        </View>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{t('fieldService.template.coVisitWeek')}</Text>
            <Text style={styles.toggleHint}>{t('fieldService.template.coVisitWeekHint')}</Text>
          </View>
          <Switch
            value={settings?.coVisitFromSchedule ?? true}
            disabled={!settings || settingsM.isPending}
            onValueChange={(v) => settingsM.mutate({ coVisitFromSchedule: v })}
            trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
          />
        </View>

        <Pressable style={styles.autoRow} onPress={() => setAutoOpen(true)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>{t('fieldService.template.auto.title')}</Text>
            <Text style={styles.toggleHint}>
              {settings?.autoPrepare
                ? t('fieldService.template.autoOn', {
                    lead: t(`fieldService.template.auto.lead.${settings.prepareLead}`),
                  })
                : t('fieldService.template.autoOff')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
        </Pressable>
      </Sheet>

      <FieldServiceRuleSheet
        visible={editing !== null}
        rule={editing && editing.index !== null ? rules[editing.index] : null}
        groups={groups}
        halls={halls}
        onClose={() => setEditing(null)}
        onDone={(rule) => {
          setRules((cur) =>
            editing && editing.index !== null
              ? cur.map((x, i) => (i === editing.index ? rule : x))
              : [...cur, rule],
          );
          setDirty(true);
          setEditing(null);
        }}
        onRemove={
          editing && editing.index !== null
            ? () => {
                const idx = editing.index!;
                setRules((cur) => cur.filter((_, i) => i !== idx));
                setDirty(true);
                setEditing(null);
              }
            : undefined
        }
      />
      <FieldServiceAutoSheet visible={autoOpen} settings={settings} onClose={() => setAutoOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#64748b', marginTop: 16, marginBottom: 8 },
  empty: { fontSize: 14, color: '#64748b', fontFamily: 'Manrope_500Medium', marginBottom: 8 },
  ruleCard: { borderWidth: 1, borderColor: '#dde3e8', borderRadius: 14, padding: 14, backgroundColor: '#ffffff', marginBottom: 10, gap: 4 },
  ruleWhen: { fontSize: 16, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  ruleWhose: { fontSize: 14.5, color: '#334155', fontFamily: 'Manrope_500Medium' },
  ruleWho: { fontSize: 13.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  ruleNote: { fontSize: 12.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingVertical: 12,
  },
  addBtnText: { fontSize: 14, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  toggleLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  toggleHint: { fontSize: 12.5, color: '#64748b', fontFamily: 'Manrope_500Medium' },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
    borderWidth: 1,
    borderColor: '#dde3e8',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#ffffff',
  },
  footerRow: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: '#0369a1', borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#ffffff' },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: '#0369a1', fontFamily: 'Manrope_600SemiBold' },
  btnOff: { opacity: 0.45 },
  saveBtn: { flex: 2, borderRadius: 12, paddingVertical: 13, alignItems: 'center', backgroundColor: '#0369a1' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff', fontFamily: 'Manrope_700Bold' },
});
