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
  type ElderTask,
  type TaskArea,
} from '../../../lib/api';
import { Sheet } from '../../../components/Sheet';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { DateField } from '../../../components/DateField';
import { confirm } from '../../../components/ConfirmHost';

const AREAS: TaskArea[] = [
  'ministry',
  'teaching',
  'care',
  'organisation',
  'accounts',
  'other',
];

/** One colour per area — the glance before the reading. */
const AREA_TINT: Record<TaskArea, string> = {
  ministry: '#1D9E75',
  teaching: '#BA7517',
  care: '#7F77DD',
  organisation: '#185FA5',
  accounts: '#0e7490',
  other: '#64748b',
};

/**
 * Tasks the body of elders has undertaken.
 *
 * Open ones first and in full, because that is what the page is for; the ones
 * already done are kept in a section of their own — visible, since a body
 * should be able to see what it has finished, but out of the way of what it
 * has not.
 */
export default function TasksScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ElderTask | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);

  const openQuery = useQuery({
    queryKey: ['tasks', 'open'],
    queryFn: () => tasksApi.list('open'),
  });
  const doneQuery = useQuery({
    queryKey: ['tasks', 'done'],
    queryFn: () => tasksApi.list('done'),
    enabled: showDone,
  });
  const publishersQuery = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({}),
  });

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of publishersQuery.data?.data ?? []) m.set(p.id, p.displayName);
    return (id: string | null) => (id ? (m.get(id) ?? null) : null);
  }, [publishersQuery.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tasks'] });
  const closeMut = useMutation({
    mutationFn: (task: ElderTask) =>
      tasksApi.update(task.id, {
        status: task.status === 'done' ? 'open' : 'done',
      }),
    onSuccess: invalidate,
  });

  const today = dayjs().format('YYYY-MM-DD');
  const fmt = (iso: string) => dayjs(iso).locale(i18n.language).format('D MMMM');

  const open = openQuery.data ?? [];
  const overdue = open.filter((x) => !!x.dueDate && x.dueDate < today);

  const row = (task: ElderTask) => {
    const late = !!task.dueDate && task.dueDate < today && task.status === 'open';
    const who = nameOf(task.assigneePublisherId);
    return (
      <Pressable
        key={task.id}
        style={styles.card}
        onPress={() => setEditing(task)}
      >
        <View style={styles.cardHead}>
          <View
            style={[styles.areaDot, { backgroundColor: AREA_TINT[task.area] }]}
          />
          <Text
            style={[styles.title, task.status === 'done' && styles.titleDone]}
          >
            {task.title}
          </Text>
          <Pressable
            hitSlop={10}
            onPress={() => closeMut.mutate(task)}
            style={styles.check}
          >
            <Ionicons
              name={task.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={task.status === 'done' ? '#15803d' : '#94a3b8'}
            />
          </Pressable>
        </View>

        <Text style={styles.area}>{t(`tasks.areas.${task.area}`)}</Text>

        {task.details ? (
          <Text style={styles.details} numberOfLines={3}>
            {task.details}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {task.dueDate ? (
            <Text style={[styles.meta, late && styles.metaLate]}>
              {late
                ? t('tasks.overdueSince', { date: fmt(task.dueDate) })
                : t('tasks.due', { date: fmt(task.dueDate) })}
            </Text>
          ) : null}
          {who ? <Text style={styles.meta}>{who}</Text> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Facts, no scolding — and gone entirely when nothing is late. */}
        {overdue.length > 0 ? (
          <View style={styles.lateCard}>
            <Ionicons name="alert-circle-outline" size={15} color="#92400e" />
            <Text style={styles.lateText}>
              {t('tasks.overdueCount', { count: overdue.length })}
            </Text>
          </View>
        ) : null}

        {openQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} />
        ) : open.length === 0 ? (
          <Text style={styles.empty}>{t('tasks.empty')}</Text>
        ) : (
          open.map(row)
        )}

        <Pressable
          style={styles.doneToggle}
          onPress={() => setShowDone((v) => !v)}
        >
          <Ionicons
            name={showDone ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#0369a1"
          />
          <Text style={styles.doneToggleText}>{t('tasks.doneSection')}</Text>
        </Pressable>
        {showDone
          ? doneQuery.isLoading
            ? <ActivityIndicator />
            : (doneQuery.data ?? []).map(row)
          : null}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => setEditing('new')}>
        <Ionicons name="add" size={26} color="#ffffff" />
      </Pressable>

      <TaskForm
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          invalidate();
          setEditing(null);
        }}
      />
    </View>
  );
}

