import { useEffect, useState, useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ScrollView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  circuitOverseersApi,
  CircuitOverseer,
  meetingSettingsApi,
  MeetingMode,
  SpecialEvent,
} from '../lib/api';
import { meetingDaysCovered, takesMeetingMode } from '../lib/event-meeting';
import { effectiveVersionFor } from '../lib/meeting-schedule';
import {
  addDaysISO,
  effectOf,
  KIND_LOOK,
  KindKey,
  mondayOfISO,
  serviceYearOf,
  visitMidweekDay,
} from '../lib/event-view';
import { useEffectText } from '../lib/event-effect-text';
import { MonthCalendar } from './MonthCalendar';
import { TimeField } from './TimeField';
import { RichText } from './RichText';

export const EVENT_TYPES = [
  'regional_convention',
  'circuit_assembly',
  'memorial',
  'circuit_overseer_visit',
  'branch_representative_visit',
  // The special talk is not made here any more: it is a talk of the talk
  // journal, with a theme in place of a number (27 September). Its label stays
  // in the translations for the events already in the bin.
  'other',
] as const;

export const TIME_PRESETS = [
  '09:20',
  '10:00',
  '13:30',
  '18:00',
  '18:30',
  '19:00',
  '20:00',
];

/** The hours each kind usually starts at — one tap instead of the wheel. */
const START_PRESETS: Record<string, string[]> = {
  regional_convention: ['09:20', '09:30', '09:40'],
  circuit_assembly: ['09:20', '09:30', '09:40'],
  memorial: ['18:30', '19:00', '19:30', '20:00', '20:30'],
};

export interface EventFormValue {
  title: string;
  type: string;
  date: string; // 'YYYY-MM-DD' (start)
  endDate: string; // '' or 'YYYY-MM-DD'
  time: string; // '' or 'HH:mm'
  timeEnd: string; // '' or 'HH:mm' — the event runs time–timeEnd
  address: string;
  mapUrl: string;
  programUrl: string;
  note: string;
  /** How the meeting goes that day — see lib/event-meeting.ts. */
  meetingMode: MeetingMode;
  meetingNote: string;
  meetingTime: string;
  meetingAddress: string;
  coFirstName: string;
  coLastName: string;
  coWifeName: string;
  coRole: string;
  coAccommodationAddress: string;
  coMidweekDow: number;
}

const CIRCUIT_OVERSEER_VISIT_TYPE_KEY = 'circuit_overseer_visit';
export const CIRCUIT_OVERSEER_VISIT_TYPE = CIRCUIT_OVERSEER_VISIT_TYPE_KEY;

export function emptyEventForm(): EventFormValue {
  return {
    title: '',
    type: '',
    date: '',
    endDate: '',
    time: '',
    timeEnd: '',
    address: '',
    mapUrl: '',
    programUrl: '',
    note: '',
    meetingMode: 'usual',
    meetingNote: '',
    meetingTime: '',
    meetingAddress: '',
    coFirstName: '',
    coLastName: '',
    coWifeName: '',
    coRole: 'overseer',
    coAccommodationAddress: '',
    coMidweekDow: 2,
  };
}

/**
 * The meeting answer as the server takes it. Only the events that carry it
 * send more than «as usual»; `replacesMeeting` goes along for the servers and
 * apps that still read it.
 */
export function meetingPayload(v: EventFormValue) {
  const mode: MeetingMode = takesMeetingMode(v.type.trim() || null)
    ? v.meetingMode
    : 'usual';
  const changed = mode === 'changed';
  return {
    meetingMode: mode,
    replacesMeeting: mode === 'none',
    // null, not «left out»: an emptied field must clear what was said.
    meetingNote: changed ? v.meetingNote.trim() || null : null,
    meetingTime: changed ? v.meetingTime.trim() || null : null,
    meetingAddress: changed ? v.meetingAddress.trim() || null : null,
  };
}

/**
 * What still keeps the event from being saved, in the reader's words — or
 * null. The save button used to go pale and say nothing; now it says this.
 * The same rules the server enforces, so a refusal after tapping is rare.
 */
export function eventFormProblem(
  v: EventFormValue,
  t: (k: string) => string,
  multiDay: boolean,
): string | null {
  const p = (k: string) => t(`specialEvents.form.problem.${k}`);
  if (!v.title.trim()) return p('needTitle');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date.trim())) {
    return v.type === CIRCUIT_OVERSEER_VISIT_TYPE_KEY
      ? p('needWeek')
      : p('needDate');
  }
  if (multiDay && !v.endDate.trim()) return p('needEnd');
  if (v.type === 'memorial' && !v.time.trim()) return p('memorialTime');
  if (v.time && v.timeEnd && v.timeEnd <= v.time) return p('timeOrder');
  const bad = (u: string) => !!u.trim() && !/^https?:\/\/\S+$/i.test(u.trim());
  if (bad(v.mapUrl) || bad(v.programUrl)) return p('linkInvalid');
  if (
    v.meetingMode === 'changed' &&
    takesMeetingMode(v.type || null) &&
    !v.meetingNote.trim() &&
    !v.meetingTime.trim() &&
    !v.meetingAddress.trim()
  )
    return p('changeEmpty');
  return null;
}

const CONGRESS = new Set(['regional_convention', 'circuit_assembly']);

/** The form's kind, as the rest of the events screen names kinds. */
export function formKind(v: EventFormValue): KindKey {
  const k = v.type || 'other';
  return (k in KIND_LOOK ? k : 'other') as KindKey;
}

