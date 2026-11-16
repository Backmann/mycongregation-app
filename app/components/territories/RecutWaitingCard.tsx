import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { RecutWaiting } from '../../lib/api';
import { formatDayShort } from '../../lib/territory-view';
import { BRAND, INK, MUTED } from '../reports/ReportBits';

const AMBER = '#b45309';
const OK = '#15803d';

/**
 * A free territory the service committee decided to cut or join (16
 * November 2026, step 5 of the re-cutting draft; boards 6, 7 and 7a).
 *
 * On the territory's page it says what waits and offers to apply it, or —
 * for a join still waiting for the others — to hold this one back. When
 * giving out it warns first: given out now, the decision waits until it
 * comes back again; «Всё равно выдать» stays the keeper's choice.
 */
export function RecutWaitingCard({
  row,
  giving = false,
  busy = false,
  onOpen,
  onHold,
  onAnyway,
}: {
  row: RecutWaiting;
  /** Shown while giving the territory out. */
  giving?: boolean;
  busy?: boolean;
  /** Opens the proposal (to apply it). */
  onOpen: () => void;
  /** A join: hold this one back, or let it go. */
  onHold?: (hold: boolean) => void;
  /** Giving out: give it out anyway. */
  onAnyway?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const join = row.kind === 'merge';
  const kicker = row.ready
    ? t(join ? 'territories.recut.apply.readyJoin' : 'territories.recut.apply.readyCut')
    : t(join ? 'territories.recut.apply.waitJoin' : 'territories.recut.apply.waitCut');
  const title = join
    ? t('territories.recut.apply.decidedJoin', { list: row.numbers.join(' + ') })
    : t('territories.recut.apply.decidedCut', { number: row.number });
  const waiting = row.waiting
    .map((w) => t('territories.recut.apply.heldSince', { number: w.number, date: formatDayShort(w.since, lang) }))
    .join(', ');
  return (
    <View style={[s.card, giving ? s.cardWarn : s.cardCalm]}>
      <Text style={[s.kicker, { color: row.ready ? OK : AMBER }]}>{kicker}</Text>
      <Text style={s.title}>{title}</Text>
      {join ? (
        <>
          <View
            style={s.track}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: row.total, now: row.free }}
          >
            <View style={[s.fill, { width: `${Math.round((row.free / row.total) * 100)}%` }]} />
          </View>
          <Text style={s.body}>
            {row.waiting.length
              ? t('territories.recut.apply.freeOf', { free: row.free, total: row.total, list: waiting })
              : t('territories.recut.apply.allFree')}
          </Text>
        </>
      ) : null}
      {giving ? (
        <Text style={s.quiet}>
          {t(join ? 'territories.recut.apply.giveDelaysJoin' : 'territories.recut.apply.giveDelaysCut', { number: row.number })}
        </Text>
      ) : null}
      {row.hold ? (
        <View style={s.held}>
          <Ionicons name="pause-circle" size={16} color={AMBER} />
          <Text style={s.heldText}>{t('territories.recut.apply.heldBack')}</Text>
        </View>
      ) : null}

      <View style={s.btns}>
        {giving && join && !row.hold && onHold ? (
          <Pressable
            onPress={() => onHold(true)}
            disabled={busy}
            style={({ pressed }) => [s.btn, { backgroundColor: AMBER }, busy && s.off, pressed && s.pressed]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
            <Text style={s.btnText}>{t('territories.recut.apply.holdInstead')}</Text>
          </Pressable>
        ) : null}
        {row.ready || !join || !giving ? (
          <Pressable
            onPress={onOpen}
            style={({ pressed }) => [giving ? s.ghost : s.btn, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Text style={giving ? s.ghostText : s.btnText}>
              {t(row.ready ? 'territories.recut.apply.openApply' : 'territories.recut.apply.openProposal')}
            </Text>
          </Pressable>
        ) : null}
        {!giving && join && !row.ready && onHold ? (
          <Pressable
            onPress={() => onHold(!row.hold)}
            disabled={busy}
            style={({ pressed }) => [s.ghost, busy && s.off, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Text style={s.ghostText}>{t(row.hold ? 'territories.recut.apply.letGo' : 'territories.recut.apply.hold')}</Text>
          </Pressable>
        ) : null}
        {giving && onAnyway ? (
          <Pressable
            onPress={onAnyway}
            disabled={busy}
            style={({ pressed }) => [s.ghost, busy && s.off, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Text style={s.ghostText}>{t('territories.recut.apply.giveAnyway')}</Text>
          </Pressable>
        ) : null}
      </View>
      {!giving && join && !row.ready ? <Text style={s.quiet}>{t('territories.recut.apply.holdHint')}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 16, padding: 14, gap: 8, borderWidth: 1 },
  cardCalm: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  cardWarn: { backgroundColor: '#fffbeb', borderColor: '#f59e0b', borderWidth: 2 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK, lineHeight: 21 },
  body: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: INK, lineHeight: 19 },
  quiet: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 18 },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: OK },
  held: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heldText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: AMBER },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  btnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff', flexShrink: 1 },
  ghost: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
  },
  ghostText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND, flexShrink: 1 },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