function TaskForm({
  target,
  onClose,
  onSaved,
}: {
  target: ElderTask | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const editing = target && target !== 'new' ? target : null;
  const visible = target !== null;

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [area, setArea] = useState<TaskArea>('other');
  const [assignee, setAssignee] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Fill the form from whatever was opened, once per opening.
  const key = editing?.id ?? (target === 'new' ? 'new' : null);
  if (visible && key !== loadedFor) {
    setLoadedFor(key);
    setTitle(editing?.title ?? '');
    setDetails(editing?.details ?? '');
    setArea(editing?.area ?? 'other');
    setAssignee(editing?.assigneePublisherId ?? null);
    setDueDate(editing?.dueDate ?? null);
  }
  if (!visible && loadedFor !== null) setLoadedFor(null);

  const saveMut = useMutation({
    mutationFn: () => {
      const input = {
        title: title.trim(),
        details: details.trim() || null,
        area,
        assigneePublisherId: assignee,
        dueDate,
      };
      return editing
        ? tasksApi.update(editing.id, input)
        : tasksApi.create(input);
    },
    onSuccess: onSaved,
  });

  const removeMut = useMutation({
    mutationFn: () => tasksApi.remove(editing!.id),
    onSuccess: onSaved,
  });

  const canSave = title.trim().length > 0 && !saveMut.isPending;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      variant="bottom"
      fills
      title={editing ? t('tasks.form.edit') : t('tasks.form.new')}
      closeLabel={t('common.close')}
      footer={
        <Pressable
          style={[styles.save, !canSave && styles.saveOff]}
          disabled={!canSave}
          onPress={() => saveMut.mutate()}
        >
          <Text style={styles.saveText}>{t('common.save')}</Text>
        </Pressable>
      }
    >
      <ScrollView contentContainerStyle={styles.formBody}>
        <Text style={styles.label}>{t('tasks.form.title')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('tasks.form.titlePlaceholder')}
          placeholderTextColor="#94a3b8"
        />

        <Text style={styles.label}>{t('tasks.form.area')}</Text>
        <View style={styles.chipRow}>
          {AREAS.map((a) => (
            <Pressable
              key={a}
              onPress={() => setArea(a)}
              style={[
                styles.chip,
                area === a && { backgroundColor: AREA_TINT[a] },
              ]}
            >
              <Text
                style={[styles.chipText, area === a && styles.chipTextOn]}
              >
                {t(`tasks.areas.${a}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>{t('tasks.form.details')}</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          value={details}
          onChangeText={setDetails}
          multiline
          placeholder={t('tasks.form.detailsPlaceholder')}
          placeholderTextColor="#94a3b8"
        />

        {/* Both optional, and deliberately so: much is decided by the body
            rather than by a person, and demanding a name at the moment of
            writing breeds assignments made only to satisfy the form. */}
        <Text style={styles.label}>{t('tasks.form.assignee')}</Text>
        <PublisherSelector
          boxed
          label={t('tasks.form.assignee')}
          value={assignee}
          onChange={setAssignee}
          absenceDate={dueDate ?? undefined}
        />

        <Text style={styles.label}>{t('tasks.form.due')}</Text>
        <DateField
          value={dueDate ?? undefined}
          onChange={(v) => setDueDate(v || null)}
        />

        {editing ? (
          <Pressable
            style={styles.delete}
            onPress={async () => {
              const ok = await confirm({
                title: t('tasks.form.deleteTitle'),
                body: t('tasks.form.deleteBody'),
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
  content: { padding: 16, paddingBottom: 96, gap: 10 },
  lateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    padding: 11,
    borderRadius: 12,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  lateText: { fontSize: 13.5, color: '#78350f', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 5 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  areaDot: { width: 9, height: 9, borderRadius: 999 },
  title: {
    flex: 1,
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  titleDone: { color: '#94a3b8', textDecorationLine: 'line-through' },
  check: { paddingLeft: 4 },
  area: { fontSize: 12, color: '#64748b', marginLeft: 18 },
  details: { fontSize: 13.5, color: '#475569', marginLeft: 18, lineHeight: 19 },
  metaRow: { flexDirection: 'row', gap: 12, marginLeft: 18, flexWrap: 'wrap' },
  meta: { fontSize: 12.5, color: '#475569' },
  metaLate: { color: '#b45309', fontWeight: '700' },
  empty: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 32 },
  doneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 6,
  },
  doneToggleText: {
    fontSize: 13.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 22,
    width: 54,
    height: 54,
    borderRadius: 999,
    backgroundColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  inputMulti: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  chipText: { fontSize: 13, color: '#334155', fontWeight: '600' },
  chipTextOn: { color: '#fff' },
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
