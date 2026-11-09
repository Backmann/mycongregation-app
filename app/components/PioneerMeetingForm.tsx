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
  meetingConductors,
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
 * 2026): the day, the hours, the place, who conducts it, a note. Who is
 * invited is not chosen: it is whoever pioneers on that day.
 *
 * Who conducts it (9 November 2026): two as a rule, one at times — elders,
 * rarely a ministerial servant (the list's switch), or someone not in the
 * app whose name is written by hand. The day is in December or January,
 * once a season; the form says so before the server has to.
 */

/** One place: a card from the list, or a name written by hand. */
interface Place {
  mode: 'card' | 'name';
  id: string | null;
  name: string;
}
const EMPTY: Place = { mode: 'card', id: null, name: '' };
const filled = (p: Place) => (p.mode === 'card' ? !!p.id : p.name.trim().length >= 2);
const MAY_CONDUCT = ['elder', 'ministerial_servant'] as const;

/** December or January — the instructions' months for it. */
export function inSeason(dateISO: string): boolean {
  const m = Number(dateISO.slice(5, 7));
  return m === 12 || m === 1;
}
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
  const [places, setPlaces] = useState<[Place, Place]>([EMPTY, EMPTY]);
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
    const was = meeting ? meetingConductors(meeting) : [];
    const toPlace = (i: number): Place => {
      const c = was[i];
      if (!c) return EMPTY;
      return c.id ? { mode: 'card', id: c.id, name: '' } : { mode: 'name', id: null, name: c.name };
    };
    setPlaces([toPlace(0), toPlace(1)]);
    setNote(meeting?.note ?? '');
  }, [visible, meeting?.id]);

  // The congregation's own hall is the usual place: one tap.
  useEffect(() => {
    if (!visible || meeting || place) return;
    const hall = (hallsQ.data ?? []).find((h) => h.isDefault) ?? hallsQ.data?.[0];
    if (hall) setPlace(hall.name);
  }, [visible, hallsQ.data]);

  const setConductor = (i: 0 | 1, next: Partial<Place>) =>
    setPlaces((ps) => {
      const copy: [Place, Place] = [ps[0], ps[1]];
      copy[i] = { ...copy[i], ...next };
      return copy;
    });
  // The first place is the one that must be filled: a lone second one moves up.
  const chosen = places.filter(filled);
  const same =
    chosen.length === 2 &&
    (chosen[0].mode === 'card' && chosen[1].mode === 'card'
      ? chosen[0].id === chosen[1].id
      : chosen[0].mode === 'name' &&
        chosen[1].mode === 'name' &&
        chosen[0].name.trim().replace(/\s+/g, ' ').toLowerCase() ===
          chosen[1].name.trim().replace(/\s+/g, ' ').toLowerCase());
  // A meeting kept from before on another day may stay on it; a new day
  // must be in its season.
  const outOfSeason = !!date && !inSeason(date) && date !== meeting?.date;
  const ready = !!date && chosen.length > 0 && !same && !outOfSeason;
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const input = {
      date,
      timeStart: timeStart || null,
      timeEnd: timeEnd || null,
      place: place.trim() || null,
      conductors: chosen.map((p) =>
        p.mode === 'card' ? { publisherId: p.id, name: null } : { publisherId: null, name: p.name.trim() },
      ),
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
        <View style={{ gap: 6 }}>
          <DateField label={t('pioneerMeeting.date')} value={date} onChange={setDate} />
          <Text style={[styles.hint, outOfSeason && styles.bad]}>
            {outOfSeason ? t('pioneerMeeting.outOfSeason') : t('pioneerMeeting.seasonHint')}
          </Text>
        </View>
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
        {([0, 1] as const).map((i) => {
          const p = places[i];
          const other = places[i === 0 ? 1 : 0];
          return (
            <View key={i} style={{ gap: 6 }}>
              {p.mode === 'card' ? (
                <PublisherSelector
                  label={i === 0 ? t('pioneerMeeting.conductor') : t('pioneerMeeting.secondConductor')}
                  value={p.id}
                  onChange={(id) => setConductor(i, { id })}
                  appointmentFilter={MAY_CONDUCT}
                  preferAppointment="elder"
                  showAllWords={{
                    toggle: t('pioneerMeeting.servantsToggle'),
                    off: t('pioneerMeeting.servantsOff'),
                    on: t('pioneerMeeting.servantsOn'),
                  }}
                  excludeIds={other.mode === 'card' && other.id ? [other.id] : undefined}
                  absenceDate={date || undefined}
                  boxed
                />
              ) : (
                <>
                  <Text style={styles.label}>
                    {i === 0 ? t('pioneerMeeting.conductor') : t('pioneerMeeting.secondConductor')}
                  </Text>
                  <TextInput
                    value={p.name}
                    onChangeText={(name) => setConductor(i, { name })}
                    style={styles.input}
                    placeholder={t('pioneerMeeting.namePlaceholder')}
                    placeholderTextColor="#94a3b8"
                    maxLength={120}
                    autoCapitalize="words"
                    testID={`pioneer-meeting-name-${i}`}
                  />
                </>
              )}
              <Pressable
                onPress={() =>
                  setConductor(i, p.mode === 'card' ? { mode: 'name', id: null } : { mode: 'card', name: '' })
                }
                accessibilityRole="button"
                hitSlop={6}
              >
                <Text style={styles.link}>
                  {p.mode === 'card' ? t('pioneerMeeting.writeName') : t('pioneerMeeting.chooseFromList')}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {places[0].mode === 'name' || places[1].mode === 'name' ? (
          <Text style={styles.hint}>{t('pioneerMeeting.nameHint')}</Text>
        ) : null}
        {same ? <Text style={[styles.hint, styles.bad]}>{t('pioneerMeeting.sameConductor')}</Text> : null}
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
  bad: { color: '#b91c1c', fontFamily: 'Manrope_700Bold' },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  error: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#b91c1c' },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5, color: '#fff' },
});
