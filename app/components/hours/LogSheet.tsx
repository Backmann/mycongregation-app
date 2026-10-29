import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { DurationWheel } from '../DurationWheel';
import { formatDuration, useLogActions } from '../../lib/useServiceLog';
import type { ServiceLogEntry } from '../../lib/api';
import { WIDE_FROM } from '../../lib/screen-width';

const INK = '#0f172a';
const MUTED = '#64748b';
const BRAND = '#0e7490';
const LAST_KEY = 'mycongregation.hours-last';
/** Ready-made lengths — never «1,5 ч» (Lionel, 29 October 2026). */
const PRESETS = [30, 60, 90, 120];

function shiftDay(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return x.toISOString().slice(0, 10);
}

/**
 * «ЗАПИСАТЬ ВРЕМЯ» (29 October 2026, mockup screen 2). The ministry or credited
 * hours; today, yesterday or another day; how long on two drums or a ready
 * length; a note only he sees. The drum opens on the length he wrote last.
 */
export function LogSheet({
  visible,
  onClose,
  today,
  entry,
  onSaved,
  onRemoved,
}: {
  visible: boolean;
  onClose: () => void;
  /** The congregation's today, «YYYY-MM-DD». */
  today: string;
  /** An entry to change; none — a new one. */
  entry?: ServiceLogEntry | null;
  onSaved?: (id: string, isNew: boolean, minutes: number) => void;
  onRemoved?: (entry: ServiceLogEntry) => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const { write, remove } = useLogActions();
  const yesterday = shiftDay(today, -1);
  const [kind, setKind] = useState<'field' | 'credit'>('field');
  const [day, setDay] = useState(today);
  const [other, setOther] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!visible) return;
    if (entry) {
      setKind(entry.kind);
      setDay(entry.day);
      setOther(entry.day !== today && entry.day !== yesterday);
      setMinutes(entry.minutes);
      setNote(entry.note ?? '');
      return;
    }
    setKind('field');
    setDay(today);
    setOther(false);
    setNote('');
    void AsyncStorage.getItem(LAST_KEY)
      .then((v) => {
        const n = v ? parseInt(v, 10) : NaN;
        setMinutes(Number.isFinite(n) && n > 0 && n <= 720 ? n : 60);
      })
      .catch(() => setMinutes(60));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entry?.id]);

  const save = async () => {
    const id = await write(
      { day, minutes, kind, note: note.trim() ? note.trim() : null },
      entry?.id,
    );
    void AsyncStorage.setItem(LAST_KEY, String(minutes)).catch(() => undefined);
    onSaved?.(id, !entry, minutes);
    onClose();
  };

  const chip = (label: string, on: boolean, onPress: () => void, key: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet
      visible={visible}
      title={entry ? t('hoursLog.sheet.editTitle') : t('hoursLog.sheet.title')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= WIDE_FROM ? 'centered' : 'bottom'}
      footer={
        <View style={{ gap: 8 }}>
          <Pressable
            style={[styles.btn, minutes <= 0 && { opacity: 0.45 }]}
            disabled={minutes <= 0}
            onPress={() => void save()}
            accessibilityRole="button"
          >
            <Text style={styles.btnText}>
              {entry ? t('hoursLog.sheet.save') : t('hoursLog.sheet.write')}
              {minutes > 0 ? ` · ${formatDuration(minutes, t)}` : ''}
            </Text>
          </Pressable>
          {entry ? (
            <Pressable
              onPress={() => {
                void remove(entry.id);
                onRemoved?.(entry);
                onClose();
              }}
              accessibilityRole="button"
              hitSlop={6}
            >
              <Text style={styles.remove}>{t('hoursLog.sheet.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <View style={styles.seg}>
        {(['field', 'credit'] as const).map((k) => {
          const on = kind === k;
          return (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[styles.segItem, on && styles.segOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.segText, on && styles.segTextOn]}>{t(`hoursLog.kind.${k}`)}</Text>
            </Pressable>
          );
        })}
      </View>
      {kind === 'credit' ? <Text style={styles.hint}>{t('hoursLog.sheet.creditHint')}</Text> : null}

      <View style={styles.days}>
        {chip(t('hoursLog.sheet.today'), !other && day === today, () => {
          setOther(false);
          setDay(today);
        }, 'today')}
        {chip(t('hoursLog.sheet.yesterday'), !other && day === yesterday, () => {
          setOther(false);
          setDay(yesterday);
        }, 'yesterday')}
        {chip(t('hoursLog.sheet.otherDay'), other, () => setOther(true), 'other')}
      </View>
      {other ? <DateField value={day} onChange={(v) => v && setDay(v)} /> : null}

      <DurationWheel minutes={minutes} onChange={setMinutes} />
      <View style={styles.presets}>
        {PRESETS.map((p) => chip(formatDuration(p, t), minutes === p, () => setMinutes(p), String(p)))}
      </View>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t('hoursLog.sheet.notePlaceholder')}
        placeholderTextColor="#94a3b8"
        maxLength={200}
        style={styles.note}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 12, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center' },
  segOn: {
    backgroundColor: '#fff',
    shadowColor: INK,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: MUTED },
  segTextOn: { color: INK, fontFamily: 'Manrope_800ExtraBold' },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#92400e', marginTop: 8 },
  days: { flexDirection: 'row', gap: 6, marginTop: 12, marginBottom: 6 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 },
  chip: {
    flexGrow: 1,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  chipOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#334155' },
  chipTextOn: { color: BRAND, fontFamily: 'Manrope_800ExtraBold' },
  note: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    color: INK,
    outlineStyle: 'none',
  } as object,
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5 },
  remove: { textAlign: 'center', fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#b91c1c', paddingVertical: 4 },
});
