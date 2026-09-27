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
} from '../lib/api';
import { meetingDaysCovered, takesMeetingMode } from '../lib/event-meeting';
import { FormChips } from './FormChips';
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date.trim())) return p('needDate');
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

/**
 * Kinds that always last several days: a regional convention runs Friday to
 * Sunday, a circuit visit Tuesday to Sunday. Their form opens with «several
 * days» on — it used to open as a one-day event, and a convention saved that
 * way took one day of the week away instead of the week.
 */
export const MULTI_DAY_KINDS = new Set([
  'regional_convention',
  CIRCUIT_OVERSEER_VISIT_TYPE_KEY,
]);

/** Normalize free time input ('1830', '18:3', '930', '9') to 'HH:mm' or ''. */

function capitalize(x: string): string {
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
}

function fmt(d: string): string {
  return d ? dayjs(d).format('DD.MM.YYYY') : '';
}

export function SpecialEventForm({
  value,
  onChange,
  pastLocked = false,
  onMultiDayChange,
}: {
  value: EventFormValue;
  onChange: (v: EventFormValue) => void;
  onMultiDayChange?: (on: boolean) => void;
  /**
   * The event is over: its days and its kind are history and stay as they
   * are (the server refuses to change them). The rest can be put right.
   */
  pastLocked?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [multiDay, setMultiDay] = useState<boolean>(
    !!value.endDate || MULTI_DAY_KINDS.has(value.type),
  );
  // Tell the screen that owns the save button, so it can say what is missing.
  useEffect(() => {
    onMultiDayChange?.(multiDay);
  }, [multiDay, onMultiDayChange]);
  const [showDate, setShowDate] = useState(false);
  const [showType, setShowType] = useState(false);

  const set = (patch: Partial<EventFormValue>) =>
    onChange({ ...value, ...patch });

  const isCoVisit = value.type === CIRCUIT_OVERSEER_VISIT_TYPE;

  /**
   * «How does the meeting go» is asked only where there is a meeting to ask
   * about: an event of the kinds that carry the answer, on a day the
   * congregation meets. Until the settings arrive it is asked anyway —
   * hiding it would hide an answer already given.
   */
  const settingsQ = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
  });
  const covered = meetingDaysCovered(
    value.date,
    multiDay ? value.endDate : null,
    settingsQ.data?.versions,
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
  // pre-fills the names from the primary; the picker lets you switch to a
  // substitute. Editing a saved visit keeps its own snapshot, so non-empty
  // names are never overwritten.
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

  const pickOverseer = (c: CircuitOverseer) =>
    set({
      coFirstName: c.firstName,
      coLastName: c.lastName,
      coWifeName: c.wifeName ?? '',
      coRole: c.role,
    });

  // Set of auto-generated titles (the type labels). Used so that picking /
  // switching a type fills the title automatically, unless the user typed
  // their own title.
  const typeLabels = new Set(
    EVENT_TYPES.map((k) => t(`specialEvents.types.${k}`, k)),
  );

  const selectType = (key: string) => {
    const isOther = key === 'other';
    const label = t(`specialEvents.types.${key}`, key);
    const current = value.title.trim();
    const titleIsAuto = current === '' || typeLabels.has(current);
    set({
      type: isOther ? '' : key,
      title: titleIsAuto ? (isOther ? '' : label) : value.title,
    });
    if (MULTI_DAY_KINDS.has(key)) setMultiDay(true);
    setShowType(false);
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

  const dateLabel = value.date
    ? multiDay && value.endDate
      ? `${fmt(value.date)} – ${fmt(value.endDate)}`
      : fmt(value.date)
    : t('specialEvents.form.pickDate');

  const typeLabel = value.type
    ? t(`specialEvents.types.${value.type}`, value.type)
    : t('specialEvents.form.pickType');

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
      {/* Title */}
      <Field label={t('specialEvents.fields.title')}>
        <TextInput
          style={styles.input}
          value={value.title}
          onChangeText={(x) => set({ title: x })}
          placeholder={t('specialEvents.placeholders.title')}
          placeholderTextColor="#94a3b8"
        />
      </Field>

      {/* Type (inline list) */}
      <Field label={t('specialEvents.fields.type')}>
        <Pressable
          style={[styles.selectBtn, pastLocked && styles.locked]}
          disabled={pastLocked}
          onPress={() => setShowType((s) => !s)}
        >
          <Text style={[styles.selectText, !value.type && styles.placeholder]}>
            {typeLabel}
          </Text>
          <Ionicons
            name={showType ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#64748b"
          />
        </Pressable>
        {showType && (
          <View style={styles.inlineCard}>
            {EVENT_TYPES.map((key) => {
              const active =
                value.type === key || (key === 'other' && !value.type);
              return (
                <Pressable
                  key={key}
                  style={styles.typeRow}
                  onPress={() => selectType(key)}
                >
                  <Text style={styles.typeText}>
                    {t(`specialEvents.types.${key}`, key)}
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
        )}
      </Field>

      {/* Circuit overseer names (visit type only) */}
      {isCoVisit && (
        <>
          {overseers && overseers.length > 0 && (
            <Field label={t('circuitOverseer.pickLabel')}>
              <View style={styles.chips}>
                {overseers.map((c) => {
                  const active =
                    c.firstName === value.coFirstName &&
                    c.lastName === value.coLastName;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => pickOverseer(c)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {c.firstName} {c.lastName}
                        {c.role === 'substitute'
                          ? ` · ${t('circuitOverseer.roleSubstitute')}`
                          : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          )}
          <Field label={t('circuitOverseer.firstName')}>
            <TextInput
              style={styles.input}
              value={value.coFirstName}
              onChangeText={(x) => set({ coFirstName: x })}
              autoCapitalize="words"
              placeholderTextColor="#94a3b8"
            />
          </Field>
          <Field label={t('circuitOverseer.lastName')}>
            <TextInput
              style={styles.input}
              value={value.coLastName}
              onChangeText={(x) => set({ coLastName: x })}
              autoCapitalize="words"
              placeholderTextColor="#94a3b8"
            />
          </Field>
          <Field label={t('circuitOverseer.wifeName')}>
            <TextInput
              style={styles.input}
              value={value.coWifeName}
              onChangeText={(x) => set({ coWifeName: x })}
              autoCapitalize="words"
              placeholderTextColor="#94a3b8"
            />
          </Field>
          <Field label={t('circuitOverseer.accommodationAddress')}>
            <TextInput
              style={styles.input}
              value={value.coAccommodationAddress}
              onChangeText={(x) => set({ coAccommodationAddress: x })}
              placeholderTextColor="#94a3b8"
            />
          </Field>
          <FormChips
            label={t('circuitOverseer.midweekDow')}
            value={value.coMidweekDow}
            // A midweek meeting is on a weekday: Saturday and Sunday are the
            // weekend meeting's, and the visit does not move that one.
            options={[1, 2, 3, 4, 5].map((d) => ({
              value: d,
              label: t(`meetingSettings.dow.${d}`),
            }))}
            onChange={(d) => set({ coMidweekDow: d })}
          />
        </>
      )}
      <View style={styles.switchRow}>
        <Text style={styles.label}>{t('specialEvents.form.multiDay')}</Text>
        <Switch
          value={multiDay}
          disabled={pastLocked}
          onValueChange={(on) => {
            setMultiDay(on);
            if (!on) set({ endDate: '' });
          }}
        />
      </View>

      {/* Date (inline calendar) */}
      <Field label={t('specialEvents.fields.date')}>
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
        {showDate && (
          <View style={styles.inlineCard}>
            <MonthCalendar
              compact
              mode={multiDay ? 'range' : 'single'}
              start={value.date || null}
              end={value.endDate || null}
              onChange={({ start, end }) => {
                if (multiDay) {
                  set({ date: start ?? '', endDate: end ?? '' });
                } else {
                  set({ date: start ?? '' });
                  setShowDate(false);
                }
              }}
              locale={locale}
            />
          </View>
        )}
      </Field>

      {/* Time: none / a single time / a from–to range, on the iOS wheel */}
      <Field label={t('specialEvents.form.time')}>
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
      </Field>

      {/* Address / map / program — not relevant for a CO visit */}
      {!isCoVisit && (
        <>
          {/* Address */}
          <Field label={t('specialEvents.fields.address')}>
        <TextInput
          style={styles.input}
          value={value.address}
          onChangeText={(x) => set({ address: x })}
          placeholder={t('specialEvents.placeholders.address')}
          placeholderTextColor="#94a3b8"
        />
      </Field>

      {/* Map URL */}
      <Field label={t('specialEvents.fields.mapUrl')}>
        <TextInput
          style={styles.input}
          value={value.mapUrl}
          onChangeText={(x) => set({ mapUrl: x })}
          placeholder={t('specialEvents.placeholders.mapUrl')}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="url"
        />
      </Field>

      {/* Program URL */}
      <Field label={t('specialEvents.fields.programUrl')}>
        <TextInput
          style={styles.input}
          value={value.programUrl}
          onChangeText={(x) => set({ programUrl: x })}
          placeholder={t('specialEvents.placeholders.programUrl')}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="url"
        />
      </Field>
        </>
      )}

      {/* Note — with a quick-insert toolbar (bullets, symbols) at the caret */}
      <Field label={t('specialEvents.fields.note')}>
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
      </Field>

      {/*
        How the congregation meeting goes that day (27 September). A branch
        representative's visit usually does NOT cancel the meeting — it goes
        ahead, differently: another hour, another hall, his talk in place of
        the public talk. A yes/no switch could not say that.
      */}
      {asksMeeting ? (
        <Field label={t('specialEvents.meeting.label')}>
          {covered.length > 0 ? (
            <Text style={styles.meetingDay}>
              {covered
                .map((c) =>
                  t('specialEvents.meeting.dayIs', {
                    day: capitalize(
                      dayjs(c.date).locale(locale).format('dddd, D MMMM'),
                    ),
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
        </Field>
      ) : null}
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
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
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
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
    marginBottom: 14,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  selectText: { flex: 1, fontSize: 16, color: '#0f172a' },
  placeholder: { color: '#94a3b8' },
  inlineCard: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
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
    justifyContent: 'space-between',
    paddingVertical: 14,
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
  typeText: { fontSize: 16, color: '#0f172a' },
});
