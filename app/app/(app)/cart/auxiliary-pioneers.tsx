import { useState } from 'react';
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
import { PublisherSelector } from '../../../components/PublisherSelector';

const QK_MONTH = (m: string) => ['aux-pioneers', 'month', m];
const QK_JOURNAL = ['aux-pioneers', 'journal'];

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
  const [newPublisher, setNewPublisher] = useState<string | null>(null);
  const [untilCancelled, setUntilCancelled] = useState(true);
  const [addError, setAddError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      auxiliaryPioneersApi.create({
        publisherId: newPublisher!,
        startMonth: monthParam,
        untilCancelled,
        endMonth: untilCancelled ? undefined : monthParam,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_MONTH(monthParam) });
      qc.invalidateQueries({ queryKey: QK_JOURNAL });
      setAddOpen(false);
      setNewPublisher(null);
      setUntilCancelled(true);
      setAddError(null);
    },
    onError: (e) => setAddError(extractErrorMessage(e)),
  });

  const stopMutation = useMutation({
    mutationFn: (id: string) => auxiliaryPioneersApi.stop(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_MONTH(monthParam) });
      qc.invalidateQueries({ queryKey: QK_JOURNAL });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => auxiliaryPioneersApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK_MONTH(monthParam) });
      qc.invalidateQueries({ queryKey: QK_JOURNAL });
    },
  });

  const reduced = (monthQuery.data?.hourGoal ?? 30) === 15;
  const rows = monthQuery.data?.rows ?? [];

  const fmtMonth = (iso: string) =>
    dayjs(iso).locale(i18n.language).format('MMMM YYYY');

  const periodLabel = (r: {
    startMonth: string;
    endMonth: string | null;
    untilCancelled: boolean;
  }) => {
    if (r.untilCancelled)
      return t('auxPioneer.untilCancelledSince', {
        month: fmtMonth(r.startMonth),
      });
    if (r.endMonth && r.endMonth.slice(0, 7) === r.startMonth.slice(0, 7))
      return t('auxPioneer.onlyMonth', { month: fmtMonth(r.startMonth) });
    return t('auxPioneer.rangeMonths', {
      from: fmtMonth(r.startMonth),
      to: r.endMonth ? fmtMonth(r.endMonth) : '…',
    });
  };

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
            <Pressable
              style={styles.addBtn}
              onPress={() => {
                setAddError(null);
                setAddOpen(true);
              }}
            >
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
              onStop={() => stopMutation.mutate(r.id)}
              onRemove={() => removeMutation.mutate(r.id)}
              stopLabel={t('auxPioneer.stop')}
              removeLabel={t('common.delete')}
            />
          ))
        )}

        {/* History journal */}
        <View style={[styles.sectionHead, { marginTop: 22 }]}>
          <Ionicons name="time-outline" size={15} color="#64748b" />
          <Text style={styles.journalTitle}>{t('auxPioneer.journal')}</Text>
        </View>
        <View style={styles.journalCard}>
          {(journalQuery.data ?? []).length === 0 ? (
            <Text style={[styles.empty, { padding: 14 }]}>
              {t('auxPioneer.journalEmpty')}
            </Text>
          ) : (
            (journalQuery.data ?? []).map((j, idx) => (
              <View
                key={j.id}
                style={[styles.journalRow, idx > 0 && styles.journalBorder]}
              >
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: j.serving ? '#1D9E75' : '#94a3b8' },
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.journalName}>{j.publisherName}</Text>
                  <Text style={styles.journalPeriod}>{periodLabel(j)}</Text>
                </View>
                <Text
                  style={[
                    styles.journalTag,
                    j.serving ? styles.tagServing : styles.tagDone,
                  ]}
                >
                  {j.serving
                    ? t('auxPioneer.serving')
                    : t('auxPioneer.finished')}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Add modal */}
      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setAddOpen(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('auxPioneer.addTitle', {
                month: monthDate.format('MMMM YYYY'),
              })}
            </Text>
            <PublisherSelector
              label={t('auxPioneer.publisher')}
              value={newPublisher}
              onChange={setNewPublisher}
              boxed
            />
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchLabel}>
                  {t('auxPioneer.untilCancelled')}
                </Text>
                <Text style={styles.switchHint}>
                  {untilCancelled
                    ? t('auxPioneer.untilCancelledHint')
                    : t('auxPioneer.singleMonthHint', {
                        month: monthDate.format('MMMM YYYY'),
                      })}
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
            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setAddOpen(false)}
              >
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.confirmBtn,
                  (!newPublisher || createMutation.isPending) &&
                    styles.confirmDisabled,
                ]}
                disabled={!newPublisher || createMutation.isPending}
                onPress={() => createMutation.mutate()}
              >
                <Text style={styles.confirmText}>{t('common.add')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ServingCard({
  row,
  periodLabel,
  canManage,
  onStop,
  onRemove,
  stopLabel,
  removeLabel,
}: {
  row: AuxPioneerMonthRow;
  periodLabel: string;
  canManage: boolean;
  onStop: () => void;
  onRemove: () => void;
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
          <Pressable hitSlop={8} onPress={() => setMenu((m) => !m)}>
            <Ionicons name="ellipsis-horizontal" size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>
      {menu ? (
        <View style={styles.rowMenu}>
          {openEnded ? (
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setMenu(false);
                onStop();
              }}
            >
              <Ionicons name="stop-circle-outline" size={16} color="#b45309" />
              <Text style={styles.menuText}>{stopLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={styles.menuItem}
            onPress={() => {
              setMenu(false);
              onRemove();
            }}
          >
            <Ionicons name="trash-outline" size={16} color="#dc2626" />
            <Text style={[styles.menuText, { color: '#dc2626' }]}>
              {removeLabel}
            </Text>
          </Pressable>
        </View>
      ) : null}
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
  rowMenu: {
    position: 'absolute',
    right: 10,
    top: 44,
    backgroundColor: '#fff',
    borderWidth: 0.5,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 10,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  menuText: { fontSize: 13.5, color: '#334155', fontWeight: '500' },
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
  journalTag: {
    fontSize: 10.5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    overflow: 'hidden',
  },
  tagServing: { color: '#0F6E56', backgroundColor: '#E1F5EE' },
  tagDone: { color: '#94a3b8', backgroundColor: '#f1f5f9' },
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
    gap: 12,
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
