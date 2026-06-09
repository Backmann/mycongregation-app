import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import DateTimePicker, {
  DateType,
  useDefaultStyles,
} from 'react-native-ui-datepicker';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';
import {
  Absence,
  CreateAbsenceInput,
  extractErrorMessage,
  Publisher,
  publishersApi,
} from '../lib/api';

type Paginatedish<T> = { items?: T[]; data?: T[]; results?: T[] };

const toISO = (d: DateType | null | undefined): string | null =>
  d ? dayjs(d).format('YYYY-MM-DD') : null;

interface Props {
  initial?: Absence;
  submitting?: boolean;
  error?: unknown;
  onSubmit: (input: CreateAbsenceInput) => void;
  onCancel?: () => void;
}

export function AbsenceForm({
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
}: Props) {
  const { t, i18n } = useTranslation();
  const defaultStyles = useDefaultStyles();

  const [publisherId, setPublisherId] = useState<string | null>(
    initial?.publisherId ?? null,
  );
  const [publisherLabel, setPublisherLabel] = useState<string>(
    initial?.publisher?.displayName ?? '',
  );
  const [pickerOpen, setPickerOpen] = useState(!initial);
  const [search, setSearch] = useState('');

  const [multiDay, setMultiDay] = useState<boolean>(!!initial?.endDate);
  const [startDate, setStartDate] = useState<string | null>(
    initial?.startDate ?? null,
  );
  const [endDate, setEndDate] = useState<string | null>(
    initial?.endDate ?? null,
  );
  const [note, setNote] = useState<string>(initial?.note ?? '');

  const { data: pubData, isLoading: pubLoading } = useQuery({
    queryKey: ['publishers', 'for-absence'],
    queryFn: () => publishersApi.list({ limit: 1000 }),
    staleTime: 5 * 60 * 1000,
  });

  const publishers = useMemo<Publisher[]>(() => {
    const res = pubData as unknown as Paginatedish<Publisher>;
    const items = res?.items ?? res?.data ?? res?.results ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? items.filter((p) => p.displayName.toLowerCase().includes(q))
      : items;
    return filtered.slice(0, 60);
  }, [pubData, search]);

  const valid =
    !!publisherId &&
    !!startDate &&
    (!multiDay || (!!endDate && endDate >= startDate));

  const submit = () => {
    if (!valid || !publisherId || !startDate) return;
    onSubmit({
      publisherId,
      startDate,
      endDate: multiDay ? endDate ?? undefined : undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <View>
      {/* ---- Publisher ---- */}
      <Text style={styles.label}>{t('absences.fields.publisher')}</Text>
      {publisherId && !pickerOpen ? (
        <Pressable
          style={styles.selectedRow}
          onPress={() => setPickerOpen(true)}
        >
          <Text style={styles.selectedName}>{publisherLabel}</Text>
          <Text style={styles.changeLink}>{t('absences.form.change')}</Text>
        </Pressable>
      ) : (
        <View style={styles.pickerBox}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('absences.placeholders.search')}
            placeholderTextColor="#94a3b8"
            style={styles.searchInput}
            autoCorrect={false}
          />
          {pubLoading ? (
            <ActivityIndicator style={{ marginVertical: 12 }} />
          ) : (
            <View>
              {publishers.map((p) => {
                return (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.pubRow,
                      p.id === publisherId && styles.pubRowActive,
                    ]}
                    onPress={() => {
                      setPublisherId(p.id);
                      setPublisherLabel(p.displayName);
                      setPickerOpen(false);
                      setSearch('');
                    }}
                  >
                    <Text style={styles.pubName}>{p.displayName}</Text>
                    {!p.isActive ? (
                      <Text style={styles.inactiveTag}>
                        {t('absences.inactive')}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
              {publishers.length === 0 ? (
                <Text style={styles.muted}>{t('absences.noMatches')}</Text>
              ) : null}
            </View>
          )}
        </View>
      )}

      {/* ---- Multi-day switch ---- */}
      <View style={styles.switchRow}>
        <Text style={styles.label}>{t('absences.form.multiDay')}</Text>
        <Switch
          value={multiDay}
          onValueChange={(v) => {
            setMultiDay(v);
            if (!v) setEndDate(null);
          }}
        />
      </View>

      {/* ---- Date(s) ---- */}
      {!multiDay ? (
        <View style={styles.calendarBox}>
          <Text style={styles.subLabel}>{t('absences.form.pickDate')}</Text>
          <DateTimePicker
            mode="single"
            date={startDate ? dayjs(startDate) : undefined}
            onChange={({ date }) => setStartDate(toISO(date))}
            firstDayOfWeek={1}
            locale={i18n.language}
            styles={defaultStyles}
          />
        </View>
      ) : (
        <View style={styles.calendarBox}>
          <Text style={styles.subLabel}>
            {t('absences.form.pickStart')} — {t('absences.form.pickEnd')}
          </Text>
          <DateTimePicker
            mode="range"
            startDate={startDate ? dayjs(startDate) : undefined}
            endDate={endDate ? dayjs(endDate) : undefined}
            onChange={({ startDate: s, endDate: e }) => {
              setStartDate(toISO(s));
              setEndDate(toISO(e));
            }}
            firstDayOfWeek={1}
            locale={i18n.language}
            styles={defaultStyles}
          />
        </View>
      )}

      {/* ---- Note ---- */}
      <Text style={styles.label}>{t('absences.fields.note')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t('absences.placeholders.note')}
        placeholderTextColor="#94a3b8"
        style={styles.noteInput}
        multiline
      />

      {error ? (
        <Text style={styles.errorText}>{extractErrorMessage(error)}</Text>
      ) : null}

      <View style={styles.actions}>
        {onCancel ? (
          <Pressable
            style={[styles.btn, styles.btnGhost]}
            onPress={onCancel}
            disabled={submitting}
          >
            <Text style={styles.btnGhostText}>{t('absences.actions.cancel')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.btn, styles.btnPrimary, !valid && styles.btnDisabled]}
          onPress={submit}
          disabled={!valid || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnPrimaryText}>
              {initial
                ? t('absences.actions.save')
                : t('absences.actions.create')}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 6,
  },
  subLabel: { fontSize: 12, color: '#64748b', marginBottom: 6 },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    padding: 12,
  },
  selectedName: { fontSize: 16, fontWeight: '600', color: '#0369a1' },
  changeLink: { fontSize: 13, color: '#0284c7' },
  pickerBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 6,
  },
  pubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  pubRowActive: { backgroundColor: '#e0f2fe' },
  pubName: { fontSize: 15, color: '#0f172a' },
  inactiveTag: { fontSize: 11, color: '#94a3b8' },
  muted: { color: '#94a3b8', textAlign: 'center', paddingVertical: 12 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginTop: 4,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    minHeight: 64,
    textAlignVertical: 'top',
  },
  errorText: { color: '#b91c1c', marginTop: 12 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#0ea5e9' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnGhost: { backgroundColor: '#f1f5f9' },
  btnGhostText: { color: '#475569', fontWeight: '600', fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
});
