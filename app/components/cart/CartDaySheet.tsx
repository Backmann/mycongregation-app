import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Sheet } from '../Sheet';
import { SpanPicker } from './SpanPicker';
import { confirm } from '../ConfirmHost';
import { useLogActions, useLogOverview } from '../../lib/useServiceLog';
import { notify } from '../../lib/error-bus';
import {
  type CartDayView,
  type CartSpan,
  type CartWeekView,
  cartWeeksApi,
  extractErrorMessage,
} from '../../lib/api';
import {
  barOf,
  liveSpans,
  merge,
  minutes,
  overlaps,
  spanText,
  toHHMM,
} from '../../lib/cart-time';
import { formatDateISO } from '../../lib/dates';

/**
 * A day at the stand, for the one who stands (2 November 2026): who is there
 * and when, his own time with whom he stands, «Не смогу», and signing up —
 * «с какого времени» and «сколько» — once or again later the same day.
 */
export function CartDaySheet({
  week,
  day,
  onClose,
  onChanged,
}: {
  week: CartWeekView;
  day: CartDayView | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [span, setSpan] = useState<CartSpan | null>(null);
  const [note, setNote] = useState('');

  const now = new Date();
  const todayISO = formatDateISO(now);
  const nowHM = toHHMM(now.getHours() * 60 + now.getMinutes());
  const published = week.status === 'published';

  const err = (e: unknown) => notify(t('witnessing.actionError'), extractErrorMessage(e));
  const request = useMutation({
    mutationFn: (v: { dayId: string; span: CartSpan; note: string }) =>
      cartWeeksApi.request(v.dayId, {
        ...v.span,
        ...(v.note.trim() ? { withWhomNote: v.note.trim() } : {}),
      }),
    onSuccess: () => {
      setSpan(null);
      setNote('');
      onChanged();
    },
    onError: err,
  });
  const withdraw = useMutation({
    mutationFn: (id: string) => cartWeeksApi.withdraw(id),
    onSuccess: onChanged,
    onError: err,
  });
  const cancelMine = useMutation({
    mutationFn: (id: string) => cartWeeksApi.cancelMine(id),
    onSuccess: onChanged,
    onError: err,
  });
  // Only for whoever's report asks for hours that month (a pioneer); the
  // assignment's id is the entry's, so a second tap writes the same entry
  // again instead of counting the hours twice. Through the log's queue, so it
  // keeps without a connection.
  const logQ = useLogOverview();
  const { write: writeLog } = useLogActions();
  const logMonth = day ? logQ.months?.find((x) => x.month === day.date.slice(0, 7)) : undefined;
  const mayLog = !!logMonth?.role && logMonth.open;
  const logged = (id: string) => !!logMonth?.entries.some((e) => e.id === id);
  const logHours = useMutation({
    mutationFn: (v: { id: string; minutes: number }) =>
      writeLog(
        {
          day: day!.date,
          minutes: v.minutes,
          kind: 'field',
          note: t('witnessing.hoursNote', { place: day!.locationName }),
        },
        v.id,
      ),
    onSuccess: () => notify(t('witnessing.hoursAdded'), undefined, 'success'),
    onError: err,
  });

  // Who is there: the plan once published, the wishes while sign-up is open.
  const people = useMemo(() => {
    if (!day) return [];
    if (published) return (day.plan ?? []).map((p) => ({ name: p.name, span: p as CartSpan, mine: day.mine.some((m) => m.id === p.id) }));
    return (day.wishes ?? []).map((w) => ({ name: w.name, span: w as CartSpan, mine: day.myRequests.some((r) => r.id === w.id) }));
  }, [day, published]);

  if (!day) return null;
  const notBefore = day.date === todayISO ? nowHM : null;
  const mineSpans = merge(liveSpans(day, day.mine));
  const withMe = (s: CartSpan) =>
    (day.plan ?? []).filter((p) => !day.mine.some((m) => m.id === p.id) && overlaps(p, s));
  const along = span
    ? people.filter((p) => !p.mine && overlaps(p.span, span)).map((p) => p.name)
    : [];
  const canSign = week.canApply && week.status !== 'draft' && !day.over;
  const date = new Date(`${day.date}T12:00:00`).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Sheet
      visible={!!day}
      variant="bottom"
      title={date.charAt(0).toLocaleUpperCase(i18n.language) + date.slice(1)}
      subtitle={
        <Text style={styles.place}>
          {day.locationName} · {t(`cartLocations.kinds.${day.locationKind}`)} · {spanText(day)}
        </Text>
      }
      closeLabel={t('witnessing.close')}
      onClose={() => {
        setSpan(null);
        onClose();
      }}
      footer={
        canSign && span ? (
          <Pressable
            style={[styles.primary, request.isPending && styles.dim]}
            disabled={request.isPending}
            onPress={() => request.mutate({ dayId: day.id, span, note })}
          >
            <Text style={styles.primaryText}>
              {t('witnessing.signUpFor', { time: spanText(span) })}
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      <View style={{ gap: 14 }}>
        {!!day.equipmentAt && (
          <Text style={styles.small}>{t('witnessing.equipment', { place: day.equipmentAt })}</Text>
        )}
        {day.cancellations.map((c) => (
          <Text key={c.id} style={styles.off}>
            {t('witnessing.calledOff', { time: spanText(c) })}
            {c.reason ? ` · ${c.reason}` : ''}
          </Text>
        ))}

        {/* My own time at the stand, with whom. */}
        {published &&
          mineSpans.map((s) => {
            const own = day.mine.filter((m) => overlaps(m, s));
            const partners = withMe(s);
            const over = day.over || (day.date === todayISO && s.endTime <= nowHM);
            return (
              <View key={s.startTime} style={styles.mineBox}>
                <Text style={styles.mineTitle}>{t(over ? 'witnessing.youStood' : 'witnessing.youStand', { time: spanText(s) })}</Text>
                <Text style={styles.small}>
                  {partners.length
                    ? t('witnessing.together', {
                        names: partners
                          .map((p) =>
                            p.startTime === s.startTime && p.endTime === s.endTime
                              ? p.name
                              : `${p.name} (${spanText(p)})`,
                          )
                          .join(', '),
                      })
                    : t('witnessing.aloneSoFar')}
                </Text>
                {!over &&
                  own.map((m) => (
                    <Pressable
                      key={m.id}
                      style={styles.cannot}
                      disabled={cancelMine.isPending}
                      onPress={async () => {
                        if (
                          await confirm({
                            title: t('witnessing.cannotTitle'),
                            body: t('witnessing.cannotBody', { time: spanText(m) }),
                            confirmLabel: t('witnessing.cannot'),
                            cancelLabel: t('witnessing.keep'),
                            danger: true,
                          })
                        )
                          cancelMine.mutate(m.id);
                      }}
                    >
                      <Text style={styles.cannotText}>{t('witnessing.cannot')}</Text>
                    </Pressable>
                  ))}
                {over &&
                  mayLog &&
                  own.map((m) =>
                    logged(m.id) ? (
                      <Text key={m.id} style={styles.small}>
                        {t('witnessing.hoursInLog')}
                      </Text>
                    ) : (
                    <Pressable
                      key={m.id}
                      style={styles.secondary}
                      disabled={logHours.isPending}
                      onPress={() => logHours.mutate({ id: m.id, minutes: minutes(m) })}
                    >
                      <Text style={styles.secondaryText}>
                        {t('witnessing.addHours', { hours: String(minutes(m) / 60).replace('.', ',') })}
                      </Text>
                    </Pressable>
                    ),
                  )}
              </View>
            );
          })}

        {/* Who is there, and when. */}
        <View style={{ gap: 6 }}>
          <Text style={styles.section}>
            {published ? t('witnessing.whoStands') : t('witnessing.whoSigned')}
          </Text>
          {people.length === 0 ? (
            <Text style={styles.small}>{t('witnessing.nobodyYet')}</Text>
          ) : (
            people.map((p, i) => (
              <View key={i} style={styles.person}>
                <Text style={[styles.name, p.mine && styles.nameMine]} numberOfLines={1}>
                  {p.mine ? t('witnessing.you') : p.name}
                </Text>
                <View style={styles.track}>
                  {/* What is called off stays in its place, grey. */}
                  <View style={[styles.bar, styles.barOff, barOf(day, p.span)]} />
                  {liveSpans(day, [p.span]).map((x) => (
                    <View key={x.startTime} style={[styles.bar, p.mine ? styles.barMine : styles.barOther, barOf(day, x)]} />
                  ))}
                </View>
                <Text style={styles.time}>{spanText(p.span)}</Text>
              </View>
            ))
          )}
        </View>

        {/* My wishes, each can be taken back. */}
        {day.myRequests.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={styles.section}>{t('witnessing.myWishes')}</Text>
            {day.myRequests.map((r) => (
              <View key={r.id} style={styles.wish}>
                <Text style={styles.name}>{spanText(r)}</Text>
                <Pressable onPress={() => withdraw.mutate(r.id)} disabled={withdraw.isPending}>
                  <Text style={styles.link}>{t('witnessing.withdraw')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {canSign ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.section}>{t('witnessing.whenCan')}</Text>
            <SpanPicker day={day} value={span} onChange={setSpan} notBefore={notBefore} />
            {span && (
              <Text style={styles.preview}>
                {along.length
                  ? t('witnessing.alongWith', { time: spanText(span), names: along.join(', ') })
                  : t('witnessing.alongNobody', { time: spanText(span) })}
              </Text>
            )}
            {span && (
              <View style={{ gap: 4 }}>
                <Text style={styles.small}>{t('witnessing.withWhomLabel')}</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  maxLength={200}
                  placeholder={t('witnessing.withWhomPlaceholder')}
                  placeholderTextColor="#64748b"
                  style={styles.input}
                />
              </View>
            )}
            <Text style={styles.small}>{t('witnessing.againLater')}</Text>
          </View>
        ) : !week.canApply && week.status !== 'draft' && !day.over ? (
          <Text style={styles.small}>{t('witnessing.notApproved')}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  place: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#15803d' },
  section: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569', lineHeight: 18 },
  off: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#92400e', backgroundColor: '#fffbeb', borderRadius: 8, padding: 8 },
  mineBox: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, gap: 6 },
  mineTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#14532d' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { width: 124, fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: '#0f172a' },
  nameMine: { fontFamily: 'Manrope_800ExtraBold', color: '#14532d' },
  track: { flex: 1, height: 12, borderRadius: 4, backgroundColor: '#f1f5f9', overflow: 'hidden', position: 'relative' },
  bar: { position: 'absolute', top: 0, bottom: 0 },
  barMine: { backgroundColor: '#15803d' },
  barOther: { backgroundColor: '#86efac' },
  barOff: { backgroundColor: '#cbd5e1' },
  time: { width: 82, textAlign: 'right', fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#475569' },
  wish: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#b91c1c' },
  preview: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#14532d', backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, lineHeight: 20 },
  input: { fontFamily: 'Manrope_400Regular', fontSize: 15, borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#0f172a' },
  primary: { backgroundColor: '#15803d', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#ffffff' },
  dim: { opacity: 0.5 },
  cannot: { borderWidth: 1.5, borderColor: '#dc2626', borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: '#ffffff' },
  cannotText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#b91c1c' },
  secondary: { borderWidth: 1.5, borderColor: '#15803d', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#ffffff' },
  secondaryText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#15803d' },
});