/** How many days a congress lasts by default: a convention three, an assembly one. */
function congressDefaultLength(type: string): number {
  return type === 'regional_convention' ? 3 : 1;
}

/** A visit takes its week: from the midweek meeting's day (Tuesday at the latest) to Sunday. */
export function visitWeekOf(
  anyDayISO: string,
  midweekDow: number,
): { date: string; endDate: string } {
  const monday = mondayOfISO(anyDayISO);
  return {
    date: addDaysISO(monday, Math.min(midweekDow, 2) - 1),
    endDate: addDaysISO(monday, 6),
  };
}

/** The form as an event, for the rules the list and the feed read events by. */
function asEvent(v: EventFormValue): SpecialEvent {
  const meeting = meetingPayload(v);
  return {
    id: '',
    congregationId: '',
    title: v.title,
    type: v.type || null,
    date: v.date,
    endDate: v.endDate || null,
    time: v.time || null,
    timeEnd: v.timeEnd || null,
    address: v.address || null,
    mapUrl: null,
    programUrl: null,
    note: null,
    coFirstName: null,
    coLastName: null,
    coWifeName: null,
    coRole: null,
    coAccommodationAddress: null,
    coAccommodationPublisherId: null,
    coMidweekDow: v.coMidweekDow,
    replacesMeeting: meeting.replacesMeeting,
    meetingMode: meeting.meetingMode,
    meetingNote: meeting.meetingNote,
    meetingTime: meeting.meetingTime,
    meetingAddress: meeting.meetingAddress,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  };
}

/** The days an event holds, for «what else is on then»: a congress and a visit hold their whole weeks. */
function heldSpan(e: {
  type: string | null;
  date: string;
  endDate: string | null;
}): { from: string; to: string } {
  const end = e.endDate || e.date;
  if (CONGRESS.has(e.type ?? '') || e.type === CIRCUIT_OVERSEER_VISIT_TYPE_KEY) {
    return { from: mondayOfISO(e.date), to: addDaysISO(mondayOfISO(end), 6) };
  }
  return { from: e.date, to: end };
}

/**
 * What the other events say about this one: what stops it being saved (a
 * second Memorial in the service year, a second visit in a week — the server
 * refuses both) and what is only worth knowing (something else on the same
 * days).
 */
export function eventConflicts(
  v: EventFormValue,
  others: SpecialEvent[] | undefined,
  selfId: string | null,
  t: (k: string, o?: Record<string, unknown>) => string,
  locale: string,
): { problem: string | null; warnings: string[] } {
  if (!others || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) {
    return { problem: null, warnings: [] };
  }
  const live = others.filter((e) => !e.deletedAt && e.id !== selfId);
  const when = (e: SpecialEvent) => {
    const d = (iso: string, f: string) => dayjs(iso).locale(locale).format(f);
    return e.endDate && e.endDate !== e.date
      ? `${d(e.date, 'D MMMM')} – ${d(e.endDate, 'D MMMM')}`
      : d(e.date, 'dd, D MMMM');
  };

  let problem: string | null = null;
  if (v.type === 'memorial') {
    const year = serviceYearOf(v.date);
    const taken = live.find(
      (e) => e.type === 'memorial' && serviceYearOf(e.date) === year,
    );
    if (taken) {
      problem = t('specialEvents.form.problem.memorialTaken', {
        when: when(taken),
      });
    }
  }
  if (v.type === CIRCUIT_OVERSEER_VISIT_TYPE_KEY) {
    const week = mondayOfISO(v.date);
    const taken = live.find(
      (e) =>
        e.type === CIRCUIT_OVERSEER_VISIT_TYPE_KEY &&
        mondayOfISO(e.date) === week,
    );
    if (taken) {
      problem = t('specialEvents.form.problem.visitTaken', {
        when: when(taken),
      });
    }
  }

  const mine = heldSpan({
    type: v.type || null,
    date: v.date,
    endDate: v.endDate || null,
  });
  const warnings = live
    .filter((e) => {
      if (problem && e.type === v.type) return false;
      const span = heldSpan(e);
      return span.from <= mine.to && span.to >= mine.from;
    })
    .slice(0, 3)
    .map((e) =>
      t('specialEvents.form.overlap', { title: e.title, when: when(e) }),
    );
  return { problem, warnings };
}

function capitalize(x: string): string {
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
}

