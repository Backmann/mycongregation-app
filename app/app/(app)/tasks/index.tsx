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
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  TaskAssigneeKind,
  meApi,
  publishersApi,
  taskRulesApi,
  tasksApi,
  type ElderTask,
  type TaskArea,
} from '../../../lib/api';
import { Sheet } from '../../../components/Sheet';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { DateField } from '../../../components/DateField';
import { confirm } from '../../../components/ConfirmHost';
import {
  AREA_BG,
  AREA_FG,
  AREAS,
  quarterLabel,
} from '../../../lib/task-areas';
import { UndoBar } from '../../../components/UndoBar';


/** One colour per area — the glance before the reading. */
const AREA_TINT: Record<TaskArea, string> = {
  ministry: '#1D9E75',
  teaching: '#BA7517',
  care: '#7F77DD',
  organisation: '#185FA5',
  announcements: '#378ADD',
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
  const [tab, setTab] = useState<'open' | 'mine' | 'done'>('open');
  /** The one just ticked — held so it can be put back, and so it can linger. */
  const [justDone, setJustDone] = useState<ElderTask | null>(null);

  const openQuery = useQuery({
    queryKey: ['tasks', 'open'],
    queryFn: () => tasksApi.list('open'),
  });
  const doneQuery = useQuery({
    queryKey: ['tasks', 'done'],
    queryFn: () => tasksApi.list('done'),
    // Fetched always now, because the tab shows a count — and a count that
    // only appears once you have opened the tab is no help at all.
    staleTime: 60 * 1000,
  });
  // Which card is mine — needed for «Мои». /me/publisher is the one honest
  // way to ask: the roster hides userId from anybody without rights.
  const meQuery = useQuery({
    queryKey: ['me', 'publisher'],
    queryFn: () => meApi.publisher(),
    retry: false,
  });
  const myPublisherId = meQuery.data?.publisher?.id ?? null;

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
    onSuccess: (_r, task) => {
      invalidate();
      // Marked done? Then say so, and offer the way back.
      //
      // The row simply vanished before, and people were frightened by it —
      // rightly. What matters at that moment is not that the task is safe but
      // that the act LOOKED irreversible and left no trace. The strip is the
      // same one the circuit schedule uses; nothing new had to be written.
      if (task.status === 'open') {
        setJustDone(task);
      } else {
        setJustDone(null);
      }
      // NO QUESTION HERE ANY MORE.
      //
      // Closing used to raise «повторить через сколько месяцев?». It was a
      // fair idea when nothing repeated by itself — but the things that truly
      // come round are now on the calendar and return without being asked,
      // and offering to copy one of THOSE produces two identical tasks, one
      // by hand and one by the app. For everything else the question arrived
      // at the worst possible moment: over the undo strip, exactly where a
      // person who had just ticked something by mistake was reaching.
      //
      // So closing a task is one act, and the only thing it raises is the way
      // back.
    },
  });

  const today = dayjs().format('YYYY-MM-DD');
  const fmt = (iso: string) => dayjs(iso).locale(i18n.language).format('D MMMM');

  const open = openQuery.data ?? [];

  /**
   * How far off a deadline is, in words.
   *
   * «Срок: 12 августа» asks the reader to work out what that means today. The
   * distance is the thing he actually wants, so the distance is what is
   * written; the date itself is still there for anybody who needs it.
   */
  const whenLabel = (task: ElderTask): string => {
    // A finished task is not «late»: the deadline stopped being the question
    // the moment the work was done. What the reader wants then is when it was
    // closed — and the card said «Просрочено на 8 дней» about work already
    // behind them, which reads as a reproach for nothing.
    if (task.status === 'done') {
      return task.doneAt
        ? t('tasks.doneOn', {
            date: dayjs(task.doneAt).locale(i18n.language).format('D MMMM'),
            time: dayjs(task.doneAt).format('HH:mm'),
          })
        : '';
    }
    if (!task.dueDate) return '';
    const days = dayjs(task.dueDate).diff(dayjs(today), 'day');
    if (days < 0) return t('tasks.lateByDays', { count: -days });
    if (days === 0) return t('tasks.dueToday');
    if (days === 1) return t('tasks.dueTomorrow');
    if (days <= 7) return t('tasks.dueInDays', { count: days });
    return fmt(task.dueDate) + (task.dueTime ? ` · ${task.dueTime}` : '');
  };

  /** Whom it reaches, said the way a person would say it. */
  const whoLabel = (task: ElderTask): string => {
    if (task.assigneeKind === 'service_committee') {
      return t('tasks.assignee.serviceCommittee');
    }
    if (task.assigneeKind === 'body_of_elders') {
      return t('tasks.assignee.bodyOfElders');
    }
    const names = (task.assignees ?? [])
      .map((p) => nameOf(p.id))
      .filter(Boolean);
    if (names.length === 0) return nameOf(task.assigneePublisherId) ?? '';
    // All of them, named. «и ещё 1» saves a line and costs the reader the one
    // thing he came for: who is doing this. The row wraps if it must.
    return names.join(', ');
  };

  const chip = (text: string, bg: string, fg: string, key: string) => (
    <View key={key} style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={[styles.tagText, { color: fg }]}>{text}</Text>
    </View>
  );

  /**
   * What a task is called.
   *
   * The recurring ones carry no title of their own: the app creates them by
   * itself, and a congregation may read German. Storing a Russian sentence
   * would have been wrong for them and unfixable afterwards, so what is stored
   * is the KIND and the reader's own app writes the words.
   */
  const titleOf = (task: ElderTask): string => {
    if (!task.kind) return task.title;
    const name = t(`tasks.calendar.${task.kind}`);
    // Two audits can stand open at once, and «Проверка счетов» twice over says
    // nothing about which quarter is which. The period is part of the name.
    const quarter = quarterLabel(task.kindPeriod, t);
    return quarter ? `${name} · ${quarter}` : name;
  };

  const row = (task: ElderTask) => {
    const late = !!task.dueDate && task.dueDate < today && task.status === 'open';
    const who = whoLabel(task);
    const when = whenLabel(task);
    return (
      <Pressable
        key={task.id}
        style={[
          styles.card,
          late && styles.cardLate,
          // A row on its way out steps back: quieter than the live ones, and
          // still perfectly readable while the strip below offers it back.
          task.status === 'done' && styles.cardDone,
        ]}
        onPress={() => setEditing(task)}
      >
        <View style={styles.cardHead}>
          <Text
            style={[styles.title, task.status === 'done' && styles.titleDone]}
          >
            {titleOf(task)}
          </Text>
          {/* The tick is the whole act, so it is given room to be one: a
              circle that fills rather than a glyph that swaps. */}
          <Pressable
            hitSlop={12}
            onPress={() => closeMut.mutate(task)}
            style={({ pressed }) => [
              styles.check,
              task.status === 'done' && styles.checkOn,
              pressed && styles.checkPressed,
            ]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: task.status === 'done' }}
          >
            {task.status === 'done' ? (
              <Ionicons name="checkmark" size={17} color="#ffffff" />
            ) : null}
          </Pressable>
        </View>

        {/* The area was a pale word under the title and got lost. A tinted
            label is read before the sentence is. */}
        <View style={styles.tagRow}>
          {chip(
            t(`tasks.areas.${task.area}`),
            AREA_BG[task.area],
            AREA_FG[task.area],
            'area',
          )}
          {when
            ? chip(
                when,
                late ? '#FCEBEB' : '#f1f5f9',
                late ? '#A32D2D' : '#475569',
                'when',
              )
            : null}
          {task.kind
            ? chip(t('tasks.recurring'), '#f1f5f9', '#475569', 'kind')
            : null}
        </View>

        {/* A calendar task that has a screen behind it says so. The brothers
            open the task, not the reports section — this is where they are. */}
        {task.kind === 'service_year_review' ? (
          <Pressable
            onPress={() =>
              router.push('/service-reports/pioneer-year-review' as never)
            }
            hitSlop={6}
          >
            <Text style={styles.openScreen}>
              {t('pioneerReview.openFromTask')}
            </Text>
          </Pressable>
        ) : null}

        {/* Who closed it. The columns were there from the first day and the
            screen never showed them, so «сделано» named no one. */}
        {task.status === 'done' && task.doneByName ? (
          <Text style={styles.closedBy}>
            {t('tasks.closedBy', { name: task.doneByName })}
          </Text>
        ) : null}

        {task.details ? (
          <Text style={styles.details} numberOfLines={2}>
            {task.details}
          </Text>
        ) : null}

        {who ? (
          <View style={styles.whoRow}>
            <Ionicons
              name={task.assigneeKind === 'people' ? 'person-outline' : 'people-outline'}
              size={14}
              color={task.assigneeKind === 'people' ? '#64748b' : '#0369a1'}
            />
            <Text
              style={[
                styles.who,
                task.assigneeKind !== 'people' && styles.whoBody,
              ]}
            >
              {who}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  /**
   * Three groups, in the order a person worries about them.
   *
   * A flat list makes the reader compare dates himself; a heading answers
   * «when» before he starts. Empty groups are left out — here a heading with
   * nothing under it would say nothing, unlike the agenda, where «nothing is
   * overdue» is worth reading.
   */
  const groups = (list: ElderTask[]) => {
    const weekEnd = dayjs(today).add(7, 'day').format('YYYY-MM-DD');
    return [
      {
        key: 'overdue',
        items: list.filter((x) => !!x.dueDate && x.dueDate < today),
      },
      {
        key: 'soon',
        items: list.filter(
          (x) => !!x.dueDate && x.dueDate >= today && x.dueDate <= weekEnd,
        ),
      },
      {
        key: 'later',
        items: list.filter((x) => !x.dueDate || x.dueDate > weekEnd),
      },
    ]
      .map((g) => ({
        ...g,
        // In date order inside each group, and undated last: a list a person
        // reads top to bottom should run the way time does.
        items: [...g.items].sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        }),
      }))
      .filter((g) => g.items.length > 0);
  };

  const mine = open.filter((x) => {
    if (!myPublisherId) return false;
    if (x.assigneeKind === 'people') {
      return (
        x.assignees?.some((p) => p.id === myPublisherId) ||
        x.assigneePublisherId === myPublisherId
      );
    }
    return x.members?.some((p) => p.id === myPublisherId) ?? false;
  });

  /**
   * The row it has just left stays a moment longer, ticked and struck through.
   *
   * A second and a half is the whole difference between «пропало» and «ушло
   * вот туда»: the eye follows it out. Without that the list simply jumps, and
   * a jump is what people read as loss.
   */
  const shown = (tab === 'mine' ? mine : open).concat(
    justDone && !open.some((x) => x.id === justDone.id)
      ? [{ ...justDone, status: 'done' as const }]
      : [],
  );

  return (
    <View style={styles.container}>
      {/* Was a collapsed «Сделанные» at the foot of the page, over an area
          that looked empty whether it was empty or merely shut. Three counts
          at the top answer the question the header only posed. */}
      <View style={styles.tabs}>
        {(['open', 'mine', 'done'] as const).map((k) => (
          <Pressable
            key={k}
            style={[styles.tab, tab === k && styles.tabOn]}
            onPress={() => setTab(k)}
          >
            <Text style={[styles.tabText, tab === k && styles.tabTextOn]}>
              {t(`tasks.tabs.${k}`)}
              {k === 'open' && open.length > 0 ? ` ${open.length}` : ''}
              {k === 'mine' && mine.length > 0 ? ` ${mine.length}` : ''}
              {/* One number falls, another rises: the place a task went to
                  stops being invisible. */}
              {k === 'done' && (doneQuery.data ?? []).length > 0
                ? ` ${(doneQuery.data ?? []).length}`
                : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'done' ? (
          doneQuery.isLoading ? (
            <ActivityIndicator style={{ marginTop: 32 }} />
          ) : (doneQuery.data ?? []).length === 0 ? (
            <Text style={styles.empty}>{t('tasks.noneDone')}</Text>
          ) : (
            (doneQuery.data ?? []).map(row)
          )
        ) : openQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 32 }} />
        ) : shown.length === 0 ? (
          <Text style={styles.empty}>
            {tab === 'mine' ? t('tasks.noneMine') : t('tasks.empty')}
          </Text>
        ) : (
          groups(shown).map((g) => (
            <View key={g.key}>
              <Text
                style={[
                  styles.groupLabel,
                  g.key === 'overdue' && styles.groupLate,
                ]}
              >
                {t(`tasks.groups.${g.key}`)}
              </Text>
              {g.items.map(row)}
            </View>
          ))
        )}

      </ScrollView>

      {/* Beside the scroller, never inside it: a strip that lives inside a
          list appears at the foot of its CONTENT, metres below the screen. */}
      <UndoBar
        visible={!!justDone}
        message={t('tasks.markedDone')}
        onUndo={async () => {
          if (!justDone) return;
          await tasksApi.update(justDone.id, { status: 'open' });
          setJustDone(null);
          invalidate();
        }}
        onDismiss={() => setJustDone(null)}
      />

      {/* A bare plus does not say what it makes, and two floating buttons at
          the same corner compete. The agenda moves to the header. */}
      <Pressable style={styles.fab} onPress={() => setEditing('new')}>
        <Ionicons name="add" size={20} color="#ffffff" />
        <Text style={styles.fabText}>{t('tasks.newShort')}</Text>
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
  const [kind, setKind] = useState<TaskAssigneeKind>('people');
  const [people, setPeople] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [dueTime, setDueTime] = useState<string>('');
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  /**
   * Why a chosen brother must not audit the accounts.
   *
   * Asked as the choice is made rather than at save time — a refusal after the
   * fact makes a person redo work he had no way of knowing was wrong. Two of
   * the three are refusals and one is advice, and the wording says which:
   * sometimes there is nobody else to ask, and the body decides.
   */
  const objectionsQuery = useQuery({
    queryKey: ['tasks', 'audit-objections', people.join(',')],
    queryFn: () => taskRulesApi.auditObjections(people),
    enabled: area === 'accounts' && people.length > 0,
  });
  const auditWarning = (() => {
    const found = objectionsQuery.data ?? {};
    const first = people.find((id) => found[id]);
    return first ? t(`tasks.form.audit.${found[first]}`) : null;
  })();


  const meetingsQuery = useQuery({
    queryKey: ['tasks', 'meetings'],
    queryFn: () => tasksApi.meetings(),
    enabled: visible,
  });

  // Fill the form from whatever was opened, once per opening.
  const key = editing?.id ?? (target === 'new' ? 'new' : null);
  if (visible && key !== loadedFor) {
    setLoadedFor(key);
    setTitle(editing?.title ?? '');
    setDetails(editing?.details ?? '');
    setArea(editing?.area ?? 'other');
    setKind(editing?.assigneeKind ?? 'people');
    setPeople(
      editing?.assignees?.length
        ? editing.assignees.map((p) => p.id)
        : editing?.assigneePublisherId
          ? [editing.assigneePublisherId]
          : [],
    );
    setDueTime(editing?.dueTime ?? '');
    setDueDate(editing?.dueDate ?? null);
    setMeetingId(editing?.eldersMeetingId ?? null);
  }
  if (!visible && loadedFor !== null) setLoadedFor(null);

  const saveMut = useMutation({
    mutationFn: () => {
      const input = {
        title: title.trim(),
        details: details.trim() || null,
        area,
        assigneeKind: kind,
        assigneePublisherIds: kind === 'people' ? people : [],
        dueTime: dueTime.trim() || null,
        dueDate,
        eldersMeetingId: meetingId,
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
        {editing?.kind ? (
          /* A calendar task is named by the app, in the reader's own language,
             from its `kind`. The stored title is a placeholder — and the form
             showed it raw, so «Обзор служения общих пионеров» opened as
             «service_year_review». Editing it changed nothing either: the list
             draws the translated name regardless. So it is shown as the settled
             fact it is. */
          <View style={styles.lockedTitle}>
            <Text style={styles.lockedTitleText}>
              {t(`tasks.calendar.${editing.kind}`)}
            </Text>
            <Text style={styles.lockedTitleHint}>
              {t('tasks.form.calendarTitleLocked')}
            </Text>
          </View>
        ) : (
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t('tasks.form.titlePlaceholder')}
            placeholderTextColor="#94a3b8"
          />
        )}

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
        {/* Whom it is for, in the three shapes a task actually takes.
            The two bodies carry no names on purpose: their members are read
            from current assignments each time, so replacing the secretary
            moves the task with the office rather than leaving it on the
            brother who happened to hold it in May. */}
        <Text style={styles.label}>{t('tasks.form.assignee')}</Text>
        <View style={styles.chipRow}>
          {(['people', 'service_committee', 'body_of_elders'] as const).map(
            (k) => (
              <Pressable
                key={k}
                style={[styles.chip, kind === k && styles.chipOnTeal]}
                onPress={() => setKind(k)}
              >
                <Text
                  style={[styles.chipText, kind === k && styles.chipTextOn]}
                >
                  {k === 'people'
                    ? t('tasks.form.assigneePeople')
                    : t(
                        `tasks.assignee.${
                          k === 'service_committee'
                            ? 'serviceCommittee'
                            : 'bodyOfElders'
                        }`,
                      )}
                </Text>
              </Pressable>
            ),
          )}
        </View>

        {kind === 'people' ? (
          <>
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
                absenceDate={dueDate ?? undefined}
              />
            ))}
            {/* One more slot, empty, rather than a count to set first: adding
                a brother is the common act and it should take one tap. */}
            {auditWarning ? (
              <Text style={styles.warn}>{auditWarning}</Text>
            ) : null}
            <PublisherSelector
              key={`add-${people.length}`}
              boxed
              label=""
              value={null}
              genderFilter="brother"
              onChange={(next) =>
                next && setPeople((list) => [...list, next])
              }
              absenceDate={dueDate ?? undefined}
            />
          </>
        ) : (
          <Text style={styles.hint}>{t('tasks.form.bodyHint')}</Text>
        )}

        {/* Putting it on a meeting is what turns a note into work: the body
            will look at this list that evening whether or not anyone
            remembered. */}
        <Text style={styles.label}>{t('tasks.form.meeting')}</Text>
        <View style={styles.chipRow}>
          <Pressable
            onPress={() => setMeetingId(null)}
            style={[styles.chip, meetingId === null && styles.chipOnTeal]}
          >
            <Text
              style={[styles.chipText, meetingId === null && styles.chipTextOn]}
            >
              {t('tasks.form.noMeeting')}
            </Text>
          </Pressable>
          {(meetingsQuery.data ?? []).map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setMeetingId(m.id)}
              style={[styles.chip, meetingId === m.id && styles.chipOnTeal]}
            >
              <Text
                style={[
                  styles.chipText,
                  meetingId === m.id && styles.chipTextOn,
                ]}
              >
                {dayjs(m.date).format('DD.MM')}
              </Text>
            </Pressable>
          ))}
        </View>

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
  tabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    maxWidth: 752,
    width: '100%',
    alignSelf: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabOn: { backgroundColor: '#0e7490', borderColor: '#0e7490' },
  tabText: { fontSize: 13, color: '#64748b' },
  tabTextOn: { color: '#fff', fontFamily: 'Manrope_600SemiBold' },
  groupLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
    marginBottom: 6,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  groupLate: { color: '#A32D2D' },
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
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  tagText: { fontSize: 12 },
  whoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 9 },
  who: { fontSize: 13, color: '#64748b', flex: 1 },
  whoBody: { color: '#0369a1' },
  cardLate: { borderColor: '#F09595' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e8edf3',
    // A card on a wide browser window stretched the whole way and left the
    // title alone on a line metres from its own chips.
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
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
  check: {
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Filled and green: done is a state, not a different picture. */
  checkOn: { backgroundColor: '#15803d', borderColor: '#15803d' },
  checkPressed: { opacity: 0.6, transform: [{ scale: 0.92 }] },
  cardDone: { backgroundColor: '#fbfdfc', borderColor: '#d7e6dd' },
  area: { fontSize: 12, color: '#64748b', marginLeft: 18 },
  // The 18pt indent belonged to the coloured dot that used to sit before the
  // title. The dot became a labelled chip and the indent was left behind,
  // holding the detail line out of line with everything above it.
  details: { fontSize: 13.5, color: '#475569', lineHeight: 19, marginTop: 8 },
  closedBy: { fontSize: 12.5, color: '#64748b', marginTop: 8 },
  lockedTitle: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  lockedTitleText: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  lockedTitleHint: {
    fontSize: 12,
    color: '#94a3b8',
    lineHeight: 17,
    marginTop: 4,
  },
  openScreen: {
    fontSize: 13.5,
    color: '#0369a1',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 10,
  },
  metaRow: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: '#0e7490',
  },
  fabText: { color: '#fff', fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  agendaBtn: {
    position: 'absolute',
    left: 18,
    bottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 15,
  },
  agendaText: {
    fontSize: 13.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  formBody: { padding: 16, gap: 6, paddingBottom: 32 },
  warn: {
    fontSize: 13,
    color: '#92400e',
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    lineHeight: 18,
  },
  hint: { fontSize: 13, color: '#64748b', marginTop: 6, lineHeight: 18 },
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
  chipOnTeal: { backgroundColor: '#0e7490' },
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
