import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import {
  externalCongregationsApi,
  meetingSettingsApi,
  publicTalksApi,
  specialEventsApi,
  talkExchangeApi,
  visitingSpeakersApi,
} from '../../../lib/api';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { addDays, formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { useAllPublishers } from '../../../lib/useAllPublishers';
import { capitalizeFirst } from '../../../lib/relative-time';
import { FONT } from '../../../lib/typography';

/**
 * THE COORDINATOR'S DESK (Lionel, 25 October 2026).
 *
 * It was four links. Now it opens on what the coordinator needs first: who
 * comes this weekend, with his talk, his song and who brings the lunch bag —
 * and how much still waits for somebody. The directories follow, below.
 * The same queries as the journal, so it costs nothing to open one after the
 * other.
 */
export default function TalkCoordinatorScreen() {
  const { t, i18n } = useTranslation();
  const list = useQuery({ queryKey: ['talk-exchange'], queryFn: () => talkExchangeApi.list() });
  const outAttn = useQuery({
    queryKey: ['talk-exchange', 'attention'],
    queryFn: () => talkExchangeApi.attention(),
  });
  const inAttn = useQuery({
    queryKey: ['talk-exchange', 'attention', 'incoming'],
    queryFn: () => talkExchangeApi.incomingAttention(),
  });
  const settings = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const speakers = useQuery({
    queryKey: ['visiting-speakers'],
    queryFn: () => visitingSpeakersApi.list(),
  });
  const congs = useQuery({
    queryKey: ['external-congregations'],
    queryFn: () => externalCongregationsApi.list(),
  });
  const talks = useQuery({
    queryKey: ['public-talks', 'all'],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });
  const pubs = useAllPublishers();
  const events = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
  });

  // This weekend: the first weekend day from today, by the settings in force.
  const today = dayjs().format('YYYY-MM-DD');
  const monday = formatDateISO(startOfWeekMonday(new Date(`${today}T00:00:00`)));
  const dayOfWeek = (mon: string) => {
    const v =
      effectiveVersionFor(settings.data?.versions ?? [], mon) ?? settings.data?.effective ?? null;
    return {
      date: formatDateISO(addDays(new Date(`${mon}T00:00:00`), (v?.weekendDow ?? 7) - 1)),
      time: v?.weekendTime ?? null,
    };
  };
  let next = dayOfWeek(monday);
  let nextMonday = monday;
  if (next.date < today) {
    nextMonday = formatDateISO(addDays(new Date(`${monday}T00:00:00`), 7));
    next = dayOfWeek(nextMonday);
  }
  const entry = (list.data ?? []).find(
    (e) =>
      e.direction === 'incoming' &&
      e.status !== 'did_not_happen' &&
      e.date.slice(0, 10) >= nextMonday &&
      e.date.slice(0, 10) <= formatDateISO(addDays(new Date(`${nextMonday}T00:00:00`), 6)),
  );
  const card = entry?.visitingSpeakerId
    ? (speakers.data ?? []).find((s) => s.id === entry.visitingSpeakerId)
    : undefined;
  const pubName = (id: string | null | undefined) =>
    id ? ((pubs.data?.data ?? []).find((p) => p.id === id)?.displayName ?? null) : null;
  const guestName = entry
    ? entry.publisherId
      ? pubName(entry.publisherId)
      : card
        ? [card.firstName, card.lastName].filter(Boolean).join(' ')
        : entry.speakerName
    : null;
  const guestCong = card?.externalCongregation?.name ?? entry?.speakerCongregation ?? null;
  const talk = entry?.publicTalkId
    ? (talks.data?.data ?? []).find((x) => x.id === entry.publicTalkId)
    : undefined;
  const talkText = entry?.specialTheme?.trim()
    ? entry.specialTheme.trim()
    : talk
      ? `№${talk.number} «${talk.title}»`
      : null;
  const lunch = entry && !entry.publisherId ? pubName(entry.hospitalityPublisherId) : null;
  // A convention or an assembly that weekend: nobody is to come, and that is
  // no gap. A circuit visit has its overseer's own entry, shown as any guest.
  const congress = (events.data ?? []).find(
    (ev) =>
      (ev.type === 'regional_convention' || ev.type === 'circuit_assembly') &&
      ev.date <= next.date &&
      (ev.endDate ?? ev.date) >= next.date,
  );
  const nextLabel = capitalizeFirst(dayjs(next.date).locale(i18n.language).format('dd, D MMMM'));

  const empty = (inAttn.data ?? []).filter((a) => a.reason === 'needs_guest').length;
  const other =
    (inAttn.data ?? []).filter((a) => a.reason !== 'needs_guest').length +
    (outAttn.data ?? []).length;

  const guestCount = (speakers.data ?? []).filter((s) => !s.circuitOverseer).length;
  const congCount = (congs.data ?? []).length;

  const openLog = (q = '') => router.push(`/talk-coordinator/log${q}` as never);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.inner}>
          {/* «Договорился» first (26 October 2026): the moment after the
              conversation is when the entry is made — or forgotten. */}
          <Pressable
            style={({ pressed }) => [styles.quick, pressed && { opacity: 0.9 }]}
            onPress={() => openLog('?quick=in')}
            accessibilityRole="button"
            testID="desk-quick"
          >
            <View style={styles.quickPlus}>
              <Ionicons name="add" size={22} color="#ffffff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickTitle}>{t('talkCoordinator.quick.title')}</Text>
              <Text style={styles.quickSub}>{t('talkCoordinator.quick.deskSub')}</Text>
            </View>
          </Pressable>
          <View style={styles.hero}>
            <Text style={styles.heroOver}>
              {t('talkCoordinator.desk.thisWeekend', { day: nextLabel })}
              {next.time ? ` · ${next.time.slice(0, 5)}` : ''}
            </Text>
            {list.isLoading ? (
              <ActivityIndicator color="#ffffff" style={{ marginVertical: 16 }} />
            ) : congress && !entry ? (
              <>
                <Text style={styles.heroName}>
                  {t(`specialEvents.types.${congress.type}`, {
                    defaultValue: congress.title ?? '',
                  })}
                </Text>
                <Text style={styles.heroTalk}>{t('talkCoordinator.desk.congress')}</Text>
              </>
            ) : entry ? (
              <>
                <Text style={styles.heroName}>
                  {guestName ?? t('talkCoordinator.log.unknownSpeaker')}
                </Text>
                {guestCong ? <Text style={styles.heroSub}>{guestCong}</Text> : null}
                <Text style={styles.heroTalk}>
                  {talkText ?? t('talkCoordinator.journal.noTalk')}
                </Text>
                <View style={styles.chips}>
                  {entry.openingSong ? (
                    <View style={styles.chip}>
                      <Ionicons name="musical-notes-outline" size={12} color="#e6f6f8" />
                      <Text style={styles.chipText}>
                        {t('talkCoordinator.journal.song', { n: entry.openingSong })}
                      </Text>
                    </View>
                  ) : null}
                  {!entry.publisherId ? (
                    <View style={[styles.chip, !lunch && styles.chipWarn]}>
                      <Ionicons
                        name="bag-handle-outline"
                        size={12}
                        color={lunch ? '#e6f6f8' : '#fed7aa'}
                      />
                      <Text style={[styles.chipText, !lunch && { color: '#fed7aa' }]}>
                        {lunch
                          ? t('talkCoordinator.journal.lunchBy', { name: lunch })
                          : t('talkCoordinator.journal.lunchNobody')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.heroBtns}>
                  {!entry.publisherId && !entry.circuitVisitId ? (
                    <Pressable
                      style={({ pressed }) => [styles.heroBtn, pressed && { opacity: 0.85 }]}
                      onPress={() => openLog(`?entry=${entry.id}&msg=invite`)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.heroBtnText}>{t('talkCoordinator.desk.msgGuest')}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [styles.heroBtn, styles.heroBtnGhost, pressed && { opacity: 0.85 }]}
                    onPress={() => openLog(`?entry=${entry.id}`)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.heroBtnText, { color: '#ffffff' }]}>
                      {t('talkCoordinator.desk.openVisit')}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.heroName}>{t('talkCoordinator.desk.nobody')}</Text>
                <Text style={styles.heroTalk}>{t('talkCoordinator.desk.nobodyHint')}</Text>
                <Pressable
                  style={({ pressed }) => [styles.heroBtn, { marginTop: 14 }, pressed && { opacity: 0.85 }]}
                  onPress={() => openLog(`?quick=in&week=${nextMonday}`)}
                  accessibilityRole="button"
                >
                  <Text style={styles.heroBtnText}>{t('talkCoordinator.journal.invite')}</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.tiles}>
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              onPress={() => openLog('?view=attention')}
              accessibilityRole="button"
            >
              <Text style={[styles.tileNum, empty > 0 && { color: '#c2410c' }]}>{empty}</Text>
              <Text style={styles.tileLabel}>{t('talkCoordinator.desk.emptyWeeks', { count: empty })}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
              onPress={() => openLog('?view=attention')}
              accessibilityRole="button"
            >
              <Text style={[styles.tileNum, other > 0 && { color: '#b45309' }]}>{other}</Text>
              <Text style={styles.tileLabel}>{t('talkCoordinator.desk.waiting', { count: other })}</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Row
              icon="swap-vertical-outline"
              color="#0369a1"
              title={t('talkCoordinator.log.title')}
              subtitle={t('talkCoordinator.desk.journalSub')}
              onPress={() => openLog()}
            />
          </View>

          <Text style={styles.sectionLabel}>{t('talkCoordinator.directoriesLabel')}</Text>
          <View style={styles.card}>
            <Row
              icon="people-outline"
              color="#6d28d9"
              title={t('talkCoordinator.speakers.title')}
              subtitle={
                speakers.data
                  ? t('talkCoordinator.desk.guestsSub', { count: guestCount })
                  : t('talkCoordinator.speakers.subtitle')
              }
              onPress={() => router.push('/talk-coordinator/speakers' as never)}
            />
            <Row
              icon="paper-plane-outline"
              color="#0f766e"
              title={t('talkCoordinator.ourSpeakers.title')}
              subtitle={t('talkCoordinator.desk.oursSub')}
              onPress={() => router.push('/talk-coordinator/our-speakers' as never)}
            />
            <Row
              icon="business-outline"
              color="#475569"
              title={t('talkCoordinator.congregations.title')}
              subtitle={
                congs.data
                  ? t('talkCoordinator.desk.congsSub', { count: congCount })
                  : t('talkCoordinator.congregations.subtitle')
              }
              onPress={() => router.push('/talk-coordinator/congregations' as never)}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  color,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[styles.iconWrap, { backgroundColor: `${color}14` }]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

const shadow = {
  shadowColor: '#0f172a',
  shadowOpacity: 0.06,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  inner: { gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#155e6e',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  quickPlus: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTitle: { fontFamily: FONT.extrabold, fontSize: 17, color: '#ffffff' },
  quickSub: { fontFamily: FONT.medium, fontSize: 12.5, lineHeight: 17, color: '#cdeef2', marginTop: 1 },
  hero: {
    backgroundColor: '#0f4c5a',
    borderRadius: 22,
    padding: 18,
    gap: 2,
  },
  heroOver: {
    fontFamily: FONT.extrabold,
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#a7dbe3',
    marginBottom: 6,
  },
  heroName: { fontFamily: FONT.extrabold, fontSize: 22, lineHeight: 28, color: '#ffffff' },
  heroSub: { fontFamily: FONT.medium, fontSize: 13, color: '#cdeef2' },
  heroTalk: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: '#e6f6f8', marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipWarn: { backgroundColor: 'rgba(234,88,12,0.28)' },
  chipText: { fontFamily: FONT.semibold, fontSize: 12, color: '#e6f6f8' },
  heroBtns: { flexDirection: 'row', gap: 8, marginTop: 14 },
  heroBtnGhost: { backgroundColor: 'rgba(255,255,255,0.14)' },
  heroBtn: {
    flex: 1,
    marginTop: 0,
    backgroundColor: '#ffffff',
    borderRadius: 13,
    paddingVertical: 11,
    alignItems: 'center',
  },
  heroBtnText: { fontFamily: FONT.extrabold, fontSize: 14.5, color: '#0f4c5a' },
  tiles: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    ...shadow,
  },
  tileNum: { fontFamily: FONT.extrabold, fontSize: 28, lineHeight: 32, color: '#0f172a' },
  tileLabel: { fontFamily: FONT.medium, fontSize: 12.5, lineHeight: 17, color: '#475569', marginTop: 2 },
  sectionLabel: {
    fontFamily: FONT.extrabold,
    fontSize: 11.5,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: 6,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    overflow: 'hidden',
    ...shadow,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eef2f6',
  },
  pressed: { opacity: 0.7 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: { fontSize: 15, fontFamily: FONT.bold, color: '#0f172a' },
  rowSubtitle: { fontFamily: FONT.regular, fontSize: 12.5, color: '#64748b', marginTop: 1 },
});
