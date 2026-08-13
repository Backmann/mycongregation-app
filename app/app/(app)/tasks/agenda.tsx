import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  AgendaItem,
  ItemOutcome,
  TaskArea,
  agendaApi,
  extractErrorMessage,
  meetingSettingsApi,
  publishersApi,
  tasksApi,
  type ElderTask,
  type EldersMeeting,
} from '../../../lib/api';
import { buildAgendaHtml } from '../../../lib/agendaPdf';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { Sheet } from '../../../components/Sheet';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { DateField } from '../../../components/DateField';
import { TimeField } from '../../../components/TimeField';
import { confirm } from '../../../components/ConfirmHost';
import { AREA_BG, AREA_FG, AREAS } from '../../../lib/task-areas';

/**
 * The agenda of an elders' meeting.
 *
 * This is what the whole thing was built for. A list of tasks with no occasion
 * attached goes stale in a month; a meeting is the rhythm the body already
 * has, and the agenda is where the list turns back into work.
 */
export default function AgendaScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [meetingId, setMeetingId] = useState<string | undefined>(undefined);
  const [editingMeeting, setEditingMeeting] = useState<
    EldersMeeting | 'new' | null
  >(null);

  const meetingsQuery = useQuery({
    queryKey: ['tasks', 'meetings'],
    queryFn: () => tasksApi.meetings(),
  });
  const agendaQuery = useQuery({
    queryKey: ['tasks', 'agenda', meetingId ?? 'next'],
    queryFn: () => tasksApi.agenda(meetingId),
  });
  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({}),
  });
  /**
   * The items, and what this person may do with them.
   *
   * The rights are asked of the SERVER rather than worked out here: three
   * different ones live behind this screen — building the agenda is the
   * coordinator's, recording what was decided belongs to the brother the
   * meeting names, and reading is every elder's once it is approved. A screen
   * that guessed would offer buttons that fail.
   */
  const currentId = meetingId ?? agendaQuery.data?.meeting?.id ?? null;
  const itemsQuery = useQuery({
    queryKey: ['agenda-items', currentId],
    queryFn: () => agendaApi.items(currentId as string),
    enabled: !!currentId,
  });
  const rightsQuery = useQuery({
    queryKey: ['agenda-rights', currentId],
    queryFn: () => agendaApi.rights(currentId as string),
    enabled: !!currentId,
  });
  const mayBuild = rightsQuery.data?.mayBuild ?? false;
  const mayRecord = rightsQuery.data?.mayRecord ?? false;

  const [editingItem, setEditingItem] = useState<AgendaItem | 'new' | null>(
    null,
  );
  const [makingTask, setMakingTask] = useState<AgendaItem | null>(null);

  const items = itemsQuery.data ?? [];
  /**
   * «Повестка на 95 минут» — the only reason to record minutes at all.
   *
   * The point is seeing that an evening does not fit BEFORE it starts, not at
   * eleven o'clock when it has already overrun.
   */
  const totalMinutes = items.reduce((sum, i) => sum + (i.minutes ?? 0), 0);

  const invalidateItems = () => {
    void qc.invalidateQueries({ queryKey: ['agenda-items', currentId] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
  };

  const moveMut = useMutation({
    mutationFn: (v: { id: string; direction: 'up' | 'down' }) =>
      agendaApi.move(v.id, v.direction),
    onSuccess: invalidateItems,
  });
  const outcomeMut = useMutation({
    mutationFn: (v: { id: string; outcome: ItemOutcome | null }) =>
      agendaApi.update(v.id, { outcome: v.outcome }),
    onSuccess: invalidateItems,
  });
  const removeItemMut = useMutation({
    mutationFn: (id: string) => agendaApi.remove(id),
    onSuccess: invalidateItems,
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => agendaApi.approve(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agenda'] });
      void qc.invalidateQueries({ queryKey: ['tasks', 'meetings'] });
    },
  });

  const congQuery = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
    staleTime: 60 * 60 * 1000,
  });

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of publishersQuery.data?.data ?? []) m.set(p.id, p.displayName);
    return (id: string | null) => (id ? (m.get(id) ?? null) : null);
  }, [publishersQuery.data]);

  const fmt = (iso: string) => dayjs(iso).locale(i18n.language).format('D MMMM YYYY');
  const agenda = agendaQuery.data;

  const print = async () => {
    if (!agenda) return;
    const preopened = openPrintWindow();
    const html = buildAgendaHtml({
      meeting: agenda.meeting,
      // Flattened here: the sheet resolves nothing, it only prints.
      items: items.map((i) => ({
        title: i.title,
        presenterName: nameOf(i.presenterPublisherId),
        sourceText: i.sourceText,
        minutes: i.minutes,
        outcome: i.outcome,
        outcomeNote: i.outcomeNote,
      })),
      onAgenda: agenda.onAgenda,
      overdue: agenda.overdue,
      dueSoon: agenda.dueSoon,
      congregationName: congQuery.data?.congregation?.name ?? '',
      nameOf,
      areaLabel: (a) => t(`tasks.areas.${a}`),
      formatDate: fmt,
      labels: {
        title: t('tasks.agenda.title'),
        items: t('agenda.items.title'),
        presenter: t('agenda.items.form.presenter'),
        outcomes: {
          reviewed: t('agenda.items.outcome.reviewed'),
          carried: t('agenda.items.outcome.carried'),
          task: t('agenda.items.outcome.task'),
        },
        onAgenda: t('tasks.agenda.onAgenda'),
        overdue: t('tasks.agenda.overdue'),
        dueSoon: t('tasks.agenda.dueSoon'),
        nothing: t('tasks.agenda.nothing'),
        due: t('tasks.agenda.dueShort'),
        printed: t('attendance.printedOn'),
      },
      printedOn: dayjs().locale(i18n.language).format('D MMMM YYYY'),
    });
    await exportHtmlAsPdf(html, {
      fileName: t('tasks.agenda.title'),
      preopenedWindow: preopened,
    });
  };

  const group = (heading: string, rows: ElderTask[]) => (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{heading}</Text>
      {rows.length === 0 ? (
        <Text style={styles.nothing}>{t('tasks.agenda.nothing')}</Text>
      ) : (
        rows.map((task) => (
          <View key={task.id} style={styles.item}>
            <Text style={styles.itemTitle}>{task.title}</Text>
            <Text style={styles.itemMeta}>
              {[
                t(`tasks.areas.${task.area}`),
                task.dueDate ? fmt(task.dueDate) : null,
                nameOf(task.assigneePublisherId),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.meetingBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chipRow}>
              {(meetingsQuery.data ?? []).map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => setMeetingId(m.id)}
                  style={[
                    styles.chip,
                    (meetingId ?? agenda?.meeting?.id) === m.id && styles.chipOn,
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      (meetingId ?? agenda?.meeting?.id) === m.id &&
                        styles.chipTextOn,
                    ]}
                  >
                    {dayjs(m.date).locale(i18n.language).format('D MMM')}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={() => setEditingMeeting('new')}
                style={[styles.chip, styles.chipAdd]}
              >
                <Ionicons name="add" size={15} color="#0369a1" />
              </Pressable>
            </View>
          </ScrollView>
        </View>

        {agendaQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} />
        ) : !agenda?.meeting ? (
          <Text style={styles.empty}>{t('tasks.agenda.noMeeting')}</Text>
        ) : (
          <>
            <Pressable
              style={styles.meetingCard}
              onPress={() => setEditingMeeting(agenda.meeting)}
            >
              <Text style={styles.meetingWhen}>
                {fmt(agenda.meeting.date)}
                {agenda.meeting.startTime ? ` · ${agenda.meeting.startTime}` : ''}
              </Text>
              {agenda.meeting.note ? (
                <Text style={styles.meetingNote}>{agenda.meeting.note}</Text>
              ) : null}
            </Pressable>

            {/* The questions brought TO the meeting, before the work carried
                INTO it. An agenda is a sequence, so they are numbered and can
                be moved; the total says whether the evening fits. */}
            <View style={styles.group}>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{t('agenda.items.title')}</Text>
                {items.length > 0 ? (
                  <Text style={styles.total}>
                    {t('agenda.items.total', { count: totalMinutes })}
                  </Text>
                ) : null}
              </View>

              {!agenda.meeting.approvedAt && !mayBuild ? (
                // Silent, not «hidden»: an elder sees a meeting is planned and
                // simply no items yet. «Hidden» invites the question what is
                // being hidden.
                <Text style={styles.nothing}>{t('agenda.items.notYet')}</Text>
              ) : items.length === 0 ? (
                <Text style={styles.nothing}>{t('agenda.items.none')}</Text>
              ) : (
                items.map((item, i) => (
                  <View key={item.id} style={styles.item}>
                    <View style={styles.itemHead}>
                      <Text style={styles.itemNo}>{i + 1}.</Text>
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() => mayRecord && setEditingItem(item)}
                      >
                        <Text style={styles.itemTitle}>{item.title}</Text>
                      </Pressable>
                      <Text style={styles.itemMinutes}>
                        {t('agenda.items.minutes', { count: item.minutes })}
                      </Text>
                    </View>

                    <View style={styles.itemMetaRow}>
                      {/* Says whether a question is about accounts or about
                          somebody's care — a bare title never did. */}
                      <View
                        style={[
                          styles.areaTag,
                          { backgroundColor: AREA_BG[item.area] },
                        ]}
                      >
                        <Text
                          style={[styles.areaTagText, { color: AREA_FG[item.area] }]}
                        >
                          {t(`tasks.areas.${item.area}`)}
                        </Text>
                      </View>
                      {item.presenterPublisherId ? (
                        <Text style={styles.itemMeta}>
                          {nameOf(item.presenterPublisherId)}
                        </Text>
                      ) : null}
                      {item.sourceText ? (
                        <Text style={styles.itemMeta}>{item.sourceText}</Text>
                      ) : null}
                      {item.sourceUrl ? (
                        <Pressable
                          onPress={() => void Linking.openURL(item.sourceUrl!)}
                        >
                          <Text style={styles.itemLink}>
                            {t('agenda.items.source')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>

                    {item.outcome ? (
                      <View style={styles.outcomeChip}>
                        <Ionicons
                          name={
                            item.outcome === 'task'
                              ? 'arrow-forward-circle-outline'
                              : item.outcome === 'carried'
                                ? 'time-outline'
                                : 'checkmark-circle-outline'
                          }
                          size={14}
                          color="#0369a1"
                        />
                        <Text style={styles.outcomeText}>
                          {t(`agenda.items.outcome.${item.outcome}`)}
                        </Text>
                      </View>
                    ) : null}

                    {/* Marking what became of an item is the recorder's, and
                        only his: two people writing at once overwrite each
                        other and the second finds his words gone. */}
                    {mayRecord ? (
                      <View style={styles.itemActions}>
                        <Pressable
                          style={[
                            styles.act,
                            item.outcome === 'task' && styles.actOn,
                          ]}
                          onPress={() => setMakingTask(item)}
                          disabled={item.outcome === 'task'}
                        >
                          <Text
                            style={[
                              styles.actText,
                              item.outcome === 'task' && styles.actTextOn,
                            ]}
                          >
                            {t('agenda.items.outcome.task')}
                          </Text>
                        </Pressable>
                        {(['reviewed', 'carried'] as const).map((o) => (
                          <Pressable
                            key={o}
                            style={[
                              styles.act,
                              item.outcome === o && styles.actOn,
                            ]}
                            onPress={() =>
                              outcomeMut.mutate({
                                id: item.id,
                                outcome: item.outcome === o ? null : o,
                              })
                            }
                          >
                            <Text
                              style={[
                                styles.actText,
                                item.outcome === o && styles.actTextOn,
                              ]}
                            >
                              {t(`agenda.items.outcome.${o}`)}
                            </Text>
                          </Pressable>
                        ))}
                        {mayBuild ? (
                          <>
                            <Pressable
                              style={styles.actIcon}
                              onPress={() =>
                                moveMut.mutate({
                                  id: item.id,
                                  direction: 'up',
                                })
                              }
                            >
                              <Ionicons
                                name="chevron-up"
                                size={16}
                                color="#64748b"
                              />
                            </Pressable>
                            <Pressable
                              style={styles.actIcon}
                              onPress={() =>
                                moveMut.mutate({
                                  id: item.id,
                                  direction: 'down',
                                })
                              }
                            >
                              <Ionicons
                                name="chevron-down"
                                size={16}
                                color="#64748b"
                              />
                            </Pressable>
                            <Pressable
                              style={styles.actIcon}
                              onPress={() => removeItemMut.mutate(item.id)}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={16}
                                color="#b91c1c"
                              />
                            </Pressable>
                          </>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ))
              )}

              {mayRecord ? (
                <Pressable
                  style={styles.addItem}
                  onPress={() => setEditingItem('new')}
                >
                  <Ionicons name="add" size={16} color="#0369a1" />
                  <Text style={styles.addItemText}>
                    {t('agenda.items.add')}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {/* Approving is the one act that turns a draft into an agenda:
                from here every elder sees the items, and word goes out with
                the day, the hour and the place — never with the items. */}
            {mayBuild && !agenda.meeting.approvedAt && items.length > 0 ? (
              <Pressable
                style={styles.approve}
                disabled={approveMut.isPending}
                onPress={() => approveMut.mutate(agenda.meeting!.id)}
              >
                <Ionicons name="send-outline" size={16} color="#fff" />
                <Text style={styles.approveText}>{t('agenda.approve')}</Text>
              </Pressable>
            ) : null}
            {agenda.meeting.approvedAt ? (
              <View style={styles.approvedRow}>
                <Ionicons name="checkmark-circle" size={15} color="#15803d" />
                <Text style={styles.approvedText}>{t('agenda.approved')}</Text>
              </View>
            ) : null}

            {group(t('tasks.agenda.onAgenda'), agenda.onAgenda)}
            {group(t('tasks.agenda.overdue'), agenda.overdue)}
            {group(t('tasks.agenda.dueSoon'), agenda.dueSoon)}

            <Pressable style={styles.print} onPress={print}>
              <Ionicons name="print-outline" size={16} color="#ffffff" />
              <Text style={styles.printText}>{t('tasks.agenda.print')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {makingTask ? (
        <MakeTaskSheet
          item={makingTask}
          onClose={() => setMakingTask(null)}
          onSaved={() => {
            setMakingTask(null);
            invalidateItems();
          }}
        />
      ) : null}

      {editingItem ? (
        <ItemSheet
          item={editingItem === 'new' ? null : editingItem}
          meetingId={currentId as string}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            invalidateItems();
          }}
        />
      ) : null}

      <MeetingForm
        target={editingMeeting}
        onClose={() => setEditingMeeting(null)}
        onSaved={(id) => {
          qc.invalidateQueries({ queryKey: ['tasks'] });
          if (id) setMeetingId(id);
          setEditingMeeting(null);
        }}
      />
    </View>
  );
}

function MeetingForm({
  target,
  onClose,
  onSaved,
}: {
  target: EldersMeeting | 'new' | null;
  onClose: () => void;
  onSaved: (id?: string) => void;
}) {
  const { t } = useTranslation();
  const editing = target && target !== 'new' ? target : null;
  const visible = target !== null;

  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [note, setNote] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const key = editing?.id ?? (target === 'new' ? 'new' : null);
  if (visible && key !== loadedFor) {
    setLoadedFor(key);
    setDate(editing?.date ?? '');
    setTime(editing?.startTime ?? '');
    setNote(editing?.note ?? '');
  }
  if (!visible && loadedFor !== null) setLoadedFor(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      const input = { date, startTime: time || null, note: note.trim() || null };
      return editing
        ? tasksApi.updateMeeting(editing.id, input)
        : tasksApi.createMeeting(input);
    },
    onSuccess: (m) => onSaved(m?.id),
  });
  const removeMut = useMutation({
    mutationFn: () => tasksApi.removeMeeting(editing!.id),
    onSuccess: () => onSaved(),
  });

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      variant="bottom"
      fills
      title={editing ? t('tasks.meeting.edit') : t('tasks.meeting.new')}
      closeLabel={t('common.close')}
      footer={
        <Pressable
          style={[styles.save, !date && styles.saveOff]}
          disabled={!date || saveMut.isPending}
          onPress={() => saveMut.mutate()}
        >
          <Text style={styles.saveText}>{t('common.save')}</Text>
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={styles.formBody}>
        <Text style={styles.label}>{t('tasks.meeting.date')}</Text>
        <DateField value={date || undefined} onChange={(v) => setDate(v)} />

        <Text style={styles.label}>{t('tasks.meeting.time')}</Text>
        <TimeField value={time} onChange={setTime} />

        <Text style={styles.label}>{t('tasks.meeting.note')}</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          multiline
        />

        {editing ? (
          <Pressable
            style={styles.delete}
            onPress={async () => {
              const ok = await confirm({
                title: t('tasks.meeting.deleteTitle'),
                // Says plainly what survives: a cancelled evening must not
                // look as though it takes the work with it.
                body: t('tasks.meeting.deleteBody'),
                confirmLabel: t('common.delete'),
                danger: true,
              });
              if (ok) removeMut.mutate();
            }}
          >
            <Text style={styles.deleteText}>{t('common.delete')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  meetingBar: { marginBottom: 2 },
  chipRow: { flexDirection: 'row', gap: 7 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  chipOn: { backgroundColor: '#0e7490' },
  chipAdd: { backgroundColor: '#e0f2fe' },
  chipText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  meetingCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 4 },
  meetingWhen: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  meetingNote: { fontSize: 13.5, color: '#475569', lineHeight: 19 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  total: { fontSize: 12.5, color: '#64748b' },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemNo: { fontSize: 14, color: '#94a3b8', fontFamily: 'Manrope_600SemiBold' },
  itemMinutes: { fontSize: 12.5, color: '#64748b' },
  itemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
    marginLeft: 20,
  },
  itemLink: { fontSize: 12.5, color: '#0369a1', textDecorationLine: 'underline' },
  outcomeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    marginLeft: 20,
  },
  outcomeText: { fontSize: 12.5, color: '#0369a1' },
  itemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginLeft: 20,
    flexWrap: 'wrap',
  },
  act: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actOn: { backgroundColor: '#0e7490', borderColor: '#0e7490' },
  actText: { fontSize: 12.5, color: '#475569' },
  actTextOn: { color: '#fff' },
  actIcon: { padding: 5 },
  addItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    alignSelf: 'flex-start',
  },
  addItemText: { fontSize: 13.5, color: '#0369a1' },
  approve: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0e7490',
    borderRadius: 12,
    paddingVertical: 13,
  },
  approveText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  approvedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  approvedText: { fontSize: 13, color: '#15803d' },
  error: { fontSize: 13, color: '#b91c1c', marginTop: 8 },
  areaTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  areaTagText: { fontSize: 11.5 },
  areaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  areaPick: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  areaPickText: { fontSize: 13 },
  group: { gap: 6 },
  groupTitle: {
    fontSize: 12,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 6,
  },
  item: { backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 3 },
  itemTitle: { fontSize: 14.5, color: '#0f172a', fontWeight: '600' },
  itemMeta: { fontSize: 12.5, color: '#475569' },
  // An empty group is SHOWN as empty: «nothing is overdue» is worth reading,
  // and a heading that vanished tells the reader nothing at all.
  nothing: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  empty: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 32 },
  print: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#0e7490',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 16,
  },
  printText: {
    color: '#fff',
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  formBody: { padding: 16, gap: 6, paddingBottom: 32 },
  label: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  save: {
    backgroundColor: '#0e7490',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  saveOff: { backgroundColor: '#cbd5e1' },
  saveText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  delete: { marginTop: 22, alignItems: 'center', paddingVertical: 12 },
  deleteText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
});

/**
 * A question on the agenda: what it is, where it comes from, who presents it,
 * how long it should take.
 *
 * THE PRESENTER IS CHOSEN FROM ELDERS ONLY — unlike a task, which can go to any
 * brother. A question at the body's own meeting is presented by one of its
 * members, and offering the whole roster would be offering a wrong answer.
 */
function ItemSheet({
  item,
  meetingId,
  onClose,
  onSaved,
}: {
  item: AgendaItem | null;
  meetingId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(item?.title ?? '');
  const [sourceText, setSourceText] = useState(item?.sourceText ?? '');
  const [sourceUrl, setSourceUrl] = useState(item?.sourceUrl ?? '');
  const [presenter, setPresenter] = useState<string | null>(
    item?.presenterPublisherId ?? null,
  );
  const [minutes, setMinutes] = useState(String(item?.minutes ?? 10));
  const [area, setArea] = useState<TaskArea>(item?.area ?? 'other');

  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () => {
      const input = {
        title: title.trim(),
        area,
        sourceText: sourceText.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
        presenterPublisherId: presenter,
        minutes: Math.max(1, parseInt(minutes, 10) || 10),
      };
      return item
        ? agendaApi.update(item.id, input)
        : agendaApi.create(meetingId, input);
    },
    onSuccess: onSaved,
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      variant="bottom"
      title={t(item ? 'agenda.items.form.edit' : 'agenda.items.form.new')}
      footer={
        <Pressable
          style={[styles.approve, !title.trim() && { opacity: 0.5 }]}
          disabled={!title.trim() || save.isPending}
          onPress={() => save.mutate()}
        >
          <Text style={styles.approveText}>{t('common.save')}</Text>
        </Pressable>
      }
    >
      <Text style={styles.label}>{t('agenda.items.form.titleLabel')}</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      {/* The area lives on the question so that it travels into the task by
          itself — and so the agenda shows what each question is about. */}
      <Text style={styles.label}>{t('tasks.form.area')}</Text>
      <View style={styles.areaRow}>
        {AREAS.map((a) => (
          <Pressable
            key={a}
            onPress={() => setArea(a)}
            style={[
              styles.areaPick,
              { backgroundColor: area === a ? AREA_BG[a] : '#f8fafc' },
              area === a && { borderColor: AREA_FG[a] },
            ]}
          >
            <Text
              style={[
                styles.areaPickText,
                { color: area === a ? AREA_FG[a] : '#64748b' },
              ]}
            >
              {t(`tasks.areas.${a}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>{t('agenda.items.form.sourceText')}</Text>
      <TextInput
        style={styles.input}
        value={sourceText}
        onChangeText={setSourceText}
        placeholder={t('agenda.items.form.sourceHint')}
        placeholderTextColor="#94a3b8"
      />

      <Text style={styles.label}>{t('agenda.items.form.sourceUrl')}</Text>
      <TextInput
        style={styles.input}
        value={sourceUrl}
        onChangeText={setSourceUrl}
        autoCapitalize="none"
        keyboardType="url"
      />

      <PublisherSelector
        boxed
        label={t('agenda.items.form.presenter')}
        value={presenter}
        genderFilter="brother"
        appointmentFilter="elder"
        onChange={setPresenter}
      />

      <Text style={styles.label}>{t('agenda.items.form.minutes')}</Text>
      <TextInput
        style={styles.input}
        value={minutes}
        onChangeText={setMinutes}
        keyboardType="number-pad"
      />

      {save.isError ? (
        <Text style={styles.error}>{extractErrorMessage(save.error)}</Text>
      ) : null}
    </Sheet>
  );
}

/**
 * «Стал задачей» — the outcome that leaves the meeting with work in hand.
 *
 * Two fields, and only two: whom, and by when. The title, the details and the
 * area come from the question itself — asking again for what is already known
 * is how a good idea becomes a form nobody fills in.
 */
function MakeTaskSheet({
  item,
  onClose,
  onSaved,
}: {
  item: AgendaItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [people, setPeople] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(null);

  const save = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      agendaApi.makeTask(item.id, {
        assigneeKind: 'people',
        assigneePublisherIds: people,
        dueDate,
      }),
    onSuccess: onSaved,
  });

  return (
    <Sheet
      visible
      onClose={onClose}
      variant="bottom"
      title={t('agenda.items.outcome.task')}
      footer={
        <Pressable
          style={[styles.approve, people.length === 0 && { opacity: 0.5 }]}
          disabled={people.length === 0 || save.isPending}
          onPress={() => save.mutate()}
        >
          <Text style={styles.approveText}>{t('agenda.items.makeTask')}</Text>
        </Pressable>
      }
    >
      {/* What it will be called, so nobody has to remember which question
          this was. Read-only: the wording belongs to the agenda. */}
      <Text style={styles.label}>{item.title}</Text>

      {people.map((id, i) => (
        <PublisherSelector
          key={`${id}-${i}`}
          boxed
          label=""
          value={id}
          genderFilter="brother"
          onChange={(next) =>
            setPeople((list) =>
              next
                ? list.map((v, j) => (j === i ? next : v))
                : list.filter((_, j) => j !== i),
            )
          }
        />
      ))}
      <PublisherSelector
        key={`add-${people.length}`}
        boxed
        label={people.length === 0 ? t('tasks.form.assignee') : ''}
        value={null}
        genderFilter="brother"
        onChange={(next) => next && setPeople((list) => [...list, next])}
      />

      <DateField
        label={t('tasks.form.due')}
        value={dueDate ?? undefined}
        onChange={(v) => setDueDate(v ?? null)}
      />

      {save.isError ? (
        <Text style={styles.error}>{extractErrorMessage(save.error)}</Text>
      ) : null}
    </Sheet>
  );
}
