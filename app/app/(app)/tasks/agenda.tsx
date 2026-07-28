import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  tasksApi,
  publishersApi,
  meetingSettingsApi,
  type ElderTask,
  type EldersMeeting,
} from '../../../lib/api';
import { buildAgendaHtml } from '../../../lib/agendaPdf';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { Sheet } from '../../../components/Sheet';
import { DateField } from '../../../components/DateField';
import { TimeField } from '../../../components/TimeField';
import { confirm } from '../../../components/ConfirmHost';

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
      onAgenda: agenda.onAgenda,
      overdue: agenda.overdue,
      dueSoon: agenda.dueSoon,
      congregationName: congQuery.data?.congregation?.name ?? '',
      nameOf,
      areaLabel: (a) => t(`tasks.areas.${a}`),
      formatDate: fmt,
      labels: {
        title: t('tasks.agenda.title'),
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
