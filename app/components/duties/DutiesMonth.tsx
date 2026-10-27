import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  absencesApi,
  dutiesApi,
  extractErrorMessage,
  meetingSettingsApi,
  publisherActivityApi,
  type MonthDutyMeeting,
  type MonthDutyRow,
  type Publisher,
} from '../../lib/api';
import { useAllPublishers } from '../../lib/useAllPublishers';
import { notify } from '../../lib/error-bus';
import { FONT } from '../../lib/typography';
import { countDuties } from '../../lib/duty-count';
import {
  autofill,
  cellId,
  programmeForDuties,
  programmeReady,
  queueContextAt,
  queueOrder,
  rowKeysOf,
  type QueueContext,
} from '../../lib/duty-autofill';
import { placeKey } from '../../lib/duty-places';
import { storage } from '../../lib/storage';
import { monthTable, rowTitle } from '../../lib/duty-month-table';
import { absenceOn, busyAt, candidatesFor, dutyPool, freeAt, idleInMonth, isServing, shortName } from '../../lib/duty-load';
import { capitalizeFirst } from '../../lib/relative-time';
import { LoadFailure } from '../LoadFailure';
import { dutyLabel } from '../DutiesSection';

/**
 * A MONTH ON ONE SCREEN (Lionel, 27 October 2026; mockup «Обязанности на
 * месяц»). Rows are the places, columns the meetings; a cell is one place at
 * one meeting. The panel beside it answers the two questions the coordinator
 * asked: who to put here (whoever carries least this month comes first), and
 * who has nothing at all — this month, and at this meeting.
 *
 * A meeting nobody has filled has no sheet; its column shows the
 * congregation's places, and the first name put into it cuts the sheet on the
 * server (POST /duties/assign-place). Nothing is written by looking.
 */

type Cell = { meeting: number; row: string };
type Selection = { kind: 'cell'; cell: Cell } | { kind: 'meeting'; meeting: number } | null;

const atMidnight = (iso: string) => new Date(`${iso}T00:00:00`);

