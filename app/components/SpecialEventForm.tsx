import type { ReactNode } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface EventFormValue {
  title: string;
  type: string;
  date: string;
  time: string;
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
    time: '',
    address: '',
    mapUrl: '',
    programUrl: '',
    note: '',
    replacesMeeting: false,
  };
}

export function SpecialEventForm({
  value,
  onChange,
}: {
  value: EventFormValue;
  onChange: (v: EventFormValue) => void;
}) {
  const { t } = useTranslation();
  const set = (k: keyof EventFormValue, v: string | boolean) =>
    onChange({ ...value, [k]: v });

  return (
    <View>
      <Field label={t('specialEvents.fields.title')}>
        <TextInput
          style={styles.input}
          value={value.title}
          onChangeText={(x) => set('title', x)}
          placeholder={t('specialEvents.placeholders.title')}
        />
      </Field>
      <Field label={t('specialEvents.fields.type')}>
        <TextInput
          style={styles.input}
          value={value.type}
          onChangeText={(x) => set('type', x)}
          placeholder={t('specialEvents.placeholders.type')}
          autoCapitalize="none"
        />
      </Field>
      <Field label={t('specialEvents.fields.date')}>
        <TextInput
          style={styles.input}
          value={value.date}
          onChangeText={(x) => set('date', x)}
          placeholder={t('specialEvents.placeholders.date')}
          autoCapitalize="none"
        />
      </Field>
      <Field label={t('specialEvents.fields.time')}>
        <TextInput
          style={styles.input}
          value={value.time}
          onChangeText={(x) => set('time', x)}
          placeholder={t('specialEvents.placeholders.time')}
          autoCapitalize="none"
        />
      </Field>
      <Field label={t('specialEvents.fields.address')}>
        <TextInput
          style={styles.input}
          value={value.address}
          onChangeText={(x) => set('address', x)}
          placeholder={t('specialEvents.placeholders.address')}
        />
      </Field>
      <Field label={t('specialEvents.fields.mapUrl')}>
        <TextInput
          style={styles.input}
          value={value.mapUrl}
          onChangeText={(x) => set('mapUrl', x)}
          placeholder={t('specialEvents.placeholders.mapUrl')}
          autoCapitalize="none"
          keyboardType="url"
        />
      </Field>
      <Field label={t('specialEvents.fields.programUrl')}>
        <TextInput
          style={styles.input}
          value={value.programUrl}
          onChangeText={(x) => set('programUrl', x)}
          placeholder={t('specialEvents.placeholders.programUrl')}
          autoCapitalize="none"
          keyboardType="url"
        />
      </Field>
      <Field label={t('specialEvents.fields.note')}>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={value.note}
          onChangeText={(x) => set('note', x)}
          placeholder={t('specialEvents.placeholders.note')}
          multiline
        />
      </Field>
      <View style={styles.switchRow}>
        <Text style={styles.label}>{t('specialEvents.fields.replacesMeeting')}</Text>
        <Switch
          value={value.replacesMeeting}
          onValueChange={(x) => set('replacesMeeting', x)}
        />
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
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
});
