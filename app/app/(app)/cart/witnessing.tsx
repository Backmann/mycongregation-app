import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { useCartSheetVariant } from '../../../lib/cart-sheet';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CartDayView,
  type CartSpan,
  type CartWeekView,
  cartLocationsApi,
  cartWeeksApi,
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { useMayOpen } from '../../../lib/useMayOpen';
import { Sheet } from '../../../components/Sheet';
import { Dialog } from '../../../components/Dialog';
import { DateField } from '../../../components/DateField';
import { CartDayStrip } from '../../../components/cart/CartDayStrip';
import { CartDaySheet } from '../../../components/cart/CartDaySheet';
import {
  addDays,
  addWeeks,
  formatDateISO,
  parseISODate,
  startOfWeekMonday,
} from '../../../lib/dates';
import { notify } from '../../../lib/error-bus';
import { confirm } from '../../../components/ConfirmHost';
import { failsScreen } from '../../../lib/screen-failure';
import { formatDayRange } from '../../../lib/date-range';
import { liveSpans, merge, overlaps, spanText, toHHMM, toMin } from '../../../lib/cart-time';
import { planHtml, planText } from '../../../lib/cart-plan';
import { exportHtmlAsPdf } from '../../../lib/pdf';
import { appFontFaces } from '../../../lib/print-fonts';

/**
 * Служение в общественных местах — the week (rewritten 2 November 2026).
 *
 * A week is days: a place on a date with its hours. Whoever stands says when
 * he can — «с какого времени» and «сколько» — as in the poll the group used
 * in WhatsApp; whoever arranges puts the plan together and publishes it, and
 * each person is told his own time and with whom. Before publication the
 * others see who marked which time; after it, who stands.
 */

const HOURS: string[] = (() => {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 21 * 60; m += 30) out.push(toHHMM(m));
  return out;
})();
const DOW = [1, 2, 3, 4, 5, 6, 7];

function cap(s: string, locale: string): string {
  return s.charAt(0).toLocaleUpperCase(locale) + s.slice(1);
}

