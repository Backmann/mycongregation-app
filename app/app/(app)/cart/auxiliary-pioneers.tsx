import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Platform,
  Share,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
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
  type AuxReducedReason,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { router } from 'expo-router';
import { auxApplicationsApi } from '../../../lib/api';
import { monthsLabel, capitalize } from '../../../lib/aux-application';
import {
  auxPeriodLabel,
  type PeriodLike,
} from '../../../lib/aux-pioneer-period';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { Dialog } from '../../../components/Dialog';
import { failsScreen } from '../../../lib/screen-failure';
import { Toast } from '../../../components/ErrorToast';
import { AuxYearHistory } from '../../../components/auxiliary/AuxYearHistory';
import { SIDE_NAV_FROM } from '../../../lib/screen-width';

const QK_MONTH = (m: string) => ['aux-pioneers', 'month', m];


export default function AuxiliaryPioneersScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { canManageAuxiliaryPioneers, canDeleteBegunAuxPeriod } = usePermissions();

  const [cursor, setCursor] = useState(() => dayjs().date(1));
  const monthDate = cursor.locale(i18n.language);
  const monthParam = cursor.format('YYYY-MM-01');

  const monthQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: QK_MONTH(monthParam),
    queryFn: () => auxiliaryPioneersApi.listForMonth(monthParam),
  });
  // Applications waiting, and whether the committee can take any (29 October 2026).
  const appsQuery = useQuery({
    queryKey: ['aux-applications', 'list'],
    queryFn: () => auxApplicationsApi.list(),
  });
  const committeeQuery = useQuery({
    queryKey: ['aux-applications', 'committee'],
    queryFn: () => auxApplicationsApi.committee(),
  });
  const waiting = (appsQuery.data ?? []).filter((a) => a.status === 'pending');

  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [newPublisher, setNewPublisher] = useState<string | null>(null);
  const [untilCancelled, setUntilCancelled] = useState(false);
  const [startMonthSel, setStartMonthSel] = useState(monthParam);
  const [endMonthSel, setEndMonthSel] = useState(monthParam);
  const [addError, setAddError] = useState<string | null>(null);
  /**
   * The months the person takes 15 hours in (29 October 2026). null: not
   * touched — every month that allows 15 shows 15, and the server is left
   * to decide the same.
   */
  const [reducedSel, setReducedSel] = useState<string[] | null>(null);

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
    setReducedSel(null);
    setReducedKept([]);
    setAddOpen(true);
  };

  const openEdit = (r: {
    id: string;
    publisherName: string;
    startMonth: string;
    endMonth: string | null;
    untilCancelled: boolean;
    reducedMonths?: string[];
  }) => {
    setAddError(null);
    setReducedSel(r.reducedMonths ?? null);
    setReducedKept(r.reducedMonths ?? []);
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
    qc.invalidateQueries({ queryKey: ['aux-pioneers', 'journal'] });
    qc.invalidateQueries({ queryKey: ['aux-pioneers', 'year'] });
    // What everybody is told — the row in «Служение», the marks in a group's
    // card and in the roster.
    qc.invalidateQueries({ queryKey: ['aux-pioneers', 'serving-now'] });
  };

  // Which months of the chosen range allow 15 hours, and why — asked of the
  // server, which keeps the rule (March, April, the Memorial, a visit, a
  // campaign). An open period is shown a year ahead.
  const rangeEnd = untilCancelled
    ? dayjs(startMonthSel).add(11, 'month').format('YYYY-MM-01')
    : endMonthSel;
  const reducibleQ = useQuery({
    queryKey: ['aux-pioneers', 'reducible', startMonthSel, rangeEnd],
    queryFn: () => auxiliaryPioneersApi.reducible(startMonthSel, rangeEnd),
    enabled: addOpen && rangeEnd >= startMonthSel,
    staleTime: 60 * 1000,
  });
  const reducible = reducibleQ.data ?? [];
  const takes15 = (m: string) =>
    reducedSel === null ? true : reducedSel.includes(m);
  const setTakes = (m: string, on: boolean) => {
    const base =
      reducedSel === null ? reducible.map((x) => x.month) : reducedSel;
    setReducedSel(
      on ? [...new Set([...base, m])] : base.filter((x) => x !== m),
    );
  };
  // What is sent: the choice within the range, or nothing when untouched.
  // A choice already kept stays even where 15 is no longer open (a visit
  // moved away) — it was allowed when it was made. An open period keeps its
  // months beyond the year shown.
  const [reducedKept, setReducedKept] = useState<string[]>([]);
  const reducedOut = () =>
    reducedSel === null
      ? undefined
      : reducedSel.filter(
          (m) =>
            reducible.some((x) => x.month === m) ||
            reducedKept.includes(m) ||
            (untilCancelled && m > rangeEnd.slice(0, 7)),
        );
  const reasonText = (rs: AuxReducedReason[]) =>
    rs.map((r) => t(`auxPioneer.reason.${r}`)).join(', ');

  const createMutation = useMutation({
    mutationFn: () =>
      auxiliaryPioneersApi.create({
        publisherId: newPublisher!,
        startMonth: startMonthSel,
        untilCancelled,
        endMonth: untilCancelled ? undefined : endMonthSel,
        reducedMonths: reducedOut(),
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
        reducedMonths: reducedOut(),
      }),
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setEditingId(null);
      setAddError(null);
    },
    onError: (e) => setAddError(extractErrorMessage(e)),
  });

  // Stopping asks for the LAST month served (29 October 2026): it used to end
  // the period with the current month whatever was meant. Deleting asks
  // first, and is offered for a begun period only to those the server lets
  // take one back — a begun period is history, stopped rather than deleted.
  const [stopFor, setStopFor] = useState<AuxPioneerMonthRow | null>(null);
  const [stopMonth, setStopMonth] = useState(monthParam);
  const [removeFor, setRemoveFor] = useState<AuxPioneerMonthRow | null>(null);
  const thisMonthKey = dayjs().format('YYYY-MM-01');
  const stopMutation = useMutation({
    mutationFn: (v: { id: string; endMonth: string }) =>
      auxiliaryPioneersApi.stop(v.id, v.endMonth),
    onSuccess: () => {
      invalidate();
      setStopFor(null);
    },
  });
  const normMutation = useMutation({
    mutationFn: (v: { id: string; hours: 15 | 30 }) =>
      auxiliaryPioneersApi.setNorm(v.id, monthParam, v.hours),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => auxiliaryPioneersApi.remove(id),
    onSuccess: () => {
      invalidate();
      setRemoveFor(null);
    },
  });
  const mayRemove = (r: AuxPioneerMonthRow) =>
    canDeleteBegunAuxPeriod || r.startMonth.slice(0, 10) > thisMonthKey;

  // The month allows 15 — each person's own goal is on his row.
  const reasons = monthQuery.data?.reasons;
  const reduced = reasons
    ? reasons.length > 0
    : (monthQuery.data?.hourGoal ?? 30) === 15;
  const rows = monthQuery.data?.rows ?? [];

  // Формулировка живёт в lib/aux-pioneer-period.ts — теми же словами говорит
  // значок на главной. Здесь год не скрываем: журнал тянется через годы.
  const periodLabel = (r: PeriodLike) => auxPeriodLabel(t, i18n.language, r);
  // Two columns on a computer (mockup screen 9): what is now on the left,
  // the years on the right.
  const { width } = useWindowDimensions();
  const two = width >= SIDE_NAV_FROM;

  return (
    // A plain View, and deliberately.
    //
    // This was a SafeAreaView with edges={['bottom']}, which reserves the
    // phone's gesture bar INSIDE the screen — while the tab bar above it
    // already reserves the very same strip, being 56 points plus that inset
    // tall. The space was taken twice: the list ended a gesture-bar's height
    // short of the tab bar and could not be scrolled any further, however
    // large the bottom padding grew. On the web the inset is zero, which is
    // why raising the padding appeared to fix it there and changed nothing on
    // a phone.
    <View style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
      >
        {(() => {
          const left = (
            <>
        {committeeQuery.data && !committeeQuery.data.complete ? (
          <View style={styles.pastWarn}>
            <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
            <Text style={styles.pastWarnText}>
              {committeeQuery.data.missing.length > 0
                ? t('auxApp.committeeMissing', {
                    who: committeeQuery.data.missing.map((m) => t(`auxApp.seat.${m}`)).join(', '),
                  })
                : t('auxApp.committeeMissingSomeone')}
            </Text>
          </View>
        ) : null}
        {waiting.length > 0 ? (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>
                {t('auxApp.waitingTitle', { count: waiting.length })}
              </Text>
            </View>
            {waiting.map((a) => {
              const done = a.seats.filter((x) => x.approved).length;
              const mine = !!a.can.approveSeat || a.can.approveOpenSeats.length > 0;
              return (
                <Pressable
                  key={a.id}
                  style={[styles.appRow, mine && styles.appRowMine]}
                  onPress={() => router.push(`/cart/aux-application/${a.id}` as never)}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.appName}>{a.publisherName}</Text>
                    <Text style={styles.appSub}>
                      {(a.untilCancelled
                        ? t('auxApp.my.fromUntilCancelled', { month: monthsLabel(a.months, i18n.language) })
                        : capitalize(monthsLabel(a.months, i18n.language))) +
                        ' · ' +
                        t('auxApp.view.ofThree', { n: done })}
                    </Text>
                  </View>
                  <Text style={[styles.appChip, mine && styles.appChipMine]}>
                    {mine ? t('auxApp.yourAnswer') : t('auxApp.waiting')}
                  </Text>
                </Pressable>
              );
            })}
          </>
        ) : null}
        {canDeleteBegunAuxPeriod ? (
          <Pressable
            style={styles.paperBtn}
            onPress={() => router.push('/cart/aux-paper' as never)}
            accessibilityRole="button"
          >
            <Ionicons name="document-text-outline" size={16} color="#0e7490" />
            <Text style={styles.paperBtnText}>{t('auxApp.paper.enter')}</Text>
          </Pressable>
        ) : null}
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
                  ? reasons && reasons.length > 0
                    ? t('auxPioneer.reducibleMonth', { why: reasonText(reasons) })
                    : t('auxPioneer.reducedNorm')
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
              onStop={() => {
                setStopMonth(
                  thisMonthKey < `${r.startMonth.slice(0, 7)}-01`
                    ? `${r.startMonth.slice(0, 7)}-01`
                    : thisMonthKey,
                );
                setStopFor(r);
              }}
              onRemove={mayRemove(r) ? () => setRemoveFor(r) : undefined}
              normLabel={
                reasons && reasons.length > 0
                  ? t(r.hourGoal === 15 ? 'auxPioneer.normTo30' : 'auxPioneer.normTo15', {
                      month: (() => {
                        const m = monthDate.format('MMMM');
                        return m.charAt(0).toUpperCase() + m.slice(1);
                      })(),
                    })
                  : undefined
              }
              onNorm={() =>
                normMutation.mutate({
                  id: r.id,
                  hours: r.hourGoal === 15 ? 30 : 15,
                })
              }
              editLabel={t('common.edit')}
              stopLabel={t('auxPioneer.stop')}
              removeLabel={t('common.delete')}
            />
          ))
        )}


              <AnnounceCard month={monthParam} names={rows.map((r) => r.publisherName)} />
            </>
          );
          const right = (
            <>
              <View style={[styles.sectionHead, { marginTop: two ? 0 : 22 }]}>
                <Ionicons name="time-outline" size={15} color="#64748b" />
                <Text style={styles.journalTitle}>{t('auxYear.historyTitle')}</Text>
              </View>
              <AuxYearHistory />
            </>
          );
          return two ? (
            <View style={styles.columns}>
              <View style={styles.leftCol}>{left}</View>
              <View style={styles.rightCol}>{right}</View>
            </View>
          ) : (
            <>
              {left}
              {right}
            </>
          );
        })()}
      </ScrollView>

      <Dialog
        visible={!!stopFor}
        title={t('auxPioneer.stopTitle')}
        icon="stop-circle-outline"
        iconTint="#b45309"
        iconBg="#fef3c7"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('auxPioneer.stop')}
        pending={stopMutation.isPending}
        onConfirm={() =>
          stopFor && stopMutation.mutate({ id: stopFor.id, endMonth: stopMonth })
        }
        onCancel={() => setStopFor(null)}
      >
        {stopFor ? (
          <>
            <Text style={styles.dialogText}>{stopFor.publisherName}</Text>
            <Text style={styles.fieldLabel}>{t('auxPioneer.lastMonth')}</Text>
            <MonthPicker
              value={stopMonth}
              options={monthOptions.filter(
                (o) => o.value >= `${stopFor.startMonth.slice(0, 7)}-01`,
              )}
              onChange={setStopMonth}
            />
            <Text style={styles.switchHint}>{t('auxPioneer.lastMonthHint')}</Text>
          </>
        ) : null}
      </Dialog>

      <Dialog
        visible={!!removeFor}
        title={t('auxPioneer.removeTitle')}
        icon="trash-outline"
        iconTint="#dc2626"
        iconBg="#fee2e2"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        confirmDanger
        pending={removeMutation.isPending}
        onConfirm={() => removeFor && removeMutation.mutate(removeFor.id)}
        onCancel={() => setRemoveFor(null)}
      >
        {removeFor ? (
          <Text style={styles.dialogText}>
            {removeFor.startMonth.slice(0, 10) > thisMonthKey
              ? t('auxPioneer.removeFuture', { name: removeFor.publisherName })
              : t('auxPioneer.removeBegun', { name: removeFor.publisherName })}
          </Text>
        ) : null}
      </Dialog>

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
            {reducible.length > 0 ? (
              <View style={styles.normBox}>
                <Text style={styles.fieldLabel}>{t('auxPioneer.normTitle')}</Text>
                {reducible.map((x) => {
                  const on = takes15(x.month);
                  return (
                    <View key={x.month} style={styles.normPickRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.normMonth}>
                          {dayjs(`${x.month}-01`).locale(i18n.language).format('MMMM YYYY')}
                        </Text>
                        <Text style={styles.normWhy}>{reasonText(x.reasons)}</Text>
                      </View>
                      <View style={styles.normSeg}>
                        {[15, 30].map((h) => {
                          const active = (h === 15) === on;
                          return (
                            <Pressable
                              key={h}
                              onPress={() => setTakes(x.month, h === 15)}
                              style={[styles.normSegItem, active && styles.normSegOn]}
                              accessibilityRole="button"
                              accessibilityState={{ selected: active }}
                            >
                              <Text style={[styles.normSegText, active && styles.normSegTextOn]}>
                                {t('auxPioneer.hours', { n: h })}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}
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
    </View>
  );
}

/**
 * The sentence the announcement is read from — the month's auxiliary
 * pioneers by name, ready to copy (mockup screen 9).
 */
function AnnounceCard({ month, names }: { month: string; names: string[] }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const when = t(`auxYear.monthIn.${Number(month.slice(5, 7))}`);
  const text =
    names.length > 0
      ? t('auxYear.announce', { when, names: names.join(', ') })
      : t('auxYear.announceNone', { when });
  const copy = () => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard
        .writeText(text)
        .then(() => setCopied(true))
        .catch(() => void Share.share({ message: text }));
    } else {
      void Share.share({ message: text });
    }
  };
  return (
    <View style={styles.announce}>
      <Text style={styles.announceKicker}>{t('auxYear.announceTitle')}</Text>
      <Text style={styles.announceText} selectable>
        {text}
      </Text>
      {names.length > 0 ? (
        <Pressable onPress={copy} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.announceCopy}>
            {copied ? t('auxYear.copied') : t('auxYear.copy')}
          </Text>
        </Pressable>
      ) : null}
    </View>
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
        {/* Its own strip: the root one is drawn under this window. */}
        <Toast layer />
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
  normLabel,
  onNorm,
  editLabel,
  stopLabel,
  removeLabel,
}: {
  row: AuxPioneerMonthRow;
  periodLabel: string;
  canManage: boolean;
  onEdit: () => void;
  onStop: () => void;
  /** Absent when this reader may not delete the period. */
  onRemove?: () => void;
  /** The month allows 15: switch his goal. */
  normLabel?: string;
  onNorm?: () => void;
  editLabel: string;
  stopLabel: string;
  removeLabel: string;
}) {
  const { t } = useTranslation();
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
          <Text style={styles.hourUnit}> {t('common.hourUnit')}</Text>
        </Text>
        {canManage ? (
          <Pressable
            hitSlop={8}
            onPress={() => setMenu(true)}
            testID={`aux-menu-${row.publisherName}`}
            accessibilityLabel={row.publisherName}
          >
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
            {normLabel && onNorm ? (
              <Pressable
                style={styles.sheetItem}
                onPress={() => {
                  setMenu(false);
                  onNorm();
                }}
              >
                <Ionicons name="swap-horizontal-outline" size={19} color="#0e7490" />
                <Text style={styles.sheetItemText}>{normLabel}</Text>
              </Pressable>
            ) : null}
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
{onRemove ? (
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
            ) : null}
          </View>
        </Pressable>
        {/* Its own strip: the root one is drawn under this window. */}
        <Toast layer />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  leftCol: { width: 380 },
  rightCol: { flex: 1, minWidth: 0 },
  announce: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  announceKicker: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  announceText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#0f172a', lineHeight: 20 },
  announceCopy: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#0e7490' },
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  // Room to breathe at the end of the list, no more: the tab bar reserves its
  // own space, and this screen no longer reserves it a second time.
  content: { padding: 14, paddingBottom: 28 },
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
    fontFamily: 'Manrope_600SemiBold',
    color: '#0f172a',
    textTransform: 'capitalize',
  },
  normRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  normText: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: '#64748b' },
  normTextReduced: { color: '#854F0B' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 12.5, fontFamily: 'Manrope_600SemiBold', color: '#64748b' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  addBtnText: { fontSize: 12.5, color: '#0284c7', fontFamily: 'Manrope_600SemiBold' },
  empty: {
    fontFamily: 'Manrope_400Regular',
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
  avatarText: { fontSize: 12.5, fontFamily: 'Manrope_700Bold' },
  cardName: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  cardPeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  cardPeriod: { fontSize: 11.5, fontFamily: 'Manrope_500Medium' },
  hourGoal: { fontSize: 15, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  hourUnit: { fontSize: 11, color: '#94a3b8', fontFamily: 'Manrope_400Regular' },
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
    fontFamily: 'Manrope_600SemiBold',
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
  sheetItemText: { fontSize: 15.5, color: '#334155', fontFamily: 'Manrope_500Medium' },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  appRowMine: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  appName: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: '#0f172a' },
  appSub: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#64748b', marginTop: 2 },
  appChip: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 12,
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  appChipMine: { color: '#92400e', backgroundColor: '#fef3c7' },
  paperBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingVertical: 6,
    marginBottom: 8,
  },
  paperBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#0e7490' },
  normBox: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 4 },
  normPickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  normMonth: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#0f172a', textTransform: 'capitalize' },
  normWhy: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: '#b45309', marginTop: 1 },
  normSeg: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 10, padding: 3 },
  normSegItem: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  normSegOn: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  normSegText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#64748b' },
  normSegTextOn: { color: '#0f172a' },
  dialogText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14.5, color: '#0f172a', marginBottom: 6, lineHeight: 20 },
  fieldLabel: {
    fontSize: 12.5,
    fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    marginTop: 2,
  },
  editName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  editNameText: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
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
    fontFamily: 'Manrope_500Medium',
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
    fontFamily: 'Manrope_700Bold',
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
  pastWarnText: { fontFamily: 'Manrope_400Regular', flex: 1, fontSize: 13, color: '#92400e', lineHeight: 18 },
  pickerNow: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
    color: '#0284c7',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  pickerItemText: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 14,
    color: '#334155',
    textTransform: 'capitalize',
  },
  pickerItemTextActive: { color: '#0284c7', fontFamily: 'Manrope_600SemiBold' },
  journalTitle: { fontSize: 12.5, fontFamily: 'Manrope_600SemiBold', color: '#64748b', flex: 1 },
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
  journalName: { fontSize: 13, color: '#0f172a', fontFamily: 'Manrope_500Medium' },
  journalPeriod: { fontFamily: 'Manrope_400Regular', fontSize: 11, color: '#94a3b8' },
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
  movedBadgeText: { fontSize: 11, color: '#0369a1', fontFamily: 'Manrope_600SemiBold' },
  journalSection: { marginBottom: 12 },
  journalSectionTitle: {
    fontSize: 11.5,
    fontFamily: 'Manrope_700Bold',
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
  modalTitle: { fontSize: 16, fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 14, fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  switchHint: { fontFamily: 'Manrope_400Regular', fontSize: 11.5, color: '#64748b', marginTop: 2 },
  error: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#b91c1c' },
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
  cancelText: { fontSize: 13.5, fontFamily: 'Manrope_600SemiBold', color: '#334155' },
  confirmBtn: {
    paddingVertical: 9,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0284c7',
  },
  confirmDisabled: { opacity: 0.45 },
  confirmText: { fontSize: 13.5, fontFamily: 'Manrope_700Bold', color: '#fff' },
});
