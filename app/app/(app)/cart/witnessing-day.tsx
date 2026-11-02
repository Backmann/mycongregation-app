import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CartDayView,
  type CartSpan,
  cartWeeksApi,
  extractErrorMessage,
} from '../../../lib/api';
import { Sheet } from '../../../components/Sheet';
import { UndoBar } from '../../../components/UndoBar';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { SpanPicker } from '../../../components/cart/SpanPicker';
import { confirm } from '../../../components/ConfirmHost';
import { notify } from '../../../lib/error-bus';
import { failsScreen } from '../../../lib/screen-failure';
import { parseISODate } from '../../../lib/dates';
import {
  barOf,
  coverage,
  halfHours,
  liveSpans,
  spanText,
  toHHMM,
  toMin,
} from '../../../lib/cart-time';

/**
 * One day at the stand for whoever arranges it (2 November 2026): the day as
 * a scale — how many stand at each half-hour — and a line per person, solid
 * for who is on the plan, hatched for who asked; beside each name what
 * fairness goes by. Put on, move, take off (with «Отменить» for a moment),
 * call the day or part of it off, change its hours.
 */
export default function WitnessingDayScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ week: string; day: string }>();
  const weekISO = String(params.week ?? '');
  const dayId = String(params.day ?? '');

  const weekQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: ['cart-week', weekISO],
    queryFn: () => cartWeeksApi.getWeek(weekISO),
    enabled: !!weekISO,
  });
  const week = weekQuery.data ?? null;
  const day: CartDayView | null = week?.days.find((d) => d.id === dayId) ?? null;
  const standingQuery = useQuery({
    queryKey: ['cart-standing', week?.id],
    queryFn: () => cartWeeksApi.standing(week!.id),
    enabled: !!week?.id,
  });
  const pairingsQuery = useQuery({
    queryKey: ['cart-pairings'],
    queryFn: () => cartWeeksApi.pairings(),
    enabled: !!week,
  });

  const title = day
    ? (() => {
        const s = parseISODate(day.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long' });
        return `${s.charAt(0).toLocaleUpperCase(locale)}${s.slice(1)} · ${day.locationName}`;
      })()
    : t('service.publicWitnessing');
  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cart-week'] });
    queryClient.invalidateQueries({ queryKey: ['cart-standing'] });
  };
  const err = (e: unknown) => notify(t('witnessing.actionError'), extractErrorMessage(e));

  const [undo, setUndo] = useState<{ name: string; body: CartSpan & { publisherId?: string; externalName?: string } } | null>(null);
  const [timeFor, setTimeFor] = useState<{ id: string; name: string; span: CartSpan } | null>(null);
  const [newSpan, setNewSpan] = useState<CartSpan | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addWho, setAddWho] = useState<string | null>(null);
  const [guest, setGuest] = useState('');
  const [addSpan, setAddSpan] = useState<CartSpan | null>(null);
  const [offOpen, setOffOpen] = useState(false);
  const [offWhole, setOffWhole] = useState(true);
  const [offSpan, setOffSpan] = useState<CartSpan | null>(null);
  const [reason, setReason] = useState('');
  const [hoursOpen, setHoursOpen] = useState(false);
  const [hoursSpan, setHoursSpan] = useState<CartSpan | null>(null);

  const assign = useMutation({
    mutationFn: (body: CartSpan & { publisherId?: string; externalName?: string }) =>
      cartWeeksApi.assign(dayId, body),
    onSuccess: refresh,
    onError: err,
  });
  const unassign = useMutation({
    mutationFn: (v: { id: string; name: string; body: CartSpan & { publisherId?: string; externalName?: string } }) =>
      cartWeeksApi.unassign(v.id),
    onSuccess: (_r, v) => {
      setUndo({ name: v.name, body: v.body });
      refresh();
    },
    onError: err,
  });
  const changeTime = useMutation({
    mutationFn: (v: { id: string; span: CartSpan }) => cartWeeksApi.changeTime(v.id, v.span),
    onSuccess: () => {
      setTimeFor(null);
      refresh();
    },
    onError: err,
  });
  const cancelDay = useMutation({
    mutationFn: () =>
      cartWeeksApi.cancelDay(dayId, {
        ...(offWhole || !offSpan ? {} : offSpan),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: () => {
      setOffOpen(false);
      setReason('');
      refresh();
    },
    onError: err,
  });
  const restore = useMutation({
    mutationFn: (id: string) => cartWeeksApi.restore(id),
    onSuccess: refresh,
    onError: err,
  });
  const dayHours = useMutation({
    mutationFn: (span: CartSpan) => cartWeeksApi.dayHours(dayId, span),
    onSuccess: () => {
      setHoursOpen(false);
      refresh();
    },
    onError: err,
  });
  const deleteDay = useMutation({
    mutationFn: () => cartWeeksApi.deleteDay(dayId),
    onSuccess: () => {
      refresh();
      navigation.goBack();
    },
    onError: err,
  });

  const rows = useMemo(() => {
    if (!day) return [];
    const standing = standingQuery.data ?? {};
    const pairs = pairingsQuery.data ?? {};
    const on = (day.plan ?? []).map((p) => ({ kind: 'plan' as const, ...p }));
    const asked = (day.wishes ?? [])
      .filter(
        (w) =>
          !on.some((p) => p.publisherId === w.publisherId && toMin(p.startTime) <= toMin(w.startTime) && toMin(w.endTime) <= toMin(p.endTime)),
      )
      .map((w) => ({ kind: 'wish' as const, external: false, ...w }));
    return [...on, ...asked]
      .map((r) => {
        const s = r.publisherId ? standing[r.publisherId] : undefined;
        const bits: string[] = [];
        if (s?.pioneer) bits.push(t('witnessing.pioneer'));
        if (s) bits.push(t('witnessing.recentDays', { count: s.recentDays }));
        if (s && s.missedWeeks >= 2) bits.push(t('witnessing.missedWeeks', { count: s.missedWeeks }));
        if ('withWhomNote' in r && r.withWhomNote) bits.push(t('witnessing.wantsWith', { who: r.withWhomNote }));
        if ('late' in r && r.late) bits.push(t('witnessing.late'));
        const partner = r.publisherId ? pairs[r.publisherId]?.[0] : undefined;
        if (partner) bits.push(t('witnessing.recentlyWith', { name: partner.name }));
        return { ...r, note: bits.join(' · '), absent: !!r.absent };
      })
      .sort((a, b) => toMin(a.startTime) - toMin(b.startTime) || (a.kind === 'plan' ? -1 : 1));
  }, [day, standingQuery.data, pairingsQuery.data, t]);

  if (weekQuery.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color="#0e7490" />;
  if (!week || !day) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>{t('witnessing.dayGone')}</Text>
      </View>
    );
  }

  const live = liveSpans(day, day.plan ?? []);
  const counts = coverage(day, live);
  const marks = halfHours(day);
  const locked = day.locked;
  const off = (s: CartSpan) => day.cancellations.some((c) => toMin(c.startTime) <= toMin(s.startTime) && toMin(s.endTime) <= toMin(c.endTime));

  return (
    <View style={{ flex: 1 }}>
      <KeyboardScroll style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.headRow}>
            <Text style={styles.headText}>
              {t(`cartLocations.kinds.${day.locationKind}`)} · {spanText(day)}
            </Text>
            <Text style={styles.headMuted}>{t('witnessing.maxFour')}</Text>
          </View>
          <View style={styles.cover}>
            {counts.map((n, i) => (
              <View
                key={marks[i]}
                style={[
                  styles.coverCell,
                  n >= 2 ? styles.c2 : n === 1 ? styles.c1 : styles.c0,
                  off({ startTime: marks[i], endTime: toHHMM(toMin(marks[i]) + 30) }) && styles.cOff,
                ]}
              >
                <Text style={[styles.coverText, n === 1 && { color: '#78350f' }]}>{n || ''}</Text>
              </View>
            ))}
          </View>
          <View style={styles.axis}>
            <Text style={styles.axisText}>{day.startTime}</Text>
            <Text style={styles.axisText}>{day.endTime}</Text>
          </View>
          {locked && <Text style={styles.locked}>{t('witnessing.lockedDay')}</Text>}
        </View>

        {day.cancellations.map((c) => (
          <View key={c.id} style={styles.offRow}>
            <Text style={styles.offText}>
              {t('witnessing.calledOff', { time: spanText(c) })}
              {c.reason ? ` · ${c.reason}` : ''}
            </Text>
            {!locked && (
              <Pressable onPress={() => restore.mutate(c.id)} disabled={restore.isPending}>
                <Text style={styles.linkText}>{t('witnessing.restore')}</Text>
              </Pressable>
            )}
          </View>
        ))}

        {!!day.warnings &&
          (day.warnings.alone.length > 0 || day.warnings.brotherSister.length > 0 || day.warnings.longDay.length > 0) && (
            <View style={styles.warn}>
              {day.warnings.alone.map((s) => (
                <Text key={`a${s.startTime}`} style={styles.warnText}>
                  {t('witnessing.warnAlone', { time: spanText(s) })}
                </Text>
              ))}
              {day.warnings.brotherSister.map((s) => (
                <Text key={`b${s.startTime}`} style={styles.warnText}>
                  {t('witnessing.warnBrotherSister', { time: spanText(s) })}
                </Text>
              ))}
              {day.warnings.longDay.map((x) => (
                <Text key={`l${x.name}`} style={styles.warnText}>
                  {t('witnessing.warnLongDay', { name: x.name, hours: String(x.minutes / 60).replace('.', ',') })}
                </Text>
              ))}
            </View>
          )}

        <View style={styles.card}>
          {rows.length === 0 && <Text style={styles.empty}>{t('witnessing.nobodyYet')}</Text>}
          {rows.map((r) => (
            <View key={`${r.kind}${r.id}`} style={styles.personRow}>
              <View style={styles.personHead}>
                <Text style={styles.personName} numberOfLines={1}>
                  {r.name}
                  {r.external ? ` · ${t('witnessing.guest')}` : ''}
                </Text>
                <Text style={styles.personTime}>{spanText(r)}</Text>
                {!locked && r.kind === 'plan' && (
                  <>
                    <Pressable
                      style={styles.timeBtn}
                      onPress={() => {
                        setTimeFor({ id: r.id, name: r.name, span: r });
                        setNewSpan(r);
                      }}
                    >
                      <Ionicons name="time-outline" size={16} color="#0e7490" />
                    </Pressable>
                    <Pressable
                      style={styles.offBtn}
                      disabled={unassign.isPending}
                      onPress={() =>
                        unassign.mutate({
                          id: r.id,
                          name: r.name,
                          body: {
                            startTime: r.startTime,
                            endTime: r.endTime,
                            ...(r.publisherId ? { publisherId: r.publisherId } : { externalName: r.name }),
                          },
                        })
                      }
                    >
                      <Text style={styles.offBtnText}>{t('witnessing.takeOff')}</Text>
                    </Pressable>
                  </>
                )}
                {!locked && r.kind === 'wish' && !day.over && (
                  <Pressable
                    style={[styles.onBtn, r.absent && styles.onBtnDim]}
                    disabled={assign.isPending}
                    onPress={() =>
                      assign.mutate({ publisherId: r.publisherId!, startTime: r.startTime, endTime: r.endTime })
                    }
                  >
                    <Text style={[styles.onBtnText, r.absent && { color: '#475569' }]}>{t('witnessing.putOn')}</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.track}>
                <View style={[styles.bar, r.kind === 'plan' ? styles.barOn : styles.barWish, barOf(day, r)]} />
              </View>
              {(!!r.note || r.absent) && (
                <Text style={[styles.personNote, r.absent && styles.absent]}>
                  {r.absent ? `${t('witnessing.absentThatDay')}${r.note ? ' · ' : ''}` : ''}
                  {r.note}
                </Text>
              )}
            </View>
          ))}
        </View>

        {!locked && (
          <View style={{ gap: 8 }}>
            {!day.over && (
              <Pressable style={styles.secondaryBtn} onPress={() => setAddOpen(true)}>
                <Text style={styles.secondaryBtnText}>{t('witnessing.addPerson')}</Text>
              </Pressable>
            )}
            <View style={styles.row2}>
              <Pressable
                style={styles.smallBtn}
                onPress={() => {
                  setHoursSpan(day);
                  setHoursOpen(true);
                }}
              >
                <Text style={styles.smallBtnText}>{t('witnessing.dayHours')}</Text>
              </Pressable>
              {!day.over && (
                <Pressable style={[styles.smallBtn, styles.amber]} onPress={() => setOffOpen(true)}>
                  <Text style={[styles.smallBtnText, { color: '#92400e' }]}>{t('witnessing.callOff')}</Text>
                </Pressable>
              )}
            </View>
            {(day.plan ?? []).length === 0 && (
              <Pressable
                style={styles.deleteBtn}
                onPress={async () => {
                  if (
                    await confirm({
                      title: t('witnessing.deleteDay'),
                      body: t('witnessing.deleteDayConfirm'),
                      confirmLabel: t('witnessing.deleteDay'),
                      cancelLabel: t('witnessing.cancel'),
                      danger: true,
                    })
                  )
                    deleteDay.mutate();
                }}
              >
                <Text style={styles.deleteText}>{t('witnessing.deleteDay')}</Text>
              </Pressable>
            )}
          </View>
        )}
      </KeyboardScroll>

      <UndoBar
        visible={!!undo}
        message={undo ? t('witnessing.takenOff', { name: undo.name }) : ''}
        onUndo={async () => {
          if (undo) await cartWeeksApi.assign(dayId, undo.body).then(refresh, err);
          setUndo(null);
        }}
        onDismiss={() => setUndo(null)}
      />

      {/* Another time for one already on the plan. */}
      <Sheet
        visible={!!timeFor}
        variant="bottom"
        title={timeFor ? t('witnessing.timeFor', { name: timeFor.name }) : ''}
        onClose={() => setTimeFor(null)}
        closeLabel={t('witnessing.cancel')}
        footer={
          <Pressable
            style={[styles.primaryBtn, (!newSpan || changeTime.isPending) && styles.dim]}
            disabled={!newSpan || changeTime.isPending}
            onPress={() => timeFor && newSpan && changeTime.mutate({ id: timeFor.id, span: newSpan })}
          >
            <Text style={styles.primaryBtnText}>{newSpan ? spanText(newSpan) : '—'}</Text>
          </Pressable>
        }
      >
        <SpanPicker day={day} value={newSpan} onChange={setNewSpan} />
      </Sheet>

      {/* Somebody who did not ask, or a guest. */}
      <Sheet
        visible={addOpen}
        variant="bottom"
        title={t('witnessing.addPerson')}
        onClose={() => setAddOpen(false)}
        closeLabel={t('witnessing.cancel')}
        footer={
          <Pressable
            style={[styles.primaryBtn, (!addSpan || (!addWho && !guest.trim()) || assign.isPending) && styles.dim]}
            disabled={!addSpan || (!addWho && !guest.trim()) || assign.isPending}
            onPress={() => {
              if (!addSpan) return;
              assign.mutate(
                addWho ? { publisherId: addWho, ...addSpan } : { externalName: guest.trim(), ...addSpan },
                {
                  onSuccess: () => {
                    setAddOpen(false);
                    setAddWho(null);
                    setGuest('');
                    setAddSpan(null);
                  },
                },
              );
            }}
          >
            <Text style={styles.primaryBtnText}>{t('witnessing.putOn')}</Text>
          </Pressable>
        }
      >
        <View style={{ gap: 12 }}>
          <PublisherSelector
            label={t('witnessing.publisher')}
            value={addWho}
            absenceDate={day.date}
            requiredCapability="public_witnessing"
            onChange={(id) => {
              setAddWho(id);
              if (id) setGuest('');
            }}
          />
          <View style={{ gap: 4 }}>
            <Text style={styles.fieldLabel}>{t('witnessing.orGuest')}</Text>
            <TextInput
              value={guest}
              onChangeText={(v) => {
                setGuest(v);
                if (v.trim()) setAddWho(null);
              }}
              maxLength={120}
              placeholder={t('witnessing.guestPlaceholder')}
              placeholderTextColor="#64748b"
              style={styles.input}
            />
          </View>
          <SpanPicker day={day} value={addSpan} onChange={setAddSpan} />
        </View>
      </Sheet>

      {/* The day, or part of it, called off. */}
      <Sheet
        visible={offOpen}
        variant="bottom"
        title={t('witnessing.callOff')}
        onClose={() => setOffOpen(false)}
        closeLabel={t('witnessing.cancel')}
        footer={
          <Pressable
            style={[styles.amberBtn, (cancelDay.isPending || (!offWhole && !offSpan)) && styles.dim]}
            disabled={cancelDay.isPending || (!offWhole && !offSpan)}
            onPress={() => cancelDay.mutate()}
          >
            <Text style={styles.primaryBtnText}>
              {offWhole ? t('witnessing.callOffDay') : t('witnessing.callOffPart', { time: offSpan ? spanText(offSpan) : '' })}
            </Text>
          </Pressable>
        }
      >
        <View style={{ gap: 12 }}>
          <View style={styles.row2}>
            <Pressable style={[styles.toggle, offWhole && styles.toggleOn]} onPress={() => setOffWhole(true)}>
              <Text style={[styles.toggleText, offWhole && styles.toggleTextOn]}>{t('witnessing.wholeDay')}</Text>
            </Pressable>
            <Pressable style={[styles.toggle, !offWhole && styles.toggleOn]} onPress={() => setOffWhole(false)}>
              <Text style={[styles.toggleText, !offWhole && styles.toggleTextOn]}>{t('witnessing.partOfDay')}</Text>
            </Pressable>
          </View>
          {!offWhole && <SpanPicker day={day} value={offSpan} onChange={setOffSpan} />}
          <Text style={styles.fieldLabel}>{t('witnessing.reasonOptional')}</Text>
          <View style={styles.row2}>
            {(['weather', 'unsafe'] as const).map((k) => (
              <Pressable key={k} style={styles.reasonChip} onPress={() => setReason(t(`witnessing.reasons.${k}`))}>
                <Text style={styles.reasonText}>{t(`witnessing.reasons.${k}`)}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={reason}
            onChangeText={setReason}
            maxLength={200}
            placeholder={t('witnessing.reasonPlaceholder')}
            placeholderTextColor="#64748b"
            style={styles.input}
          />
          <Text style={styles.small}>{t('witnessing.callOffNote')}</Text>
        </View>
      </Sheet>

      {/* The day's hours. */}
      <Sheet
        visible={hoursOpen}
        variant="bottom"
        title={t('witnessing.dayHours')}
        onClose={() => setHoursOpen(false)}
        closeLabel={t('witnessing.cancel')}
        footer={
          <Pressable
            style={[styles.primaryBtn, (!hoursSpan || dayHours.isPending) && styles.dim]}
            disabled={!hoursSpan || dayHours.isPending}
            onPress={() => hoursSpan && dayHours.mutate(hoursSpan)}
          >
            <Text style={styles.primaryBtnText}>{hoursSpan ? spanText(hoursSpan) : '—'}</Text>
          </Pressable>
        }
      >
        <SpanPicker
          day={{ startTime: '06:00', endTime: '21:00' }}
          value={hoursSpan}
          onChange={setHoursSpan}
          lengths={[60, 90, 120, 180, 240, 300, 360, 420, 480, 540]}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 14, paddingBottom: 90, gap: 10 },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 12, gap: 6 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between' },
  headText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#15803d' },
  headMuted: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b' },
  cover: { flexDirection: 'row', gap: 2 },
  coverCell: { flex: 1, height: 22, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  c2: { backgroundColor: '#15803d' },
  c1: { backgroundColor: '#f59e0b' },
  c0: { backgroundColor: '#e2e8f0' },
  cOff: { backgroundColor: '#cbd5e1', opacity: 0.6 },
  coverText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 10.5, color: '#ffffff' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: '#64748b' },
  locked: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#475569' },
  offRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fffbeb', borderRadius: 10, padding: 10 },
  offText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#92400e' },
  warn: { backgroundColor: '#fffbeb', borderRadius: 12, padding: 10, gap: 4 },
  warnText: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#92400e' },
  empty: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: '#64748b', textAlign: 'center', padding: 12 },
  personRow: { gap: 4, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  personName: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: '#0f172a' },
  personTime: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#475569' },
  personNote: { fontFamily: 'Manrope_400Regular', fontSize: 11.5, color: '#475569' },
  absent: { color: '#b91c1c' },
  track: { height: 10, borderRadius: 3, backgroundColor: '#f1f5f9', overflow: 'hidden', position: 'relative' },
  bar: { position: 'absolute', top: 0, bottom: 0 },
  barOn: { backgroundColor: '#15803d' },
  barWish: { backgroundColor: '#bbf7d0', borderWidth: 1.5, borderColor: '#15803d', borderStyle: 'dashed' },
  timeBtn: { padding: 6, borderRadius: 8, backgroundColor: '#f0f9ff' },
  offBtn: { backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  offBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: '#b91c1c' },
  onBtn: { backgroundColor: '#15803d', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  onBtnDim: { backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#cbd5e1' },
  onBtnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12.5, color: '#ffffff' },
  secondaryBtn: { borderWidth: 1.5, borderColor: '#15803d', borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#ffffff' },
  secondaryBtnText: { color: '#15803d', fontSize: 14.5, fontFamily: 'Manrope_700Bold' },
  row2: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  smallBtn: { flex: 1, borderWidth: 1.5, borderColor: '#0e7490', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#ffffff' },
  amber: { borderColor: '#b45309' },
  smallBtnText: { color: '#0e7490', fontSize: 13.5, fontFamily: 'Manrope_700Bold' },
  deleteBtn: { alignItems: 'center', paddingVertical: 12 },
  deleteText: { color: '#b91c1c', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  linkText: { color: '#0e7490', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  primaryBtn: { backgroundColor: '#15803d', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  amberBtn: { backgroundColor: '#b45309', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { color: '#ffffff', fontSize: 15.5, fontFamily: 'Manrope_800ExtraBold' },
  dim: { opacity: 0.5 },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: '#475569' },
  input: { fontFamily: 'Manrope_400Regular', fontSize: 15, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#0f172a' },
  toggle: { flex: 1, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  toggleOn: { backgroundColor: '#0e7490', borderColor: '#0e7490' },
  toggleText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#334155' },
  toggleTextOn: { color: '#ffffff' },
  reasonChip: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  reasonText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: '#334155' },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569', lineHeight: 18 },
});