export default function WitnessingScreen() {
  const { t, i18n } = useTranslation();
  const sheetVariant = useCartSheetVariant();
  const locale = i18n.language;
  const router = useRouter();
  const perms = usePermissions();
  const queryClient = useQueryClient();
  const mayOpen = useMayOpen();
  const mayArrange = perms.canEditCartWitnessing || perms.canEditFieldServiceMeetings;

  // A notification about a week opens that week.
  const { week: weekParam } = useLocalSearchParams<{ week?: string }>();
  const [monday, setMonday] = useState<Date>(() =>
    startOfWeekMonday(
      typeof weekParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)
        ? parseISODate(weekParam)
        : new Date(),
    ),
  );
  // …also when the screen is already open underneath.
  useEffect(() => {
    if (typeof weekParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
      setMonday(startOfWeekMonday(parseISODate(weekParam)));
    }
  }, [weekParam]);
  const weekISO = formatDateISO(monday);
  const thisMonday = formatDateISO(startOfWeekMonday(new Date()));
  const nextMonday = formatDateISO(addWeeks(startOfWeekMonday(new Date()), 1));

  const [sheetDayId, setSheetDayId] = useState<{ week: string; day: string } | null>(null);
  const [showBuild, setShowBuild] = useState(false);
  const [showOpen, setShowOpen] = useState(false);
  const [showMemo, setShowMemo] = useState(false);
  const [memo, setMemo] = useState('');
  const [deadline, setDeadline] = useState('');
  const [bDays, setBDays] = useState<number[]>([]);
  const [bLocations, setBLocations] = useState<string[]>([]);
  const [bFrom, setBFrom] = useState('09:00');
  const [bTo, setBTo] = useState('16:00');

  const weekQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: ['cart-week', weekISO],
    queryFn: () => cartWeeksApi.getWeek(weekISO),
  });
  const week = weekQuery.data ?? null;
  // «Мои смены»: this week and the next — and the week on screen, when it is
  // a later one (walk of 2 November 2026: a brother looking at a week three
  // weeks out saw his shifts of the next two, not of the week before him).
  const mineWeeks = [...new Set([thisMonday, nextMonday, ...(weekISO > nextMonday ? [weekISO] : [])])];
  const mineQs = useQueries({
    queries: mineWeeks.map((w) => ({
      queryKey: ['cart-week', w],
      queryFn: () => cartWeeksApi.getWeek(w),
    })),
  });
  const locationsQuery = useQuery({
    queryKey: ['cart-locations', false],
    queryFn: () => cartLocationsApi.list(false),
    enabled: showBuild,
  });

  const canManage = week ? week.canManage : mayArrange;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['cart-week'] });
  const err = (e: unknown) => notify(t('witnessing.actionError'), extractErrorMessage(e));

  const build = useMutation({
    mutationFn: () =>
      cartWeeksApi.build({
        weekStartDate: weekISO,
        startTime: bFrom,
        endTime: bTo,
        daysOfWeek: bDays,
        locationIds: bLocations,
      }),
    onSuccess: () => {
      setShowBuild(false);
      refresh();
    },
    onError: err,
  });
  const copy = useMutation({
    mutationFn: () => cartWeeksApi.copy(weekISO),
    onSuccess: (r) => {
      notify(t('witnessing.copied', { count: r.added }), undefined, 'success');
      refresh();
    },
    onError: err,
  });
  const open = useMutation({
    mutationFn: (id: string) => cartWeeksApi.open(id, deadline || undefined),
    onSuccess: () => {
      setShowOpen(false);
      refresh();
    },
    onError: err,
  });
  const publish = useMutation({
    mutationFn: (id: string) => cartWeeksApi.publish(id),
    onSuccess: refresh,
    onError: err,
  });
  const suggest = useMutation({
    mutationFn: (id: string) => cartWeeksApi.suggest(id),
    onSuccess: (r) => {
      notify(t('witnessing.suggested', { count: r.added }), undefined, 'success');
      refresh();
    },
    onError: err,
  });
  const remove = useMutation({
    mutationFn: (id: string) => cartWeeksApi.remove(id),
    onSuccess: refresh,
    onError: err,
  });
  const saveMemo = useMutation({
    mutationFn: () => cartWeeksApi.setMemo(memo.trim() || null),
    onSuccess: () => {
      setShowMemo(false);
      refresh();
    },
    onError: err,
  });

  const dayTitle = (iso: string) =>
    cap(
      parseISODate(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }),
      locale,
    );
  const shortDay = (iso: string) =>
    cap(parseISODate(iso).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }), locale);

  // My own time at the stand, ahead: this week and the next.
  const now = new Date();
  const todayISO = formatDateISO(now);
  const nowHM = toHHMM(now.getHours() * 60 + now.getMinutes());
  // The three nearest first (2 November 2026): with many shifts ahead the
  // list pushed the week itself off the screen.
  const [allMine, setAllMine] = useState(false);
  const myShifts = useMemo(() => {
    const out: { week: CartWeekView; day: CartDayView; span: CartSpan; with: string[] }[] = [];
    for (const q of mineQs) {
      const w = q.data;
      if (!w || w.status !== 'published') continue;
      for (const d of w.days) {
        for (const s of merge(liveSpans(d, d.mine))) {
          if (d.date < todayISO || (d.date === todayISO && s.endTime <= nowHM)) continue;
          const others = (d.plan ?? []).filter(
            (p) => !d.mine.some((m) => m.id === p.id) && overlaps(p, s),
          );
          out.push({
            week: w,
            day: d,
            span: s,
            with: others.map((p) =>
              p.startTime === s.startTime && p.endTime === s.endTime ? p.name : `${p.name} (${spanText(p)})`,
            ),
          });
        }
      }
    }
    return out.sort((a, b) => `${a.day.date}${a.span.startTime}`.localeCompare(`${b.day.date}${b.span.startTime}`));
  }, [mineQs, todayISO, nowHM]);

  const weeksById = new Map<string, CartWeekView>();
  for (const w of [week, ...mineQs.map((q) => q.data ?? null)]) if (w) weeksById.set(w.weekStartDate, w);
  const sheetWeek = sheetDayId ? weeksById.get(sheetDayId.week) ?? null : null;
  const sheetDay = sheetWeek?.days.find((d) => d.id === sheetDayId?.day) ?? null;

  const statusLine = (): string => {
    if (!week) return '';
    if (week.status === 'published') return t('witnessing.statusPublished');
    if (week.status === 'collecting')
      return week.signupUntil
        ? t('witnessing.statusCollectingUntil', { date: shortDay(week.signupUntil) })
        : t('witnessing.statusCollecting');
    return t('witnessing.statusDraft');
  };

  const sharePlan = async () => {
    if (!week) return;
    const words = {
      title: `${t('service.publicWitnessing')} · ${formatDayRange(weekISO, formatDateISO(addDays(monday, 6)), locale, { month: 'short', year: 'never' })}`,
      nobody: '—',
      calledOff: t('witnessing.calledOffShort'),
      dayLabel: shortDay,
    };
    const text = planText(week, words);
    try {
      if (Platform.OS === 'web' && !(navigator as { share?: unknown }).share) {
        await navigator.clipboard.writeText(text);
        notify(t('witnessing.textCopied'), undefined, 'success');
      } else {
        await Share.share({ message: text });
      }
    } catch {
      // The reader closed the share sheet: nothing to say.
    }
  };
  const planPdf = async () => {
    if (!week) return;
    const html = planHtml(
      week,
      {
        title: `${t('service.publicWitnessing')} · ${formatDayRange(weekISO, formatDateISO(addDays(monday, 6)), locale, { month: 'short', year: 'never' })}`,
        nobody: '—',
        calledOff: t('witnessing.calledOffShort'),
        dayLabel: shortDay,
      },
      appFontFaces(),
    );
    const r = await exportHtmlAsPdf(html, { fileName: t('witnessing.pdfName'), landscape: true });
    if (!r.ok && r.reason === 'popup_blocked') notify(t('witnessing.popupBlocked'));
  };

  const people = (d: CartDayView): CartSpan[] =>
    week?.status === 'published' || canManage
      ? (d.plan ?? []).filter((p) => !d.mine.some((m) => m.id === p.id))
      : (d.wishes ?? []).filter((w) => !d.myRequests.some((r) => r.id === w.id));
  const myOn = (d: CartDayView): CartSpan[] =>
    week?.status === 'published' ? d.mine : d.myRequests;

  const dayNote = (d: CartDayView): string => {
    const off = d.cancellations.length
      ? ` · ${t('witnessing.partOff')}`
      : '';
    if (canManage) {
      const wishes = (d.wishes ?? []).length;
      const alone = d.warnings?.alone.length ?? 0;
      // Once the plan has people, it is what the arranger reads first.
      const onPlan = new Set((d.plan ?? []).map((p) => p.publisherId ?? p.name)).size;
      const what = [
        ...(onPlan || week?.status === 'published' ? [t('witnessing.planCount', { count: onPlan })] : []),
        ...(week?.status !== 'published' ? [t('witnessing.wishesCount', { count: wishes })] : []),
      ].join(' · ');
      return `${spanText(d)} · ${what}${
        alone ? ` · ${t('witnessing.aloneCount', { count: alone })}` : ''
      }${off}`;
    }
    const mine = myOn(d);
    const others = people(d);
    const head = mine.length
      ? t(week?.status === 'published' ? 'witnessing.youAt' : 'witnessing.youAsked', {
          time: merge(mine).map(spanText).join(', '),
        })
      : others.length
        ? t('witnessing.othersCount', { count: new Set((week?.status === 'published' ? d.plan ?? [] : d.wishes ?? []).map((p) => p.name)).size })
        : t('witnessing.nobodyYet');
    return `${spanText(d)} · ${head}${off}`;
  };

  const visible = week && !(week.status === 'draft' && !canManage);
  const hasPeople = !!week && week.days.some((d) => (d.plan ?? []).length > 0);

  return (
    <KeyboardScroll style={styles.container} contentContainerStyle={styles.content}>
      {canManage && (
        <Pressable style={styles.placesRow} onPress={() => router.push('/cart/locations' as never)}>
          <View style={styles.placesIcon}>
            <Ionicons name="location-outline" size={18} color="#0369a1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.placesTitle}>{t('service.locations')}</Text>
            <Text style={styles.placesSub}>{t('service.locationsSubtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </Pressable>
      )}

      {(!!week?.memo || canManage) && (
        <Pressable
          style={styles.memo}
          disabled={!canManage}
          onPress={() => {
            setMemo(week?.memo ?? '');
            setShowMemo(true);
          }}
        >
          <Ionicons name="information-circle-outline" size={18} color="#0e7490" />
          <Text style={styles.memoText}>{week?.memo || t('witnessing.memoEmpty')}</Text>
          {canManage && <Ionicons name="create-outline" size={16} color="#64748b" />}
        </Pressable>
      )}

      {myShifts.length > 0 && (
        <View style={styles.mineCard}>
          <Text style={styles.mineHeader}>{t('witnessing.myShifts')}</Text>
          {(allMine ? myShifts : myShifts.slice(0, MINE_SHOWN)).map((m) => (
            <Pressable
              key={`${m.day.id}${m.span.startTime}`}
              style={styles.mineRow}
              onPress={() => setSheetDayId({ week: m.week.weekStartDate, day: m.day.id })}
            >
              <View style={styles.dot} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.mineWhen}>
                  {shortDay(m.day.date)}, {spanText(m.span)}
                </Text>
                <Text style={styles.minePlace}>
                  {m.day.locationName} · {t(`cartLocations.kinds.${m.day.locationKind}`)}
                </Text>
                <Text style={styles.mineWith}>
                  {m.with.length ? t('witnessing.together', { names: m.with.join(', ') }) : t('witnessing.aloneSoFar')}
                </Text>
                {!!m.day.equipmentAt && (
                  <Text style={styles.mineWith}>{t('witnessing.equipment', { place: m.day.equipmentAt })}</Text>
                )}
              </View>
            </Pressable>
          ))}
          {myShifts.length > MINE_SHOWN && (
            <Pressable style={styles.mineMore} onPress={() => setAllMine((v) => !v)}>
              <Text style={styles.linkText}>
                {allMine ? t('witnessing.mineLess') : t('witnessing.mineMore', { count: myShifts.length - MINE_SHOWN })}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.weekNav}>
        <Pressable
          accessibilityLabel={t('witnessing.prevWeek')}
          onPress={() => setMonday((m) => addWeeks(m, -1))}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#0e7490" />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.weekTitle}>
            {formatDayRange(weekISO, formatDateISO(addDays(monday, 6)), locale, { month: 'short', year: 'never' })}
          </Text>
          {!!visible && <Text style={styles.statusText}>{statusLine()}</Text>}
        </View>
        <Pressable
          accessibilityLabel={t('witnessing.nextWeek')}
          onPress={() => setMonday((m) => addWeeks(m, 1))}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-forward" size={22} color="#0e7490" />
        </Pressable>
      </View>

      {canManage && week && (
        <View style={styles.steps}>
          {(['draft', 'collecting', 'published'] as const).map((s, i) => {
            const at = ['draft', 'collecting', 'published'].indexOf(week.status);
            const done = i < at || (s === 'published' && at === 2);
            const now2 = i === at && s !== 'published';
            return (
              <View key={s} style={styles.step}>
                <View style={[styles.stepDot, done && styles.stepDone, now2 && styles.stepNow]}>
                  <Text style={[styles.stepNum, (done || now2) && styles.stepNumOn]}>
                    {done ? '✓' : String(i + 1)}
                  </Text>
                </View>
                <Text style={[styles.stepText, now2 && styles.stepTextNow, done && styles.stepTextDone]}>
                  {t(`witnessing.steps.${s}`)}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {weekQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#0e7490" />
      ) : !visible ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('witnessing.notOpen')}</Text>
          {canManage && (
            <View style={{ gap: 10, alignSelf: 'stretch' }}>
              <Pressable style={styles.primaryBtn} onPress={() => setShowBuild(true)}>
                <Text style={styles.primaryBtnText}>{t('witnessing.addDays')}</Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} disabled={copy.isPending} onPress={() => copy.mutate()}>
                <Text style={styles.secondaryBtnText}>{t('witnessing.repeatLastWeek')}</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <>
          {week!.days.length === 0 && <Text style={styles.emptyText}>{t('witnessing.noDays')}</Text>}
          {week!.days.map((d) => (
            <Pressable
              key={d.id}
              style={styles.dayCard}
              onPress={() =>
                canManage && mayOpen('/cart/witnessing-day')
                  ? router.push({ pathname: '/cart/witnessing-day', params: { week: weekISO, day: d.id } } as never)
                  : setSheetDayId({ week: weekISO, day: d.id })
              }
            >
              <View style={styles.dayHead}>
                <Text style={styles.dayTitle}>{dayTitle(d.date)}</Text>
                <Text style={styles.dayPlace}>
                  {d.locationName} · {t(`cartLocations.kinds.${d.locationKind}`)}
                </Text>
              </View>
              <CartDayStrip day={d} others={people(d)} mine={canManage ? [] : myOn(d)} />
              <View style={styles.axis}>
                <Text style={styles.axisText}>{d.startTime}</Text>
                <Text style={styles.axisText}>{d.endTime}</Text>
              </View>
              <Text style={styles.dayNote}>{dayNote(d)}</Text>
            </Pressable>
          ))}
          {!canManage && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendBox, { backgroundColor: '#15803d' }]} />
                <Text style={styles.legendText}>{t('witnessing.legendYou')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendBox, { backgroundColor: '#86efac' }]} />
                <Text style={styles.legendText}>{t('witnessing.legendOthers')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendBox, { backgroundColor: '#cbd5e1' }]} />
                <Text style={styles.legendText}>{t('witnessing.legendOff')}</Text>
              </View>
            </View>
          )}

          {canManage && week && (
            <View style={{ gap: 8, marginTop: 8 }}>
              {week.status === 'collecting' && (
                <Pressable
                  style={styles.greenBtn}
                  disabled={suggest.isPending}
                  onPress={() => suggest.mutate(week.id)}
                >
                  <Text style={styles.primaryBtnText}>{t('witnessing.suggest')}</Text>
                </Pressable>
              )}
              {week.status === 'draft' && (
                <Pressable style={styles.primaryBtn} onPress={() => setShowOpen(true)}>
                  <Text style={styles.primaryBtnText}>{t('witnessing.openSignup')}</Text>
                </Pressable>
              )}
              {week.status === 'collecting' && (
                <Pressable
                  style={styles.primaryBtn}
                  disabled={publish.isPending}
                  onPress={async () => {
                    if (
                      await confirm({
                        title: t('witnessing.publish'),
                        body: [
                          t('witnessing.publishConfirm'),
                          // Soft, as agreed: said before it goes out, never a refusal.
                          ...(() => {
                            const alone = week.days.reduce((n, d) => n + (d.warnings?.alone.length ?? 0), 0);
                            const empty = week.days.filter((d) => liveSpans(d, d.plan ?? []).length === 0 && d.cancellations.length === 0).length;
                            return [
                              ...(alone ? [t('witnessing.publishAlone', { count: alone })] : []),
                              ...(empty ? [t('witnessing.publishEmpty', { count: empty })] : []),
                            ];
                          })(),
                        ].join('\n\n'),
                        confirmLabel: t('witnessing.publish'),
                        cancelLabel: t('witnessing.cancel'),
                      })
                    )
                      publish.mutate(week.id);
                  }}
                >
                  <Text style={styles.primaryBtnText}>{t('witnessing.publish')}</Text>
                </Pressable>
              )}
              <View style={styles.row3}>
                <Pressable style={styles.smallBtn} onPress={() => setShowBuild(true)}>
                  <Text style={styles.smallBtnText}>{t('witnessing.addDay')}</Text>
                </Pressable>
                <Pressable style={styles.smallBtn} onPress={sharePlan}>
                  <Text style={styles.smallBtnText}>{t('witnessing.shareText')}</Text>
                </Pressable>
                <Pressable style={styles.smallBtn} onPress={planPdf}>
                  <Text style={styles.smallBtnText}>{t('witnessing.sharePdf')}</Text>
                </Pressable>
              </View>
              {mayOpen('/cart/witnessing-archive') && (
                <Pressable style={styles.linkRow} onPress={() => router.push('/cart/witnessing-archive' as never)}>
                  <Ionicons name="archive-outline" size={18} color="#0e7490" />
                  <Text style={styles.linkText}>{t('witnessing.archive')}</Text>
                </Pressable>
              )}
              {!(week.status === 'published' && hasPeople) && (
                <Pressable
                  style={styles.deleteWeekBtn}
                  onPress={async () => {
                    if (
                      await confirm({
                        title: t('witnessing.deleteWeek'),
                        body: t('witnessing.deleteWeekConfirm'),
                        confirmLabel: t('witnessing.deleteWeek'),
                        cancelLabel: t('witnessing.cancel'),
                        danger: true,
                      })
                    )
                      remove.mutate(week.id);
                  }}
                >
                  <Text style={styles.deleteWeekText}>{t('witnessing.deleteWeek')}</Text>
                </Pressable>
              )}
            </View>
          )}
          {!canManage && week?.status === 'published' && (
            <Pressable style={styles.smallBtnWide} onPress={sharePlan}>
              <Text style={styles.smallBtnText}>{t('witnessing.shareText')}</Text>
            </Pressable>
          )}
        </>
      )}

      {sheetWeek && (
        <CartDaySheet
          week={sheetWeek}
          day={sheetDay}
          onClose={() => setSheetDayId(null)}
          onChanged={refresh}
        />
      )}

      {/* Days: which weekdays, which places, which hours. */}
      <Sheet
        visible={showBuild}
        variant={sheetVariant}
        title={t('witnessing.addDays')}
        onClose={() => setShowBuild(false)}
        closeLabel={t('witnessing.cancel')}
        footer={
          <Pressable
            style={[styles.primaryBtn, (bDays.length === 0 || bLocations.length === 0 || build.isPending) && styles.dim]}
            disabled={bDays.length === 0 || bLocations.length === 0 || build.isPending}
            onPress={() => build.mutate()}
          >
            <Text style={styles.primaryBtnText}>{t('witnessing.add')}</Text>
          </Pressable>
        }
      >
        <View style={{ gap: 10 }}>
          <Text style={styles.fieldLabel}>{t('witnessing.days')}</Text>
          <View style={styles.wrap}>
            {DOW.map((d) => (
              <Pressable
                key={d}
                onPress={() => setBDays((a) => (a.includes(d) ? a.filter((x) => x !== d) : [...a, d]))}
                style={[styles.chip, bDays.includes(d) && styles.chipOn]}
              >
                <Text style={[styles.chipText, bDays.includes(d) && styles.chipTextOn]}>{t(`witnessing.dow.${d}`)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>{t('witnessing.places')}</Text>
          {locationsQuery.isLoading ? (
            <ActivityIndicator color="#0e7490" />
          ) : (locationsQuery.data ?? []).length === 0 ? (
            <Pressable onPress={() => router.push('/cart/locations' as never)}>
              <Text style={styles.linkText}>{t('witnessing.noLocations')}</Text>
            </Pressable>
          ) : (
            <View style={styles.wrap}>
              {(locationsQuery.data ?? []).map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() =>
                    setBLocations((a) => (a.includes(l.id) ? a.filter((x) => x !== l.id) : [...a, l.id]))
                  }
                  style={[styles.chip, bLocations.includes(l.id) && styles.chipOn]}
                >
                  <Text style={[styles.chipText, bLocations.includes(l.id) && styles.chipTextOn]}>{l.name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={styles.fieldLabel}>{t('witnessing.hoursFrom')}</Text>
          <View style={styles.wrap}>
            {HOURS.filter((h) => toMin(h) + 60 <= 21 * 60).map((h) => (
              <Pressable
                key={h}
                onPress={() => {
                  setBFrom(h);
                  if (toMin(bTo) < toMin(h) + 60) setBTo(toHHMM(toMin(h) + 60));
                }}
                style={[styles.timeChip, bFrom === h && styles.chipOn]}
              >
                <Text style={[styles.chipText, bFrom === h && styles.chipTextOn]}>{h}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.fieldLabel}>{t('witnessing.hoursTo')}</Text>
          <View style={styles.wrap}>
            {HOURS.filter((h) => toMin(h) >= toMin(bFrom) + 60).map((h) => (
              <Pressable key={h} onPress={() => setBTo(h)} style={[styles.timeChip, bTo === h && styles.chipOn]}>
                <Text style={[styles.chipText, bTo === h && styles.chipTextOn]}>{h}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Sheet>

      {/* Sign-up opened, with its last day. */}
      <Dialog
        visible={showOpen}
        title={t('witnessing.openSignup')}
        confirmLabel={t('witnessing.openSignup')}
        cancelLabel={t('witnessing.cancel')}
        onCancel={() => setShowOpen(false)}
        onConfirm={() => week && open.mutate(week.id)}
        pending={open.isPending}
      >
        <View style={{ gap: 8 }}>
          <Text style={styles.small}>{t('witnessing.openBody')}</Text>
          <DateField label={t('witnessing.deadline')} value={deadline} onChange={setDeadline} />
        </View>
      </Dialog>

      {/* The memo for everyone who stands. */}
      <Dialog
        visible={showMemo}
        title={t('witnessing.memoTitle')}
        confirmLabel={t('witnessing.save')}
        cancelLabel={t('witnessing.cancel')}
        onCancel={() => setShowMemo(false)}
        onConfirm={() => saveMemo.mutate()}
        pending={saveMemo.isPending}
      >
        <TextInput
          value={memo}
          onChangeText={setMemo}
          multiline
          maxLength={2000}
          placeholder={t('witnessing.memoPlaceholder')}
          placeholderTextColor="#64748b"
          style={styles.memoInput}
        />
      </Dialog>
    </KeyboardScroll>
  );
}

const MINE_SHOWN = 3;

const styles = StyleSheet.create({
  mineMore: { alignSelf: 'flex-start', paddingVertical: 8 },
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  placesRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  placesIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#e0f2fe', alignItems: 'center', justifyContent: 'center' },
  placesTitle: { fontSize: 14.5, color: '#0c4a6e', fontFamily: 'Manrope_600SemiBold' },
  placesSub: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#0369a1', marginTop: 1 },
  memo: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: '#ffffff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  memoText: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: '#334155', lineHeight: 19 },
  memoInput: { fontFamily: 'Manrope_400Regular', fontSize: 15, minHeight: 120, textAlignVertical: 'top', borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, color: '#0f172a' },
  mineCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: '#dcfce7' },
  mineHeader: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#0f172a' },
  mineRow: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 10, backgroundColor: '#f0fdf4' },
  dot: { marginTop: 6, width: 9, height: 9, borderRadius: 5, backgroundColor: '#4ade80' },
  mineWhen: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  minePlace: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#15803d' },
  mineWith: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#334155' },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { padding: 10 },
  weekTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  statusText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: '#0e7490', marginTop: 2, textAlign: 'center' },
  steps: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 14, padding: 12 },
  step: { flex: 1, alignItems: 'center', gap: 4 },
  stepDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  stepDone: { backgroundColor: '#15803d', borderColor: '#15803d' },
  stepNow: { borderColor: '#0e7490', borderWidth: 2.5 },
  stepNum: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#64748b' },
  stepNumOn: { color: '#ffffff' },
  stepText: { fontFamily: 'Manrope_700Bold', fontSize: 11.5, color: '#64748b', textAlign: 'center' },
  stepTextNow: { color: '#0e7490' },
  stepTextDone: { color: '#15803d' },
  emptyBox: { alignItems: 'center', marginTop: 24, gap: 16 },
  emptyText: { fontFamily: 'Manrope_400Regular', textAlign: 'center', color: '#64748b', marginTop: 8 },
  dayCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 12, gap: 7, borderWidth: 1, borderColor: '#e2e8f0' },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  dayTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#0f172a' },
  dayPlace: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#15803d' },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: '#64748b' },
  dayNote: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#334155' },
  legend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendBox: { width: 14, height: 10, borderRadius: 3 },
  legendText: { fontFamily: 'Manrope_400Regular', fontSize: 11.5, color: '#475569' },
  primaryBtn: { backgroundColor: '#0e7490', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  greenBtn: { backgroundColor: '#15803d', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { color: '#ffffff', fontSize: 15.5, fontFamily: 'Manrope_800ExtraBold' },
  secondaryBtn: { borderWidth: 1.5, borderColor: '#0e7490', borderRadius: 12, paddingVertical: 12, alignItems: 'center', backgroundColor: '#ffffff' },
  secondaryBtnText: { color: '#0e7490', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  row3: { flexDirection: 'row', gap: 6 },
  smallBtn: { flex: 1, borderWidth: 1.5, borderColor: '#0e7490', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#ffffff' },
  smallBtnWide: { borderWidth: 1.5, borderColor: '#0e7490', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#ffffff', marginTop: 4 },
  smallBtnText: { color: '#0e7490', fontSize: 13, fontFamily: 'Manrope_700Bold' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  linkText: { color: '#0e7490', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  deleteWeekBtn: { alignItems: 'center', paddingVertical: 12 },
  deleteWeekText: { color: '#b91c1c', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  fieldLabel: { fontSize: 13, fontFamily: 'Manrope_700Bold', color: '#475569' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  timeChip: { minWidth: 58, paddingVertical: 8, alignItems: 'center', borderRadius: 9, borderWidth: 1.5, borderColor: '#cbd5e1', backgroundColor: '#ffffff' },
  chipOn: { backgroundColor: '#15803d', borderColor: '#15803d' },
  chipText: { fontSize: 13.5, color: '#334155', fontFamily: 'Manrope_700Bold' },
  chipTextOn: { color: '#ffffff' },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: '#475569', lineHeight: 19 },
  dim: { opacity: 0.5 },
});
