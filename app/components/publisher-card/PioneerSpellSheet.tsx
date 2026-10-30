import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { confirm } from '../ConfirmHost';
import { capitalize, monthName } from '../../lib/aux-application';
import { WIDE_FROM } from '../../lib/screen-width';
import type { PastPioneerSpellInput, PioneerHistorySpell, PioneerType } from '../../lib/api';

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const BRAND = '#166534';
const KINDS: PioneerType[] = ['regular', 'special', 'missionary'];

function shiftYear(ym: string, n: number): string {
  return `${Number(ym.slice(0, 4)) + n}${ym.slice(4)}`;
}

/**
 * «Прежнее служение» (30 October 2026): a stretch of regular, special or
 * missionary pioneering copied in from the paper S-21 — its kind, first and
 * last month. One year-and-month grid edits whichever end is picked, so a
 * stretch from 1995 is three taps, not a calendar paged back thirty years.
 */
export function PioneerSpellSheet({
  visible,
  spell,
  thisMonth,
  onClose,
  onSave,
  onRemove,
}: {
  visible: boolean;
  /** A past spell to correct; none — a new one. */
  spell: PioneerHistorySpell | null;
  /** The congregation's current month, YYYY-MM: nothing past it. */
  thisMonth: string;
  onClose: () => void;
  /** Resolves to an error text, or null when saved. */
  onSave: (input: PastPioneerSpellInput) => Promise<string | null>;
  onRemove: (spell: PioneerHistorySpell) => Promise<string | null>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { width } = useWindowDimensions();
  const [kind, setKind] = useState<PioneerType>('regular');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [editing, setEditing] = useState<'start' | 'end'>('start');
  const [year, setYear] = useState(thisMonth.slice(0, 4));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    setBusy(false);
    if (spell && spell.end) {
      setKind(spell.kind);
      setStart(spell.start);
      setEnd(spell.end);
      setYear(spell.start.slice(0, 4));
    } else {
      setKind('regular');
      setStart('');
      setEnd('');
      setYear(String(Number(thisMonth.slice(0, 4)) - 10));
    }
    setEditing('start');
  }, [visible, spell?.id, thisMonth]);

  const pick = (ym: string) => {
    setError(null);
    if (editing === 'start') {
      setStart(ym);
      if (end && end < ym) setEnd('');
      setEditing('end');
    } else {
      setEnd(ym);
      if (start && start > ym) setStart(ym);
    }
  };

  const ready = !!start && !!end && start <= end;
  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const err = await onSave({ kind, start, end });
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };
  const remove = async () => {
    if (!spell || busy) return;
    const ok = await confirm({
      title: t('pioneerHistory.removeTitle'),
      body: t('pioneerHistory.removeBody', {
        kind: t(`publishers.pioneer.detail.${spell.kind}`),
        range: `${monthName(spell.start, lang)} – ${spell.end ? monthName(spell.end, lang) : ''}`,
      }),
      confirmLabel: t('pioneerHistory.remove'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const err = await onRemove(spell);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  const endPill = (which: 'start' | 'end', value: string) => (
    <Pressable
      onPress={() => {
        setEditing(which);
        if (value) setYear(value.slice(0, 4));
      }}
      style={[styles.pill, editing === which && styles.pillOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: editing === which }}
    >
      <Text style={styles.pillLabel}>{t(which === 'start' ? 'pioneerHistory.from' : 'pioneerHistory.to')}</Text>
      <Text style={[styles.pillValue, !value && styles.pillEmpty]}>
        {value ? capitalize(monthName(value, lang)) : t('pioneerHistory.pick')}
      </Text>
    </Pressable>
  );

  return (
    <Sheet
      visible={visible}
      title={spell ? t('pioneerHistory.editTitle') : t('pioneerHistory.addTitle')}
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
            testID="pioneer-spell-save"
          >
            <Text style={styles.btnText}>{spell ? t('pioneerHistory.save') : t('pioneerHistory.add')}</Text>
          </Pressable>
          {spell ? (
            <Pressable onPress={() => void remove()} style={styles.removeBtn} accessibilityRole="button">
              <Text style={styles.removeText}>{t('pioneerHistory.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <View style={{ gap: 14 }}>
        <View style={styles.kinds}>
          {KINDS.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[styles.chip, kind === k && styles.chipOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[styles.chipText, kind === k && styles.chipTextOn]}>
                {t(`publishers.pioneer.detail.${k}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.ends}>
          {endPill('start', start)}
          <Ionicons name="arrow-forward" size={16} color={MUTED} />
          {endPill('end', end)}
        </View>

        <MonthGrid
          year={year}
          onYear={setYear}
          thisMonth={thisMonth}
          isOn={(ym) => ym === start || ym === end}
          isInside={(ym) => !!start && !!end && ym > start && ym < end}
          onPick={pick}
        />
        <Text style={styles.hint}>{t('pioneerHistory.hint')}</Text>
      </View>
    </Sheet>
  );
}

/**
 * A year with its twelve months, and the years around it a tap away — for
 * months long past as much as this one. Nothing after `thisMonth`.
 */
export function MonthGrid({
  year,
  onYear,
  thisMonth,
  isOn,
  isInside,
  onPick,
}: {
  year: string;
  onYear: (y: string) => void;
  thisMonth: string;
  isOn: (ym: string) => boolean;
  isInside?: (ym: string) => boolean;
  onPick: (ym: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const yearNum = Number(year);
  const canNext = `${yearNum + 1}-01` <= thisMonth;
  const setYear = onYear;
  const pick = onPick;
  return (
    <View style={styles.grid}>
      <View style={styles.yearRow}>
        <Pressable
          onPress={() => setYear(String(yearNum - 1))}
          style={styles.yearBtn}
          accessibilityRole="button"
          accessibilityLabel={t('pioneerHistory.prevYear')}
          hitSlop={6}
        >
          <Ionicons name="chevron-back" size={18} color={INK} />
        </Pressable>
        <Text style={styles.year}>{year}</Text>
        <Pressable
          onPress={() => canNext && setYear(String(yearNum + 1))}
          disabled={!canNext}
          style={[styles.yearBtn, !canNext && { opacity: 0.3 }]}
          accessibilityRole="button"
          accessibilityLabel={t('pioneerHistory.nextYear')}
          hitSlop={6}
        >
          <Ionicons name="chevron-forward" size={18} color={INK} />
        </Pressable>
      </View>
      <View style={styles.monthWrap}>
        {months.map((ym) => {
          const future = ym > thisMonth;
          const on = isOn(ym);
          const inside = isInside ? isInside(ym) : false;
          return (
            <Pressable
              key={ym}
              onPress={() => !future && pick(ym)}
              disabled={future}
              style={[styles.month, inside && styles.monthIn, on && styles.monthOn, future && { opacity: 0.3 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: future }}
            >
              <Text style={[styles.monthText, on && styles.monthTextOn]}>
                {new Date(`${ym}-15T12:00:00Z`)
                  .toLocaleDateString(lang, { month: 'short', timeZone: 'UTC' })
                  .replace('.', '')}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.jump}>
        {[-10, 10].map((n) => {
          const target = shiftYear(`${year}-01`, n);
          const off = target > thisMonth;
          return (
            <Pressable
              key={n}
              onPress={() => !off && setYear(target.slice(0, 4))}
              disabled={off}
              style={[styles.jumpBtn, off && { opacity: 0.3 }]}
              accessibilityRole="button"
            >
              <Text style={styles.jumpText}>{n > 0 ? `+${n}` : String(n)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kinds: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 13 },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#334155' },
  chipTextOn: { color: '#fff', fontFamily: 'Manrope_800ExtraBold' },
  ends: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pill: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 },
  pillOn: { borderColor: BRAND, backgroundColor: '#f0fdf4' },
  pillLabel: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },
  pillValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK, marginTop: 2 },
  pillEmpty: { color: '#94a3b8', fontFamily: 'Manrope_600SemiBold' },
  grid: { borderWidth: 1, borderColor: '#eef2f7', borderRadius: 16, padding: 10, backgroundColor: '#f8fafc' },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  yearBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  year: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: INK, fontVariant: ['tabular-nums'] },
  monthWrap: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, rowGap: 6 },
  month: { width: '25%', alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  monthIn: { backgroundColor: '#dcfce7' },
  monthOn: { backgroundColor: BRAND },
  monthText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#334155' },
  monthTextOn: { color: '#fff', fontFamily: 'Manrope_800ExtraBold' },
  jump: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
  jumpBtn: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, backgroundColor: '#fff', borderWidth: 1, borderColor: LINE },
  jumpText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 18 },
  error: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#b91c1c' },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5, color: '#fff' },
  removeBtn: { alignItems: 'center', paddingVertical: 8 },
  removeText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#b91c1c' },
});
