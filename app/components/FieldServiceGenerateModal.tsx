import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { fieldServiceTemplateApi, hallsApi } from '../lib/api';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ORDINALS = [1, 2, 3, 4, 5];
const DAYS = [1, 2, 3, 4, 5, 6, 7];

type EditSlot = {
  ordinal: number;
  dayOfWeek: number;
  startTime: string;
  address: string;
};

/**
 * ISO date ('YYYY-MM-DD') of the Nth occurrence of an ISO weekday
 * (1=Mon..7=Sun) in a month, or null when it doesn't exist (e.g. a 5th
 * Saturday). Mirrors the server generator so the preview matches exactly.
 */
function nthWeekdayISO(
  year: number,
  month: number, // 1-12
  isoDow: number, // 1=Mon..7=Sun
  ordinal: number,
): string | null {
  const jsTarget = isoDow === 7 ? 0 : isoDow;
  const first = new Date(year, month - 1, 1);
  const day = 1 + ((jsTarget - first.getDay() + 7) % 7) + (ordinal - 1) * 7;
  const date = new Date(year, month - 1, day);
  if (date.getMonth() !== month - 1) return null;
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** Lionel's real default rota — shown when the saved template is empty. */
const DEFAULT_TEMPLATE: EditSlot[] = [
  { ordinal: 1, dayOfWeek: 6, startTime: '10:30', address: 'Зал Царства Hamm' },
  { ordinal: 2, dayOfWeek: 6, startTime: '10:30', address: 'Зал Царства Hamm' },
  { ordinal: 3, dayOfWeek: 6, startTime: '10:30', address: 'Зал Царства Ahlen' },
  { ordinal: 4, dayOfWeek: 6, startTime: '10:30', address: 'Зал Царства Ahlen' },
  { ordinal: 5, dayOfWeek: 6, startTime: '10:30', address: 'Зал Царства Ahlen' },
];

export function FieldServiceGenerateModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();

  const [year, setYear] = useState(0);
  const [month, setMonth] = useState(0);
  const [months, setMonths] = useState(1);
  const [slots, setSlots] = useState<EditSlot[]>([]);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
  } | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const hallsQuery = useQuery({
    queryKey: ['halls'],
    queryFn: () => hallsApi.list(),
  });
  const halls = hallsQuery.data ?? [];
  const templateQuery = useQuery({
    queryKey: ['field-service-template'],
    queryFn: () => fieldServiceTemplateApi.getSlots(),
    enabled: visible,
  });

  // Reset start month + result on each open (default = next month).
  useEffect(() => {
    if (!visible) return;
    const n = dayjs().add(1, 'month');
    setYear(n.year());
    setMonth(n.month() + 1);
    setMonths(1);
    setResult(null);
    setSavedFlash(false);
  }, [visible]);

  // Seed the editable template from the server, falling back to the default.
  useEffect(() => {
    if (!visible) return;
    const loaded = templateQuery.data;
    if (!loaded) return;
    setSlots(
      (loaded.length ? loaded : DEFAULT_TEMPLATE).map((s) => ({
        ordinal: s.ordinal,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        address: s.address,
      })),
    );
  }, [visible, templateQuery.data]);

  const saveTemplate = useMutation({
    mutationFn: () =>
      fieldServiceTemplateApi.replaceSlots(
        slots.map((s) => ({
          ordinal: s.ordinal,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime,
          address: s.address.trim(),
        })),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-service-template'] });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    },
  });
  const generateM = useMutation({
    mutationFn: () =>
      fieldServiceTemplateApi.generate({
        startYear: year,
        startMonth: month,
        months,
      }),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['field-service'] });
    },
  });

  const slotsValid =
    slots.length > 0 &&
    slots.every((s) => s.address.trim() && TIME_RE.test(s.startTime));

  const stepMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setMonth(m);
    setYear(y);
  };
  const monthLabel =
    year && month
      ? dayjs(`${year}-${String(month).padStart(2, '0')}-01`)
          .toDate()
          .toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })
      : '';

  // Live preview: the exact dates that "Generate" will produce.
  const preview = useMemo(() => {
    if (!year || !month) return [];
    const out: {
      label: string;
      items: { dateISO: string; dayOfWeek: number; address: string }[];
    }[] = [];
    let y = year;
    let m = month;
    for (let i = 0; i < months; i += 1) {
      const items: { dateISO: string; dayOfWeek: number; address: string }[] =
        [];
      for (const s of slots) {
        const iso = nthWeekdayISO(y, m, s.dayOfWeek, s.ordinal);
        if (iso)
          items.push({
            dateISO: iso,
            dayOfWeek: s.dayOfWeek,
            address: s.address.trim(),
          });
      }
      items.sort((a, b) => a.dateISO.localeCompare(b.dateISO));
      out.push({
        label: dayjs(`${y}-${String(m).padStart(2, '0')}-01`)
          .toDate()
          .toLocaleDateString(i18n.language, {
            month: 'long',
            year: 'numeric',
          }),
        items,
      });
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
    return out;
  }, [year, month, months, slots, i18n.language]);
  const previewTotal = preview.reduce((n, mo) => n + mo.items.length, 0);

  const updateSlot = (i: number, patch: Partial<EditSlot>) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const removeSlot = (i: number) =>
    setSlots((prev) => prev.filter((_, idx) => idx !== i));
  const addSlot = () =>
    setSlots((prev) => [
      ...prev,
      {
        ordinal: 1,
        dayOfWeek: 6,
        startTime: '10:30',
        address: (halls.find((h) => h.isDefault) ?? halls[0])?.address ?? '',
      },
    ]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>{t('fieldService.generate.title')}</Text>

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Start month */}
            <Text style={styles.label}>
              {t('fieldService.generate.startMonth')}
            </Text>
            <View style={styles.monthRow}>
              <Pressable
                style={styles.stepBtn}
                onPress={() => stepMonth(-1)}
                hitSlop={6}
              >
                <Ionicons name="chevron-back" size={20} color="#0369a1" />
              </Pressable>
              <Text style={styles.monthLabel}>{monthLabel}</Text>
              <Pressable
                style={styles.stepBtn}
                onPress={() => stepMonth(1)}
                hitSlop={6}
              >
                <Ionicons name="chevron-forward" size={20} color="#0369a1" />
              </Pressable>
            </View>

            {/* Months count */}
            <Text style={styles.label}>
              {t('fieldService.generate.monthsCount')}
            </Text>
            <View style={styles.segment}>
              {[1, 2, 3].map((n) => (
                <Pressable
                  key={n}
                  style={[
                    styles.segmentItem,
                    months === n && styles.segmentItemOn,
                  ]}
                  onPress={() => setMonths(n)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      months === n && styles.segmentTextOn,
                    ]}
                  >
                    {n}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Template */}
            <Text style={[styles.label, { marginTop: 16 }]}>
              {t('fieldService.generate.template')}
            </Text>
            <Text style={styles.hint}>{t('fieldService.generate.hint')}</Text>

            {slots.map((s, i) => (
              <View key={i} style={styles.slotCard}>
                <View style={styles.slotHeader}>
                  <Text style={styles.slotTitle}>
                    {t('fieldService.generate.slot', { n: i + 1 })}
                  </Text>
                  <Pressable onPress={() => removeSlot(i)} hitSlop={8}>
                    <Ionicons name="close" size={18} color="#94a3b8" />
                  </Pressable>
                </View>

                <Text style={styles.miniLabel}>
                  {t('fieldService.generate.ordinal')}
                </Text>
                <View style={styles.chipRow}>
                  {ORDINALS.map((o) => (
                    <Pressable
                      key={o}
                      style={[styles.chip, s.ordinal === o && styles.chipOn]}
                      onPress={() => updateSlot(i, { ordinal: o })}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          s.ordinal === o && styles.chipTextOn,
                        ]}
                      >
                        {o}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.miniLabel}>
                  {t('fieldService.generate.day')}
                </Text>
                <View style={styles.chipRow}>
                  {DAYS.map((d) => (
                    <Pressable
                      key={d}
                      style={[styles.chip, s.dayOfWeek === d && styles.chipOn]}
                      onPress={() => updateSlot(i, { dayOfWeek: d })}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          s.dayOfWeek === d && styles.chipTextOn,
                        ]}
                      >
                        {t(`fieldService.days.${d}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.timeAddrRow}>
                  <View style={styles.timeBox}>
                    <Text style={styles.miniLabel}>
                      {t('fieldService.generate.time')}
                    </Text>
                    <TextInput
                      style={[
                        styles.timeInput,
                        !TIME_RE.test(s.startTime) && styles.inputError,
                      ]}
                      value={s.startTime}
                      onChangeText={(v) => updateSlot(i, { startTime: v })}
                      placeholder="10:30"
                      placeholderTextColor="#94a3b8"
                      maxLength={5}
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={styles.addrBox}>
                    <Text style={styles.miniLabel}>
                      {t('fieldService.generate.address')}
                    </Text>
                    <TextInput
                      style={styles.addrInput}
                      value={s.address}
                      onChangeText={(v) => updateSlot(i, { address: v })}
                      placeholder={t('fieldService.generate.address')}
                      placeholderTextColor="#94a3b8"
                    />
                  </View>
                </View>
                {halls.length > 0 && (
                  <View style={styles.hallChips}>
                    {halls.map((h) => {
                      const active = s.address.trim() === h.address;
                      return (
                        <Pressable
                          key={h.id}
                          style={[styles.hallChip, active && styles.hallChipOn]}
                          onPress={() => updateSlot(i, { address: h.address })}
                        >
                          <Text
                            style={[
                              styles.hallChipText,
                              active && styles.hallChipTextOn,
                            ]}
                          >
                            {h.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ))}

            <Pressable style={styles.addSlot} onPress={addSlot}>
              <Ionicons name="add" size={16} color="#0369a1" />
              <Text style={styles.addSlotText}>
                {t('fieldService.generate.addSlot')}
              </Text>
            </Pressable>

            <Pressable
              style={[styles.saveTemplate, savedFlash && styles.saveTemplateOk]}
              onPress={() => saveTemplate.mutate()}
              disabled={!slotsValid || saveTemplate.isPending}
            >
              <Ionicons
                name={savedFlash ? 'checkmark' : 'bookmark-outline'}
                size={16}
                color={savedFlash ? '#15803d' : '#475569'}
              />
              <Text
                style={[
                  styles.saveTemplateText,
                  savedFlash && { color: '#15803d' },
                ]}
              >
                {savedFlash
                  ? t('fieldService.generate.saved')
                  : t('fieldService.generate.saveTemplate')}
              </Text>
            </Pressable>

            <View style={styles.previewBox}>
              <Text style={styles.previewTitle}>
                {t('fieldService.generate.previewTitle')} ({previewTotal})
              </Text>
              {previewTotal === 0 ? (
                <Text style={styles.previewEmpty}>
                  {t('fieldService.generate.previewEmpty')}
                </Text>
              ) : (
                preview.map((mo) => (
                  <View key={mo.label} style={styles.previewMonth}>
                    <Text style={styles.previewMonthLabel}>{mo.label}</Text>
                    {mo.items.map((it) => (
                      <Text key={it.dateISO} style={styles.previewItem}>
                        {t(`fieldService.days.${it.dayOfWeek}`)}{' '}
                        {dayjs(it.dateISO).format('D.MM')} · {it.address}
                      </Text>
                    ))}
                  </View>
                ))
              )}
            </View>

            {result && (
              <View style={styles.resultBox}>
                <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                <Text style={styles.resultText}>
                  {t('fieldService.generate.result', {
                    created: result.created,
                    skipped: result.skipped,
                  })}
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose}>
              <Text style={styles.cancelText}>
                {result ? t('common.done') : t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.generate,
                (!slotsValid || generateM.isPending) && styles.disabled,
              ]}
              onPress={() => generateM.mutate()}
              disabled={!slotsValid || generateM.isPending}
            >
              <Text style={styles.generateText}>
                {t('fieldService.generate.button')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    padding: 18,
    paddingBottom: 10,
  },
  scroll: { paddingHorizontal: 18 },
  label: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 8 },
  hint: { fontSize: 12, color: '#94a3b8', marginBottom: 10 },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 16,
  },
  stepBtn: { padding: 8 },
  monthLabel: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentItemOn: { backgroundColor: '#0ea5e9' },
  segmentText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  segmentTextOn: { color: '#fff' },
  slotCard: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f8fafc',
  },
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  slotTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  miniLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 4,
    marginTop: 6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  chip: {
    minWidth: 30,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  chipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipTextOn: { color: '#fff' },
  timeAddrRow: { flexDirection: 'row', gap: 10 },
  timeBox: { width: 84 },
  addrBox: { flex: 1 },
  timeInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff',
    textAlign: 'center',
  },
  addrInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  inputError: { borderColor: '#f87171' },
  hallChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  hallChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  hallChipOn: { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' },
  hallChipText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  hallChipTextOn: { color: '#0369a1' },
  addSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderStyle: 'dashed',
    paddingVertical: 10,
    marginBottom: 12,
  },
  addSlotText: { fontSize: 13, fontWeight: '600', color: '#0369a1' },
  saveTemplate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    paddingVertical: 11,
    marginBottom: 14,
  },
  saveTemplateOk: { backgroundColor: '#dcfce7' },
  saveTemplateText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  previewBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    padding: 12,
    marginBottom: 14,
  },
  previewTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0369a1',
    marginBottom: 8,
  },
  previewEmpty: { fontSize: 13, color: '#94a3b8' },
  previewMonth: { marginBottom: 8 },
  previewMonthLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 3,
  },
  previewItem: { fontSize: 12, color: '#334155', lineHeight: 18 },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  resultText: { fontSize: 14, fontWeight: '600', color: '#15803d', flex: 1 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  cancel: { paddingHorizontal: 16, paddingVertical: 11 },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  generate: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  generateText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.5 },
});