function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-01T00:00:00`);
  d.setMonth(d.getMonth() + by);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function DutiesMonth({
  canEdit,
  month,
  onMonth,
}: {
  canEdit: boolean;
  /** YYYY-MM — kept by the screen, so its print button prints this month. */
  month: string;
  onMonth: (month: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const [sel, setSel] = useState<Selection>(null);
  // «Заполнить пустые»: proposals live here until saved — nothing is written
  // before the coordinator says so.
  const [proposals, setProposals] = useState<Map<string, string> | null>(null);
  const [nobody, setNobody] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  // From 1200 the panel stands beside the table; narrower — a tablet held
  // upright — the table takes the width and the panel slides over it when a
  // cell is chosen (Lionel, 27 October 2026).
  const { width } = useWindowDimensions();
  const docked = width >= 1200;
  const [idleOpen, setIdleOpen] = useState(false);
  const [advance, setAdvance] = useState(true);
  useEffect(() => {
    storage
      .getItem(ADVANCE_KEY)
      .then((v) => v === '0' && setAdvance(false))
      .catch(() => {});
  }, []);
  const [mainW, setMainW] = useState(0);
  const [viewW, setViewW] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });
  const changeMonth = (by: number) => {
    onMonth(shiftMonth(month, by));
    setSel(null);
    setIdleOpen(false);
    setProposals(null);
    setNobody(new Set());
    setSkipped([]);
  };

  const q = useQuery({ queryKey: ['duties', 'month', month], queryFn: () => dutiesApi.month(month) });
  const peopleQ = useAllPublishers();
  const absQ = useQuery({
    queryKey: ['absences', 'week-warn'],
    queryFn: () => absencesApi.list(),
    staleTime: 5 * 60 * 1000,
  });
  const publishers = useMemo(() => peopleQ.data?.data ?? [], [peopleQ.data]);
  const byId = useMemo(() => new Map(publishers.map((p) => [p.id, p])), [publishers]);
  const pool = useMemo(() => dutyPool(publishers), [publishers]);

  const meetings = useMemo(() => q.data?.meetings ?? [], [q.data]);
  // The duties before the month: the queue goes by who stood where. The same
  // query «Заполнить пустые» reads, so the panel and the button agree.
  const firstMonday = meetings[0]?.weekStartDate ?? `${month}-01`;
  const historyQ = useQuery({
    queryKey: ['publisher-activity', firstMonday, 26],
    queryFn: () => publisherActivityApi.getActivity({ weekStart: firstMonday, weeks: 26 }),
    enabled: canEdit && meetings.length > 0,
    staleTime: 60 * 1000,
  });
  const historyBefore = useMemo(
    () =>
      (historyQ.data ?? []).map((h) => ({
        publisherId: h.publisherId,
        items: h.items.filter((it) => it.weekStartDate < firstMonday),
      })),
    [historyQ.data, firstMonday],
  );
  const load = useMemo(() => new Map((q.data?.load ?? []).map((l) => [l.publisherId, l])), [q.data]);

  // The rows of the table: every place any meeting of the month has, in the
  // order the sheets keep them (the printed sheet builds the same table).
  const table = useMemo(() => monthTable(meetings), [meetings]);

  const assignM = useMutation({
    mutationFn: async (v: { meeting: MonthDutyMeeting; row: MonthDutyRow; ordinal: number; publisherId: string | null }) =>
      v.row.id
        ? dutiesApi.assign(v.row.id, { publisherId: v.publisherId })
        : dutiesApi.assignPlace({
            weekStartDate: v.meeting.weekStartDate,
            eventType: v.meeting.eventType!,
            dutyType: v.row.dutyType,
            customLabel: v.row.customLabel,
            ordinal: v.ordinal,
            publisherId: v.publisherId,
          }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['duties'] });
      qc.invalidateQueries({ queryKey: ['publisher-activity'] });
    },
    onError: (e) => notify(t('dutiesMonth.errorTitle'), extractErrorMessage(e)),
  });

  if (q.isLoading || peopleQ.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator />
      </View>
    );
  }
  if (q.error || !q.data) {
    return (
      <View style={styles.centre}>
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} />
      </View>
    );
  }

  const fill = async () => {
    try {
      const history = await qc.fetchQuery({
        queryKey: ['publisher-activity', firstMonday, 26],
        queryFn: () => publisherActivityApi.getActivity({ weekStart: firstMonday, weeks: 26 }),
      });
      // Only what came before the month: the month itself is walked in order.
      const before = history.map((h) => ({
        publisherId: h.publisherId,
        items: h.items.filter((it) => it.weekStartDate < firstMonday),
      }));
      const res = autofill({
        month: q.data!,
        publishers,
        absences: absQ.data,
        history: before,
        treasuresMicRule: settingsQ.data?.congregation.assignmentAutomationEnabled ?? false,
      });
      setProposals(res.proposals);
      setNobody(res.nobody);
      setSkipped(res.skipped);
      setSel(null);
      setIdleOpen(false);
      if (res.proposals.size === 0 && res.skipped.length === 0) notify(undefined, t('dutiesMonth.fill.none'), 'success');
    } catch (e) {
      notify(t('dutiesMonth.errorTitle'), extractErrorMessage(e));
    }
  };
  const saveProposals = async () => {
    if (!proposals) return;
    setSaving(true);
    let done = 0;
    try {
      // One by one: the first name of a meeting with no sheet cuts it, and
      // the next ones of that meeting must find it there.
      for (const [id, publisherId] of proposals) {
        const [mi, rowKey] = [Number(id.split('|')[0]), id.slice(id.indexOf('|') + 1)];
        const meeting = meetings[mi];
        const entry = table.cells[mi]?.get(rowKey);
        if (!meeting || !entry || entry.row.publisherId) continue;
        await (entry.row.id
          ? dutiesApi.assign(entry.row.id, { publisherId })
          : dutiesApi.assignPlace({
              weekStartDate: meeting.weekStartDate,
              eventType: meeting.eventType!,
              dutyType: entry.row.dutyType,
              customLabel: entry.row.customLabel,
              ordinal: entry.ordinal,
              publisherId,
            }));
        done += 1;
        // A meeting with no sheet has one now: the rest of its places are
        // read again before the next of them is written.
        if (!entry.row.id) {
          const fresh = await dutiesApi.month(month);
          q.refetch();
          const again = fresh.meetings[mi];
          if (again) {
            for (const r of rowKeysOf(again)) {
              const cell = table.cells[mi].get(r.key);
              if (cell && !cell.row.id) cell.row = { ...cell.row, id: r.row.id };
            }
          }
        }
      }
      notify(undefined, t('dutiesMonth.fill.saved', { count: done }), 'success');
      setProposals(null);
      setNobody(new Set());
      setSkipped([]);
    } catch (e) {
      notify(t('dutiesMonth.errorTitle'), `${extractErrorMessage(e)} (${t('dutiesMonth.fill.savedSoFar', { count: done })})`);
    } finally {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ['duties'] });
      qc.invalidateQueries({ queryKey: ['publisher-activity'] });
    }
  };

  const held = meetings.filter((m) => m.held);
  const totals = held.reduce(
    (acc, m) => {
      const c = countDuties(m.rows);
      return { assigned: acc.assigned + c.assigned, total: acc.total + c.total };
    },
    { assigned: 0, total: 0 },
  );
  const idle = idleInMonth(q.data, pool);
  // A brother with a place AND a part at one meeting of the month still
  // ahead — the programme was filled after the places (or the other way).
  const clashes = meetings.reduce(
    (n, m) =>
      n + (m.held && !m.locked ? m.rows.filter((r) => r.publisherId && m.partPublisherIds.includes(r.publisherId)).length : 0),
    0,
  );
  const monthName = capitalizeFirst(atMidnight(`${month}-01`).toLocaleDateString(lang, { month: 'long', year: 'numeric' }));

  const titleOf = (key: string, row: MonthDutyRow, ordinal: number) => rowTitle(table, key, row, ordinal, t);

  const selCell = sel?.kind === 'cell' ? sel.cell : null;
  const selMeetingIdx = sel?.kind === 'cell' ? sel.cell.meeting : sel?.kind === 'meeting' ? sel.meeting : null;
  const selMeeting = selMeetingIdx != null ? meetings[selMeetingIdx] : null;

  const dayLabel = (m: MonthDutyMeeting) =>
    capitalizeFirst(atMidnight(m.date).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'long' }));

  // Where a cell is chosen, which of its meeting's empty places comes next —
  // «После выбора — к следующей пустой» (27 October 2026).
  const nextEmpty = (from: Cell): Cell | null => {
    const m = meetings[from.meeting];
    if (!m || m.locked) return null;
    const at = table.rows.findIndex((r) => r.key === from.row);
    for (const r of table.rows.slice(at + 1)) {
      const c = table.cells[from.meeting].get(r.key);
      if (!c || c.row.publisherId || c.row.dutyType === 'timekeeper') continue;
      if (proposals?.has(cellId(from.meeting, r.key))) continue;
      return { meeting: from.meeting, row: r.key };
    }
    return null;
  };
  const afterChoice = (from: Cell, wasEmpty: boolean) => {
    const next = advance && wasEmpty ? nextEmpty(from) : null;
    if (next) choose({ kind: 'cell', cell: next });
    else if (!docked) close();
  };

  // A column as wide as the room allows: on a tablet held upright the
  // meetings fill the width instead of leaving it empty on the right, and a
  // whole surname fits where «Остерманн…» was cut.
  const avail = Math.max(0, mainW - 2);
  const colW = Math.max(COL, Math.min(COL_MAX, Math.floor((avail - PLACE) / Math.max(1, meetings.length))));

  // Pick a cell or a meeting: with the panel sliding over the table, the
  // chosen column is brought out from under it.
  const choose = (s: Selection) => {
    setSel(s);
    setIdleOpen(false);
    const mi = s?.kind === 'cell' ? s.cell.meeting : s?.kind === 'meeting' ? s.meeting : null;
    if (!docked && mi != null && scrollRef.current) {
      const left = mi * colW;
      const room = viewW - PANEL_W;
      if (left + colW > scrollX.current + room) {
        scrollRef.current.scrollTo({ x: Math.max(0, left + colW - room + 16), animated: true });
      }
    }
  };
  const close = () => {
    setSel(null);
    setIdleOpen(false);
  };

  const cellPanel =
    selCell && selMeeting
      ? (() => {
          const entry = table.cells[selCell.meeting].get(selCell.row)!;
          return (
            <CellPanel
              meeting={selMeeting}
              entry={entry}
              kicker={dayLabel(selMeeting)}
              title={titleOf(selCell.row, entry.row, entry.ordinal)}
              publishers={publishers}
              byId={byId}
              load={load}
              absences={absQ.data}
              queue={queueContextAt(q.data!, historyBefore, selCell.meeting, placeKey(entry.row))}
              historyReady={!!historyQ.data}
              pending={assignM.isPending || saving}
              advance={advance}
              onAdvance={(v) => {
                setAdvance(v);
                void storage.setItem(ADVANCE_KEY, v ? '1' : '0').catch(() => {});
              }}
              proposed={
                proposals && !entry.row.publisherId ? (proposals.get(cellId(selCell.meeting, selCell.row)) ?? null) : undefined
              }
              onPropose={(publisherId) => {
                const next = new Map(proposals ?? []);
                const id = cellId(selCell.meeting, selCell.row);
                const wasEmpty = !next.has(id);
                if (publisherId) next.set(id, publisherId);
                else next.delete(id);
                setProposals(next);
                if (publisherId) afterChoice(selCell, wasEmpty);
              }}
              onPick={(publisherId) => {
                const from = selCell;
                const wasEmpty = !entry.row.publisherId;
                assignM.mutate(
                  { meeting: selMeeting, row: entry.row, ordinal: entry.ordinal, publisherId },
                  { onSuccess: () => publisherId && afterChoice(from, wasEmpty) },
                );
              }}
              onClose={close}
            />
          );
        })()
      : null;
  const panelContent =
    cellPanel ??
    (selMeeting ? (
      <PeoplePanel
        title={t('dutiesMonth.freeAt', { day: dayLabel(selMeeting) })}
        hint={t('dutiesMonth.freeAtHint')}
        people={freeAt(selMeeting, pool, absQ.data)}
        load={load}
        onClose={close}
      />
    ) : (
      <PeoplePanel
        title={t('dutiesMonth.idleTitle')}
        hint={t('dutiesMonth.idleHint')}
        people={idle}
        load={load}
        onClose={docked ? undefined : close}
      />
    ));
  const overlayOpen = !docked && (sel !== null || idleOpen);

  const kindOf = (m: MonthDutyMeeting) => (m.eventType === 'weekend' ? KIND.weekend : KIND.midweek);

  return (
    <View style={styles.wrap}>
      <View style={styles.main} onLayout={(e) => setMainW(e.nativeEvent.layout.width - 32)}>
        <View style={styles.bar}>
          <View style={styles.monthNav}>
            <Pressable onPress={() => changeMonth(-1)} style={styles.navBtn} accessibilityLabel={t('dutiesMonth.prev')}>
              <Ionicons name="chevron-back" size={16} color="#64748b" />
            </Pressable>
            <Text style={styles.monthName}>{monthName}</Text>
            <Pressable onPress={() => changeMonth(1)} style={styles.navBtn} accessibilityLabel={t('dutiesMonth.next')}>
              <Ionicons name="chevron-forward" size={16} color="#64748b" />
            </Pressable>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{t('dutiesMonth.filled', { assigned: totals.assigned, total: totals.total })}</Text>
          </View>
          {totals.total - totals.assigned > 0 ? (
            <View style={[styles.pill, styles.pillWarn]}>
              <Text style={[styles.pillText, styles.pillWarnText]}>{t('dutiesMonth.empty', { count: totals.total - totals.assigned })}</Text>
            </View>
          ) : null}
          {clashes > 0 ? (
            <View style={[styles.pill, styles.pillClash]} testID="clashes">
              <Text style={[styles.pillText, styles.pillClashText]}>{t('dutiesMonth.clashes', { count: clashes })}</Text>
            </View>
          ) : null}
          {idle.length > 0 ? (
            <Pressable
              testID="idle-pill"
              onPress={() => {
                setSel(null);
                if (!docked) setIdleOpen(true);
              }}
              style={[styles.pill, styles.pillWarn, styles.pillRow]}
            >
              <Text style={[styles.pillText, styles.pillWarnText]}>{t('dutiesMonth.idle', { count: idle.length })}</Text>
              {!docked ? <Ionicons name="chevron-forward" size={13} color="#b45309" /> : null}
            </Pressable>
          ) : null}
          <View style={styles.spacer} />
          {canEdit && !proposals ? (
            <Pressable onPress={fill} style={({ pressed }) => [styles.fillBtn, pressed && styles.pressed]} testID="fill-empty">
              <Ionicons name="sparkles-outline" size={16} color="#fff" />
              <Text style={styles.fillText}>{t('dutiesMonth.fill.button')}</Text>
            </Pressable>
          ) : null}
        </View>
        {proposals ? (
          <View style={styles.proposalBar} testID="proposal-bar">
            <Text style={styles.proposalText}>
              {t('dutiesMonth.fill.proposed', { count: proposals.size })}
              {nobody.size > 0 ? ` · ${t('dutiesMonth.fill.nobodyCount', { count: nobody.size })}` : ''}
            </Text>
            {skipped.length > 0 ? (
              <Text style={styles.skipped} testID="proposals-skipped">
                {t('dutiesMonth.fill.skipped', {
                  count: skipped.length,
                  list: skipped.map((i) => dayLabel(meetings[i])).join(', '),
                })}
              </Text>
            ) : null}
            <Text style={styles.proposalHint}>{t('dutiesMonth.fill.hint')}</Text>
            <View style={styles.proposalBtns}>
              <Pressable
                onPress={saveProposals}
                disabled={saving || proposals.size === 0}
                style={[styles.fillBtn, (saving || proposals.size === 0) && styles.off]}
                testID="proposals-save"
              >
                <Text style={styles.fillText}>{saving ? t('common.saving') : t('dutiesMonth.fill.save')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setProposals(null);
                  setNobody(new Set());
                  setSkipped([]);
                }}
                disabled={saving}
                style={styles.cancelBtn}
                testID="proposals-cancel"
              >
                <Text style={styles.cancelText}>{t('common.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={styles.table} testID="duties-month-table">
          {/* The places stay where they are while the meetings scroll by. */}
          <View style={styles.placeSide}>
            <View style={[styles.placeCol, styles.th, styles.thRow, styles.thPlace]}>
              <Text style={styles.thText}>{t('dutiesMonth.place')}</Text>
            </View>
            {table.rows.map((r) => (
              <View key={r.key} style={[styles.placeCol, styles.tdRow]}>
                <Text style={styles.placeText} numberOfLines={2}>
                  {titleOf(r.key, r.row, r.ordinal)}
                </Text>
              </View>
            ))}
            <View style={[styles.placeCol, styles.tf, styles.tfRow]}>
              <Text style={styles.thText}>{t('dutiesMonth.freeRow')}</Text>
            </View>
          </View>
          <ScrollView
            horizontal
            ref={scrollRef}
            onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
            onScroll={(e) => {
              scrollX.current = e.nativeEvent.contentOffset.x;
            }}
            scrollEventThrottle={32}
            style={styles.flex}
          >
            <View>
              <View style={styles.tr}>
              {meetings.map((m, mi) => {
                const c = m.held ? countDuties(m.rows) : null;
                const d = atMidnight(m.date);
                return (
                  <Pressable
                    key={`${m.weekStartDate}|${m.eventType}|${mi}`}
                    onPress={() => m.held && choose({ kind: 'meeting', meeting: mi })}
                    style={[
                      styles.col,
                      { width: colW },
                      styles.th,
                      styles.thRow,
                      m.held ? { backgroundColor: kindOf(m).tint, borderTopColor: kindOf(m).color } : styles.hatched,
                      selMeetingIdx === mi && styles.colSel,
                    ]}
                  >
                    <Text style={styles.day}>{d.getDate()}</Text>
                    <Text style={styles.dow}>{d.toLocaleDateString(lang, { weekday: 'short' }).replace('.', '').toUpperCase()}</Text>
                    {m.held ? (
                      <>
                        <View style={styles.kind}>
                          <Text style={[styles.kindText, { color: kindOf(m).color }]}>
                            {t(`dutiesMonth.kind.${m.eventType}`)}
                          </Text>
                        </View>
                        <Text style={[styles.count, c && c.assigned === c.total && c.total > 0 && styles.countFull]}>
                          {c ? `${c.assigned}/${c.total}` : ''}
                        </Text>
                        {/* The programme not complete yet: the places wait
                            for it — «Заполнить пустые» passes this one by. */}
                        {!m.locked && !programmeReady(m) ? (
                          <Text style={styles.progWait} testID={`programme-${m.date}`}>
                            {programmeForDuties(m)?.loaded
                              ? t('dutiesMonth.programmeOf', {
                                  assigned: programmeForDuties(m)!.assigned,
                                  total: programmeForDuties(m)!.total,
                                })
                              : t('dutiesMonth.programmeNone')}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.notHeld}>{t(`dutiesMonth.notHeld.${m.notHeld ?? 'event'}`)}</Text>
                    )}
                  </Pressable>
                );
              })}
              </View>
              {table.rows.map((r) => (
                <View key={r.key} style={styles.tr}>
                  {meetings.map((m, mi) => {
                    const cell = table.cells[mi].get(r.key);
                    if (!m.held || !cell) {
                      return <View key={mi} style={[styles.col, { width: colW }, styles.td, styles.tdRow, !m.held && styles.hatched]} />;
                    }
                    const who = cell.row.publisherId ? byId.get(cell.row.publisherId) : undefined;
                    const empty = !cell.row.publisherId;
                    const optional = cell.row.dutyType === 'timekeeper';
                    const absent = cell.row.publisherId ? absenceOn(absQ.data, cell.row.publisherId, m.date) : null;
                    const hasPart = !!cell.row.publisherId && m.partPublisherIds.includes(cell.row.publisherId);
                    // The same place at the meeting before — handed round,
                    // or stuck with one man?
                    const prev = meetings.slice(0, mi).reverse().find((x) => x.held && x.eventType === m.eventType);
                    const repeat =
                      !!cell.row.publisherId &&
                      !!prev &&
                      table.cells[meetings.indexOf(prev)].get(r.key)?.row.publisherId === cell.row.publisherId;
                    const isSel = selCell?.meeting === mi && selCell.row === r.key;
                    const proposed = empty ? proposals?.get(cellId(mi, r.key)) : undefined;
                    const noOne = empty && nobody.has(cellId(mi, r.key));
                    return (
                      <Pressable
                        key={mi}
                        testID={`cell-${m.date}-${r.key}`}
                        disabled={!canEdit || m.locked}
                        onPress={() => choose({ kind: 'cell', cell: { meeting: mi, row: r.key } })}
                        style={[
                          styles.col,
                          { width: colW },
                          styles.td,
                          styles.tdRow,
                          empty && !optional && !m.locked && !proposed && styles.tdEmpty,
                          proposed && styles.tdProposed,
                          m.locked && styles.tdPast,
                          isSel && styles.tdSel,
                        ]}
                      >
                        {proposed ? (
                          <Text style={styles.proposedName} numberOfLines={1}>
                            {shortName(byId.get(proposed))}
                          </Text>
                        ) : noOne ? (
                          <Text style={styles.noOne}>{t('dutiesMonth.fill.noOne')}</Text>
                        ) : empty ? (
                          <Text style={styles.dash}>{optional ? '' : '—'}</Text>
                        ) : (
                          <View style={styles.cellRow}>
                            {absent ? <View style={[styles.mark, styles.markAbsent]} /> : null}
                            {hasPart ? <View style={[styles.mark, styles.markPart]} /> : null}
                            {repeat ? <View style={[styles.mark, styles.markRepeat]} /> : null}
                            <Text style={[styles.name, m.locked && styles.namePast]} numberOfLines={1}>
                              {shortName(who)}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              {/* Footer: who is still free at each meeting. */}
              <View style={styles.tr}>
                {meetings.map((m, mi) => (
                  <Pressable
                    key={mi}
                    disabled={!m.held}
                    onPress={() => choose({ kind: 'meeting', meeting: mi })}
                    style={[styles.col, { width: colW }, styles.tf, styles.tfRow, !m.held && styles.hatched]}
                    testID={`free-${m.date}`}
                  >
                    {m.held ? <Text style={styles.free}>{freeAt(m, pool, absQ.data).length}</Text> : null}
                  </Pressable>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>

        <View style={styles.legend}>
          <Legend color="#dc2626" text={t('dutiesMonth.legend.absent')} />
          <Legend color="#f59e0b" text={t('dutiesMonth.legend.part')} />
          <Legend color={REPEAT} text={t('dutiesMonth.legend.repeat')} />
        </View>
      </View>

      {docked ? (
        <View style={styles.panel} testID="duties-month-panel">
          {panelContent}
        </View>
      ) : overlayOpen ? (
        <>
          <Pressable style={styles.scrim} onPress={close} accessibilityRole="button" accessibilityLabel={t('common.close')} />
          <SlideIn key={idleOpen ? 'idle' : 'sel'} style={styles.sheet} testID="duties-month-panel">
            {panelContent}
          </SlideIn>
        </>
      ) : null}
    </View>
  );
}

/** The panel coming in from the right edge, over the table. */
function SlideIn({ children, style, testID }: { children: ReactNode; style: object; testID?: string }) {
  const x = useRef(new Animated.Value(PANEL_W)).current;
  useEffect(() => {
    Animated.timing(x, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [x]);
  return (
    <Animated.View testID={testID} style={[style, { transform: [{ translateX: x }] }]}>
      {children}
    </Animated.View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.mark, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

type LoadMap = Map<string, { duties: number; parts: number; lastDutyBefore: string | null }>;

/** A list of people with what each already carries this month. */
function PeoplePanel({
  title,
  hint,
  people,
  load,
  onClose,
}: {
  title: string;
  hint: string;
  people: Publisher[];
  load: LoadMap;
  onClose?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const sorted = [...people].sort((a, b) => a.displayName.localeCompare(b.displayName, i18n.language));
  return (
    <ScrollView contentContainerStyle={styles.panelBody}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        {onClose ? (
          <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={20} color="#64748b" />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.panelHint}>{hint}</Text>
      {sorted.length === 0 ? <Text style={styles.nobody}>{t('dutiesMonth.nobody')}</Text> : null}
      {sorted.map((p) => {
        const l = load.get(p.id);
        return (
          <View key={p.id} style={styles.person}>
            <View style={styles.flex}>
              <Text style={styles.personName}>{p.displayName}</Text>
              <Text style={styles.personMeta}>
                {l?.lastDutyBefore ? t('dutiesMonth.lastDuty', { date: shortDate(l.lastDutyBefore, i18n.language) }) : t('dutiesMonth.neverDuty')}
              </Text>
            </View>
            <Count n={(l?.duties ?? 0) + (l?.parts ?? 0)} />
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * One place at one meeting: who to put there. «По очереди» is the queue
 * «Заполнить пустые» goes by — its first is the one the button would propose
 * — and «Лучше не ставить» says why not.
 */
function CellPanel({
  meeting,
  entry,
  kicker,
  title,
  publishers,
  byId,
  load,
  absences,
  queue,
  historyReady,
  pending,
  advance,
  onAdvance,
  proposed,
  onPropose,
  onPick,
  onClose,
}: {
  /** While proposals are shown, the empty cell's proposal (null — none). */
  proposed?: string | null;
  onPropose: (publisherId: string | null) => void;
  meeting: MonthDutyMeeting;
  entry: { row: MonthDutyRow; ordinal: number };
  kicker: string;
  title: string;
  publishers: Publisher[];
  byId: Map<string, Publisher>;
  load: LoadMap;
  absences: Parameters<typeof absenceOn>[0];
  queue: QueueContext;
  historyReady: boolean;
  pending: boolean;
  advance: boolean;
  onAdvance: (on: boolean) => void;
  onPick: (publisherId: string | null) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const proposing = proposed !== undefined;
  const current = entry.row.publisherId
    ? byId.get(entry.row.publisherId)
    : proposed
      ? byId.get(proposed)
      : undefined;
  const choose = (id: string | null) => (proposing ? onPropose(id) : onPick(id));
  const busy = busyAt(meeting);
  const others = new Map<string, string>();
  for (const r of meeting.rows) {
    if (r.publisherId && r.publisherId !== entry.row.publisherId) {
      others.set(r.publisherId, dutyLabel({ ...r, id: '', congregationId: '', weekStartDate: '', eventType: 'midweek' } as never, t));
    }
  }
  const people = candidatesFor(entry.row.capability, publishers).filter(
    (p) => p.id !== entry.row.publisherId && p.id !== proposed,
  );
  const reasonOf = (p: Publisher): string | null => {
    if (!isServing(p)) return t('dutiesMonth.reason.inactive');
    const a = absenceOn(absences, p.id, meeting.date);
    if (a) return t('dutiesMonth.reason.absent');
    if (others.has(p.id)) return t('dutiesMonth.reason.duty', { place: others.get(p.id) });
    if (busy.has(p.id)) return t('dutiesMonth.reason.part');
    return null;
  };
  const place = placeKey(entry.row);
  const free = queueOrder(
    people.filter((p) => !reasonOf(p)),
    place,
    queue,
  );
  const notNow = people.filter((p) => !!reasonOf(p)).sort((a, b) => a.displayName.localeCompare(b.displayName, i18n.language));
  const markName = entry.row.capability ? t(`capabilities.items.${entry.row.capability}`) : null;
  const empty = !entry.row.publisherId;

  const Row = ({ p, reason, first }: { p: Publisher; reason: string | null; first?: boolean }) => {
    const l = load.get(p.id);
    const lastHere = queue.last.get(p.id)?.get(place);
    return (
      <Pressable
        testID={`pick-${p.id}`}
        onPress={() => choose(p.id)}
        disabled={pending}
        style={({ pressed }) => [
          styles.person,
          styles.personPick,
          first && styles.personFirst,
          reason && styles.personOff,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.flex}>
          <View style={styles.nameLine}>
            <Text style={styles.personName}>{p.displayName}</Text>
            {first ? <Text style={styles.nextTag}>{t('dutiesMonth.queue.next')}</Text> : null}
          </View>
          {reason ? (
            <Text style={styles.reason}>{reason}</Text>
          ) : (
            <Text style={styles.personMeta}>
              {lastHere
                ? t('dutiesMonth.queue.lastHere', { date: shortDate(lastHere, i18n.language) })
                : t('dutiesMonth.queue.neverHere')}
              {queue.previous.has(p.id) ? ` · ${t('dutiesMonth.queue.repeat')}` : ''}
            </Text>
          )}
        </View>
        <Count n={(l?.duties ?? 0) + (l?.parts ?? 0)} />
      </Pressable>
    );
  };

  return (
    <View style={styles.flex}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.panelBody}>
        <View style={styles.panelHead}>
          <View style={styles.flex}>
            <Text style={styles.kicker}>{kicker}</Text>
            <Text style={styles.cellTitle}>{title}</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn} accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={18} color="#64748b" />
          </Pressable>
        </View>
        <Text style={styles.panelHint}>
          {markName ? t('dutiesMonth.byMark', { name: markName }) : t('dutiesMonth.byBrothers')}
        </Text>
        {current ? (
          <View style={styles.current}>
            <View style={styles.flex}>
              <Text style={styles.currentLabel}>{proposing ? t('dutiesMonth.fill.proposal') : t('dutiesMonth.now')}</Text>
              <Text style={styles.personName}>{current.displayName}</Text>
            </View>
            <Pressable onPress={() => choose(null)} disabled={pending} style={styles.clear} testID="cell-clear">
              <Text style={styles.clearText}>{t('dutiesMonth.clear')}</Text>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.groupHead}>
          <Text style={styles.groupLabel}>{t('dutiesMonth.canPut')}</Text>
          <Text style={styles.groupLabel}>{t('dutiesMonth.thisMonth')}</Text>
        </View>
        {free.length === 0 ? <Text style={styles.nobody}>{t('dutiesMonth.nobody')}</Text> : null}
        {!historyReady && free.length > 0 ? <ActivityIndicator style={styles.queueWait} size="small" /> : null}
        {free.map((p, i) => (
          <Row key={p.id} p={p} reason={null} first={i === 0 && historyReady} />
        ))}
        {notNow.length > 0 ? (
          <View style={styles.groupHead}>
            <Text style={styles.groupLabel}>{t('dutiesMonth.better')}</Text>
          </View>
        ) : null}
        {notNow.map((p) => (
          <Row key={p.id} p={p} reason={reasonOf(p)} />
        ))}
      </ScrollView>
      {empty ? (
        <View style={styles.advance}>
          <Switch
            testID="advance-switch"
            value={advance}
            onValueChange={onAdvance}
            trackColor={{ true: '#0e7490', false: '#cbd5e1' }}
            thumbColor="#ffffff"
          />
          <Text style={styles.advanceText}>{t('dutiesMonth.advance')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Count({ n }: { n: number }) {
  return (
    <View style={[styles.cnt, n === 0 && styles.cntZero]}>
      <Text style={[styles.cntText, n === 0 && styles.cntZeroText]}>{n}</Text>
    </View>
  );
}

function shortDate(iso: string, lang: string): string {
  return atMidnight(iso).toLocaleDateString(lang, { day: 'numeric', month: 'short' });
}

const INK = '#0f172a';
const SOFT = '#64748b';
const FAINT = '#94a3b8';
const LINE = '#e2e8f0';
const COL = 76;
const COL_MAX = 124;
const PLACE = 140;
const PANEL_W = 360;
const REPEAT = '#94a3b8';
const ADVANCE_KEY = 'duties.month.advance';
/** Each kind of meeting in its colour from «Программа» (teal book, violet sun). */
const KIND = {
  midweek: { color: '#0e7490', tint: '#f0f9ff' },
  weekend: { color: '#6d28d9', tint: '#f5f3ff' },
} as const;

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  wrap: { flex: 1, flexDirection: 'row', backgroundColor: '#f1f5f9' },
  main: { flex: 1, minWidth: 0, padding: 16, gap: 12 },
  bar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 6 },
  navBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  monthName: { fontFamily: FONT.extrabold, fontSize: 17, color: INK, minWidth: 130, textAlign: 'center' },
  pill: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: '#fff', borderWidth: 1, borderColor: LINE },
  pillText: { fontFamily: FONT.bold, fontSize: 12.5, color: SOFT },
  pillWarn: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  pillWarnText: { color: '#b45309' },
  table: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  placeSide: { width: PLACE, borderRightWidth: 1, borderRightColor: LINE, backgroundColor: '#fff', zIndex: 1 },
  thRow: { height: 104, borderTopWidth: 3, borderTopColor: 'transparent' },
  thPlace: { justifyContent: 'flex-end', alignItems: 'flex-start', paddingBottom: 10 },
  tdRow: { height: 46 },
  tfRow: { height: 38 },
  tr: { flexDirection: 'row' },
  placeCol: { width: PLACE, paddingHorizontal: 12, paddingVertical: 6, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  placeText: { fontFamily: FONT.semibold, fontSize: 13, color: INK },
  col: { width: COL, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderRightWidth: 1, borderRightColor: '#f1f5f9' },
  colSel: { backgroundColor: '#e0f2fe' },
  th: { backgroundColor: '#f8fafc', paddingVertical: 8, alignItems: 'center' },
  thText: { fontFamily: FONT.bold, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: FAINT },
  day: { fontFamily: FONT.extrabold, fontSize: 17, color: INK, lineHeight: 20 },
  dow: { fontFamily: FONT.bold, fontSize: 10, color: SOFT, marginTop: 1 },
  kind: { marginTop: 4, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 6, backgroundColor: '#ffffff' },
  kindText: { fontFamily: FONT.extrabold, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase' },
  count: { fontFamily: FONT.bold, fontSize: 11, color: FAINT, marginTop: 3 },
  countFull: { color: '#047857' },
  notHeld: { fontFamily: FONT.semibold, fontSize: 10.5, color: SOFT, marginTop: 6, textAlign: 'center', paddingHorizontal: 4 },
  hatched: { backgroundColor: '#f1f5f9' },
  td: { justifyContent: 'center', paddingHorizontal: 6 },
  tdEmpty: { backgroundColor: '#fffbeb' },
  tdPast: { backgroundColor: '#fafafa' },
  tdSel: { backgroundColor: '#e0f2fe', borderWidth: 2, borderColor: '#38bdf8' },
  dash: { fontFamily: FONT.bold, fontSize: 13, color: '#b45309', textAlign: 'center' },
  cellRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  name: { fontFamily: FONT.semibold, fontSize: 12.5, color: INK, flexShrink: 1 },
  namePast: { color: FAINT },
  mark: { width: 7, height: 7, borderRadius: 4 },
  markAbsent: { backgroundColor: '#dc2626' },
  markPart: { backgroundColor: '#f59e0b' },
  markRepeat: { backgroundColor: REPEAT },
  tf: { backgroundColor: '#f8fafc', paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 0 },
  free: { fontFamily: FONT.extrabold, fontSize: 13, color: '#047857' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontFamily: FONT.medium, fontSize: 12, color: SOFT },
  panel: { width: 320, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: LINE },
  panelBody: { padding: 16, paddingBottom: 40, gap: 4 },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  kicker: { fontFamily: FONT.extrabold, fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', color: '#0e7490' },
  cellTitle: { fontFamily: FONT.extrabold, fontSize: 19, color: INK, marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.10)' },
  sheet: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: PANEL_W,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: -8, height: 0 },
    elevation: 12,
    overflow: 'hidden',
  },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nextTag: {
    fontFamily: FONT.extrabold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#0f766e',
    backgroundColor: '#ccfbf1',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  personFirst: { backgroundColor: '#f0fdfa' },
  queueWait: { alignSelf: 'flex-start', marginVertical: 4 },
  advance: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  advanceText: { flex: 1, fontFamily: FONT.semibold, fontSize: 13, color: '#334155' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  panelTitle: { flex: 1, fontFamily: FONT.extrabold, fontSize: 16, color: INK },
  panelHint: { fontFamily: FONT.regular, fontSize: 12.5, lineHeight: 18, color: SOFT, marginBottom: 8 },
  nobody: { fontFamily: FONT.medium, fontSize: 13, color: FAINT, paddingVertical: 6 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 2 },
  groupLabel: { fontFamily: FONT.bold, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: FAINT },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  personPick: { paddingHorizontal: 8, borderRadius: 10, marginHorizontal: -8 },
  personOff: { opacity: 0.6 },
  pressed: { backgroundColor: '#f1f5f9' },
  personName: { fontFamily: FONT.bold, fontSize: 13.5, color: INK },
  personMeta: { fontFamily: FONT.regular, fontSize: 11.5, color: SOFT, marginTop: 1 },
  reason: { fontFamily: FONT.semibold, fontSize: 11.5, color: '#b91c1c', marginTop: 1 },
  cnt: { minWidth: 26, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cntText: { fontFamily: FONT.extrabold, fontSize: 12, color: SOFT },
  cntZero: { backgroundColor: '#fef3c7' },
  cntZeroText: { color: '#b45309' },
  current: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f8fafc', borderRadius: 12, padding: 10, marginBottom: 4 },
  currentLabel: { fontFamily: FONT.bold, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: FAINT },
  spacer: { flex: 1 },
  skipped: { fontFamily: FONT.semibold, fontSize: 12.5, color: '#b45309' },
  progWait: { fontFamily: FONT.bold, fontSize: 9.5, color: '#b45309', marginTop: 2, textAlign: 'center' },
  pillClash: { backgroundColor: '#ffedd5', borderColor: '#fdba74' },
  pillClashText: { color: '#c2410c' },
  fillBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#0e7490', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  fillText: { fontFamily: FONT.bold, fontSize: 13.5, color: '#fff' },
  off: { opacity: 0.5 },
  proposalBar: { backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', borderRadius: 12, padding: 12, gap: 6 },
  proposalText: { fontFamily: FONT.extrabold, fontSize: 14, color: '#0369a1' },
  proposalHint: { fontFamily: FONT.regular, fontSize: 12.5, color: '#475569' },
  proposalBtns: { flexDirection: 'row', gap: 8, marginTop: 2 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  cancelText: { fontFamily: FONT.bold, fontSize: 13.5, color: '#64748b' },
  tdProposed: { backgroundColor: '#f0f9ff', borderWidth: 1, borderStyle: 'dashed', borderColor: '#7dd3fc' },
  proposedName: { fontFamily: FONT.semibold, fontSize: 12.5, color: '#0369a1' },
  noOne: { fontFamily: FONT.semibold, fontSize: 11, color: '#b91c1c', textAlign: 'center' },
  clear: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fee2e2' },
  clearText: { fontFamily: FONT.bold, fontSize: 12.5, color: '#b91c1c' },
});
