import { useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  agendaApi,
  localNeedsApi,
  tasksApi,
  type LocalNeedsTopic,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { failsScreen } from '../../../lib/screen-failure';
import { reportError, reportSuccess } from '../../../lib/error-bus';
import { HEADER_ICON, BRAND } from '../../../lib/header';
import { UndoBar } from '../../../components/UndoBar';
import { WeekCard, TopicCard } from '../../../components/local-needs/Cards';
import { PlaceSheet } from '../../../components/local-needs/PlaceSheet';
import { TopicForm } from '../../../components/local-needs/TopicForm';
import {
  buildBoard,
  normalise,
  shortDayLabel,
  type BoardWeek,
} from '../../../lib/local-needs';

/** Two columns from this width of the screen's own room. */
const TWO_COLUMNS_FROM = 900;

/**
 * «Местные потребности» (rebuilt 28 October 2026).
 *
 * The body of elders chooses the subjects, and the question it brings here
 * is «what stands in the coming weeks, and what is still open» — so the
 * weeks ahead come first, on the left (on a phone, above), and the bank of
 * topics beside them. A topic is put into a week from either side: «Выбрать
 * тему» on an empty week, «Поставить на неделю» on a topic.
 *
 * Editing is for the administrators, the Life & Ministry overseer and the
 * body of elders' coordinator; every elder reads.
 */
export default function LocalNeedsScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const perms = usePermissions();
  const manage = perms.canManageLocalNeeds;

  const topicsQ = useQuery({
    throwOnError: failsScreen,
    // Deleted topics come along: they are the archive.
    queryKey: ['local-needs', 'with-archive'],
    queryFn: () => localNeedsApi.list({ includeRemoved: true }),
    enabled: perms.canViewLocalNeeds,
  });
  const weeksQ = useQuery({
    queryKey: ['local-needs', 'weeks'],
    queryFn: () => localNeedsApi.weeks(),
    enabled: perms.canViewLocalNeeds,
  });

  /**
   * «Вынести на совет» — for whoever may build the next meeting's agenda.
   * The rights are the server's answer for that meeting; without a meeting
   * the coordinator (and an administrator) still sees the button, and is told
   * to set the meeting first.
   */
  const agendaQ = useQuery({
    queryKey: ['tasks', 'agenda', 'next'],
    queryFn: () => tasksApi.agenda(),
    enabled: perms.canViewLocalNeeds,
    staleTime: 60 * 1000,
  });
  const nextMeeting = agendaQ.data?.meeting ?? null;
  const rightsQ = useQuery({
    queryKey: ['agenda-rights', nextMeeting?.id],
    queryFn: () => agendaApi.rights(nextMeeting!.id),
    enabled: !!nextMeeting,
  });
  // Without a meeting: admin or the coordinator, as canManageEvents says.
  const toCouncil = nextMeeting ? !!rightsQ.data?.mayBuild : agendaQ.isSuccess && perms.canManageEvents;

  const councilMut = useMutation({
    mutationFn: async (week: BoardWeek) => {
      if (!nextMeeting) return null;
      await agendaApi.create(nextMeeting.id, {
        title: t('localNeeds.toCouncil.itemTitle', { day: shortDayLabel(week.day, lang) }),
        area: 'teaching',
      });
      return nextMeeting;
    },
    onSuccess: (meeting) => {
      if (!meeting) {
        reportError(t('localNeeds.toCouncil.noMeeting'));
        return;
      }
      void qc.invalidateQueries({ queryKey: ['agenda-items', meeting.id] });
      reportSuccess(t('localNeeds.toCouncil.done', { day: shortDayLabel(meeting.date, lang) }));
    },
  });

  const [search, setSearch] = useState('');
  const [pastOpen, setPastOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LocalNeedsTopic | null>(null);
  const [justDeleted, setJustDeleted] = useState<string | null>(null);
  const [place, setPlace] = useState<{
    topic: LocalNeedsTopic | null;
    week?: string;
    partId?: string;
  } | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: manage
        ? () => (
            <Pressable
              onPress={openNew}
              style={{ paddingHorizontal: 12 }}
              hitSlop={8}
              accessibilityLabel={t('localNeeds.add')}
            >
              <Ionicons name="add" size={28} color={HEADER_ICON} />
            </Pressable>
          )
        : undefined,
    });
  }, [navigation, manage, t]);

  const restoreMut = useMutation({
    mutationFn: (id: string) => localNeedsApi.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['local-needs'] }),
  });

  const all = useMemo(() => topicsQ.data ?? [], [topicsQ.data]);
  const weeks = useMemo(() => weeksQ.data ?? [], [weeksQ.data]);
  const board = useMemo(() => buildBoard(weeks, all), [weeks, all]);

  const { bank, past, archive } = useMemo(() => {
    const needle = normalise(search);
    const matches = (r: LocalNeedsTopic) =>
      !needle || normalise(`${r.title} ${r.notes ?? ''}`).includes(needle);
    // What stands on the left needs no second place on the right.
    const onBoard = new Set(
      board.flatMap((w) => w.slots.filter((x) => !x.planned && x.topic).map((x) => x.topic!.id)),
    );
    const live = all.filter((r) => !r.deletedAt);
    return {
      // Waiting: never given, or put back. A planned week does not take a
      // topic out of the bank — it is still to be placed.
      bank: live.filter((r) => !r.usedWeek).filter(matches),
      // Given — every one not standing in a week ahead on the left.
      past: live
        .filter((r) => !!r.usedWeek && !onBoard.has(r.id))
        .filter(matches)
        .sort((a, b) => (b.usedWeek as string).localeCompare(a.usedWeek as string)),
      archive: all
        .filter((r) => !!r.deletedAt)
        .filter(matches)
        .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt ?? '')),
    };
  }, [all, search, board]);

  const twoColumns = width >= TWO_COLUMNS_FROM;
  const loading = topicsQ.isLoading || weeksQ.isLoading;

  const refresh = () => {
    void topicsQ.refetch();
    void weeksQ.refetch();
  };

  const weeksColumn = (
    <View style={twoColumns ? styles.left : null}>
      <Text style={styles.sectionLabel}>{twoColumns ? t('localNeeds.board.head') : t('localNeeds.board.headShort')}</Text>
      {weeksQ.isLoading ? (
        <ActivityIndicator style={{ marginVertical: 16 }} />
      ) : board.length === 0 ? (
        <Text style={styles.empty}>{t('localNeeds.board.empty')}</Text>
      ) : (
        board.map((w) => (
          <WeekCard
            key={w.weekStartDate}
            week={w}
            manage={manage}
            toCouncil={toCouncil}
            onChoose={(wk, slot) => setPlace({ topic: null, week: wk.weekStartDate, partId: slot.part?.id })}
            onPlacePlanned={(wk, topic) => setPlace({ topic, week: wk.weekStartDate })}
            onCouncil={(wk) => councilMut.mutate(wk)}
          />
        ))
      )}
      <Text style={styles.footnote}>{t('localNeeds.board.footnote')}</Text>
    </View>
  );

  const card = (r: LocalNeedsTopic, mode: 'bank' | 'past' | 'archive') => (
    <TopicCard
      key={r.id}
      topic={r}
      manage={manage}
      mode={mode}
      onPlace={(topic) => setPlace({ topic })}
      onEdit={(topic) => {
        setEditing(topic);
        setFormOpen(true);
      }}
      onRestore={(topic) => restoreMut.mutate(topic.id)}
    />
  );

  const bankColumn = (
    <View style={twoColumns ? styles.right : null}>
      <View style={styles.bankHead}>
        <Text style={[styles.sectionLabel, { marginBottom: 0 }]}>
          {t('localNeeds.bank.head')} · {bank.length}
        </Text>
        {past.length > 0 ? (
          <Pressable onPress={() => setPastOpen((v) => !v)} hitSlop={8} style={styles.linkRow}>
            <Text style={styles.link}>
              {t('localNeeds.bank.past')} · {past.length}
            </Text>
            <Ionicons name={pastOpen ? 'chevron-up' : 'chevron-forward'} size={14} color={BRAND} />
          </Pressable>
        ) : null}
      </View>

      {manage ? (
        <Pressable style={styles.addCard} onPress={openNew} accessibilityRole="button">
          <Ionicons name="add" size={18} color={BRAND} />
          <Text style={styles.addCardText}>{t('localNeeds.add')}</Text>
        </Pressable>
      ) : null}

      {all.length > 3 ? (
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('localNeeds.searchPlaceholder')}
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
          />
          {search ? (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#cbd5e1" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {topicsQ.isLoading ? (
        <ActivityIndicator style={{ marginVertical: 16 }} />
      ) : bank.length === 0 ? (
        <Text style={styles.empty}>{search ? t('localNeeds.noMatches') : t('localNeeds.bank.empty')}</Text>
      ) : (
        bank.map((r) => card(r, 'bank'))
      )}

      {pastOpen && past.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, { marginTop: 12 }]}>
            {t('localNeeds.bank.past')} · {past.length}
          </Text>
          {past.map((r) => card(r, 'past'))}
        </>
      ) : null}

      {archive.length > 0 ? (
        <Pressable onPress={() => setArchiveOpen((v) => !v)} hitSlop={6} style={[styles.linkRow, { marginTop: 8 }]}>
          <Text style={styles.archiveLink}>
            {t('localNeeds.section.archived')} · {archive.length}
          </Text>
          <Ionicons name={archiveOpen ? 'chevron-up' : 'chevron-down'} size={13} color="#94a3b8" />
        </Pressable>
      ) : null}
      {archiveOpen ? <View style={{ marginTop: 8 }}>{archive.map((r) => card(r, 'archive'))}</View> : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={topicsQ.isRefetching} onRefresh={refresh} />}
      >
        {loading && !topicsQ.data ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : twoColumns ? (
          <View style={styles.columns}>
            {weeksColumn}
            {bankColumn}
          </View>
        ) : (
          <>
            {weeksColumn}
            <View style={{ height: 20 }} />
            {bankColumn}
          </>
        )}
      </ScrollView>

      <PlaceSheet
        visible={!!place}
        onClose={() => setPlace(null)}
        topic={place?.topic ?? null}
        bank={bank}
        topics={all}
        weeks={weeks}
        initialWeek={place?.week ?? null}
        initialPartId={place?.partId ?? null}
      />
      <TopicForm
        visible={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        all={all}
        onDeleted={setJustDeleted}
      />
      <UndoBar
        visible={!!justDeleted}
        message={t('localNeeds.deleted')}
        onUndo={async () => {
          if (!justDeleted) return;
          await localNeedsApi.restore(justDeleted);
          setJustDeleted(null);
          void qc.invalidateQueries({ queryKey: ['local-needs'] });
        }}
        onDismiss={() => setJustDeleted(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 48 },
  columns: { flexDirection: 'row', gap: 20, alignItems: 'flex-start' },
  left: { flex: 5, minWidth: 0 },
  right: { flex: 7, minWidth: 0 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  bankHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  archiveLink: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#94a3b8' },
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#a5f3fc',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  addCardText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: BRAND },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: { fontFamily: 'Manrope_400Regular', flex: 1, fontSize: 14, color: '#0f172a', paddingVertical: 2 },
  empty: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: '#94a3b8', marginBottom: 12 },
  footnote: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#94a3b8', marginTop: 2, lineHeight: 17 },
});
