import { createContext, useContext, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SpecialEventDetail } from '../../../components/SpecialEventDetail';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  extractErrorMessage,
  meetingSettingsApi,
  specialEventsApi,
  talkExchangeApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { formatDateISO } from '../../../lib/dates';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import {
  daysUntil,
  effectIsNotable,
  effectOf,
  EventListItem,
  KIND_LOOK,
  kindOf,
  listItems,
  programmeLinkOf,
  serviceYearOf,
} from '../../../lib/event-view';
import { useEffectText } from '../../../lib/event-effect-text';

/**
 * The congregation's events (27 September) — what is coming and what it
 * means for the meetings, in one list.
 *
 * The first thing is the nearest one, told in full; below it the rest by
 * month, each with the one line that matters: whether the meetings go as
 * usual, move, change or do not happen. A special talk is here too — it
 * lives in the talk journal now, but for the congregation it is an occasion
 * like the others. What is over stays, by service year, one tap away.
 */
export default function SpecialEventsListScreen() {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const { canManageEvents } = usePermissions();
  const [showPast, setShowPast] = useState(false);
  const [showBin, setShowBin] = useState(false);
  const today = formatDateISO(new Date());
  // A wide screen shows the list and the open event side by side (27
  // September): on a laptop, going back and forth between two screens to
  // compare the next events is what the space is for.
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [picked, setPicked] = useState<string | null>(null);

  const eventsQ = useQuery({
    // Everything ever recorded, and the bin for those who keep it: the past
    // and the bin show their counts on their buttons before they are opened.
    queryKey: ['special-events', 'list-all', canManageEvents],
    queryFn: () =>
      specialEventsApi.list({ all: true, includeRemoved: canManageEvents }),
  });
  const talksQ = useQuery({
    queryKey: ['special-talks'],
    queryFn: () => talkExchangeApi.specialTalks(),
  });
  const settingsQ = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const versions = settingsQ.data?.versions;

  const { upcoming, past, removed } = useMemo(() => {
    const all = eventsQ.data ?? [];
    const live = all.filter((e) => !e.deletedAt);
    const items = listItems(live, talksQ.data ?? []);
    return {
      upcoming: items.filter((x) => x.end >= today),
      past: items.filter((x) => x.end < today).reverse(),
      removed: listItems(
        all.filter((e) => !!e.deletedAt),
        [],
      ).reverse(),
    };
  }, [eventsQ.data, talksQ.data, today]);

  const [hero, ...rest] = upcoming;
  const refetch = () => {
    void eventsQ.refetch();
    void talksQ.refetch();
  };

  const monthTitle = (iso: string) => {
    const d = dayjs(iso).locale(loc);
    return iso.slice(0, 4) === today.slice(0, 4)
      ? d.format('MMMM')
      : d.format('MMMM YYYY');
  };

  // The rest by month; the past by service year, newest first.
  const byMonth = groupBy(rest, (x) => x.date.slice(0, 7));
  const byYear = groupBy(past, (x) => String(serviceYearOf(x.date)));

  const weekendTime = (iso: string) =>
    effectiveVersionFor(versions, iso)?.weekendTime ?? null;

  const firstEvent = upcoming.find((x) => x.kind === 'event');
  const selected =
    picked ?? (firstEvent && firstEvent.kind === 'event' ? firstEvent.event.id : null);

  const list = (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={eventsQ.isRefetching || talksQ.isRefetching}
          onRefresh={refetch}
        />
      }
    >
      {eventsQ.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            {extractErrorMessage(eventsQ.error)}
          </Text>
        </View>
      ) : null}

      {eventsQ.isLoading ? (
        <ActivityIndicator size="large" style={{ marginTop: 32 }} />
      ) : (
        <>
          {hero ? (
            <>
              <Text style={styles.sectionLabel}>
                {t('specialEvents.list.nearest')}
              </Text>
              <Hero
                item={hero}
                today={today}
                weekendTime={weekendTime(hero.date)}
                link={programmeLinkOf(hero, versions)}
              />
            </>
          ) : (
            <Text style={styles.empty}>{t('specialEvents.empty')}</Text>
          )}

          {byMonth.map(([month, items]) => (
            <View key={month}>
              <Text style={styles.sectionLabel}>{monthTitle(`${month}-01`)}</Text>
              <View style={styles.card}>
                {items.map((x, i) => (
                  <Row
                    key={x.key}
                    item={x}
                    first={i === 0}
                    manager={canManageEvents}
                    weekendTime={weekendTime(x.date)}
                    link={programmeLinkOf(x, versions)}
                  />
                ))}
              </View>
            </View>
          ))}

          <View style={styles.moreRow}>
            {past.length > 0 ? (
              <Pressable
                style={[styles.moreBtn, showPast && styles.moreBtnOn]}
                onPress={() => setShowPast((v) => !v)}
              >
                <Ionicons name="time-outline" size={16} color="#334155" />
                <Text style={styles.moreText}>
                  {t('specialEvents.list.past', { n: past.length })}
                </Text>
              </Pressable>
            ) : null}
            {canManageEvents && removed.length > 0 ? (
              <Pressable
                style={[styles.moreBtn, showBin && styles.moreBtnOn]}
                onPress={() => setShowBin((v) => !v)}
              >
                <Ionicons name="trash-outline" size={16} color="#334155" />
                <Text style={styles.moreText}>
                  {t('specialEvents.list.bin', { n: removed.length })}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {showPast
            ? byYear.map(([year, items]) => (
                <View key={year}>
                  <Text style={styles.sectionLabel}>
                    {t('specialEvents.list.serviceYear', {
                      from: year,
                      to: String(Number(year) + 1).slice(2),
                    })}
                  </Text>
                  <View style={styles.card}>
                    {items.map((x, i) => (
                      <Row
                        key={x.key}
                        item={x}
                        first={i === 0}
                        manager={false}
                        past
                        weekendTime={weekendTime(x.date)}
                        link={programmeLinkOf(x, versions)}
                      />
                    ))}
                  </View>
                </View>
              ))
            : null}

          {showBin ? (
            <View>
              <Text style={styles.sectionLabel}>
                {t('specialEvents.list.binTitle')}
              </Text>
              <View style={styles.card}>
                {removed.map((x, i) => (
                  <Row
                    key={x.key}
                    item={x}
                    first={i === 0}
                    manager={false}
                    removed
                    weekendTime={null}
                    link={null}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );

  if (!wide) return list;
  return (
    <OpenCtx.Provider value={{ selected, select: setPicked }}>
      <View style={styles.wideRow}>
        <View style={styles.listWide}>{list}</View>
        <View style={styles.detailPane}>
          {selected ? (
            <SpecialEventDetail
              key={selected}
              id={selected}
              onRemoved={() => setPicked(null)}
            />
          ) : (
            <Text style={styles.empty}>{t('specialEvents.empty')}</Text>
          )}
        </View>
      </View>
    </OpenCtx.Provider>
  );
}

/** On a wide screen an event opens beside the list instead of over it. */
const OpenCtx = createContext<{
  selected: string | null;
  select: ((id: string) => void) | null;
}>({ selected: null, select: null });

function groupBy<T>(items: T[], key: (x: T) => string): [string, T[]][] {
  const out: [string, T[]][] = [];
  for (const x of items) {
    const k = key(x);
    const last = out[out.length - 1];
    if (last && last[0] === k) last[1].push(x);
    else out.push([k, [x]]);
  }
  return out;
}

/** Kind, title, the line under it — shared by the card on top and the rows. */
function useItemText(item: EventListItem, weekendTime: string | null) {
  const { t } = useTranslation();
  const kind = kindOf(item);
  const kindLabel =
    kind === 'other'
      ? t('specialEvents.list.kindOther')
      : t(`specialEvents.types.${kind}`);
  if (item.kind === 'talk') {
    const x = item.talk;
    return {
      kind,
      kindLabel,
      time: weekendTime,
      title: x.theme,
      meta: x.speaker
        ? [x.speaker, x.speakerCongregation].filter(Boolean).join(', ')
        : t('specialEvents.list.speakerLater'),
    };
  }
  const e = item.event;
  const coNames = [e.coFirstName, e.coLastName].filter(Boolean).join(' ');
  const title =
    kind === 'circuit_overseer_visit' && coNames
      ? e.coWifeName
        ? t('specialEvents.list.coWithWife', { name: coNames, wife: e.coWifeName })
        : coNames
      : e.title;
  const time = e.time ? `${e.time}${e.timeEnd ? `–${e.timeEnd}` : ''}` : null;
  return {
    kind,
    kindLabel,
    time,
    title,
    // The place, unless the title already is the place (a convention is
    // often named by its hall).
    meta:
      kind === 'circuit_overseer_visit' || e.address?.trim() === title.trim()
        ? null
        : e.address || null,
  };
}

/** A manager's reminder of what an event still lacks — only for the keeper. */
function useManagerHint(item: EventListItem): string | null {
  const { t } = useTranslation();
  if (item.kind !== 'event') return null;
  const e = item.event;
  const kind = kindOf(item);
  if ((kind === 'regional_convention' || kind === 'circuit_assembly') && !e.programUrl)
    return t('specialEvents.list.noProgramme');
  if (kind === 'memorial' && !e.memorialPublishedAt)
    return t('specialEvents.list.memorialDraft');
  return null;
}

function openItem(
  item: EventListItem,
  link: { week: string; meeting: string } | null,
  select: ((id: string) => void) | null = null,
) {
  if (item.kind === 'event' && select) {
    select(item.event.id);
  } else if (item.kind === 'event') {
    router.push(`/special-events/${item.event.id}` as never);
  } else if (link) {
    router.push(`/schedule?week=${link.week}&meeting=${link.meeting}` as never);
  }
}

function Hero({
  item,
  today,
  weekendTime,
  link,
}: {
  item: EventListItem;
  today: string;
  weekendTime: string | null;
  link: { week: string; meeting: string } | null;
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const open = useContext(OpenCtx);
  const text = useItemText(item, weekendTime);
  const effect = effectOf(item);
  const effectText = useEffectText(effect);
  const look = KIND_LOOK[text.kind];
  const n = daysUntil(today, item.date);
  const when =
    item.date < today && item.end >= today
      ? t('specialEvents.list.now')
      : n === 0
        ? t('specialEvents.list.today')
        : n === 1
        ? t('specialEvents.list.tomorrow')
        : t('specialEvents.list.inDays', { count: n });
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
  const dateLine =
    item.end !== item.date
      ? `${dayjs(item.date).locale(loc).format('D MMMM')} – ${dayjs(item.end)
          .locale(loc)
          .format('D MMMM')}`
      : cap(dayjs(item.date).locale(loc).format('dddd, D MMMM'));
  return (
    <Pressable
      onPress={() => openItem(item, link, open.select)}
      style={({ pressed }) => [
        styles.hero,
        { borderColor: look.soft },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.heroTop}>
        <View style={[styles.kindIcon, { backgroundColor: look.soft }]}>
          <Ionicons name={look.icon as never} size={16} color={look.color} />
        </View>
        <Text style={[styles.heroKind, { color: look.color }]} numberOfLines={1}>
          {text.kindLabel}
        </Text>
        <Text style={[styles.heroWhen, { backgroundColor: look.soft, color: look.color }]}>
          {when}
        </Text>
      </View>
      <Text style={styles.heroDate}>{dateLine}</Text>
      <Text style={styles.heroTitle}>{text.title}</Text>
      {[text.time, text.meta].filter(Boolean).length > 0 ? (
        <Text style={styles.heroMeta}>
          {[text.time, text.meta].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {effectText ? (
        <View style={styles.effectRow}>
          {effectIsNotable(effect) ? <View style={styles.dot} /> : null}
          <Text
            style={[
              styles.effect,
              effectIsNotable(effect) && styles.effectNotable,
            ]}
          >
            {effectText}
          </Text>
        </View>
      ) : null}
      {link ? (
        <View style={styles.heroActions}>
          <Pressable
            hitSlop={8}
            onPress={() =>
              router.push(
                `/schedule?week=${link.week}&meeting=${link.meeting}` as never,
              )
            }
          >
            <Text style={styles.heroAction}>
              {t('specialEvents.list.inProgramme')}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

function Row({
  item,
  first,
  manager,
  past = false,
  removed = false,
  weekendTime,
  link,
}: {
  item: EventListItem;
  first: boolean;
  manager: boolean;
  past?: boolean;
  removed?: boolean;
  weekendTime: string | null;
  link: { week: string; meeting: string } | null;
}) {
  const { t, i18n } = useTranslation();
  const loc = i18n.language;
  const text = useItemText(item, weekendTime);
  const effect = past || removed ? null : effectOf(item);
  const effectText = useEffectText(effect);
  const hint = useManagerHint(item);
  const look = KIND_LOOK[text.kind];
  const open = useContext(OpenCtx);
  const isSelected =
    !!open.select && item.kind === 'event' && open.selected === item.event.id;
  const d = (iso: string, f: string) => dayjs(iso).locale(loc).format(f);
  const range = item.end !== item.date;
  return (
    <Pressable
      onPress={() => openItem(item, link, open.select)}
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowBorder,
        isSelected && styles.rowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.dateCol}>
        <Text style={[styles.dateNum, range && styles.dateNumRange]}>
          {range ? `${d(item.date, 'D')}–\n${d(item.end, 'D')}` : d(item.date, 'D')}
        </Text>
        <Text style={styles.dateDow}>
          {range
            ? `${d(item.date, 'dd')}–${d(item.end, 'dd')}`
            : past
              ? d(item.date, 'MMM')
              : d(item.date, 'dd')}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.kindRow}>
          <Ionicons name={look.icon as never} size={13} color={look.color} />
          <Text style={[styles.kind, { color: look.color }]} numberOfLines={1}>
            {text.kindLabel}
            {text.time ? ` · ${text.time}` : ''}
          </Text>
        </View>
        <Text
          style={[styles.title, (past || removed) && styles.titlePast, removed && styles.removed]}
          numberOfLines={2}
        >
          {text.title}
        </Text>
        {text.meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {text.meta}
          </Text>
        ) : null}
        {effectText ? (
          <View style={styles.effectRow}>
            {effectIsNotable(effect) ? <View style={styles.dot} /> : null}
            <Text
              style={[
                styles.effect,
                effectIsNotable(effect) && styles.effectNotable,
              ]}
            >
              {effectText}
            </Text>
          </View>
        ) : null}
        {manager && hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {removed ? (
          <Text style={styles.meta}>{t('specialEvents.list.inBin')}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  wideRow: { flex: 1, flexDirection: 'row', backgroundColor: '#f8fafc' },
  listWide: {
    width: 440,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
  },
  detailPane: { flex: 1 },
  rowSelected: { backgroundColor: '#f0f9ff' },
  content: { padding: 16, paddingBottom: 40, gap: 4 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 32 },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: '#b91c1c' },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 8,
  },
  hero: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    gap: 4,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroKind: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
  },
  heroWhen: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  heroDate: {
    fontSize: 21,
    fontFamily: 'Manrope_800ExtraBold',
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 8,
  },
  heroTitle: {
    fontSize: 16,
    fontFamily: 'Manrope_600SemiBold',
    fontWeight: '600',
    color: '#1e293b',
  },
  heroMeta: { fontSize: 14, color: '#475569' },
  heroActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    marginTop: 10,
    paddingTop: 10,
  },
  heroAction: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#0369a1',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rowBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  pressed: { backgroundColor: '#f8fafc' },
  dateCol: { width: 44, alignItems: 'center' },
  dateNum: {
    fontSize: 22,
    fontFamily: 'Manrope_800ExtraBold',
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  dateNumRange: { fontSize: 16, lineHeight: 19 },
  dateDow: {
    fontSize: 11,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kind: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 2,
  },
  titlePast: { color: '#475569' },
  removed: { textDecorationLine: 'line-through' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 2 },
  effectRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#ea580c' },
  effect: { flex: 1, fontSize: 13, color: '#64748b' },
  effectNotable: {
    color: '#c2410c',
    fontFamily: 'Manrope_600SemiBold',
    fontWeight: '600',
  },
  hint: { fontSize: 12, color: '#b45309', marginTop: 3 },
  moreRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  moreBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  moreBtnOn: { borderStyle: 'solid', borderColor: '#94a3b8' },
  moreText: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
    fontWeight: '600',
    color: '#334155',
  },
});
