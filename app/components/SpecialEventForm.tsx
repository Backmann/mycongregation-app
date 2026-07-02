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
import { circuitOverseersApi, CircuitOverseer } from '../lib/api';
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
  'special_talk',
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
  replacesMeeting: boolean;
  coFirstName: string;
  coLastName: string;
  coWifeName: string;
  coRole: string;
  coAccommodationAddress: string;
  coMidweekDow: number;
}

export const CIRCUIT_OVERSEER_VISIT_TYPE = 'circuit_overseer_visit';

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
    replacesMeeting: false,
    coFirstName: '',
    coLastName: '',
    coWifeName: '',
    coRole: 'overseer',
    coAccommodationAddress: '',
    coMidweekDow: 2,
  };
}

/** Normalize free time input ('1830', '18:3', '930', '9') to 'HH:mm' or ''. */

function fmt(d: string): string {
  return d ? dayjs(d).format('DD.MM.YYYY') : '';
}

export function SpecialEventForm({
  value,
  onChange,
}: {
  value: EventFormValue;
  onChange: (v: EventFormValue) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  const [multiDay, setMultiDay] = useState<boolean>(!!value.endDate);
  const [showDate, setShowDate] = useState(false);
  const [showType, setShowType] = useState(false);

  const set = (patch: Partial<EventFormValue>) =>
    onChange({ ...value, ...patch });

  const isCoVisit = value.type === CIRCUIT_OVERSEER_VISIT_TYPE;

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
          style={styles.selectBtn}
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
            options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
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
          onValueChange={(on) => {
            setMultiDay(on);
            if (!on) set({ endDate: '' });
          }}
        />
      </View>

      {/* Date (inline calendar) */}
      <Field label={t('specialEvents.fields.date')}>
        <Pressable
          style={styles.selectBtn}
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
            <Text style={[styles.noteToolText, { fontWeight: '800' }]}>Ж</Text>
          </Pressable>
          <Pressable style={styles.noteTool} onPress={() => wrapNote('_')}>
            <Text style={[styles.noteToolText, { fontStyle: 'italic' }]}>
              К
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

      {/* Replaces meeting (not for a CO visit — the meeting still happens) */}
      {!isCoVisit && (
        <View style={styles.switchRow}>
          <Text style={styles.label}>
            {t('specialEvents.fields.replacesMeeting')}
          </Text>
          <Switch
            value={value.replacesMeeting}
            onValueChange={(x) => set({ replacesMeeting: x })}
          />
        </View>
      )}
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
    fontWeight: '700',
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
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  notePreviewText: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
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
  chipTextActive: { color: '#fff', fontWeight: '600' },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  typeText: { fontSize: 16, color: '#0f172a' },
});
