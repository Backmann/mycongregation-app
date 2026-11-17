import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { extractErrorMessage, territoriesApi, type MyTerritory, type TerritoryMe } from '../../../lib/api';
import { failsScreen } from '../../../lib/screen-failure';
import { LoadFailure } from '../../../components/LoadFailure';
import { TerritoryMap } from '../../../components/territories/TerritoryMap';
import { OpenMapButton, ShareLink } from '../../../components/territories/MapLinks';
import { meetingDay, MyMeetings } from '../../../components/territories/MyMeetings';
import {
  AssignmentSheet,
  type AssignmentAction,
} from '../../../components/territories/AssignmentSheet';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../components/reports/ReportBits';
import { formatDateISO } from '../../../lib/dates';
import {
  daysBetween,
  DUE_SOON_DAYS,
  formatDayShort,
  routeLink,
  TONE_COLOR,
} from '../../../lib/territory-view';
import { BusinessList, pointsOf, useBusinesses } from '../../../components/territories/BusinessList';
import { DivisionButton } from '../../../components/territories/DivisionButton';

/**
 * «Мои участки» (11 November 2026; since 17 November 2026 by mockup boards
 * 7–11 and «Организованы…» ch. 9 §31–34).
 *
 * The territories the user walks: his own, and those held for his group
 * (the members see them too, with the «не беспокоить» addresses — they are
 * the ones knocking). A territory is the holder's duty: he sees what he took
 * on (the day it is to be worked by, how far it is), reports it worked and
 * keeps it or gives it back, and once takes a month more. Returning it
 * unworked or handing it on is the territory servant's decision after a
 * word with him — the screen names him. Without a territory: «Попросить
 * участок»; not while one of his is overdue. Below: his own past lines.
 */
export default function MyTerritoriesScreen() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['territories', 'mine'],
    queryFn: () => territoriesApi.mine(),
    throwOnError: failsScreen,
  });
  const meQ = useQuery({
    queryKey: ['territories', 'me'],
    queryFn: () => territoriesApi.me(),
    throwOnError: failsScreen,
  });
  const [acting, setActing] = useState<{ action: AssignmentAction; item: MyTerritory } | null>(null);

  if (q.isLoading || meQ.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error) return <LoadFailure error={q.error} onRetry={() => q.refetch()} />;
  if (meQ.error) return <LoadFailure error={meQ.error} onRetry={() => meQ.refetch()} />;
  const me = meQ.data!;
  // His own first, then his group's; each by the day it is due.
  const items = [...(q.data ?? [])].sort(
    (x, y) =>
      Number(y.assignment.mine) - Number(x.assignment.mine) ||
      (x.assignment.dueOn ?? '').localeCompare(y.assignment.dueOn ?? ''),
  );
  const ownCount = items.filter((i) => i.assignment.mine).length;

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={s.content}>
      <MyMeetings />
      {items.length === 0 && !me.mayAsk ? (
        <View style={[cardStyles.card, s.emptyCard]}>
          <Ionicons name="map-outline" size={28} color="#94a3b8" />
          <Text style={s.emptyText}>{t('territories.my.none')}</Text>
        </View>
      ) : null}
      {items.map((item) => (
        <Item
          key={item.assignment.id}
          item={item}
          progress={me.progress[item.id] ?? null}
          keeper={me.keeper}
          onAct={(action) => setActing({ action, item })}
        />
      ))}
      {me.mayAsk ? <Ask me={me} holds={ownCount > 0} /> : null}
      {me.past.length > 0 ? <Past me={me} /> : null}
      <AssignmentSheet
        action={acting?.action ?? null}
        assignment={
          acting
            ? {
                id: acting.item.assignment.id,
                assignedOn: acting.item.assignment.assignedOn,
                dueOn: acting.item.assignment.dueOn,
                completedOn: null,
                returnedOn: null,
                method: null,
                extended: acting.item.assignment.extended,
              }
            : null
        }
        keeps={false}
        onClose={() => setActing(null)}
      />
    </KeyboardScroll>
  );
}

/**
 * «Попросить участок» — asked of the territory servant (ch. 9 §32). With
 * none: a card; with some: a quiet line. Not while one of his is overdue.
 */
