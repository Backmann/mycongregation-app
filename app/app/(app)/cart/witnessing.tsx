import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BuildCartWeekInput,
  CartSlotView,
  cartLocationsApi,
  cartWeeksApi,
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import {
  addDays,
  addWeeks,
  formatDateISO,
  parseISODate,
  startOfWeekMonday,
} from '../../../lib/dates';

const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 20 * 60; m += 30) {
    out.push(
      `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(
        2,
        '0',
      )}`,
    );
  }
  return out;
})();

const STEP_OPTIONS = [60, 90, 120] as const;
const DOW = [1, 2, 3, 4, 5, 6, 7];

function dayLabel(dateISO: string, locale: string): string {
  const d = parseISODate(dateISO);
  return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
}

export default function WitnessingScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const router = useRouter();
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const canManage =
    perms.canEditCartWitnessing || perms.canEditFieldServiceMeetings;

  const [monday, setMonday] = useState<Date>(() => startOfWeekMonday(new Date()));
  const weekISO = formatDateISO(monday);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showBuild, setShowBuild] = useState(false);

  // build-form state
  const [bDays, setBDays] = useState<number[]>([]);
  const [bLocations, setBLocations] = useState<string[]>([]);
  const [bStart, setBStart] = useState('10:00');
  const [bEnd, setBEnd] = useState('16:00');
  const [bStep, setBStep] = useState<number>(90);

  // apply modal
  const [slotModal, setSlotModal] = useState<CartSlotView | null>(null);
  const [withWhom, setWithWhom] = useState('');

  const weekQuery = useQuery({
    queryKey: ['cart-week', weekISO],
    queryFn: () => cartWeeksApi.getWeek(weekISO),
  });
  const week = weekQuery.data ?? null;

  const locationsQuery = useQuery({
    queryKey: ['cart-locations', false],
    queryFn: () => cartLocationsApi.list(false),
    enabled: showBuild,
  });

  const invalidateWeek = () =>
    queryClient.invalidateQueries({ queryKey: ['cart-week', weekISO] });

  const visible = week && !(week.status === 'draft' && !canManage);

  const dates = useMemo(() => {
    if (!visible || !week) return [];
    return [...new Set(week.slots.map((s) => s.date))].sort();
  }, [visible, week]);

  useEffect(() => {
    if (dates.length && (!selectedDate || !dates.includes(selectedDate))) {
      setSelectedDate(dates[0]);
    }
  }, [dates, selectedDate]);

  const buildMutation = useMutation({
    mutationFn: (input: BuildCartWeekInput) => cartWeeksApi.build(input),
    onSuccess: () => {
      setShowBuild(false);
      invalidateWeek();
    },
    onError: (e) => Alert.alert(t('witnessing.buildError'), extractErrorMessage(e)),
  });

  const openMutation = useMutation({
    mutationFn: (id: string) => cartWeeksApi.open(id),
    onSuccess: invalidateWeek,
    onError: (e) => Alert.alert(t('witnessing.buildError'), extractErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cartWeeksApi.remove(id),
    onSuccess: invalidateWeek,
    onError: (e) => Alert.alert(t('witnessing.buildError'), extractErrorMessage(e)),
  });

  const applyMutation = useMutation({
    mutationFn: (v: { slotId: string; note?: string }) =>
      cartWeeksApi.apply(v.slotId, v.note),
    onSuccess: () => {
      setSlotModal(null);
      setWithWhom('');
      invalidateWeek();
    },
    onError: (e: unknown) => {
      const status = (e as { response?: { status?: number } })?.response?.status;
      Alert.alert(
        status === 403
          ? t('witnessing.notEligible')
          : t('witnessing.buildError'),
        status === 403 ? '' : extractErrorMessage(e),
      );
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: (slotId: string) => cartWeeksApi.withdraw(slotId),
    onSuccess: () => {
      setSlotModal(null);
      invalidateWeek();
    },
    onError: (e) => Alert.alert(t('witnessing.buildError'), extractErrorMessage(e)),
  });

  function toggle<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  }

  function weekHeader(): string {
    const end = addDays(monday, 6);
    return `${monday.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;
  }

  function statusLabel(): string {
    if (!week) return '';
    if (week.status === 'collecting') return t('witnessing.statusCollecting');
    if (week.status === 'published') return t('witnessing.statusPublished');
    return t('witnessing.statusDraft');
  }

  function confirmDelete() {
    if (!week) return;
    const id = week.id;
    if (Platform.OS === 'web') {
      if (window.confirm(t('witnessing.deleteWeekConfirm'))) deleteMutation.mutate(id);
      return;
    }
    Alert.alert('', t('witnessing.deleteWeekConfirm'), [
      { text: t('witnessing.cancel'), style: 'cancel' },
      {
        text: t('witnessing.deleteWeek'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(id),
      },
    ]);
  }

  const daySlots = useMemo(() => {
    if (!week || !selectedDate) return [];
    return week.slots.filter((s) => s.date === selectedDate);
  }, [week, selectedDate]);

  const byLocation = useMemo(() => {
    const map = new Map<string, { name: string; slots: CartSlotView[] }>();
    for (const s of daySlots) {
      const e = map.get(s.locationId) ?? { name: s.locationName, slots: [] };
      e.slots.push(s);
      map.set(s.locationId, e);
    }
    return [...map.values()];
  }, [daySlots]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Week navigator */}
      <View style={styles.weekNav}>
        <Pressable
          onPress={() => setMonday((m) => addWeeks(m, -1))}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#0ea5e9" />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.weekTitle}>{weekHeader()}</Text>
          {!!week && visible && (
            <Text style={styles.statusText}>{statusLabel()}</Text>
          )}
        </View>
        <Pressable
          onPress={() => setMonday((m) => addWeeks(m, 1))}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-forward" size={22} color="#0ea5e9" />
        </Pressable>
      </View>

      {weekQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#0ea5e9" />
      ) : !visible ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('witnessing.notOpen')}</Text>
          {canManage && !showBuild && (
            <Pressable style={styles.primaryBtn} onPress={() => setShowBuild(true)}>
              <Ionicons name="construct-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>{t('witnessing.build')}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          {/* Day selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dayRow}
          >
            {dates.map((d) => (
              <Pressable
                key={d}
                onPress={() => setSelectedDate(d)}
                style={[styles.dayChip, selectedDate === d && styles.dayChipActive]}
              >
                <Text
                  style={[
                    styles.dayChipText,
                    selectedDate === d && styles.dayChipTextActive,
                  ]}
                >
                  {dayLabel(d, locale)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {byLocation.length === 0 ? (
            <Text style={styles.emptyText}>{t('witnessing.noSlots')}</Text>
          ) : (
            byLocation.map((loc, i) => (
              <View key={i} style={styles.locBlock}>
                <Text style={styles.locName}>{loc.name}</Text>
                <View style={styles.cellWrap}>
                  {loc.slots.map((s) => {
                    const full =
                      typeof s.requestCount === 'number' &&
                      false; /* capacity handled in Phase 3 */
                    const state = s.myRequest
                      ? 'mine'
                      : full
                        ? 'full'
                        : 'free';
                    return (
                      <Pressable
                        key={s.id}
                        onPress={() => setSlotModal(s)}
                        style={[
                          styles.cell,
                          state === 'free' && styles.cellFree,
                          state === 'mine' && styles.cellMine,
                        ]}
                      >
                        <Text
                          style={[
                            styles.cellTime,
                            state === 'mine' && styles.cellTimeMine,
                          ]}
                        >
                          {s.startTime}
                        </Text>
                        {canManage && typeof s.requestCount === 'number' && (
                          <Text style={styles.cellCount}>
                            {s.requestCount} {t('witnessing.requests')}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))
          )}

          {/* Manager controls */}
          {canManage && week && week.status === 'draft' && (
            <Pressable
              style={styles.primaryBtn}
              onPress={() => openMutation.mutate(week.id)}
            >
              <Ionicons name="megaphone-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {t('witnessing.openCollecting')}
              </Text>
            </Pressable>
          )}
          {canManage && week && (
            <Pressable style={styles.deleteWeekBtn} onPress={confirmDelete}>
              <Text style={styles.deleteWeekText}>
                {t('witnessing.deleteWeek')}
              </Text>
            </Pressable>
          )}
        </>
      )}

      {/* Build form modal */}
      <Modal
        visible={showBuild}
        animationType="slide"
        transparent
        onRequestClose={() => setShowBuild(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView>
              <Text style={styles.modalTitle}>{t('witnessing.build')}</Text>

              <Text style={styles.fieldLabel}>{t('witnessing.days')}</Text>
              <View style={styles.cellWrap}>
                {DOW.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => setBDays((a) => toggle(a, d))}
                    style={[styles.optChip, bDays.includes(d) && styles.optChipOn]}
                  >
                    <Text
                      style={[
                        styles.optChipText,
                        bDays.includes(d) && styles.optChipTextOn,
                      ]}
                    >
                      {t(`witnessing.dow.${d}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>{t('witnessing.locations')}</Text>
              {locationsQuery.isLoading ? (
                <ActivityIndicator color="#0ea5e9" />
              ) : (locationsQuery.data ?? []).length === 0 ? (
                <Pressable onPress={() => router.push('/cart/locations' as never)}>
                  <Text style={styles.linkText}>
                    {t('witnessing.noLocations')}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.cellWrap}>
                  {(locationsQuery.data ?? []).map((l) => (
                    <Pressable
                      key={l.id}
                      onPress={() => setBLocations((a) => toggle(a, l.id))}
                      style={[
                        styles.optChip,
                        bLocations.includes(l.id) && styles.optChipOn,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optChipText,
                          bLocations.includes(l.id) && styles.optChipTextOn,
                        ]}
                      >
                        {l.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>
                    {t('witnessing.windowStart')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.timeScroll}
                  >
                    {TIME_OPTIONS.map((tm) => (
                      <Pressable
                        key={tm}
                        onPress={() => setBStart(tm)}
                        style={[styles.timeChip, bStart === tm && styles.optChipOn]}
                      >
                        <Text
                          style={[
                            styles.optChipText,
                            bStart === tm && styles.optChipTextOn,
                          ]}
                        >
                          {tm}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>
                    {t('witnessing.windowEnd')}
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.timeScroll}
                  >
                    {TIME_OPTIONS.map((tm) => (
                      <Pressable
                        key={tm}
                        onPress={() => setBEnd(tm)}
                        style={[styles.timeChip, bEnd === tm && styles.optChipOn]}
                      >
                        <Text
                          style={[
                            styles.optChipText,
                            bEnd === tm && styles.optChipTextOn,
                          ]}
                        >
                          {tm}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              </View>

              <Text style={styles.fieldLabel}>{t('witnessing.step')}</Text>
              <View style={styles.cellWrap}>
                {STEP_OPTIONS.map((st) => (
                  <Pressable
                    key={st}
                    onPress={() => setBStep(st)}
                    style={[styles.optChip, bStep === st && styles.optChipOn]}
                  >
                    <Text
                      style={[
                        styles.optChipText,
                        bStep === st && styles.optChipTextOn,
                      ]}
                    >
                      {t(`witnessing.step${st}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.modalActions}>
                <Pressable
                  style={styles.cancelBtn}
                  onPress={() => setShowBuild(false)}
                >
                  <Text style={styles.cancelBtnText}>
                    {t('witnessing.cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.saveBtn,
                    (bDays.length === 0 ||
                      bLocations.length === 0 ||
                      buildMutation.isPending) &&
                      styles.saveBtnDisabled,
                  ]}
                  disabled={
                    bDays.length === 0 ||
                    bLocations.length === 0 ||
                    buildMutation.isPending
                  }
                  onPress={() =>
                    buildMutation.mutate({
                      weekStartDate: weekISO,
                      startTime: bStart,
                      endTime: bEnd,
                      stepMinutes: bStep,
                      daysOfWeek: bDays,
                      locationIds: bLocations,
                    })
                  }
                >
                  <Text style={styles.saveBtnText}>{t('witnessing.create')}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Apply / withdraw modal */}
      <Modal
        visible={!!slotModal}
        animationType="slide"
        transparent
        onRequestClose={() => setSlotModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {slotModal && (
              <>
                <Text style={styles.modalTitle}>
                  {slotModal.locationName} · {slotModal.startTime}–
                  {slotModal.endTime}
                </Text>
                {slotModal.myRequest ? (
                  <>
                    <Text style={styles.appliedNote}>
                      {t('witnessing.applied')}
                    </Text>
                    <View style={styles.modalActions}>
                      <Pressable
                        style={styles.cancelBtn}
                        onPress={() => setSlotModal(null)}
                      >
                        <Text style={styles.cancelBtnText}>
                          {t('witnessing.close')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.deleteBtn}
                        onPress={() => withdrawMutation.mutate(slotModal.id)}
                      >
                        <Text style={styles.deleteBtnText}>
                          {t('witnessing.withdraw')}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>
                      {t('witnessing.withWhom')}
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={withWhom}
                      onChangeText={setWithWhom}
                      placeholder={t('witnessing.withWhomPlaceholder')}
                      placeholderTextColor="#94a3b8"
                    />
                    <View style={styles.modalActions}>
                      <Pressable
                        style={styles.cancelBtn}
                        onPress={() => {
                          setSlotModal(null);
                          setWithWhom('');
                        }}
                      >
                        <Text style={styles.cancelBtnText}>
                          {t('witnessing.cancel')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.saveBtn}
                        disabled={applyMutation.isPending}
                        onPress={() =>
                          applyMutation.mutate({
                            slotId: slotModal.id,
                            note: withWhom.trim() || undefined,
                          })
                        }
                      >
                        <Text style={styles.saveBtnText}>
                          {t('witnessing.apply')}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40 },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navBtn: { padding: 8 },
  weekTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  statusText: { fontSize: 12, color: '#64748b', marginTop: 2 },
  emptyBox: { alignItems: 'center', marginTop: 32, gap: 16 },
  emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 8 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 16,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  dayRow: { gap: 8, paddingVertical: 4, marginBottom: 12 },
  dayChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
  },
  dayChipActive: { backgroundColor: '#0ea5e9' },
  dayChipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  dayChipTextActive: { color: '#fff' },
  locBlock: { marginBottom: 16 },
  locName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  cellWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    minWidth: 84,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
  },
  cellFree: { backgroundColor: '#dcfce7' },
  cellMine: { backgroundColor: '#0ea5e9' },
  cellTime: { fontSize: 15, fontWeight: '700', color: '#166534' },
  cellTimeMine: { color: '#fff' },
  cellCount: { fontSize: 11, color: '#475569', marginTop: 2 },
  deleteWeekBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  deleteWeekText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  linkText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },
  optChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  optChipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  optChipText: { fontSize: 14, color: '#475569', fontWeight: '600' },
  optChipTextOn: { color: '#fff' },
  timeRow: { flexDirection: 'row', gap: 8 },
  timeScroll: { gap: 6, paddingVertical: 2 },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 20,
  },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  cancelBtnText: { color: '#475569', fontSize: 15, fontWeight: '600' },
  deleteBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  deleteBtnText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
  appliedNote: { fontSize: 14, color: '#0369a1', marginTop: 4 },
  saveBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
