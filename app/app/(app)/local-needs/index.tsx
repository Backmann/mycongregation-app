import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UndoBar } from '../../../components/UndoBar';
import { Ionicons } from '@expo/vector-icons';
import {
  CreateLocalNeedsTopicInput,
  LocalNeedsTopic,
  MeetingSettingsVersion,
  SpecialEvent,
  UpdateLocalNeedsTopicInput,
  extractErrorMessage,
  localNeedsApi,
  meetingSettingsApi,
  specialEventsApi,
} from '../../../lib/api';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { DateField } from '../../../components/DateField';
import { usePermissions } from '../../../lib/permissions';
import { weekRules } from '../../../lib/week-rules';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';

/**
 * The day a week's midweek meeting actually falls on.
 *
 * A topic stores the WEEK it was used in, not a date — so «прошла» was being
 * decided by comparing Mondays, and a subject covered on Thursday went on
 * calling itself upcoming until the following Monday. Reading the list on
 * Friday, the next three subjects were not the next three.
 *
 * The day comes from lib/week-rules, the one authority on what happens in a
 * week: it knows the congregation's midweek day and moves it for a circuit
 * overseer's visit, so «the meeting has been held» stays true in a week when
 * the meeting was on Tuesday.
 */
function meetingDayOf(
  weekISO: string,
  version: MeetingSettingsVersion | null | undefined,
  events: SpecialEvent[],
): string | null {
  return weekRules({ weekStartISO: weekISO, version, events }).dateOf('midweek');
}

/** Today as YYYY-MM-DD, on the device's clock. */
function todayLocalISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

