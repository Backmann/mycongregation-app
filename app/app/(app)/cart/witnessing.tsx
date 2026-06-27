import { useMemo, useState } from 'react';
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
import { PublisherSelector } from '../../../components/PublisherSelector';
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

function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

const PERIOD_TIMES: { key: string; times: string[] }[] = [
  { key: 'morning', from: 6 * 60, to: 11 * 60 + 30 },
  { key: 'day', from: 12 * 60, to: 17 * 60 + 30 },
  { key: 'evening', from: 18 * 60, to: 20 * 60 },
].map((p) => ({
  key: p.key,
  times: TIME_OPTIONS.filter(
    (tm) => timeToMin(tm) >= p.from && timeToMin(tm) <= p.to,
  ),
}));

const STEP_OPTIONS = [60, 90, 120] as const;
const DOW = [1, 2, 3, 4, 5, 6, 7];

function dayHeader(dateISO: string, locale: string): string {
  const d = parseISODate(dateISO);
  return d.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
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
  const [showBuild, setShowBuild] = useState(false);
  const [appendMode, setAppendMode] = useState(false);

  // build-form state
  const [bDays, setBDays] = useState<number[]>([]);
  const [bLocations, setBLocations] = useState<string[]>([]);
  const [bStart, setBStart] = useState('10:00');
  const [bEnd, setBEnd] = useState('16:00');
  const [bStep, setBStep] = useState<number>(90);

  // apply modal
  const [slotModal, setSlotModal] = useState<CartSlotView | null>(null);
  const [distSlotId, setDistSlotId] = useState<string | null>(null);
  const [extName, setExtName] = useState('');

  const weekQuery = useQuery({
    queryKey: ['cart-week', weekISO],
    queryFn: () => cartWeeksApi.getWeek(weekISO),
  });
  const week = weekQuery.data ?? null;

  const pairingsQuery = useQuery({
    queryKey: ['cart-pairings'],
    queryFn: () => cartWeeksApi.pairings(),
    enabled: canManage && !!week,
  });
  const pairings = pairingsQuery.data;

  const locationsQuery = useQuery({
    queryKey: ['cart-locations', false],
    queryFn: () => cartLocationsApi.list(false),
    enabled: showBuild,
  });

  const invalidateWeek = () =>
    queryClient.invalidateQueries({ queryKey: ['cart-week', weekISO] });

  const visible = week && !(week.status === 'draft' && !canManage);

  const distSlot = useMemo(
    () => week?.slots.find((s) => s.id === distSlotId) ?? null,
    [week, distSlotId],
  );
  const atCapacity =
    !!distSlot && (distSlot.assignedCount ?? 0) >= distSlot.capacityMax;


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

  const assignMutation = useMutation({
    mutationFn: (v: {
      slotId: string;
      body: { publisherId?: string; externalName?: string };
    }) => cartWeeksApi.assign(v.slotId, v.body),
    onSuccess: () => {
      setExtName('');
      invalidateWeek();
    },
    onError: (e) =>
      Alert.alert(t('witnessing.assignError'), extractErrorMessage(e)),
  });

  const unassignMutation = useMutation({
    mutationFn: (v: { slotId: string; assignmentId: string }) =>
      cartWeeksApi.unassign(v.slotId, v.assignmentId),
    onSuccess: () => invalidateWeek(),
    onError: (e) =>
      Alert.alert(t('witnessing.assignError'), extractErrorMessage(e)),
  });

  const publishMutation = useMutation({
    mutationFn: (id: string) => cartWeeksApi.publish(id),
    onSuccess: () => invalidateWeek(),
    onError: (e) =>
      Alert.alert(t('witnessing.publishError'), extractErrorMessage(e)),
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

  function pickTime(tm: string) {
    if (!bStart || (bStart && bEnd)) {
      setBStart(tm);
      setBEnd('');
      return;
    }
    if (timeToMin(tm) > timeToMin(bStart)) setBEnd(tm);
    else setBStart(tm);
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

  function confirmPublish() {
    if (!week) return;
    const id = week.id;
    if (Platform.OS === 'web') {
      if (window.confirm(t('witnessing.publishConfirm')))
        publishMutation.mutate(id);
      return;
    }
    Alert.alert('', t('witnessing.publishConfirm'), [
      { text: t('witnessing.cancel'), style: 'cancel' },
      {
        text: t('witnessing.publish'),
        onPress: () => publishMutation.mutate(id),
      },
    ]);
  }

  const byDay = useMemo(() => {
    if (!week) return [];
    const days = new Map<
      string,
      Map<string, { name: string; slots: CartSlotView[] }>
    >();
    for (const s of week.slots) {
      let locs = days.get(s.date);
      if (!locs) {
        locs = new Map();
        days.set(s.date, locs);
      }
      const e = locs.get(s.locationId) ?? { name: s.locationName, slots: [] };
      e.slots.push(s);
      locs.set(s.locationId, e);
    }
    return [...days.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, locs]) => ({ date, locations: [...locs.values()] }));
  }, [week]);

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
            <Pressable
              style={styles.primaryBtn}
              onPress={() => {
                setAppendMode(false);
                setBDays([]);
                setBLocations([]);
                setShowBuild(true);
              }}
            >
              <Ionicons name="construct-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>{t('witnessing.build')}</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <>
          {byDay.length === 0 ? (
            <Text style={styles.emptyText}>{t('witnessing.noSlots')}</Text>
          ) : (
            byDay.map((day) => (
              <View key={day.date} style={styles.dayBlock}>
                <Text style={styles.dayHeader}>
                  {dayHeader(day.date, locale)}
                </Text>
                {day.locations.map((loc, i) => (
                  <View key={i} style={styles.locBlock}>
                    <Text style={styles.locName}>{loc.name}</Text>
                    <View style={styles.cellWrap}>
                      {loc.slots.map((s) => {
                        const cnt = s.assignedCount ?? 0;
                        const mine = s.myRequest || s.myAssignment;
                        const full = cnt >= s.capacityMax;
                        const warn =
                          canManage &&
                          !!s.warnings &&
                          (s.warnings.underMin ||
                            s.warnings.brotherSister ||
                            s.warnings.secondShiftSameDay);
                        const state = mine ? 'mine' : full ? 'full' : 'free';
                        return (
                          <Pressable
                            key={s.id}
                            onPress={() =>
                              canManage ? setDistSlotId(s.id) : setSlotModal(s)
                            }
                            style={[
                              styles.cell,
                              state === 'free' && styles.cellFree,
                              state === 'mine' && styles.cellMine,
                              state === 'full' && styles.cellFull,
                              warn && styles.cellWarn,
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
                            {canManage ? (
                              <Text style={styles.cellCount}>
                                {cnt}/{s.capacityMax}
                                {s.requestCount ? ` · ${s.requestCount}` : ''}
                              </Text>
                            ) : (
                              typeof s.assignedCount === 'number' && (
                                <Text style={styles.cellCount}>
                                  {cnt}/{s.capacityMax}
                                </Text>
                              )
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}

          {/* Manager controls */}
          {canManage && week && week.status !== 'published' && (
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => {
                setAppendMode(true);
                setBDays([]);
                setBLocations([]);
                if (week) {
                  setBStart(week.startTime);
                  setBEnd(week.endTime);
                  setBStep(week.stepMinutes);
                }
                setShowBuild(true);
              }}
            >
              <Ionicons name="add" size={18} color="#0ea5e9" />
              <Text style={styles.secondaryBtnText}>
                {t('witnessing.addToWeek')}
              </Text>
            </Pressable>
          )}
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
          {canManage && week && week.status === 'collecting' && (
            <Pressable style={styles.primaryBtn} onPress={confirmPublish}>
              <Ionicons name="checkmark-done-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {t('witnessing.publish')}
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

              <>
                  <View style={styles.windowHeader}>
                    <Text style={styles.fieldLabel}>
                      {t('witnessing.window')}
                    </Text>
                    <Text style={styles.windowValue}>
                      {bStart} – {bEnd}
                    </Text>
                  </View>
                  {PERIOD_TIMES.map((p) => (
                    <View key={p.key}>
                      <Text style={styles.periodLabel}>
                        {t(`witnessing.period.${p.key}`)}
                      </Text>
                      <View style={styles.cellWrap}>
                        {p.times.map((tm) => {
                          const edge = tm === bStart || tm === bEnd;
                          const inRange =
                            !!bStart &&
                            !!bEnd &&
                            timeToMin(tm) > timeToMin(bStart) &&
                            timeToMin(tm) < timeToMin(bEnd);
                          return (
                            <Pressable
                              key={tm}
                              onPress={() => pickTime(tm)}
                              style={[
                                styles.timeCell,
                                inRange && styles.timeCellRange,
                                edge && styles.optChipOn,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.optChipText,
                                  inRange && styles.timeCellRangeText,
                                  edge && styles.optChipTextOn,
                                ]}
                              >
                                {tm}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ))}

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
              </>

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
                      (!bStart || !bEnd) ||
                      buildMutation.isPending) &&
                      styles.saveBtnDisabled,
                  ]}
                  disabled={
                    bDays.length === 0 ||
                    bLocations.length === 0 ||
                    (!bStart || !bEnd) ||
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
                  <Text style={styles.saveBtnText}>
                    {appendMode ? t('witnessing.add') : t('witnessing.create')}
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Apply / withdraw modal */}
      {/* Distribution modal (manager) */}
      <Modal
        visible={!!distSlot}
        animationType="slide"
        transparent
        onRequestClose={() => setDistSlotId(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView>
              {distSlot && (
                <>
                  <Text style={styles.modalTitle}>
                    {distSlot.locationName} · {distSlot.startTime}–
                    {distSlot.endTime}
                  </Text>
                  <Text style={styles.capacityLine}>
                    {distSlot.assignedCount ?? 0}/{distSlot.capacityMax}{' '}
                    {t('witnessing.assignedOf')}
                  </Text>

                  {distSlot.warnings &&
                    (distSlot.warnings.underMin ||
                      distSlot.warnings.brotherSister ||
                      distSlot.warnings.secondShiftSameDay) && (
                      <View style={styles.warnWrap}>
                        {distSlot.warnings.underMin && (
                          <Text style={styles.warnChip}>
                            {t('witnessing.warn.underMin')}
                          </Text>
                        )}
                        {distSlot.warnings.brotherSister && (
                          <Text style={styles.warnChip}>
                            {t('witnessing.warn.brotherSister')}
                          </Text>
                        )}
                        {distSlot.warnings.secondShiftSameDay && (
                          <Text style={styles.warnChip}>
                            {t('witnessing.warn.secondShift')}
                          </Text>
                        )}
                      </View>
                    )}

                  <Text style={styles.fieldLabel}>
                    {t('witnessing.assigned')}
                  </Text>
                  {(distSlot.assignments ?? []).length === 0 ? (
                    <Text style={styles.emptyText}>
                      {t('witnessing.noneYet')}
                    </Text>
                  ) : (
                    (distSlot.assignments ?? []).map((a) => (
                      <View key={a.id} style={styles.assignedRow}>
                        <Text style={styles.assignedName}>
                          {a.name}
                          {a.external ? ` · ${t('witnessing.external')}` : ''}
                        </Text>
                        <Pressable
                          onPress={() =>
                            unassignMutation.mutate({
                              slotId: distSlot.id,
                              assignmentId: a.id,
                            })
                          }
                        >
                          <Ionicons
                            name="close-circle"
                            size={22}
                            color="#ef4444"
                          />
                        </Pressable>
                      </View>
                    ))
                  )}

                  {(distSlot.requests ?? []).filter(
                    (r) =>
                      !(distSlot.assignments ?? []).some(
                        (a) => a.publisherId === r.publisherId,
                      ),
                  ).length > 0 && (
                    <>
                      <Text style={styles.fieldLabel}>
                        {t('witnessing.applicants')}
                      </Text>
                      {(distSlot.requests ?? [])
                        .filter(
                          (r) =>
                            !(distSlot.assignments ?? []).some(
                              (a) => a.publisherId === r.publisherId,
                            ),
                        )
                        .map((r) => (
                          <View key={r.publisherId} style={styles.applicantRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.assignedName}>{r.name}</Text>
                              {!!r.withWhomNote && (
                                <Text style={styles.withWhomNote}>
                                  {t('witnessing.withWhomShort')}:{' '}
                                  {r.withWhomNote}
                                </Text>
                              )}
                              {pairings &&
                                pairings[r.publisherId] &&
                                pairings[r.publisherId].length > 0 && (
                                  <Text style={styles.pairingHint}>
                                    {t('witnessing.recentlyWith')}:{' '}
                                    {pairings[r.publisherId]
                                      .slice(0, 3)
                                      .map((p) => p.name)
                                      .join(', ')}
                                  </Text>
                                )}
                            </View>
                            <Pressable
                              style={[
                                styles.assignBtn,
                                atCapacity && styles.assignBtnDisabled,
                              ]}
                              disabled={atCapacity || assignMutation.isPending}
                              onPress={() =>
                                assignMutation.mutate({
                                  slotId: distSlot.id,
                                  body: { publisherId: r.publisherId },
                                })
                              }
                            >
                              <Text style={styles.assignBtnText}>
                                {t('witnessing.assign')}
                              </Text>
                            </Pressable>
                          </View>
                        ))}
                    </>
                  )}

                  {!atCapacity ? (
                    <>
                      <PublisherSelector
                        label={t('witnessing.addPublisher')}
                        value={null}
                        requiredCapability="public_witnessing"
                        excludeIds={(distSlot.assignments ?? [])
                          .map((a) => a.publisherId)
                          .filter((x): x is string => !!x)}
                        onChange={(id) => {
                          if (id)
                            assignMutation.mutate({
                              slotId: distSlot.id,
                              body: { publisherId: id },
                            });
                        }}
                      />
                      <Text style={styles.fieldLabel}>
                        {t('witnessing.addExternal')}
                      </Text>
                      <View style={styles.extRow}>
                        <TextInput
                          style={[styles.input, { flex: 1 }]}
                          value={extName}
                          onChangeText={setExtName}
                          placeholder={t('witnessing.externalPlaceholder')}
                          placeholderTextColor="#94a3b8"
                        />
                        <Pressable
                          style={[
                            styles.assignBtn,
                            !extName.trim() && styles.assignBtnDisabled,
                          ]}
                          disabled={!extName.trim() || assignMutation.isPending}
                          onPress={() =>
                            assignMutation.mutate({
                              slotId: distSlot.id,
                              body: { externalName: extName.trim() },
                            })
                          }
                        >
                          <Text style={styles.assignBtnText}>
                            {t('witnessing.add')}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.appliedNote}>
                      {t('witnessing.slotFull')}
                    </Text>
                  )}

                  <View style={styles.modalActions}>
                    <Pressable
                      style={styles.cancelBtn}
                      onPress={() => {
                        setDistSlotId(null);
                        setExtName('');
                      }}
                    >
                      <Text style={styles.cancelBtnText}>
                        {t('witnessing.close')}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

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
                {week?.status === 'published' ? (
                  <>
                    {(slotModal.assignments ?? []).length === 0 ? (
                      <Text style={styles.emptyText}>
                        {t('witnessing.noneYet')}
                      </Text>
                    ) : (
                      (slotModal.assignments ?? []).map((a) => (
                        <Text key={a.id} style={styles.assignedName}>
                          • {a.name}
                          {a.external ? ` · ${t('witnessing.external')}` : ''}
                        </Text>
                      ))
                    )}
                    <View style={styles.modalActions}>
                      <Pressable
                        style={styles.cancelBtn}
                        onPress={() => setSlotModal(null)}
                      >
                        <Text style={styles.cancelBtnText}>
                          {t('witnessing.close')}
                        </Text>
                      </Pressable>
                    </View>
                  </>
                ) : slotModal.myRequest ? (
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
                    <Text style={styles.appliedNote}>
                      {t('witnessing.applyHint')}
                    </Text>
                    <View style={styles.modalActions}>
                      <Pressable
                        style={styles.cancelBtn}
                        onPress={() => setSlotModal(null)}
                      >
                        <Text style={styles.cancelBtnText}>
                          {t('witnessing.cancel')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={styles.saveBtn}
                        disabled={applyMutation.isPending}
                        onPress={() =>
                          applyMutation.mutate({ slotId: slotModal.id })
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
  dayBlock: { marginBottom: 20 },
  dayHeader: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 10,
    textTransform: 'capitalize',
  },
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
  cellFull: { backgroundColor: '#e2e8f0' },
  cellWarn: { borderWidth: 2, borderColor: '#f59e0b' },
  capacityLine: { fontSize: 14, color: '#475569', marginBottom: 8 },
  warnWrap: { gap: 6, marginBottom: 8 },
  warnChip: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  assignedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  assignedName: { fontSize: 15, color: '#0f172a', fontWeight: '600' },
  applicantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  withWhomNote: { fontSize: 12, color: '#64748b', marginTop: 2 },
  pairingHint: { fontSize: 12, color: '#0369a1', marginTop: 2 },
  assignBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  assignBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  assignBtnDisabled: { opacity: 0.5 },
  extRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
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
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0ea5e9',
    paddingVertical: 12,
    marginTop: 16,
  },
  secondaryBtnText: { color: '#0ea5e9', fontSize: 15, fontWeight: '600' },
  windowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  windowValue: { fontSize: 14, fontWeight: '700', color: '#0ea5e9' },
  periodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 10,
    marginBottom: 4,
  },
  timeCell: {
    width: '22%',
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  timeCellRange: { backgroundColor: '#e0f2fe', borderColor: '#bae6fd' },
  timeCellRangeText: { color: '#0369a1' },
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
