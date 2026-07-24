import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  auxiliaryPioneersApi,
  extractErrorMessage,
  AuxPioneerMonthRow,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import {
  auxPeriodLabel,
  type PeriodLike,
} from '../../../lib/aux-pioneer-period';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { Dialog } from '../../../components/Dialog';

const QK_MONTH = (m: string) => ['aux-pioneers', 'month', m];
const QK_JOURNAL = ['aux-pioneers', 'journal'];

const STATE_DOT: Record<string, string> = {
  serving: '#1D9E75',
  upcoming: '#2563eb',
  finished: '#94a3b8',
};

export default function AuxiliaryPioneersScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { canManageAuxiliaryPioneers } = usePermissions();

  const [cursor, setCursor] = useState(() => dayjs().date(1));
  const monthDate = cursor.locale(i18n.language);
  const monthParam = cursor.format('YYYY-MM-01');

  const monthQuery = useQuery({
    queryKey: QK_MONTH(monthParam),
    queryFn: () => auxiliaryPioneersApi.listForMonth(monthParam),
  });
  const journalQuery = useQuery({
    queryKey: QK_JOURNAL,
    queryFn: () => auxiliaryPioneersApi.journal(),
  });

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [newPublisher, setNewPublisher] = useState<string | null>(null);
  const [untilCancelled, setUntilCancelled] = useState(false);
  const [startMonthSel, setStartMonthSel] = useState(monthParam);
  const [endMonthSel, setEndMonthSel] = useState(monthParam);
  const [addError, setAddError] = useState<string | null>(null);

  // Month options: 24 months back … 12 months forward from today.
  const monthOptions = useMemo(() => {
    const base = dayjs().date(1);
    const opts: { value: string; label: string }[] = [];
    for (let i = -24; i <= 12; i++) {
      const d = base.add(i, 'month');
      opts.push({
        value: d.format('YYYY-MM-01'),
        label: d.locale(i18n.language).format('MMMM YYYY'),
      });
    }
    return opts;
  }, [i18n.language]);

  const openAdd = () => {
    setAddError(null);
    setEditingId(null);
    setEditingName('');
    setNewPublisher(null);
    setUntilCancelled(false);
    setStartMonthSel(monthParam);
    setEndMonthSel(monthParam);
    setAddOpen(true);
  };

  const openEdit = (r: {
    id: string;
    publisherName: string;
    startMonth: string;
    endMonth: string | null;
    untilCancelled: boolean;
  }) => {
    setAddError(null);
    setEditingId(r.id);
    setEditingName(r.publisherName);
    setNewPublisher(null);
    setUntilCancelled(r.untilCancelled);
    setStartMonthSel(`${r.startMonth.slice(0, 7)}-01`);
    setEndMonthSel(`${(r.endMonth ?? r.startMonth).slice(0, 7)}-01`);
    setAddOpen(true);
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: QK_MONTH(monthParam) });
    qc.invalidateQueries({ queryKey: QK_JOURNAL });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      auxiliaryPioneersApi.create({
        publisherId: newPublisher!,
        startMonth: startMonthSel,
        untilCancelled,
        endMonth: untilCancelled ? undefined : endMonthSel,
      }),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setNewPublisher(null);
      setUntilCancelled(false);
      setAddError(null);
    },
    onError: (e) => setAddError(extractErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      auxiliaryPioneersApi.update(editingId!, {
        startMonth: startMonthSel,
        untilCancelled,
        endMonth: untilCancelled ? undefined : endMonthSel,
      }),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setEditingId(null);
      setAddError(null);
    },
    onError: (e) => setAddError(extractErrorMessage(e)),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => auxiliaryPioneersApi.stop(id),
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => auxiliaryPioneersApi.remove(id),
    onSuccess: invalidate,
  });

  const reduced = (monthQuery.data?.hourGoal ?? 30) === 15;
  const rows = monthQuery.data?.rows ?? [];

  // Формулировка живёт в lib/aux-pioneer-period.ts — теми же словами говорит
  // значок на главной. Здесь год не скрываем: журнал тянется через годы.
  const periodLabel = (r: PeriodLike) => auxPeriodLabel(t, i18n.language, r);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Month selector */}
        <View style={styles.monthBar}>
          <Pressable
            hitSlop={10}
            onPress={() => setCursor((c) => c.subtract(1, 'month'))}
          >
            <Ionicons name="chevron-back" size={22} color="#64748b" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.monthTitle}>
              {monthDate.format('MMMM YYYY')}
            </Text>
            <View style={styles.normRow}>
              <Ionicons
                name={reduced ? 'ribbon-outline' : 'time-outline'}
                size={13}
                color={reduced ? '#854F0B' : '#64748b'}
              />
              <Text
                style={[styles.normText, reduced && styles.normTextReduced]}
              >
                {reduced
                  ? t('auxPioneer.reducedNorm')
                  : t('auxPioneer.standardNorm')}
              </Text>
            </View>
          </View>
          <Pressable
            hitSlop={10}
            onPress={() => setCursor((c) => c.add(1, 'month'))}
          >
            <Ionicons name="chevron-forward" size={22} color="#64748b" />
          </Pressable>
        </View>

        {/* Serving this month */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>
            {t('auxPioneer.servingThisMonth', { count: rows.length })}
          </Text>
          {canManageAuxiliaryPioneers ? (
            <Pressable style={styles.addBtn} onPress={openAdd}>
              <Ionicons name="add" size={16} color="#0284c7" />
              <Text style={styles.addBtnText}>{t('auxPioneer.add')}</Text>
            </Pressable>
          ) : null}
        </View>

        {monthQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 20 }} color="#0ea5e9" />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>{t('auxPioneer.noneThisMonth')}</Text>
        ) : (
          rows.map((r) => (
            <ServingCard
              key={r.id}
              row={r}
              periodLabel={periodLabel(r)}
              canManage={canManageAuxiliaryPioneers}
              onEdit={() => openEdit(r)}
              onStop={() => stopMutation.mutate(r.id)}
              onRemove={() => removeMutation.mutate(r.id)}
              editLabel={t('common.edit')}
              stopLabel={t('auxPioneer.stop')}
              removeLabel={t('common.delete')}
            />
          ))
        )}

        {/* History journal — grouped into serving / upcoming / finished */}
        <View style={[styles.sectionHead, { marginTop: 22 }]}>
          <Ionicons name="time-outline" size={15} color="#64748b" />
          <Text style={styles.journalTitle}>{t('auxPioneer.journal')}</Text>
        </View>
        {(journalQuery.data ?? []).length === 0 ? (
          <View style={styles.journalCard}>
            <Text style={[styles.empty, { padding: 14 }]}>
              {t('auxPioneer.journalEmpty')}
            </Text>
          </View>
        ) : (
          (['serving', 'upcoming', 'finished'] as const).map((state) => {
            const items = (journalQuery.data ?? []).filter(
              (j) => j.state === state,
            );
            if (items.length === 0) return null;
            return (
              <View key={state} style={styles.journalSection}>
                <Text style={styles.journalSectionTitle}>
                  {t(`auxPioneer.section.${state}`)}
                </Text>
                <View style={styles.journalCard}>
                  {items.map((j, idx) => (
                    <View
                      key={j.id}
                      style={[
                        styles.journalRow,
                        idx > 0 && styles.journalBorder,
                      ]}
                    >
                      <View
                        style={[styles.dot, { backgroundColor: STATE_DOT[state] }]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.journalName}>
                          {j.publisherName}
                        </Text>
                        <Text style={styles.journalPeriod}>
                          {periodLabel(j)}
                        </Text>
                        {state === 'finished' &&
                        j.currentPioneerType !== 'none' ? (
                          <View style={styles.movedBadge}>
                            <Ionicons
                              name="arrow-forward"
                              size={11}
                              color="#0369a1"
                            />
                            <Text style={styles.movedBadgeText}>
                              {t(
                                `auxPioneer.movedTo.${j.currentPioneerType}`,
                              )}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Add modal */}
      <Dialog
        visible={addOpen}
        title={editingId ? t('auxPioneer.editTitle') : t('auxPioneer.addTitle2')}
        icon="person-add-outline"
        iconTint="#16a34a"
        iconBg="#dcfce7"
        cancelLabel={t('common.cancel')}
        confirmLabel={editingId ? t('common.save') : t('common.add')}
        confirmDisabled={!editingId && !newPublisher}
        pending={createMutation.isPending || updateMutation.isPending}
        onConfirm={() =>
          editingId ? updateMutation.mutate() : createMutation.mutate()
        }
        onCancel={() => setAddOpen(false)}
        scroll
      >
            {editingId ? (
              <View style={styles.editName}>
                <Ionicons name="person-circle-outline" size={20} color="#64748b" />
                <Text style={styles.editNameText}>{editingName}</Text>
              </View>
            ) : (
              <PublisherSelector
                label={t('auxPioneer.publisher')}
                value={newPublisher}
                onChange={setNewPublisher}
                /* Auxiliary pioneering is open to baptized publishers, so a
                   student or an unbaptized publisher is not offered at all
                   rather than chosen and then refused later. */
                excludeAppointments={['student', 'unbaptized_publisher']}
                boxed
              />
            )}

            <Text style={styles.fieldLabel}>{t('auxPioneer.startMonth')}</Text>
            <MonthPicker
              value={startMonthSel}
              options={monthOptions}
              onChange={(v) => {
                setStartMonthSel(v);
                if (endMonthSel < v) setEndMonthSel(v);
              }}
            />

            {!untilCancelled ? (
              <>
                <Text style={styles.fieldLabel}>
                  {t('auxPioneer.endMonth')}
                </Text>
                <MonthPicker
                  value={endMonthSel}
                  options={monthOptions.filter((o) => o.value >= startMonthSel)}
                  onChange={setEndMonthSel}
                />
              </>
            ) : null}

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>
                  {t('auxPioneer.untilCancelled')}
                </Text>
                <Text style={styles.switchHint}>
                  {t('auxPioneer.untilCancelledHint')}
                </Text>
              </View>
              <Switch
                value={untilCancelled}
                onValueChange={setUntilCancelled}
                trackColor={{ true: '#7dd3fc' }}
                thumbColor={untilCancelled ? '#0284c7' : '#f4f4f5'}
              />
            </View>
            {addError ? <Text style={styles.error}>{addError}</Text> : null}

            {/* Not a block — a distant past month is sometimes intended — but a
                clear flag, because the real mistake caught here was picking the
                right month in the wrong YEAR and not noticing. */}
            {(() => {
              const endForCheck = untilCancelled ? startMonthSel : endMonthSel;
              const now = dayjs();
              const thisMonth = now.format('YYYY-MM-01');
              // Whole period already past — the real trap was the wrong year.
              if (!untilCancelled && endForCheck < thisMonth) {
                return (
                  <View style={styles.pastWarn}>
                    <Ionicons name="time-outline" size={16} color="#b45309" />
                    <Text style={styles.pastWarnText}>
                      {t('auxPioneer.pastPeriodWarning')}
                    </Text>
                  </View>
                );
              }
              // Enrolling for the CURRENT month, but the month is already well
              // under way (past the 10th). The hour goal is a fixed 30 (or 15),
              // not prorated, so a mid-month enrolment quietly asks a lot for
              // the days that remain. Not blocked — sometimes the paperwork is
              // simply late — just surfaced so it is a deliberate choice.
              if (startMonthSel === thisMonth && now.date() > 10) {
                return (
                  <View style={styles.pastWarn}>
                    <Ionicons name="time-outline" size={16} color="#b45309" />
                    <Text style={styles.pastWarnText}>
                      {t('auxPioneer.lateMonthWarning', {
                        day: now.date(),
                      })}
                    </Text>
                  </View>
                );
              }
              return null;
            })()}
      </Dialog>
    </SafeAreaView>
  );
}

const PICKER_ROW_H = 45;

function MonthPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const selected = options.find((o) => o.value === value);
  const thisMonth = dayjs().format('YYYY-MM-01');

  // Open the list scrolled to the chosen month, centred, so it is instantly
  // clear WHICH one is picked. Without this the list opened at the top — two
  // years in the past — and it was easy to pick "August" in the wrong year.
  const selectedIndex = options.findIndex((o) => o.value === value);
  useEffect(() => {
    if (!open || selectedIndex < 0) return;
    const y = Math.max(0, selectedIndex * PICKER_ROW_H - 150);
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 0);
    return () => clearTimeout(id);
  }, [open, selectedIndex]);

  return (
    <>
      <Pressable style={styles.pickerBox} onPress={() => setOpen(true)}>
        <Text style={styles.pickerValue}>{selected?.label ?? '—'}</Text>
        <Ionicons name="chevron-down" size={16} color="#94a3b8" />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setOpen(false)}>
          <View style={styles.pickerSheet}>
            <ScrollView ref={scrollRef}>
              {options.map((o, i) => {
                const active = o.value === value;
                const isNow = o.value === thisMonth;
                // A year heading whenever the year changes, so August 2024 and
                // August 2026 can never be mistaken for each other.
                const year = o.value.slice(0, 4);
                const prevYear = i > 0 ? options[i - 1].value.slice(0, 4) : null;
                const showYear = year !== prevYear;
                return (
                  <View key={o.value}>
                    {showYear ? (
                      <View style={styles.pickerYear}>
                        <Text style={styles.pickerYearText}>{year}</Text>
                      </View>
                    ) : null}
                    <Pressable
                      style={[
                        styles.pickerItem,
                        { height: PICKER_ROW_H },
                        active && styles.pickerItemActive,
                      ]}
                      onPress={() => {
                        onChange(o.value);
                        setOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.pickerItemText,
                          active && styles.pickerItemTextActive,
                        ]}
                      >
                        {o.label}
                      </Text>
                      {active ? (
                        <Ionicons name="checkmark" size={17} color="#0284c7" />
                      ) : isNow ? (
                        <Text style={styles.pickerNow}>
                          {t('auxPioneer.currentMonth')}
                        </Text>
                      ) : null}
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function ServingCard({
  row,
  periodLabel,
  canManage,
  onEdit,
  onStop,
  onRemove,
  editLabel,
  stopLabel,
  removeLabel,
}: {
  row: AuxPioneerMonthRow;
  periodLabel: string;
  canManage: boolean;
  onEdit: () => void;
  onStop: () => void;
  onRemove: () => void;
  editLabel: string;
  stopLabel: string;
  removeLabel: string;
}) {
  const [menu, setMenu] = useState(false);
  const openEnded = row.untilCancelled;
  const accent = openEnded ? '#1D9E75' : '#378ADD';
  const tint = openEnded ? '#E1F5EE' : '#E6F1FB';
  const dark = openEnded ? '#085041' : '#0C447C';
  const initials = row.publisherName
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.card, { borderLeftColor: accent }]}>
      <View style={[styles.avatar, { backgroundColor: tint }]}>
        <Text style={[styles.avatarText, { color: dark }]}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{row.publisherName}</Text>
        <View style={styles.cardPeriodRow}>
          <Ionicons
            name={openEnded ? 'infinite' : 'calendar-outline'}
            size={13}
            color={accent}
          />
          <Text style={[styles.cardPeriod, { color: accent }]}>
            {periodLabel}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.hourGoal}>
          {row.hourGoal}
          <Text style={styles.hourUnit}> ч</Text>
        </Text>
        {canManage ? (
          <Pressable hitSlop={8} onPress={() => setMenu(true)}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={menu}
        transparent
        animationType="fade"
        onRequestClose={() => setMenu(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setMenu(false)}>
          <View style={styles.actionSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetName}>{row.publisherName}</Text>
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                setMenu(false);
                onEdit();
              }}
            >
              <Ionicons name="create-outline" size={19} color="#334155" />
              <Text style={styles.sheetItemText}>{editLabel}</Text>
            </Pressable>
            {openEnded ? (
              <Pressable
                style={styles.sheetItem}
                onPress={() => {
                  setMenu(false);
                  onStop();
                }}
              >
                <Ionicons name="stop-circle-outline" size={19} color="#b45309" />
                <Text style={styles.sheetItemText}>{stopLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.sheetItem}
              onPress={() => {
                setMenu(false);
                onRemove();
              }}
            >
              <Ionicons name="trash-outline" size={19} color="#dc2626" />
              <Text style={[styles.sheetItemText, { color: '#dc2626' }]}>
                {removeLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 14, paddingBottom: 40 },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14,
  },
  monthTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    textTransform: 'capitalize',
  },
  normRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  normText: { fontSize: 11, color: '#64748b' },
  normTextReduced: { color: '#854F0B' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12.5, fontWeight: '600', color: '#64748b' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addBtnText: { fontSize: 12.5, color: '#0284c7', fontWeight: '600' },
  empty: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 11,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12.5, fontWeight: '700' },
  cardName: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  cardPeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cardPeriod: { fontSize: 11.5, fontWeight: '500' },
  hourGoal: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  hourUnit: { fontSize: 11, color: '#94a3b8', fontWeight: '400' },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 28,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 8,
  },
  sheetName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94a3b8',
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  sheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  sheetItemText: { fontSize: 15.5, color: '#334155', fontWeight: '500' },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
  },
  editName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  editNameText: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  pickerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#f8fafc',
  },
  pickerValue: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 32,
  },
  pickerSheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    maxHeight: 360,
    overflow: 'hidden',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f1f5f9',
  },
  pickerItemActive: { backgroundColor: '#f0f9ff' },
  pickerYear: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    backgroundColor: '#f8fafc',
  },
  pickerYearText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 1,
  },
  pastWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  pastWarnText: { flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  pickerNow: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284c7',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pickerItemText: {
    fontSize: 14,
    color: '#334155',
    textTransform: 'capitalize',
  },
  pickerItemTextActive: { color: '#0284c7', fontWeight: '600' },
  journalTitle: { fontSize: 12.5, fontWeight: '600', color: '#64748b', flex: 1 },
  journalCard: {
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
  },
  journalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
  },
  journalBorder: { borderTopWidth: 0.5, borderTopColor: '#f1f5f9' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  journalName: { fontSize: 13, color: '#0f172a', fontWeight: '500' },
  journalPeriod: { fontSize: 11, color: '#94a3b8' },
  movedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
  },
  movedBadgeText: { fontSize: 11, color: '#0369a1', fontWeight: '600' },
  journalSection: { marginBottom: 12 },
  journalSectionTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginLeft: 2,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  switchHint: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  error: { fontSize: 12.5, color: '#b91c1c' },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  cancelText: { fontSize: 13.5, fontWeight: '600', color: '#334155' },
  confirmBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0284c7',
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { fontSize: 13.5, fontWeight: '700', color: '#fff' },
});