/** Monday (YYYY-MM-DD) of the current week, in local time. */
function thisMonday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fmtWeek(week: string, loc: string): string {
  const d = new Date(`${week}T00:00:00`);
  return d.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function LocalNeedsScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { canManageLocalNeeds, canViewLocalNeeds } = usePermissions();

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    // Deleted topics come along: they are the archive, and the whole reason
    // the archive exists is that a subject already covered must stay findable.
    queryKey: ['local-needs', 'with-archive'],
    queryFn: () => localNeedsApi.list({ includeRemoved: true }),
    enabled: canViewLocalNeeds,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  /*
   * No «точно удалить?» here any more.
   *
   * A dialog asks everybody, every time, about a thing they almost always
   * meant — the price is paid on every correct deletion. The strip is paid
   * only by the person who erred, and only for a moment. That was the reason
   * the strip was built; keeping both meant paying both.
   */
  const [search, setSearch] = useState('');
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>(
    {},
  );
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [usedWeek, setUsedWeek] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['local-needs'] });

  const createMut = useMutation({
    mutationFn: (input: CreateLocalNeedsTopicInput) =>
      localNeedsApi.create(input),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
  });
  const updateMut = useMutation({
    mutationFn: (vars: { id: string; input: UpdateLocalNeedsTopicInput }) =>
      localNeedsApi.update(vars.id, vars.input),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
  });
  /**
   * The topic just deleted, so the strip can offer it back.
   *
   * Deleting a topic is soft and the archive holds it, but finding it there
   * means leaving the screen and knowing the archive exists. A tap on
   * «Отменить» in the same second costs neither.
   */
  const [justDeleted, setJustDeleted] = useState<string | null>(null);
  const removeMut = useMutation({
    mutationFn: (id: string) => localNeedsApi.remove(id),
    onSuccess: (_r, id) => {
      invalidate();
      setJustDeleted(id);
    },
  });
  const usedMut = useMutation({
    // The week is the server's business now — it reads the congregation's
    // clock. The screen only says which way it is moving.
    mutationFn: (vars: { id: string; used: boolean }) =>
      vars.used
        ? localNeedsApi.markUsed(vars.id)
        : localNeedsApi.markPlanned(vars.id),
    onSuccess: invalidate,
  });
  const restoreMut = useMutation({
    mutationFn: (id: string) => localNeedsApi.restore(id),
    onSuccess: invalidate,
  });

  /** Loose match so «Гостеприимство» finds «о гостеприимстве». */
  const normalise = (v: string) =>
    v
      .toLowerCase()
      .replace(/[«»"'’.,:;!?()\-—–]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  /**
   * What the congregation's week looks like — the same two sources the
   * schedule screen reads, so the two cannot disagree about which day the
   * meeting is on.
   */
  const settingsQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 10 * 60 * 1000,
  });
  const eventsQuery = useQuery({
    queryKey: ['special-events', 'all'],
    queryFn: () => specialEventsApi.list({ all: true }),
    staleTime: 10 * 60 * 1000,
  });

  /**
   * The one answer to «has that meeting happened yet», used by the grouping
   * AND by the chip on each row.
   *
   * Two copies of this rule is how the list and the label drift apart: the
   * section would say «прошедшие» while the row still said «в программе».
   */
  const versions = settingsQuery.data?.versions;
  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  const meetingHeld = useCallback(
    (weekISO: string): boolean => {
      const day = meetingDayOf(
        weekISO,
        effectiveVersionFor(versions, weekISO),
        events,
      );
      // No settings yet: fall back to the old rule rather than guessing.
      if (!day) return weekISO < thisMonday();
      return day < todayLocalISO();
    },
    [versions, events],
  );

  const { planned, upcoming, today, past, archived, all } = useMemo(() => {
    const rows = data ?? [];
    const monday = thisMonday();
    const todayISO = todayLocalISO();

    const held = meetingHeld;
    void monday;
    const needle = normalise(search);
    const matches = (r: LocalNeedsTopic) =>
      !needle ||
      normalise(`${r.title} ${r.notes ?? ''}`).includes(needle);
    const live = rows.filter((r) => !r.deletedAt);
    const withWeek = live.filter((r) => !!r.usedWeek);
    return {
      all: rows,
      planned: live.filter((r) => !r.usedWeek).filter(matches),
      // On the schedule and the meeting is still ahead.
      upcoming: withWeek
        .filter((r) => !held(r.usedWeek as string))
        .filter(
          (r) =>
            meetingDayOf(
              r.usedWeek as string,
              effectiveVersionFor(versions, r.usedWeek as string),
              events,
            ) !== todayISO,
        )
        .filter(matches)
        .sort((a, b) =>
          (a.usedWeek as string).localeCompare(b.usedWeek as string),
        ),
      /* Its own line, because «на этой неделе» and «сегодня вечером» are
         different answers to the question the elder is actually asking. */
      today: withWeek
        .filter(
          (r) =>
            meetingDayOf(
              r.usedWeek as string,
              effectiveVersionFor(versions, r.usedWeek as string),
              events,
            ) === todayISO,
        )
        .filter(matches),
      // The meeting has already been held — this is the history.
      past: withWeek
        .filter((r) => held(r.usedWeek as string))
        .filter(matches)
        .sort((a, b) =>
          (b.usedWeek as string).localeCompare(a.usedWeek as string),
        ),
      // Deleted, but kept: a subject already covered is worth remembering, and
      // sometimes worth coming back to.
      archived: rows
        .filter((r) => !!r.deletedAt)
        .filter(matches)
        .sort((a, b) => (b.deletedAt as string).localeCompare(a.deletedAt ?? '')),
    };
  }, [data, search, meetingHeld, versions, events]);

  /**
   * A subject that has come up before, whatever state it is in now.
   *
   * The fear this answers is a real one — taking the same subject twice a year
   * apart — and the moment to answer it is while the title is being typed, not
   * afterwards.
   */
  const similar = useMemo(() => {
    const needle = normalise(title);
    if (needle.length < 4) return [];
    return (all ?? [])
      .filter((r) => r.id !== editId)
      .filter((r) => {
        const other = normalise(r.title);
        return other.includes(needle) || needle.includes(other);
      })
      .slice(0, 3);
  }, [title, all, editId]);

  const [pastOpen, setPastOpen] = useState(true);

  function openNew() {
    setEditId(null);
    setTitle('');
    setNotes('');
    setSpeakerId(null);
    setUsedWeek(null);
    createMut.reset();
    updateMut.reset();
    setModalOpen(true);
  }
  function openEdit(topic: LocalNeedsTopic) {
    setEditId(topic.id);
    setTitle(topic.title);
    setNotes(topic.notes ?? '');
    setSpeakerId(topic.speakerPublisherId);
    setUsedWeek(topic.usedWeek);
    createMut.reset();
    updateMut.reset();
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
  }

  function save() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (editId) {
      updateMut.mutate({
        id: editId,
        input: {
          title: cleanTitle,
          notes: notes.trim() ? notes.trim() : null,
          speakerPublisherId: speakerId ?? null,
          usedWeek: usedWeek,
        },
      });
    } else {
      createMut.mutate({
        title: cleanTitle,
        notes: notes.trim() || undefined,
        speakerPublisherId: speakerId ?? undefined,
      });
    }
  }

  const saving = createMut.isPending || updateMut.isPending;
  const saveError = createMut.error || updateMut.error;

  function renderRow(item: LocalNeedsTopic) {
    const isArchived = !!item.deletedAt;
    const isUsed = !!item.usedWeek;
    const isPast = isUsed && meetingHeld(item.usedWeek as string);
    const notesOpen = !!expandedNotes[item.id];
    return (
      <View key={item.id} style={[styles.row, isArchived && styles.rowArchived]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topicTitle}>{item.title}</Text>
          {item.notes ? (
            // Tappable, because an elder who may read the backlog but not edit
            // it had no other way to see a note longer than two lines.
            <Pressable
              onPress={() =>
                setExpandedNotes((prev) => ({
                  ...prev,
                  [item.id]: !prev[item.id],
                }))
              }
            >
              <Text
                style={styles.notes}
                numberOfLines={notesOpen ? undefined : 2}
              >
                {item.notes}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.metaRow}>
            {item.speaker ? (
              <View style={styles.metaChip}>
                <Ionicons name="person-outline" size={12} color="#475569" />
                <Text style={styles.metaText}>{item.speaker.displayName}</Text>
              </View>
            ) : null}
            {/* Said in words. A tick and a date used to mean both "will be" and
                "already was", told apart only by the shade of the chip. */}
            {isUsed ? (
              <View
                style={[
                  styles.metaChip,
                  isPast ? styles.pastChip : styles.upcomingChip,
                ]}
              >
                <Ionicons
                  name={isPast ? 'checkmark-circle' : 'calendar-outline'}
                  size={12}
                  color={isPast ? '#047857' : '#0369a1'}
                />
                <Text
                  style={[
                    styles.metaText,
                    { color: isPast ? '#047857' : '#0369a1' },
                  ]}
                >
                  {isPast
                    ? t('localNeeds.wasUsedOn', {
                        week: fmtWeek(item.usedWeek as string, i18n.language),
                      })
                    : t('localNeeds.scheduledFor', {
                        week: fmtWeek(item.usedWeek as string, i18n.language),
                      })}
                </Text>
              </View>
            ) : null}
            {isArchived ? (
              <View style={[styles.metaChip, styles.archivedChip]}>
                <Ionicons name="archive-outline" size={12} color="#92400e" />
                <Text style={[styles.metaText, { color: '#92400e' }]}>
                  {t('localNeeds.archived')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {canManageLocalNeeds && (
          <View style={styles.actions}>
            {isArchived ? (
              <Pressable
                onPress={() => restoreMut.mutate(item.id)}
                hitSlop={6}
                style={styles.actionBtn}
                accessibilityLabel={t('localNeeds.restore')}
              >
                <Ionicons name="arrow-undo-outline" size={20} color="#0ea5e9" />
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={() =>
                    usedMut.mutate({ id: item.id, used: !isUsed })
                  }
                  hitSlop={6}
                  style={styles.actionBtn}
                  accessibilityLabel={
                    isUsed ? t('localNeeds.markPlanned') : t('localNeeds.markUsed')
                  }
                >
                  <Ionicons
                    name={isUsed ? 'arrow-undo-outline' : 'checkmark-done-outline'}
                    size={20}
                    color={isUsed ? '#64748b' : '#059669'}
                  />
                </Pressable>
                <Pressable
                  onPress={() => openEdit(item)}
                  hitSlop={6}
                  style={styles.actionBtn}
                  accessibilityLabel={t('localNeeds.edit')}
                >
                  <Ionicons name="create-outline" size={20} color="#0ea5e9" />
                </Pressable>
                <Pressable
                  onPress={() => removeMut.mutate(item.id)}
                  hitSlop={6}
                  style={styles.actionBtn}
                  accessibilityLabel={t('localNeeds.delete')}
                >
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    );
  }

  if (!canViewLocalNeeds) {
    return (
      <View style={styles.container}>
        <Text style={[styles.empty, { paddingHorizontal: 24 }]}>
          {t('localNeeds.noAccess')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <Text style={styles.intro}>{t('localNeeds.intro')}</Text>

        {canManageLocalNeeds && (
          <Pressable style={styles.addBtn} onPress={openNew}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>{t('localNeeds.add')}</Text>
          </Pressable>
        )}

        {(data ?? []).length > 0 && (
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
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{extractErrorMessage(error)}</Text>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : (data ?? []).length === 0 ? (
          <Text style={styles.empty}>{t('localNeeds.empty')}</Text>
        ) : (
          <>
            <Text style={styles.sectionLabel}>
              {t('localNeeds.section.planned')} · {planned.length}
            </Text>
            {planned.length === 0 ? (
              <Text style={styles.sectionEmpty}>
                {t('localNeeds.noPlanned')}
              </Text>
            ) : (
              planned.map(renderRow)
            )}

            {/* Above «запланированы», because tonight is nearer than next
                month and the eye should meet it first. */}
            {today.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 18 }]}>
                  {t('localNeeds.section.today')} · {today.length}
                </Text>
                {today.map(renderRow)}
              </>
            )}

            {upcoming.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 18 }]}>
                  {t('localNeeds.section.upcoming')} · {upcoming.length}
                </Text>
                {upcoming.map(renderRow)}
              </>
            )}

            {past.length > 0 && (
              <>
                <Pressable
                  style={styles.pastHeader}
                  onPress={() => setPastOpen((v) => !v)}
                >
                  <Text style={styles.sectionLabel}>
                    {t('localNeeds.section.past')} · {past.length}
                  </Text>
                  <Ionicons
                    name={pastOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="#94a3b8"
                  />
                </Pressable>
                {pastOpen ? (
                  <View style={styles.pastRow}>{past.map(renderRow)}</View>
                ) : null}
              </>
            )}

            {archived.length > 0 && (
              <>
                <Pressable
                  style={styles.pastHeader}
                  onPress={() => setArchiveOpen((v) => !v)}
                >
                  <Text style={styles.sectionLabel}>
                    {t('localNeeds.section.archived')} · {archived.length}
                  </Text>
                  <Ionicons
                    name={archiveOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="#94a3b8"
                  />
                </Pressable>
                {archiveOpen ? (
                  <View style={styles.pastRow}>{archived.map(renderRow)}</View>
                ) : null}
              </>
            )}

            {search &&
            planned.length +
              upcoming.length +
              past.length +
              archived.length ===
              0 ? (
              <Text style={styles.sectionEmpty}>
                {t('localNeeds.noMatches')}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Add / edit modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeModal}
            accessibilityRole="button"
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editId ? t('localNeeds.editTitle') : t('localNeeds.newTitle')}
              </Text>
              <Pressable onPress={closeModal} hitSlop={8}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>{t('localNeeds.fields.title')}</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t('localNeeds.placeholders.title')}
                placeholderTextColor="#94a3b8"
              />

              {/* Asked while the title is being typed, not discovered a year
                  later: has this subject come up before, in any state? */}
              {similar.length > 0 ? (
                <View style={styles.similarBox}>
                  <Text style={styles.similarHead}>
                    {t('localNeeds.similarWarning')}
                  </Text>
                  {similar.map((r) => (
                    <Text key={r.id} style={styles.similarItem}>
                      • {r.title}
                      {r.usedWeek
                        ? ` — ${fmtWeek(r.usedWeek, i18n.language)}`
                        : ''}
                      {r.deletedAt ? ` (${t('localNeeds.archived')})` : ''}
                    </Text>
                  ))}
                </View>
              ) : null}

              <Text style={styles.label}>{t('localNeeds.fields.notes')}</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder={t('localNeeds.placeholders.notes')}
                placeholderTextColor="#94a3b8"
                multiline
              />

              <PublisherSelector
                label={t('localNeeds.fields.speaker')}
                value={speakerId}
                onChange={setSpeakerId}
                preferAppointment="elder"
              />

              {/* Recording a topic that was given weeks ago. The tick on the
                  list only ever means "this week", which is right for the
                  common case and useless for catching up. */}
              {editId ? (
                <DateField
                  label={t('localNeeds.fields.week')}
                  value={usedWeek ?? ''}
                  onChange={(v) => setUsedWeek(v || null)}
                  placeholder={t('localNeeds.placeholders.week')}
                />
              ) : null}

              {saveError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    {extractErrorMessage(saveError)}
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={closeModal}
              >
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalBtn,
                  styles.saveBtn,
                  (!title.trim() || saving) && styles.saveBtnDisabled,
                ]}
                onPress={save}
                disabled={!title.trim() || saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? t('common.saving') : t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <UndoBar
        visible={!!justDeleted}
        message={t('localNeeds.deleted')}
        onUndo={async () => {
          if (!justDeleted) return;
          await localNeedsApi.restore(justDeleted);
          setJustDeleted(null);
          invalidate();
        }}
        onDismiss={() => setJustDeleted(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  intro: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 6,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold',},
  empty: { textAlign: 'center', color: '#64748b', marginTop: 32 },
  pastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  pastRow: { opacity: 0.6 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionEmpty: { fontSize: 13, color: '#94a3b8', marginBottom: 8 },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  errorText: { color: '#b91c1c' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  topicTitle: { fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
  notes: { fontSize: 13, color: '#64748b', marginTop: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  usedChip: { backgroundColor: '#ecfdf5' },
  upcomingChip: { backgroundColor: '#e0f2fe' },
  archivedChip: { backgroundColor: '#fef3c7' },
  rowArchived: { opacity: 0.75 },
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
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a', paddingVertical: 2 },
  similarBox: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  similarHead: {
    fontSize: 12.5,
    color: '#92400e',
    fontFamily: 'Manrope_600SemiBold',
  },
  similarItem: { fontSize: 12.5, color: '#92400e', marginTop: 2 },
  pastChip: { backgroundColor: '#f1f5f9' },
  metaText: { fontSize: 12, color: '#475569', fontWeight: '500', fontFamily: 'Manrope_500Medium',},
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionBtn: { padding: 6 },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  label: {
    fontSize: 13,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtn: { backgroundColor: '#f1f5f9' },
  cancelBtnText: { color: '#475569', fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  saveBtn: { backgroundColor: '#0ea5e9' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold',},
  deleteBtn: { backgroundColor: '#ef4444' },
  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  confirmText: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
});