function Ask({ me, holds }: { me: TerritoryMe; holds: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['territories', 'me'] });
  const ask = useMutation({
    mutationFn: () => territoriesApi.ask(),
    onSuccess: refresh,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const cancel = useMutation({
    mutationFn: () => territoriesApi.cancelAsk(),
    onSuccess: refresh,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const busy = ask.isPending || cancel.isPending;
  if (me.request) {
    return (
      <View style={[cardStyles.card, s.askCard]}>
        <Text style={s.kicker}>
          {t('territories.ask.sent', {
            date: formatDayShort(me.request.createdAt.slice(0, 10), i18n.language),
          })}
        </Text>
        <Text style={s.askTitle}>{t('territories.ask.waiting')}</Text>
        <Text style={s.askText}>{t('territories.ask.waitingHint')}</Text>
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Pressable
          onPress={() => cancel.mutate()}
          disabled={busy}
          style={({ pressed }) => [s.btn, s.btnSelf, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Text style={s.btnText}>{t('territories.ask.cancel')}</Text>
        </Pressable>
      </View>
    );
  }
  if (me.overdue.length > 0) {
    return (
      <Text style={s.quiet}>
        {t('territories.ask.overdue', { list: me.overdue.map((o) => o.number).join(', ') })}
      </Text>
    );
  }
  if (holds) {
    return (
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Pressable
          onPress={() => ask.mutate()}
          disabled={busy}
          style={({ pressed }) => [s.more, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={18} color={BRAND} />
          <Text style={s.moreText}>{t('territories.ask.another')}</Text>
        </Pressable>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    );
  }
  return (
    <View style={[cardStyles.card, s.askCard]}>
      <Text style={s.askTitle}>{t('territories.ask.none')}</Text>
      <Text style={s.askText}>{t('territories.ask.hint')}</Text>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable
        onPress={() => ask.mutate()}
        disabled={busy}
        style={({ pressed }) => [s.btn, s.btnPrimary, s.btnSelf, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
      >
        {ask.isPending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[s.btnText, { color: '#fff' }]}>{t('territories.ask.go')}</Text>
        )}
      </Pressable>
    </View>
  );
}

/** His own lines of the S-13, the current and the previous service year. */
function Past({ me }: { me: TerritoryMe }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <View style={[cardStyles.card, { gap: 2 }]}>
      <Text style={s.kicker}>{t('territories.my.past')}</Text>
      {me.past.map((p, i) => {
        const end = p.completedOn
          ? `${formatDayShort(p.completedOn, lang)} · ${t('territories.my.pastWorked')}${
              p.method ? `, ${t(`territories.method.${p.method}`)}` : ''
            }`
          : p.transferred
            ? `${formatDayShort(p.returnedOn!, lang)} · ${t('territories.line.transferred')}`
            : `${formatDayShort(p.returnedOn!, lang)} · ${t('territories.my.pastReturned')}`;
        return (
          <View key={`${p.number}-${p.assignedOn}-${i}`} style={s.pastRow}>
            <Text style={s.pastNumber}>{p.number}</Text>
            <Text style={s.pastMeta}>
              {formatDayShort(p.assignedOn, lang)} → {end}
            </Text>
          </View>
        );
      })}
      <Text style={s.small}>{t('territories.my.pastRule')}</Text>
    </View>
  );
}

function Item({
  item,
  progress,
  keeper,
  onAct,
}: {
  item: MyTerritory;
  /** Per cent worked by the «street walked» marks; null: none marked. */
  progress: number | null;
  keeper: string | null;
  onAct: (a: AssignmentAction) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = formatDateISO(new Date());
  const a = item.assignment;
  const left = a.dueOn ? daysBetween(today, a.dueOn) : null;
  const late = left !== null && left < 0;
  const soon = left !== null && left <= DUE_SOON_DAYS;
  const route = routeLink(item.geometry);
  // A business territory: its list to walk and mark (13 November 2026).
  const business = item.category === 'business';
  const businessesQ = useBusinesses(item.id, business);

  return (
    <View style={s.item}>
      {Platform.OS === 'web' ? (
        <TerritoryMap
          shapes={[{ id: item.id, number: item.number, geometry: item.geometry, tone: 'mine' }]}
          focus={item.id}
          height={300}
          points={business ? pointsOf(businessesQ.data) : undefined}
        />
      ) : (
        <OpenMapButton assignmentId={a.id} />
      )}

      <View style={[cardStyles.card, s.card]}>
        <Text style={s.kicker}>
          {[item.locality, t('territories.my.since', { date: formatDayShort(a.assignedOn, lang) })]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <View style={s.titleRow}>
          <Text style={s.title}>{item.number}</Text>
          {route ? (
            <Pressable onPress={() => void Linking.openURL(route)} style={s.route} accessibilityRole="link">
              <Ionicons name="navigate-outline" size={16} color={BRAND} />
              <Text style={s.routeText}>{t('territories.route')}</Text>
            </Pressable>
          ) : null}
        </View>
        {item.meeting ? (
          <View style={s.meeting}>
            <Ionicons name="people-outline" size={15} color={BRAND} />
            <Text style={s.meetingText}>
              {t('territories.my.meeting', {
                when: `${meetingDay(item.meeting.date, lang)} · ${item.meeting.startTime}`,
                where: item.meeting.address,
              })}
            </Text>
          </View>
        ) : null}
        {a.forGroupName ? (
          <Text style={s.group}>
            {a.mine
              ? t('territories.my.forGroup', { group: a.forGroupName })
              : t('territories.my.ofGroup', { group: a.forGroupName, name: a.holderName })}
          </Text>
        ) : null}
        {a.dueOn ? (
          <View style={[s.due, soon && s.dueSoon, late && s.dueLate]}>
            <Text style={[s.dueText, (soon || late) && { color: TONE_COLOR.overdue }]}>
              {t('territories.my.due', { date: formatDayShort(a.dueOn, lang) })}
              {left !== null
                ? ` · ${late ? t('territories.my.late', { count: -left }) : t('territories.my.left', { count: left })}`
                : ''}
            </Text>
          </View>
        ) : null}
        {progress !== null ? (
          <View style={s.progress}>
            <View style={s.progressHead}>
              <Text style={s.progressText}>{t('territories.my.progress', { pct: progress })}</Text>
              <Text style={s.progressBy}>{t('territories.my.progressBy')}</Text>
            </View>
            <View style={s.bar}>
              <View style={[s.barFill, { width: `${progress}%` }]} />
            </View>
          </View>
        ) : null}

        {/* Several groups on one territory today: each its own streets. */}
        {!business ? <DivisionButton territoryId={item.id} /> : null}

        {business ? (
          <View style={{ marginTop: 10, gap: 6 }}>
            <Text style={s.noCallsTitle}>{t('territories.business.title')}</Text>
            <BusinessList territoryId={item.id} keeps={false} canMark />
          </View>
        ) : null}

        <View style={s.noCalls}>
          <View style={s.noCallsHead}>
            <Ionicons name="hand-left-outline" size={16} color="#c2410c" />
            <Text style={s.noCallsTitle}>
              {item.noCalls.length
                ? t('territories.my.noCalls', { count: item.noCalls.length })
                : t('territories.my.noCallsNone')}
            </Text>
          </View>
          {item.noCalls.map((n) => (
            <Text key={n.id} style={s.address}>
              {n.address}
              {n.surname ? ` · ${n.surname}` : ''}
            </Text>
          ))}
          <Text style={s.small}>{t('territories.my.noCallsRule')}</Text>
        </View>

        {a.mine ? (
          <View style={s.actions}>
            <Pressable
              onPress={() => onAct('complete')}
              style={({ pressed }) => [s.btn, s.btnPrimary, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={[s.btnText, { color: '#fff' }]}>{t('territories.action.complete.title')}</Text>
            </Pressable>
            {!a.extended ? (
              <Pressable
                onPress={() => onAct('extend')}
                style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
              >
                <Text style={s.btnText}>{t('territories.action.extend.title')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {/* Returning it unworked or handing it on: a word with the territory
            servant, not a button (17 November 2026). */}
        {a.mine ? (
          <Text style={s.talk}>
            {keeper
              ? t('territories.my.talkTo', { name: keeper })
              : t('territories.my.talk')}
          </Text>
        ) : null}
        {a.mine ? <ShareLink assignmentId={a.id} /> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center', gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyCard: { alignItems: 'center', gap: 10, paddingVertical: 28 },
  emptyText: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: MUTED, textAlign: 'center' },
  item: { gap: 10 },
  card: { marginBottom: 0 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  title: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 26, color: INK },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: BRAND,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  routeText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  meeting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    backgroundColor: '#ecfeff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  meetingText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  group: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK, marginTop: 4 },
  due: { marginTop: 10, alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f1f5f9' },
  dueSoon: { backgroundColor: '#fff7ed' },
  dueLate: { backgroundColor: '#ffedd5' },
  dueText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  noCalls: { marginTop: 16, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 12, gap: 4 },
  noCallsHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noCallsTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  address: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: INK, marginLeft: 24 },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: '#94a3b8', marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  btnPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  btnText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK },
  btnSelf: { alignSelf: 'flex-start', marginTop: 10 },
  progress: { marginTop: 10, gap: 6 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  progressText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  progressBy: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },
  bar: { height: 8, borderRadius: 999, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: '#16a34a' },
  talk: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 12, lineHeight: 18 },
  askCard: { gap: 4 },
  askTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: INK, marginTop: 2 },
  askText: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, lineHeight: 19 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 6 },
  quiet: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, textAlign: 'center', lineHeight: 18 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12 },
  moreText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: BRAND },
  pastRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  pastNumber: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK },
  pastMeta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
});
