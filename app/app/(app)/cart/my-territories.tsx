import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { territoriesApi, type MyTerritory } from '../../../lib/api';
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

/**
 * «Мой участок» (11 November 2026; mockup «Мой участок»).
 *
 * The territories the user walks: his own, and those held for his group
 * (the members see them too, with the «не беспокоить» addresses — they are
 * the ones knocking). Only the holder closes or extends; «Маршрут» hands
 * the place to the phone's own navigation.
 */
export default function MyTerritoriesScreen() {
  const { t } = useTranslation();
  const q = useQuery({
    queryKey: ['territories', 'mine'],
    queryFn: () => territoriesApi.mine(),
    throwOnError: failsScreen,
  });
  const [acting, setActing] = useState<{ action: AssignmentAction; item: MyTerritory } | null>(null);

  if (q.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error) return <LoadFailure error={q.error} onRetry={() => q.refetch()} />;
  // His own first, then his group's; each by the day it is due.
  const items = [...(q.data ?? [])].sort(
    (x, y) =>
      Number(y.assignment.mine) - Number(x.assignment.mine) ||
      (x.assignment.dueOn ?? '').localeCompare(y.assignment.dueOn ?? ''),
  );

  return (
    <KeyboardScroll style={s.screen} contentContainerStyle={s.content}>
      <MyMeetings />
      {items.length === 0 ? (
        <View style={[cardStyles.card, s.emptyCard]}>
          <Ionicons name="map-outline" size={28} color="#94a3b8" />
          <Text style={s.emptyText}>{t('territories.my.none')}</Text>
        </View>
      ) : (
        items.map((item) => (
          <Item key={item.assignment.id} item={item} onAct={(action) => setActing({ action, item })} />
        ))
      )}
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

function Item({ item, onAct }: { item: MyTerritory; onAct: (a: AssignmentAction) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const today = formatDateISO(new Date());
  const a = item.assignment;
  const left = a.dueOn ? daysBetween(today, a.dueOn) : null;
  const late = left !== null && left < 0;
  const soon = left !== null && left <= DUE_SOON_DAYS;
  const route = routeLink(item.geometry);

  return (
    <View style={s.item}>
      {Platform.OS === 'web' ? (
        <TerritoryMap
          shapes={[{ id: item.id, number: item.number, geometry: item.geometry, tone: 'mine' }]}
          focus={item.id}
          height={300}
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
            <Pressable
              onPress={() => onAct('return')}
              style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
            >
              <Text style={s.btnText}>{t('territories.action.return.title')}</Text>
            </Pressable>
          </View>
        ) : null}
        {a.mine && a.extended ? <Text style={s.small}>{t('territories.action.extend.already')}</Text> : null}
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
});
