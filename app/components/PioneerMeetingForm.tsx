import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from './Sheet';
import { DateField } from './DateField';
import { TimeField } from './TimeField';
import { PublisherSelector } from './PublisherSelector';
import { WIDE_FROM } from '../lib/screen-width';
import {
  extractErrorMessage,
  hallsApi,
  pioneerMeetingsApi,
  type PioneerMeetingDetail,
  type PioneerMeetingView,
} from '../lib/api';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#0e7490';

/**
 * «Ежегодная встреча старейшин с пионерами» — set or changed (30 October
 * 2026): the day, the hours, the place, the elder who conducts it, a note.
 * Who is invited is not chosen: it is whoever pioneers on that day.
 */
export function PioneerMeetingForm({
  visible,
  meeting,
  onClose,
  onSaved,
}: {
  visible: boolean;
  /** One to change; none — a new one. */
  meeting?: PioneerMeetingView | null;
  onClose: () => void;
  onSaved: (m: PioneerMeetingDetail) => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const hallsQ = useQuery({ queryKey: ['halls'], queryFn: () => hallsApi.list(), enabled: visible });
  const [date, setDate] = useState('');
  const [timeStart, setTimeStart] = useState('');
  const [timeEnd, setTimeEnd] = useState('');
  const [place, setPlace] = useState('');
  const [conductor, setConductor] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBusy(false);
    setDate(meeting?.date ?? '');
    setTimeStart(meeting?.timeStart ?? '');
    setTimeEnd(meeting?.timeEnd ?? '');
    setPlace(meeting?.place ?? '');
    setConductor(meeting?.conductor.id ?? null);
    setNote(meeting?.note ?? '');
  }, [visible, meeting?.id]);

  // The congregation's own hall is the usual place: one tap.
  useEffect(() => {
    if (!visible || meeting || place) return;
    const hall = (hallsQ.data ?? []).find((h) => h.isDefault) ?? hallsQ.data?.[0];
    if (hall) setPlace(hall.name);
  }, [visible, hallsQ.data]);

  const ready = !!date && !!conductor;
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const input = {
      date,
      timeStart: timeStart || null,
      timeEnd: timeEnd || null,
      place: place.trim() || null,
      conductorPublisherId: conductor!,
      note: note.trim() || null,
    };
    try {
      const saved = meeting
        ? await pioneerMeetingsApi.update(meeting.id, input)
        : await pioneerMeetingsApi.create(input);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={meeting ? t('pioneerMeeting.editTitle') : t('pioneerMeeting.newTitle')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= WIDE_FROM ? 'centered' : 'bottom'}
      footer={
        <View style={{ gap: 8 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.btn, (!ready || busy) && { opacity: 0.45 }]}
            disabled={!ready || busy}
            onPress={() => void save()}
            accessibilityRole="button"
            testID="pioneer-meeting-save"
          >
            <Text style={styles.btnText}>{meeting ? t('pioneerMeeting.save') : t('pioneerMeeting.set')}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={{ gap: 14 }}>
        <Text style={styles.lead}>{t('pioneerMeeting.lead')}</Text>
        <DateField label={t('pioneerMeeting.date')} value={date} onChange={setDate} />
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.label}>{t('pioneerMeeting.from')}</Text>
            <TimeField value={timeStart} onChange={setTimeStart} placeholder="—" />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.label}>{t('pioneerMeeting.to')}</Text>
            <TimeField value={timeEnd} onChange={setTimeEnd} placeholder="—" />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>{t('pioneerMeeting.place')}</Text>
          <TextInput
            value={place}
            onChangeText={setPlace}
            style={styles.input}
            placeholder={t('pioneerMeeting.placeHint')}
            placeholderTextColor="#94a3b8"
            maxLength={200}
          />
          {(hallsQ.data ?? []).length > 1 ? (
            <View style={styles.chips}>
              {(hallsQ.data ?? []).map((h) => (
                <Pressable key={h.id} onPress={() => setPlace(h.name)} style={[styles.chip, place === h.name && styles.chipOn]}>
                  <Text style={[styles.chipText, place === h.name && styles.chipTextOn]}>{h.name}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        <PublisherSelector
          label={t('pioneerMeeting.conductor')}
          value={conductor}
          onChange={setConductor}
          appointmentFilter="elder"
          absenceDate={date || undefined}
          boxed
        />
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>{t('pioneerMeeting.note')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]}
            multiline
            maxLength={2000}
          />
        </View>
        <Text style={styles.hint}>{t('pioneerMeeting.whoHint')}</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, lineHeight: 20, color: '#334155' },
  row: { flexDirection: 'row', gap: 10 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED },
  input: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
    color: INK,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#334155' },
  chipTextOn: { color: '#fff' },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, lineHeight: 18, color: MUTED },
  error: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#b91c1c' },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5, color: '#fff' },
});