export function SpecialEventForm({
  value,
  onChange,
  pastLocked = false,
  onMultiDayChange,
  isNew = false,
  others,
  selfId = null,
}: {
  value: EventFormValue;
  onChange: (v: EventFormValue) => void;
  onMultiDayChange?: (on: boolean) => void;
  /**
   * The event is over: its days and its kind are history and stay as they
   * are (the server refuses to change them). The rest can be put right.
   */
  pastLocked?: boolean;
  /** A new event (the summary says who will be told). */
  isNew?: boolean;
  /**
   * The congregation's other events, for «as last time» and «already on
   * those days». The form works without them.
   */
  others?: SpecialEvent[];
  selfId?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const kind = formKind(value);
  const isCoVisit = kind === 'circuit_overseer_visit';
  const isCongress = CONGRESS.has(kind);
  const isMemorial = kind === 'memorial';
  const isOther = kind === 'other';

  const set = (patch: Partial<EventFormValue>) =>
    onChange({ ...value, ...patch });

  // «Several days» is a question only for «Other»: the other kinds know
  // their length — a visit its week, a congress its days, the Memorial and a
  // representative's visit one evening.
  const [otherMultiDay, setOtherMultiDay] = useState<boolean>(
    !!value.endDate && value.endDate !== value.date,
  );
  const congressLength = value.endDate
    ? dayjs(value.endDate).diff(dayjs(value.date), 'day') + 1
    : 1;
  const multiDay = isCoVisit
    ? true
    : isCongress
      ? congressLength > 1
      : isOther
        ? otherMultiDay
        : false;
  // Tell the screen that owns the save button, so it can say what is missing.
  useEffect(() => {
    onMultiDayChange?.(multiDay);
  }, [multiDay, onMultiDayChange]);

  const [showDate, setShowDate] = useState(!value.date && !pastLocked);
  // A congress length chosen before its first day, used when the day is.
  const [pendingLength, setPendingLength] = useState<number | null>(null);
  const [showKinds, setShowKinds] = useState(false);

  const settingsQ = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const versions = settingsQ.data?.versions;

  /**
   * «How does the meeting go» is asked only where there is a meeting to ask
   * about: an event of the kinds that carry the answer, on a day the
   * congregation meets. Until the settings arrive it is asked anyway —
   * hiding it would hide an answer already given.
   */
  const covered = meetingDaysCovered(
    value.date,
    multiDay ? value.endDate : null,
    versions,
  );
  const asksMeeting =
    takesMeetingMode(value.type || null) &&
    !!value.date &&
    (!settingsQ.data || covered.length > 0);
  // A day without a meeting has nothing to change or cancel: the answer goes
  // back to «as usual» rather than staying behind unseen.
  useEffect(() => {
    if (settingsQ.data && !asksMeeting && value.meetingMode !== 'usual') {
      onChange({ ...value, meetingMode: 'usual' });
    }
  }, [settingsQ.data, asksMeeting, value, onChange]);

  // Circuit overseers to choose from (regular + substitutes). A new visit
  // pre-fills the names from the primary; the chips switch to a substitute.
  // Editing a saved visit keeps its own snapshot, so non-empty names are
  // never overwritten.
  const { data: overseers } = useQuery({
    queryKey: ['circuit-overseers'],
    queryFn: () => circuitOverseersApi.list(),
    enabled: isCoVisit,
  });

  useEffect(() => {
    if (!isCoVisit || !overseers || overseers.length === 0) return;
    const empty =
      !value.coFirstName.trim() &&
      !value.coLastName.trim() &&
      !value.coWifeName.trim();
    if (empty) {
      const primary = overseers.find((c) => c.isPrimary) ?? overseers[0];
      set({
        coFirstName: primary.firstName ?? '',
        coLastName: primary.lastName ?? '',
        coWifeName: primary.wifeName ?? '',
        coRole: primary.role,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCoVisit, overseers]);

  const knownOverseer = (overseers ?? []).find(
    (c) =>
      c.firstName === value.coFirstName && c.lastName === value.coLastName,
  );
  const [otherBrother, setOtherBrother] = useState(false);
  // Names that match nobody on the list are «another brother»: shown as
  // fields, not hidden behind a chip that is not lit.
  const namesShown =
    otherBrother ||
    !overseers ||
    overseers.length === 0 ||
    (!knownOverseer &&
      !!(value.coFirstName.trim() || value.coLastName.trim()));

  const pickOverseer = (c: CircuitOverseer) => {
    setOtherBrother(false);
    set({
      coFirstName: c.firstName,
      coLastName: c.lastName,
      coWifeName: c.wifeName ?? '',
      coRole: c.role,
    });
  };

  // The kinds' own names. A title that is one of them was filled in by the
  // form, and follows the kind when it changes; a title someone typed stays.
  const typeLabels = new Set(
    EVENT_TYPES.map((k) => t(`specialEvents.types.${k}`, k)),
  );
  const kindLabel = t(`specialEvents.types.${kind}`, kind);
  const titleIsAuto = !value.title.trim() || typeLabels.has(value.title.trim());

  const selectType = (key: string) => {
    const other = key === 'other';
    const label = t(`specialEvents.types.${key}`, key);
    const patch: Partial<EventFormValue> = {
      type: other ? '' : key,
      title: titleIsAuto ? (other ? '' : label) : value.title,
    };
    // The days follow the kind's length.
    if (value.date) {
      if (key === CIRCUIT_OVERSEER_VISIT_TYPE_KEY) {
        Object.assign(patch, visitWeekOf(value.date, value.coMidweekDow));
      } else if (CONGRESS.has(key)) {
        const n = congressDefaultLength(key);
        patch.endDate = n > 1 ? addDaysISO(value.date, n - 1) : '';
      } else if (key === 'memorial' || key === 'branch_representative_visit') {
        patch.endDate = '';
      }
    }
    // A branch representative's day usually changes the meeting rather than
    // cancelling it — a new one opens on that answer.
    if (isNew && key === 'branch_representative_visit' && value.meetingMode === 'usual') {
      patch.meetingMode = 'changed';
    }
    set(patch);
    setShowKinds(false);
  };

  const pickDay = (iso: string) => {
    // One tap settles a visit's week and a congress's days: the calendar
    // closes, the chosen days stay in its button.
    if (isCoVisit) {
      set(visitWeekOf(iso, value.coMidweekDow));
      setShowDate(false);
      return;
    }
    if (isCongress) {
      const n = value.date
        ? congressLength
        : (pendingLength ?? congressDefaultLength(kind));
      set({ date: iso, endDate: n > 1 ? addDaysISO(iso, n - 1) : '' });
      setShowDate(false);
      return;
    }
    if (isOther && otherMultiDay) {
      // Two taps: the first day, then the last.
      if (!value.date || value.endDate || iso < value.date) {
        set({ date: iso, endDate: '' });
      } else {
        set({ endDate: iso });
        setShowDate(false);
      }
      return;
    }
    set({ date: iso, endDate: '' });
    setShowDate(false);
  };

  const noteSelRef = useRef<{ start: number; end: number } | null>(null);
  const insertIntoNote = (snippet: string) => {
    const note = value.note ?? '';
    const sel = noteSelRef.current ?? { start: note.length, end: note.length };
    let text = snippet;
    // A bullet starts its own line.
    if (snippet.startsWith('•') && sel.start > 0 && note[sel.start - 1] !== '\n')
      text = `\n${snippet}`;
    const next = note.slice(0, sel.start) + text + note.slice(sel.end);
    noteSelRef.current = {
      start: sel.start + text.length,
      end: sel.start + text.length,
    };
    set({ note: next });
  };
  /** Wrap the selected text in markers (or insert them and park the caret
   * inside) — this is how B and I work, like in a real editor. */
  const wrapNote = (marker: string) => {
    const note = value.note ?? '';
    const sel = noteSelRef.current ?? { start: note.length, end: note.length };
    if (sel.end > sel.start) {
      const inner = note.slice(sel.start, sel.end);
      const next =
        note.slice(0, sel.start) + marker + inner + marker + note.slice(sel.end);
      noteSelRef.current = {
        start: sel.end + marker.length * 2,
        end: sel.end + marker.length * 2,
      };
      set({ note: next });
    } else {
      const next =
        note.slice(0, sel.start) + marker + marker + note.slice(sel.end);
      noteSelRef.current = {
        start: sel.start + marker.length,
        end: sel.start + marker.length,
      };
      set({ note: next });
    }
  };

  const day = (iso: string, f: string) => dayjs(iso).locale(locale).format(f);
  const spanLabel = (from: string, to: string) => {
    if (!to || to === from) return capitalize(day(from, 'dddd, D MMMM YYYY'));
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    return sameMonth
      ? `${day(from, 'dd D')} – ${day(to, 'dd D MMMM YYYY')}`
      : `${day(from, 'dd D MMMM')} – ${day(to, 'dd D MMMM YYYY')}`;
  };
  const dateLabel = value.date
    ? spanLabel(value.date, multiDay ? value.endDate : '')
    : isCoVisit
      ? t('specialEvents.form.pickWeek')
      : t('specialEvents.form.pickDate');

  // «As last time»: the same kind's latest earlier event with a place — a
  // convention is in the same hall year after year, the Memorial too.
  const earlier = (others ?? [])
    .filter(
      (e) =>
        !e.deletedAt &&
        e.id !== selfId &&
        (e.type || 'other') === kind &&
        kind !== 'other' &&
        e.date < (value.date || '9999-12-31'),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const lastPlace = earlier.find((e) => e.address?.trim());

  const look = KIND_LOOK[kind];
  const version = value.date ? effectiveVersionFor(versions, value.date) : null;

  return (
    <View>
      {pastLocked ? (
        <View style={styles.pastNote}>
          <Ionicons name="lock-closed-outline" size={16} color="#475569" />
          <Text style={styles.pastNoteText}>
            {t('specialEvents.form.pastLocked')}
          </Text>
        </View>
      ) : null}

      {/* The kind decides the questions (27 September): it heads the form,
          and changing it is one tap away rather than a field among fields. */}
      <View style={styles.kindHead}>
        <View style={[styles.kindIcon, { backgroundColor: look.soft }]}>
          <Ionicons name={look.icon as never} size={20} color={look.color} />
        </View>
        <Text style={styles.kindName}>
          {isOther ? t('specialEvents.create.other') : kindLabel}
        </Text>
        {pastLocked ? null : (
          <Pressable
            hitSlop={8}
            onPress={() => setShowKinds((s) => !s)}
            accessibilityRole="button"
          >
            <Text style={styles.kindChange}>
              {showKinds
                ? t('specialEvents.actions.cancel')
                : t('specialEvents.form.changeKind')}
            </Text>
          </Pressable>
        )}
      </View>
      {showKinds ? (
        <View style={styles.inlineCard}>
          {EVENT_TYPES.map((key) => {
            const active = kind === key;
            const kl = KIND_LOOK[key as KindKey];
            return (
              <Pressable
                key={key}
                style={styles.typeRow}
                onPress={() => selectType(key)}
              >
                <Ionicons name={kl.icon as never} size={18} color={kl.color} />
                <Text style={styles.typeText}>
                  {key === 'other'
                    ? t('specialEvents.create.other')
                    : t(`specialEvents.types.${key}`, key)}
                </Text>
                {active && (
                  <Ionicons name="checkmark" size={20} color="#0ea5e9" />
                )}
              </Pressable>
            );
          })}
          <Text style={styles.typeHint}>
            {t('specialEvents.form.specialTalkMoved')}
          </Text>
        </View>
      ) : null}

      {/* Title. «Other» needs one; a representative's visit has one ready
          to change; a congress may carry its theme; the visit and the
          Memorial are named by their kind — unless someone named them. */}
      {isOther || kind === 'branch_representative_visit' ? (
        <Section label={t('specialEvents.fields.title')}>
          <TextInput
            style={styles.input}
            value={value.title}
            onChangeText={(x) => set({ title: x })}
            // An example, not an order: the order is already under the
            // save button, and the two said the same words.
            placeholder={
              isOther
                ? t('specialEvents.form.titleExample')
                : t('specialEvents.placeholders.title')
            }
            placeholderTextColor="#94a3b8"
          />
        </Section>
      ) : isCongress ? (
        <Section label={t('specialEvents.form.theme')}>
          <TextInput
            style={styles.input}
            value={titleIsAuto ? '' : value.title}
            onChangeText={(x) => set({ title: x.trim() ? x : kindLabel })}
            placeholder={t('specialEvents.form.themePlaceholder')}
            placeholderTextColor="#94a3b8"
          />
        </Section>
      ) : !titleIsAuto ? (
        <Section label={t('specialEvents.fields.title')}>
          <TextInput
            style={styles.input}
            value={value.title}
            onChangeText={(x) => set({ title: x.trim() ? x : kindLabel })}
            placeholderTextColor="#94a3b8"
          />
        </Section>
      ) : null}

      {/* Who is coming — the visit only. */}
      {isCoVisit ? (
        <Section label={t('specialEvents.form.who')}>
          {overseers && overseers.length > 0 ? (
            <View style={styles.chips}>
              {overseers.map((c) => {
                const active = !otherBrother && knownOverseer?.id === c.id;
                const extra = [
                  c.wifeName ? t('specialEvents.form.withWife') : null,
                  c.role === 'substitute'
                    ? t('specialEvents.form.substitute')
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Chip
                    key={c.id}
                    label={`${c.firstName} ${c.lastName}${extra ? ` · ${extra}` : ''}`}
                    active={active}
                    onPress={() => pickOverseer(c)}
                  />
                );
              })}
              <Chip
                label={t('specialEvents.form.otherBrother')}
                active={namesShown && !knownOverseer}
                onPress={() => {
                  setOtherBrother(true);
                  if (knownOverseer) {
                    set({
                      coFirstName: '',
                      coLastName: '',
                      coWifeName: '',
                      coRole: 'substitute',
                    });
                  }
                }}
              />
            </View>
          ) : null}
          {namesShown ? (
            <View style={{ gap: 8, marginTop: overseers?.length ? 10 : 0 }}>
              <View style={styles.pair}>
                <TextInput
                  style={[styles.input, styles.half]}
                  value={value.coFirstName}
                  onChangeText={(x) => set({ coFirstName: x })}
                  placeholder={t('circuitOverseer.firstName')}
                  autoCapitalize="words"
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  style={[styles.input, styles.half]}
                  value={value.coLastName}
                  onChangeText={(x) => set({ coLastName: x })}
                  placeholder={t('circuitOverseer.lastName')}
                  autoCapitalize="words"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <TextInput
                style={styles.input}
                value={value.coWifeName}
                onChangeText={(x) => set({ coWifeName: x })}
                placeholder={t('circuitOverseer.wifeName')}
                autoCapitalize="words"
                placeholderTextColor="#94a3b8"
              />
            </View>
          ) : null}
        </Section>
      ) : null}

      {/* The days, first among the facts: everything else hangs on them. */}
      <Section
        label={
          isCoVisit
            ? t('specialEvents.form.week')
            : multiDay || isCongress
              ? t('specialEvents.form.days')
              : t('specialEvents.form.day')
        }
      >
        {isOther ? (
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {t('specialEvents.form.multiDay')}
            </Text>
            <Switch
              value={otherMultiDay}
              disabled={pastLocked}
              onValueChange={(on) => {
                setOtherMultiDay(on);
                if (!on) set({ endDate: '' });
                setShowDate(true);
              }}
            />
          </View>
        ) : null}
        {isCongress && !pastLocked ? (
          <View style={[styles.chips, { marginBottom: 10 }]}>
            {[1, 2, 3].map((n) => (
              <Chip
                key={n}
                label={t('specialEvents.form.length', { count: n })}
                active={
                  (value.date
                    ? congressLength
                    : (pendingLength ?? congressDefaultLength(kind))) === n
                }
                onPress={() => {
                  if (!value.date) {
                    setPendingLength(n);
                    return;
                  }
                  set({ endDate: n > 1 ? addDaysISO(value.date, n - 1) : '' });
                }}
              />
            ))}
          </View>
        ) : null}
        <Pressable
          style={[styles.selectBtn, pastLocked && styles.locked]}
          disabled={pastLocked}
          onPress={() => setShowDate((s) => !s)}
        >
          <Ionicons
            name="calendar-outline"
            size={18}
            color="#0ea5e9"
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.selectText, !value.date && styles.placeholder]}>
            {dateLabel}
          </Text>
          <Ionicons
            name={showDate ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#64748b"
          />
        </Pressable>
        {showDate && !pastLocked ? (
          <View style={styles.inlineCard}>
            <Text style={styles.calendarHint}>
              {isCoVisit
                ? t('specialEvents.form.weekHint')
                : isCongress
                  ? t('specialEvents.form.congressHint')
                  : isOther && otherMultiDay
                    ? t('specialEvents.form.rangeHint')
                    : ''}
            </Text>
            <MonthCalendar
              compact
              hidePresets={isCoVisit || isCongress}
              mode={multiDay ? 'range' : 'single'}
              start={value.date || null}
              end={value.endDate || null}
              onChange={() => undefined}
              onPickDay={pickDay}
              locale={locale}
            />
          </View>
        ) : null}
      </Section>

      {/* The visit's midweek meeting — the day the week turns on. */}
      {isCoVisit ? (
        <Section label={t('specialEvents.form.midweek')}>
          <View style={styles.chips}>
            {[1, 2, 3, 4, 5].map((d) => {
              const usual = version?.midweekDow === d;
              return (
                <Chip
                  key={d}
                  label={
                    usual
                      ? `${t(`meetingSettings.dow.${d}`)} · ${t('specialEvents.form.usualDay')}`
                      : t(`meetingSettings.dow.${d}`)
                  }
                  active={value.coMidweekDow === d}
                  disabled={pastLocked}
                  onPress={() =>
                    set({
                      coMidweekDow: d,
                      ...(value.date ? visitWeekOf(value.date, d) : {}),
                    })
                  }
                />
              );
            })}
          </View>
        </Section>
      ) : null}

      {/* The hour: a congress and the Memorial by one tap; others as before. */}
      {isCongress || isMemorial ? (
        <Section label={t('specialEvents.form.start')}>
          <StartTime
            value={value.time}
            presets={START_PRESETS[kind] ?? TIME_PRESETS}
            allowNone={!isMemorial}
            onChange={(x) => set({ time: x, timeEnd: '' })}
          />
        </Section>
      ) : !isCoVisit ? (
        <Section label={t('specialEvents.form.time')}>
          <View style={styles.chips}>
            <Chip
              label={t('specialEvents.form.noTime')}
              active={!value.time}
              onPress={() => set({ time: '', timeEnd: '' })}
            />
            <Chip
              label={t('specialEvents.form.singleTime')}
              active={!!value.time && !value.timeEnd}
              onPress={() => set({ time: value.time || '10:00', timeEnd: '' })}
            />
            <Chip
              label={t('specialEvents.form.rangeTime')}
              active={!!value.time && !!value.timeEnd}
              onPress={() =>
                set({
                  time: value.time || '10:00',
                  timeEnd: value.timeEnd || '12:00',
                })
              }
            />
          </View>
          {value.time ? (
            <View style={styles.timeFields}>
              <View style={{ flex: 1 }}>
                {value.timeEnd ? (
                  <Text style={styles.timeSubLabel}>
                    {t('specialEvents.form.timeFrom')}
                  </Text>
                ) : null}
                <TimeField
                  value={value.time}
                  onChange={(v) => set({ time: v })}
                />
              </View>
              {value.timeEnd ? (
                <View style={{ flex: 1 }}>
                  <Text style={styles.timeSubLabel}>
                    {t('specialEvents.form.timeTo')}
                  </Text>
                  <TimeField
                    value={value.timeEnd}
                    onChange={(v) => set({ timeEnd: v })}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </Section>
      ) : null}

      {/* Where. The visit's lodging is settled in its schedule, with the
          families and the halls to choose from — not asked twice. */}
      {isCoVisit ? (
        <Text style={styles.stayHint}>{t('specialEvents.form.stayInSchedule')}</Text>
      ) : (
        <Section label={t('specialEvents.form.where')}>
          <TextInput
            style={styles.input}
            value={value.address}
            onChangeText={(x) => set({ address: x })}
            placeholder={t('specialEvents.placeholders.address')}
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={value.mapUrl}
            onChangeText={(x) => set({ mapUrl: x })}
            placeholder={t('specialEvents.form.mapPlaceholder')}
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            keyboardType="url"
          />
          {lastPlace &&
          !value.address.trim() &&
          !value.mapUrl.trim() ? (
            <Pressable
              onPress={() =>
                set({
                  address: lastPlace.address ?? '',
                  mapUrl: lastPlace.mapUrl ?? '',
                  // The hour goes along when none is chosen yet: a convention
                  // starts at the same time year after year.
                  ...(!value.time && lastPlace.time
                    ? { time: lastPlace.time, timeEnd: '' }
                    : {}),
                })
              }
              hitSlop={6}
            >
              <Text style={styles.suggest}>
                {t('specialEvents.form.asLastTime', {
                  value: lastPlace.address,
                  year: day(lastPlace.date, 'YYYY'),
                })}
              </Text>
            </Pressable>
          ) : null}
        </Section>
      )}

      {isCongress || isOther ? (
        <Section label={t('specialEvents.form.programme')}>
          <TextInput
            style={styles.input}
            value={value.programUrl}
            onChangeText={(x) => set({ programUrl: x })}
            placeholder={t('specialEvents.form.programmePlaceholder')}
            placeholderTextColor="#94a3b8"
            autoCapitalize="none"
            keyboardType="url"
          />
        </Section>
      ) : null}

      {/*
        How the congregation meeting goes that day (27 September). A branch
        representative's visit usually does NOT cancel the meeting — it goes
        ahead, differently: another hour, another hall, his talk in place of
        the public talk. A yes/no switch could not say that.
      */}
      {asksMeeting ? (
        <Section label={t('specialEvents.meeting.label')}>
          {covered.length > 0 ? (
            <Text style={styles.meetingDay}>
              {covered
                .map((c) =>
                  t('specialEvents.meeting.dayIs', {
                    day: capitalize(day(c.date, 'dddd, D MMMM')),
                    kind: t(`specialEvents.meeting.kind.${c.kind}`),
                  }),
                )
                .join('\n')}
            </Text>
          ) : null}
          <View style={styles.modeList}>
            {(['usual', 'changed', 'none'] as const).map((m) => {
              const on = value.meetingMode === m;
              return (
                <Pressable
                  key={m}
                  disabled={pastLocked}
                  onPress={() => set({ meetingMode: m })}
                  style={[
                    styles.modeRow,
                    on && styles.modeRowOn,
                    pastLocked && !on && styles.locked,
                  ]}
                >
                  <Ionicons
                    name={on ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={on ? '#0284c7' : '#94a3b8'}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.modeTitle, on && styles.modeTitleOn]}>
                      {t(`specialEvents.meeting.mode.${m}`)}
                    </Text>
                    <Text style={styles.modeHint}>
                      {t(`specialEvents.meeting.modeHint.${m}`)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {value.meetingMode === 'changed' ? (
            <View style={styles.changeBox}>
              <Text style={styles.label}>
                {t('specialEvents.meeting.what')}
              </Text>
              <TextInput
                style={[styles.input, styles.multilineShort]}
                value={value.meetingNote}
                onChangeText={(x) => set({ meetingNote: x })}
                placeholder={t('specialEvents.meeting.whatPlaceholder')}
                placeholderTextColor="#94a3b8"
                maxLength={500}
                multiline
              />
              <Text style={[styles.label, { marginTop: 10 }]}>
                {t('specialEvents.meeting.time')}
              </Text>
              <TimeField
                value={value.meetingTime}
                onChange={(v) => set({ meetingTime: v })}
                placeholder={t('specialEvents.meeting.timeSame')}
              />
              <Text style={[styles.label, { marginTop: 10 }]}>
                {t('specialEvents.meeting.place')}
              </Text>
              <TextInput
                style={styles.input}
                value={value.meetingAddress}
                onChangeText={(x) => set({ meetingAddress: x })}
                placeholder={t('specialEvents.meeting.placeSame')}
                placeholderTextColor="#94a3b8"
                maxLength={500}
              />
              {!value.meetingNote.trim() &&
              !value.meetingTime.trim() &&
              !value.meetingAddress.trim() ? (
                <Text style={styles.changeNeed}>
                  {t('specialEvents.meeting.sayWhat')}
                </Text>
              ) : null}
            </View>
          ) : null}
        </Section>
      ) : null}

      {/* Note — with a quick-insert toolbar (bullets, symbols) at the caret */}
      <Section label={t('specialEvents.fields.note')}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.noteToolbar}
          keyboardShouldPersistTaps="always"
        >
          <Pressable style={styles.noteTool} onPress={() => wrapNote('**')}>
            <Text style={[styles.noteToolText, { fontWeight: '800', fontFamily: 'Manrope_800ExtraBold',}]}>{t('common.boldShort')}</Text>
          </Pressable>
          <Pressable style={styles.noteTool} onPress={() => wrapNote('_')}>
            <Text style={[styles.noteToolText, { fontStyle: 'italic' }]}>
              {t('common.italicShort')}
            </Text>
          </Pressable>
          <View style={styles.noteToolDivider} />
          {NOTE_SNIPPETS.map((snip) => (
            <Pressable
              key={snip}
              style={styles.noteTool}
              onPress={() => insertIntoNote(snip)}
            >
              <Text style={styles.noteToolText}>{snip.trim() || snip}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={value.note}
          onChangeText={(x) => set({ note: x })}
          onSelectionChange={(e) => {
            noteSelRef.current = e.nativeEvent.selection;
          }}
          placeholder={t('specialEvents.placeholders.note')}
          placeholderTextColor="#94a3b8"
          multiline
        />
        {/(\*\*[^*\n]+\*\*|_[^_\n]+_)/.test(value.note) ? (
          <View style={styles.notePreview}>
            <Text style={styles.notePreviewLabel}>
              {t('specialEvents.form.notePreview')}
            </Text>
            <RichText text={value.note} style={styles.notePreviewText} />
          </View>
        ) : null}
      </Section>

      <Summary
        value={value}
        versions={versions}
        isNew={isNew}
        others={others}
        selfId={selfId}
        midweekTime={version?.midweekTime ?? null}
      />
    </View>
  );
}

/** «What will happen»: the event's effect on the meetings and who is told. */
function Summary({
  value,
  versions,
  isNew,
  others,
  selfId,
  midweekTime,
}: {
  value: EventFormValue;
  versions: Parameters<typeof meetingDaysCovered>[2];
  isNew: boolean;
  others?: SpecialEvent[];
  selfId: string | null;
  midweekTime: string | null;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const kind = formKind(value);
  const ev = asEvent(value);
  const effect = value.date
    ? effectOf({ kind: 'event', key: '', date: ev.date, end: ev.endDate ?? ev.date, event: ev })
    : null;
  const effectText = useEffectText(kind === 'circuit_overseer_visit' ? null : effect);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
  const day = (iso: string, f: string) => dayjs(iso).locale(locale).format(f);
  const today = dayjs().format('YYYY-MM-DD');
  const past = (value.endDate || value.date) < today;

  const lines: { icon: string; text: string; warn?: boolean }[] = [];
  if (kind === 'circuit_overseer_visit') {
    const mid = visitMidweekDay(ev);
    lines.push({
      icon: 'calendar-outline',
      text: t('specialEvents.form.sum.visitMidweek', {
        day: day(mid, 'dddd, D MMMM'),
        time: midweekTime ? `, ${midweekTime}` : '',
      }),
    });
    lines.push({ icon: 'mic-outline', text: t('specialEvents.form.sum.visitProgramme') });
  } else if (effectText) {
    lines.push({ icon: 'people-outline', text: effectText });
  }
  if (CONGRESS.has(kind)) {
    const from = mondayOfISO(value.date);
    const to = addDaysISO(mondayOfISO(value.endDate || value.date), 6);
    const gone = meetingDaysCovered(from, to, versions);
    if (gone.length > 0) {
      lines.push({
        icon: 'close-circle-outline',
        text: t('specialEvents.form.sum.noMeetings', {
          days: gone.map((g) => day(g.date, 'dddd D MMMM')).join(', '),
        }),
      });
    }
  }
  const { warnings } = eventConflicts(value, others, selfId, t, locale);
  for (const w of warnings) lines.push({ icon: 'alert-circle-outline', text: w, warn: true });
  lines.push({
    icon: past ? 'archive-outline' : 'notifications-outline',
    text: past
      ? t('specialEvents.form.problem.pastNotice')
      : isNew
        ? t('specialEvents.form.sum.notifyNew')
        : t('specialEvents.form.sum.notifyEdit'),
  });

  return (
    <View style={styles.summary}>
      <Text style={styles.summaryTitle}>{t('specialEvents.form.sum.title')}</Text>
      {lines.map((l, i) => (
        <View key={i} style={styles.summaryRow}>
          <Ionicons
            name={l.icon as never}
            size={16}
            color={l.warn ? '#b45309' : '#0369a1'}
            style={{ marginTop: 1 }}
          />
          <Text style={[styles.summaryText, l.warn && styles.summaryWarn]}>
            {capitalize(l.text)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A start hour: the kind's usual ones as chips, anything else on the wheel. */
function StartTime({
  value,
  presets,
  allowNone,
  onChange,
}: {
  value: string;
  presets: string[];
  allowNone: boolean;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [ownPicked, setOwn] = useState(false);
  // An hour that is not one of the chips — typed, or brought by «as last
  // time» — is shown on the wheel, whoever set it.
  const own = ownPicked || (!!value && !presets.includes(value));
  return (
    <View>
      <View style={styles.chips}>
        {allowNone ? (
          <Chip
            label={t('specialEvents.form.noStart')}
            active={!value && !own}
            onPress={() => {
              setOwn(false);
              onChange('');
            }}
          />
        ) : null}
        {presets.map((p) => (
          <Chip
            key={p}
            label={p}
            active={!own && value === p}
            onPress={() => {
              setOwn(false);
              onChange(p);
            }}
          />
        ))}
        <Chip
          label={t('specialEvents.form.otherTime')}
          active={own}
          onPress={() => {
            setOwn(true);
            if (!value) onChange(presets[0]);
          }}
        />
      </View>
      {own ? (
        <View style={{ marginTop: 8 }}>
          <TimeField value={value} onChange={onChange} />
        </View>
      ) : null}
    </View>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive, disabled && !active && styles.locked]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Quick symbols for tidy, friendly notes. A bullet begins a new line. */
const NOTE_SNIPPETS = [
  '• ',
  '— ',
  '«»',
  '⚠️',
  '📌',
  '✅',
  '➡️',
  '🕐',
  '📍',
  '❗',
  '⭐',
  '🙂',
];

const styles = StyleSheet.create({
  pastNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  pastNoteText: { flex: 1, fontSize: 13.5, color: '#334155', lineHeight: 19 },
  locked: { backgroundColor: '#f8fafc', opacity: 0.7 },
  kindHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  kindIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kindName: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#0f172a',
  },
  kindChange: {
    fontSize: 13,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#0369a1',
  },
  noteToolbar: { marginBottom: 8, flexGrow: 0 },
  noteTool: {
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  noteToolText: { fontSize: 14, color: '#0f172a' },
  timeFields: { flexDirection: 'row', gap: 10, marginTop: 8 },
  timeSubLabel: {
    fontSize: 11,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#64748b',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  noteToolDivider: {
    width: 1,
    backgroundColor: '#e2e8f0',
    marginRight: 6,
    marginVertical: 4,
  },
  notePreview: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
  },
  notePreviewLabel: {
    fontSize: 10.5,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  notePreviewText: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  field: { marginBottom: 18 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  label: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  pair: { flexDirection: 'row', gap: 8 },
  // minWidth 0: a web input keeps its own width and pushes past the screen.
  half: { flex: 1, minWidth: 0 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  suggest: {
    fontSize: 13,
    color: '#0369a1',
    fontFamily: 'Manrope_600SemiBold',
    fontWeight: '600',
    marginTop: 8,
  },
  stayHint: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginTop: -6,
    marginBottom: 18,
  },
  calendarHint: {
    fontSize: 12.5,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  meetingDay: {
    fontSize: 13,
    color: '#0369a1',
    marginBottom: 8,
    lineHeight: 18,
  },
  modeList: { gap: 8 },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  modeRowOn: { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' },
  modeTitle: {
    fontSize: 15,
    fontFamily: 'Manrope_600SemiBold',
    fontWeight: '600',
    color: '#0f172a',
  },
  modeTitleOn: { color: '#0369a1' },
  modeHint: { fontSize: 12, color: '#64748b', marginTop: 2, lineHeight: 17 },
  changeBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  multilineShort: { minHeight: 64, textAlignVertical: 'top' },
  changeNeed: { fontSize: 12, color: '#b45309', marginTop: 8 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  switchLabel: { fontSize: 15, color: '#0f172a' },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  selectText: { flex: 1, fontSize: 16, color: '#0f172a' },
  placeholder: { color: '#94a3b8' },
  inlineCard: {
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 8,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipText: { fontSize: 14, color: '#334155' },
  chipTextActive: { color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  typeHint: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  typeText: { flex: 1, fontSize: 16, color: '#0f172a' },
  summary: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    fontWeight: '700',
    color: '#0369a1',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  summaryRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  summaryText: { flex: 1, fontSize: 14, color: '#0f172a', lineHeight: 20 },
  summaryWarn: { color: '#92400e' },
});
