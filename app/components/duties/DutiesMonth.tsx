import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  absencesApi,
  dutiesApi,
  extractErrorMessage,
  type MonthDutyMeeting,
  type MonthDutyRow,
  type Publisher,
} from '../../lib/api';
import { useAllPublishers } from '../../lib/useAllPublishers';
import { notify } from '../../lib/error-bus';
import { FONT } from '../../lib/typography';
import { countDuties } from '../../lib/duty-count';
import { placeKey } from '../../lib/duty-places';
import { absenceOn, busyAt, candidatesFor, dutyPool, freeAt, idleInMonth, shortName } from '../../lib/duty-load';
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

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-01T00:00:00`);
  d.setMonth(d.getMonth() + by);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The places of a meeting as rows of the table: `<place>#<n>`. */
function rowKeysOf(m: MonthDutyMeeting): { key: string; row: MonthDutyRow; ordinal: number }[] {
  const seen = new Map<string, number>();
  return [...m.rows]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slotIndex - b.slotIndex)
    .map((row) => {
      const place = placeKey(row);
      const n = seen.get(place) ?? 0;
      seen.set(place, n + 1);
      return { key: `${place}#${n}`, row, ordinal: n };
    });
}

export function DutiesMonth({ canEdit, startISO }: { canEdit: boolean; startISO: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const [month, setMonth] = useState(monthOf(startISO));
  const [sel, setSel] = useState<Selection>(null);

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
  const load = useMemo(() => new Map((q.data?.load ?? []).map((l) => [l.publisherId, l])), [q.data]);

  // The rows of the table: every place any meeting of the month has, in the
  // order the sheets keep them.
  const table = useMemo(() => {
    const order = new Map<string, { sort: number; ordinal: number; row: MonthDutyRow }>();
    const cells = meetings.map((m) => {
      const map = new Map<string, { row: MonthDutyRow; ordinal: number }>();
      for (const r of rowKeysOf(m)) {
        map.set(r.key, { row: r.row, ordinal: r.ordinal });
        const was = order.get(r.key);
        if (!was || r.row.sortOrder < was.sort) order.set(r.key, { sort: r.row.sortOrder, ordinal: r.ordinal, row: r.row });
      }
      return map;
    });
    const rows = [...order.entries()]
      .sort((a, b) => a[1].sort - b[1].sort || a[1].ordinal - b[1].ordinal)
      .map(([key, v]) => ({ key, ...v }));
    return { rows, cells };
  }, [meetings]);

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

  const held = meetings.filter((m) => m.held);
  const totals = held.reduce(
    (acc, m) => {
      const c = countDuties(m.rows);
      return { assigned: acc.assigned + c.assigned, total: acc.total + c.total };
    },
    { assigned: 0, total: 0 },
  );
  const idle = idleInMonth(q.data, pool);
  const monthName = capitalizeFirst(atMidnight(`${month}-01`).toLocaleDateString(lang, { month: 'long', year: 'numeric' }));

  const rowTitle = (row: MonthDutyRow, ordinal: number, count: number) => {
    const base = dutyLabel({ ...row, id: '', congregationId: '', weekStartDate: '', eventType: 'midweek' } as never, t);
    if (row.dutyType === 'microphone') return base;
    return count > 1 ? `${base} ${ordinal + 1}` : base;
  };
  const placeCount = new Map<string, number>();
  for (const r of table.rows) {
    const place = r.key.split('#')[0];
    placeCount.set(place, (placeCount.get(place) ?? 0) + 1);
  }

  const selCell = sel?.kind === 'cell' ? sel.cell : null;
  const selMeetingIdx = sel?.kind === 'cell' ? sel.cell.meeting : sel?.kind === 'meeting' ? sel.meeting : null;
  const selMeeting = selMeetingIdx != null ? meetings[selMeetingIdx] : null;

  const dayLabel = (m: MonthDutyMeeting) =>
    capitalizeFirst(atMidnight(m.date).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'long' }));

  return (
    <View style={styles.wrap}>
      <View style={styles.main}>
        <View style={styles.bar}>
          <View style={styles.monthNav}>
            <Pressable onPress={() => { setMonth(shiftMonth(month, -1)); setSel(null); }} style={styles.navBtn} accessibilityLabel={t('dutiesMonth.prev')}>
              <Ionicons name="chevron-back" size={16} color="#64748b" />
            </Pressable>
            <Text style={styles.monthName}>{monthName}</Text>
            <Pressable onPress={() => { setMonth(shiftMonth(month, 1)); setSel(null); }} style={styles.navBtn} accessibilityLabel={t('dutiesMonth.next')}>
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
          {idle.length > 0 ? (
            <Pressable onPress={() => setSel(null)} style={[styles.pill, styles.pillWarn]}>
              <Text style={[styles.pillText, styles.pillWarnText]}>{t('dutiesMonth.idle', { count: idle.length })}</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal style={styles.tableScroll} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={styles.table} testID="duties-month-table">
            {/* Header: one column per meeting. */}
            <View style={styles.tr}>
              <View style={[styles.placeCol, styles.th]}>
                <Text style={styles.thText}>{t('dutiesMonth.place')}</Text>
              </View>
              {meetings.map((m, mi) => {
                const c = m.held ? countDuties(m.rows) : null;
                const d = atMidnight(m.date);
                return (
                  <Pressable
                    key={`${m.weekStartDate}|${m.eventType}|${mi}`}
                    onPress={() => m.held && setSel({ kind: 'meeting', meeting: mi })}
                    style={[styles.col, styles.th, !m.held && styles.hatched, selMeetingIdx === mi && styles.colSel]}
                  >
                    <Text style={styles.day}>{d.getDate()}</Text>
                    <Text style={styles.dow}>{d.toLocaleDateString(lang, { weekday: 'short' }).replace('.', '').toUpperCase()}</Text>
                    {m.held ? (
                      <>
                        <View style={[styles.kind, m.eventType === 'midweek' ? styles.kindMid : styles.kindEnd]}>
                          <Text style={[styles.kindText, m.eventType === 'midweek' ? styles.kindMidText : styles.kindEndText]}>
                            {t(`dutiesMonth.kind.${m.eventType}`)}
                          </Text>
                        </View>
                        <Text style={[styles.count, c && c.assigned === c.total && c.total > 0 && styles.countFull]}>
                          {c ? `${c.assigned}/${c.total}` : ''}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.notHeld}>{t(`dutiesMonth.notHeld.${m.notHeld ?? 'event'}`)}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {table.rows.map((r) => {
              const place = r.key.split('#')[0];
              return (
                <View key={r.key} style={styles.tr}>
                  <View style={styles.placeCol}>
                    <Text style={styles.placeText} numberOfLines={2}>
                      {rowTitle(r.row, r.ordinal, placeCount.get(place) ?? 1)}
                    </Text>
                  </View>
                  {meetings.map((m, mi) => {
                    const cell = table.cells[mi].get(r.key);
                    if (!m.held || !cell) {
                      return <View key={mi} style={[styles.col, styles.td, !m.held && styles.hatched]} />;
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
                    return (
                      <Pressable
                        key={mi}
                        testID={`cell-${m.date}-${r.key}`}
                        disabled={!canEdit || m.locked}
                        onPress={() => setSel({ kind: 'cell', cell: { meeting: mi, row: r.key } })}
                        style={[
                          styles.col,
                          styles.td,
                          empty && !optional && !m.locked && styles.tdEmpty,
                          m.locked && styles.tdPast,
                          isSel && styles.tdSel,
                        ]}
                      >
                        {empty ? (
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
              );
            })}

            {/* Footer: who is still free at each meeting. */}
            <View style={styles.tr}>
              <View style={[styles.placeCol, styles.tf]}>
                <Text style={styles.thText}>{t('dutiesMonth.freeRow')}</Text>
              </View>
              {meetings.map((m, mi) => (
                <Pressable
                  key={mi}
                  disabled={!m.held}
                  onPress={() => setSel({ kind: 'meeting', meeting: mi })}
                  style={[styles.col, styles.tf, !m.held && styles.hatched]}
                  testID={`free-${m.date}`}
                >
                  {m.held ? <Text style={styles.free}>{freeAt(m, pool, absQ.data).length}</Text> : null}
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

        <View style={styles.legend}>
          <Legend color="#dc2626" text={t('dutiesMonth.legend.absent')} />
          <Legend color="#f59e0b" text={t('dutiesMonth.legend.part')} />
          <Legend color="#a78bfa" text={t('dutiesMonth.legend.repeat')} />
        </View>
      </View>

      <View style={styles.panel} testID="duties-month-panel">
        {selCell && selMeeting ? (
          <CellPanel
            meeting={selMeeting}
            entry={table.cells[selCell.meeting].get(selCell.row)!}
            title={`${dayLabel(selMeeting)} · ${rowTitle(
              table.cells[selCell.meeting].get(selCell.row)!.row,
              table.cells[selCell.meeting].get(selCell.row)!.ordinal,
              placeCount.get(selCell.row.split('#')[0]) ?? 1,
            )}`}
            publishers={publishers}
            byId={byId}
            load={load}
            absences={absQ.data}
            pending={assignM.isPending}
            onPick={(publisherId) =>
              assignM.mutate({
                meeting: selMeeting,
                row: table.cells[selCell.meeting].get(selCell.row)!.row,
                ordinal: table.cells[selCell.meeting].get(selCell.row)!.ordinal,
                publisherId,
              })
            }
            onClose={() => setSel(null)}
          />
        ) : selMeeting ? (
          <PeoplePanel
            title={t('dutiesMonth.freeAt', { day: dayLabel(selMeeting) })}
            hint={t('dutiesMonth.freeAtHint')}
            people={freeAt(selMeeting, pool, absQ.data)}
            load={load}
            onClose={() => setSel(null)}
          />
        ) : (
          <PeoplePanel
            title={t('dutiesMonth.idleTitle')}
            hint={t('dutiesMonth.idleHint')}
            people={idle}
            load={load}
          />
        )}
      </View>
    </View>
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

/** One place at one meeting: who to put there, the fittest first. */
function CellPanel({
  meeting,
  entry,
  title,
  publishers,
  byId,
  load,
  absences,
  pending,
  onPick,
  onClose,
}: {
  meeting: MonthDutyMeeting;
  entry: { row: MonthDutyRow; ordinal: number };
  title: string;
  publishers: Publisher[];
  byId: Map<string, Publisher>;
  load: LoadMap;
  absences: Parameters<typeof absenceOn>[0];
  pending: boolean;
  onPick: (publisherId: string | null) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const current = entry.row.publisherId ? byId.get(entry.row.publisherId) : undefined;
  const busy = busyAt(meeting);
  const others = new Map<string, string>();
  for (const r of meeting.rows) {
    if (r.publisherId && r.publisherId !== entry.row.publisherId) {
      others.set(r.publisherId, dutyLabel({ ...r, id: '', congregationId: '', weekStartDate: '', eventType: 'midweek' } as never, t));
    }
  }
  const people = candidatesFor(entry.row.capability, publishers).filter((p) => p.id !== entry.row.publisherId);
  const reasonOf = (p: Publisher): string | null => {
    const a = absenceOn(absences, p.id, meeting.date);
    if (a) return t('dutiesMonth.reason.absent');
    if (others.has(p.id)) return t('dutiesMonth.reason.duty', { place: others.get(p.id) });
    if (busy.has(p.id)) return t('dutiesMonth.reason.part');
    return null;
  };
  const weight = (p: Publisher) => {
    const l = load.get(p.id);
    return (l?.duties ?? 0) * 2 + (l?.parts ?? 0);
  };
  const free = people
    .filter((p) => !reasonOf(p))
    .sort(
      (a, b) =>
        weight(a) - weight(b) ||
        (load.get(a.id)?.lastDutyBefore ?? '').localeCompare(load.get(b.id)?.lastDutyBefore ?? '') ||
        a.displayName.localeCompare(b.displayName, i18n.language),
    );
  const notNow = people.filter((p) => !!reasonOf(p)).sort((a, b) => a.displayName.localeCompare(b.displayName, i18n.language));
  const markName = entry.row.capability ? t(`capabilities.items.${entry.row.capability}`) : null;

  const Row = ({ p, reason }: { p: Publisher; reason: string | null }) => {
    const l = load.get(p.id);
    return (
      <Pressable
        testID={`pick-${p.id}`}
        onPress={() => onPick(p.id)}
        disabled={pending}
        style={({ pressed }) => [styles.person, styles.personPick, reason && styles.personOff, pressed && styles.pressed]}
      >
        <View style={styles.flex}>
          <Text style={styles.personName}>{p.displayName}</Text>
          {reason ? (
            <Text style={styles.reason}>{reason}</Text>
          ) : (
            <Text style={styles.personMeta}>
              {l?.lastDutyBefore ? t('dutiesMonth.lastDuty', { date: shortDate(l.lastDutyBefore, i18n.language) }) : t('dutiesMonth.neverDuty')}
            </Text>
          )}
        </View>
        <Count n={(l?.duties ?? 0) + (l?.parts ?? 0)} />
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.panelBody}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel={t('common.close')}>
          <Ionicons name="close" size={20} color="#64748b" />
        </Pressable>
      </View>
      <Text style={styles.panelHint}>
        {markName ? t('dutiesMonth.byMark', { name: markName }) : t('dutiesMonth.byBrothers')}
      </Text>
      {current ? (
        <View style={styles.current}>
          <View style={styles.flex}>
            <Text style={styles.currentLabel}>{t('dutiesMonth.now')}</Text>
            <Text style={styles.personName}>{current.displayName}</Text>
          </View>
          <Pressable onPress={() => onPick(null)} disabled={pending} style={styles.clear} testID="cell-clear">
            <Text style={styles.clearText}>{t('dutiesMonth.clear')}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.groupHead}>
        <Text style={styles.groupLabel}>{t('dutiesMonth.canPut')}</Text>
        <Text style={styles.groupLabel}>{t('dutiesMonth.thisMonth')}</Text>
      </View>
      {free.length === 0 ? <Text style={styles.nobody}>{t('dutiesMonth.nobody')}</Text> : null}
      {free.map((p) => (
        <Row key={p.id} p={p} reason={null} />
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
const PLACE = 140;

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
  tableScroll: { flexGrow: 0 },
  table: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  tr: { flexDirection: 'row' },
  placeCol: { width: PLACE, paddingHorizontal: 12, paddingVertical: 8, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderRightWidth: 1, borderRightColor: '#f1f5f9' },
  placeText: { fontFamily: FONT.semibold, fontSize: 13, color: INK },
  col: { width: COL, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderRightWidth: 1, borderRightColor: '#f1f5f9' },
  colSel: { backgroundColor: '#e0f2fe' },
  th: { backgroundColor: '#f8fafc', paddingVertical: 8, alignItems: 'center' },
  thText: { fontFamily: FONT.bold, fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase', color: FAINT },
  day: { fontFamily: FONT.extrabold, fontSize: 17, color: INK, lineHeight: 20 },
  dow: { fontFamily: FONT.bold, fontSize: 10, color: SOFT, marginTop: 1 },
  kind: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
  kindMid: { backgroundColor: '#fff7ed' },
  kindEnd: { backgroundColor: '#eff6ff' },
  kindText: { fontFamily: FONT.bold, fontSize: 10 },
  kindMidText: { color: '#c2410c' },
  kindEndText: { color: '#1d4ed8' },
  count: { fontFamily: FONT.bold, fontSize: 11, color: FAINT, marginTop: 3 },
  countFull: { color: '#047857' },
  notHeld: { fontFamily: FONT.semibold, fontSize: 10.5, color: SOFT, marginTop: 6, textAlign: 'center', paddingHorizontal: 4 },
  hatched: { backgroundColor: '#f1f5f9' },
  td: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 6 },
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
  markRepeat: { backgroundColor: '#a78bfa' },
  tf: { backgroundColor: '#f8fafc', paddingVertical: 8, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 0 },
  free: { fontFamily: FONT.extrabold, fontSize: 13, color: '#047857' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontFamily: FONT.medium, fontSize: 12, color: SOFT },
  panel: { width: 320, backgroundColor: '#fff', borderLeftWidth: 1, borderLeftColor: LINE },
  panelBody: { padding: 16, paddingBottom: 40, gap: 4 },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
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
  clear: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#fee2e2' },
  clearText: { fontFamily: FONT.bold, fontSize: 12.5, color: '#b91c1c' },
});
