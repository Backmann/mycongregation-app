import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import DateTimePicker, {
  useDefaultStyles,
  type DateType,
} from 'react-native-ui-datepicker';

export const EVENT_TYPES = [
  'regional_convention',
  'circuit_assembly',
  'memorial',
  'circuit_overseer_visit',
  'branch_representative_visit',
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
  address: string;
  mapUrl: string;
  programUrl: string;
  note: string;
  replacesMeeting: boolean;
}

export function emptyEventForm(): EventFormValue {
  return {
    title: '',
    type: '',
    date: '',
    endDate: '',
    time: '',
    address: '',
    mapUrl: '',
    programUrl: '',
    note: '',
    replacesMeeting: false,
  };
}

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
  const { t } = useTranslation();
  const dpStyles = useDefaultStyles();
  const [multiDay, setMultiDay] = useState<boolean>(!!value.endDate);
  const [dateModal, setDateModal] = useState(false);
  const [timeModal, setTimeModal] = useState(false);
  const [typeModal, setTypeModal] = useState(false);

  const set = (patch: Partial<EventFormValue>) => onChange({ ...value, ...patch });

  const dateLabel = value.date
    ? multiDay && value.endDate
      ? `${fmt(value.date)} – ${fmt(value.endDate)}`
      : fmt(value.date)
    : t('specialEvents.form.pickDate');

  const typeLabel = value.type
    ? t(`specialEvents.types.${value.type}`, value.type)
    : t('specialEvents.form.pickType');

  // Anchor date for the time-only picker (date part is ignored on save).
  const timeAnchor: DateType = value.time
    ? dayjs(`2000-01-01T${value.time}`)
    : dayjs('2000-01-01T09:00');

  return (
    <View>
      {/* Title */}
      <Field label={t('specialEvents.fields.title')}>
        <TextInput
          style={styles.input}
          value={value.title}
          onChangeText={(x) => set({ title: x })}
          placeholder={t('specialEvents.placeholders.title')}
        />
      </Field>

      {/* Type picker */}
      <Field label={t('specialEvents.fields.type')}>
        <Pressable style={styles.selectBtn} onPress={() => setTypeModal(true)}>
          <Text style={[styles.selectText, !value.type && styles.placeholder]}>
            {typeLabel}
          </Text>
          <Ionicons name="chevron-down" size={18} color="#64748b" />
        </Pressable>
      </Field>

      {/* Multi-day switch */}
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

      {/* Date picker */}
      <Field label={t('specialEvents.fields.date')}>
        <Pressable style={styles.selectBtn} onPress={() => setDateModal(true)}>
          <Ionicons
            name="calendar-outline"
            size={18}
            color="#0ea5e9"
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.selectText, !value.date && styles.placeholder]}>
            {dateLabel}
          </Text>
        </Pressable>
      </Field>

      {/* Time presets + custom */}
      <Field label={t('specialEvents.form.time')}>
        <View style={styles.chips}>
          <Chip
            label={t('specialEvents.form.noTime')}
            active={!value.time}
            onPress={() => set({ time: '' })}
          />
          {TIME_PRESETS.map((tm) => (
            <Chip
              key={tm}
              label={tm}
              active={value.time === tm}
              onPress={() => set({ time: tm })}
            />
          ))}
          <Chip
            label={
              value.time && !TIME_PRESETS.includes(value.time)
                ? value.time
                : t('specialEvents.form.customTime')
            }
            active={!!value.time && !TIME_PRESETS.includes(value.time)}
            onPress={() => setTimeModal(true)}
          />
        </View>
      </Field>

      {/* Address */}
      <Field label={t('specialEvents.fields.address')}>
        <TextInput
          style={styles.input}
          value={value.address}
          onChangeText={(x) => set({ address: x })}
          placeholder={t('specialEvents.placeholders.address')}
        />
      </Field>

      {/* Map URL */}
      <Field label={t('specialEvents.fields.mapUrl')}>
        <TextInput
          style={styles.input}
          value={value.mapUrl}
          onChangeText={(x) => set({ mapUrl: x })}
          placeholder={t('specialEvents.placeholders.mapUrl')}
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
          autoCapitalize="none"
          keyboardType="url"
        />
      </Field>

      {/* Note */}
      <Field label={t('specialEvents.fields.note')}>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={value.note}
          onChangeText={(x) => set({ note: x })}
          placeholder={t('specialEvents.placeholders.note')}
          multiline
        />
      </Field>

      {/* Replaces meeting */}
      <View style={styles.switchRow}>
        <Text style={styles.label}>
          {t('specialEvents.fields.replacesMeeting')}
        </Text>
        <Switch
          value={value.replacesMeeting}
          onValueChange={(x) => set({ replacesMeeting: x })}
        />
      </View>

      {/* ----- Date modal ----- */}
      <PickerModal
        visible={dateModal}
        onClose={() => setDateModal(false)}
        closeLabel={t('specialEvents.form.close')}
      >
        {multiDay ? (
          <DateTimePicker
            mode="range"
            startDate={value.date ? dayjs(value.date) : undefined}
            endDate={value.endDate ? dayjs(value.endDate) : undefined}
            onChange={({ startDate, endDate }) =>
              set({
                date: startDate ? dayjs(startDate).format('YYYY-MM-DD') : '',
                endDate: endDate ? dayjs(endDate).format('YYYY-MM-DD') : '',
              })
            }
            styles={dpStyles}
          />
        ) : (
          <DateTimePicker
            mode="single"
            date={value.date ? dayjs(value.date) : undefined}
            onChange={({ date }) =>
              set({ date: date ? dayjs(date).format('YYYY-MM-DD') : '' })
            }
            styles={dpStyles}
          />
        )}
      </PickerModal>

      {/* ----- Time modal ----- */}
      <PickerModal
        visible={timeModal}
        onClose={() => setTimeModal(false)}
        closeLabel={t('specialEvents.form.close')}
      >
        <DateTimePicker
          mode="single"
          date={timeAnchor}
          timePicker
          initialView="time"
          onChange={({ date }) =>
            set({ time: date ? dayjs(date).format('HH:mm') : '' })
          }
          styles={dpStyles}
        />
      </PickerModal>

      {/* ----- Type modal ----- */}
      <PickerModal
        visible={typeModal}
        onClose={() => setTypeModal(false)}
        closeLabel={t('specialEvents.form.close')}
      >
        <View>
          {EVENT_TYPES.map((key) => (
            <Pressable
              key={key}
              style={styles.typeRow}
              onPress={() => {
                set({ type: key === 'other' ? '' : key });
                setTypeModal(false);
              }}
            >
              <Text style={styles.typeText}>
                {t(`specialEvents.types.${key}`, key)}
              </Text>
              {(value.type === key || (key === 'other' && !value.type)) && (
                <Ionicons name="checkmark" size={20} color="#0ea5e9" />
              )}
            </Pressable>
          ))}
        </View>
      </PickerModal>
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

function PickerModal({
  visible,
  onClose,
  closeLabel,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <ScrollView>{children}</ScrollView>
          <Pressable style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneText}>{closeLabel}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    maxHeight: '85%',
  },
  doneBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  doneText: { color: '#fff', fontSize: 16, fontWeight: '600' },
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
