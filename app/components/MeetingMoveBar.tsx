import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { extractErrorMessage, meetingMovesApi } from '../lib/api';
import { notify } from '../lib/error-bus';
import { confirm } from './ConfirmHost';
import { refreshAfterMove } from './MeetingMoveSheet';
import type { MeetingKind, WeekRules } from '../lib/week-rules';

/**
 * Under a meeting's header in the week editor (mockup screens 1 and 4): the
 * way into a move for whoever may make one, and — once moved — that it is,
 * where from, «Изменить» and «Вернуть на <обычный день>». Shown whether the
 * section is open or folded: a moved meeting must not be missed.
 */
export function MeetingMoveBar({
  rules,
  kind,
  canMove,
  canMoveAfterwards,
  todayISO,
  onOpen,
}: {
  rules: WeekRules;
  kind: MeetingKind;
  canMove: boolean;
  canMoveAfterwards: boolean;
  todayISO: string;
  onOpen: (kind: MeetingKind) => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const m = rules.meetingOf(kind);
  const day = (iso: string | null, opts: Intl.DateTimeFormatOptions) =>
    iso ? new Intl.DateTimeFormat(i18n.language, opts).format(new Date(`${iso}T00:00:00`)) : '';
  const from = m.moved?.from;
  const fromWhen = from ? [day(from.date, { weekday: 'short', day: 'numeric', month: 'short' }), from.time].filter(Boolean).join(' · ') : '';
  const past = (m.date ?? '') < todayISO || (from?.date ?? '') < todayISO;
  const may = canMove && (!past || canMoveAfterwards);

  if (!m.held) return null;
  if (!m.moved) {
    if (!may) return null;
    return (
      <Pressable accessibilityRole="button" style={styles.cta} onPress={() => onOpen(kind)}>
        <Ionicons name="swap-horizontal" size={18} color="#0e7490" />
        <Text style={styles.ctaText}>{t('schedule.move.button')}</Text>
      </Pressable>
    );
  }

  const moveBack = async () => {
    const usualWhen = [day(from?.date ?? null, { weekday: 'long', day: 'numeric', month: 'long' }), from?.time]
      .filter(Boolean)
      .join(', ');
    const ok = await confirm({
      title: t('schedule.move.moveBackTitle'),
      body: t(past ? 'schedule.move.moveBackBodyPast' : 'schedule.move.moveBackBody', { when: usualWhen }),
      confirmLabel: t('schedule.move.moveBack', { day: day(from?.date ?? null, { weekday: 'short' }) }),
    });
    if (!ok) return;
    try {
      await meetingMovesApi.moveBack(rules.weekStartISO, kind);
      await refreshAfterMove(qc);
      notify(t('schedule.move.doneBack'), undefined, 'success');
    } catch (err) {
      notify(t('common.error'), extractErrorMessage(err));
    }
  };

  return (
    <View style={styles.moved}>
      <View style={styles.movedHead}>
        <Text style={styles.badge}>{t('schedule.move.moved')}</Text>
        <Text style={styles.from}>{t('schedule.move.movedFrom', { when: fromWhen })}</Text>
      </View>
      {may ? (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" style={styles.btn} onPress={() => onOpen(kind)}>
            <Text style={styles.btnText}>{t('schedule.move.change')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={[styles.btn, styles.btnQuiet]} onPress={moveBack}>
            <Text style={[styles.btnText, styles.btnQuietText]}>
              {t('schedule.move.moveBack', { day: day(from?.date ?? null, { weekday: 'short' }) })}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#0e7490',
    marginHorizontal: 14,
    marginBottom: 12,
  },
  ctaText: { color: '#0e7490', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  moved: {
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
    gap: 8,
  },
  movedHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: {
    color: '#fff',
    backgroundColor: '#c2410c',
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontFamily: 'Manrope_700Bold',
    overflow: 'hidden',
  },
  from: { fontSize: 13, fontFamily: 'Manrope_600SemiBold', color: '#7c2d12' },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#0e7490',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  btnText: { color: '#0e7490', fontSize: 14, fontFamily: 'Manrope_700Bold' },
  btnQuiet: { borderColor: '#cbd5e1' },
  btnQuietText: { color: '#334155' },
});
