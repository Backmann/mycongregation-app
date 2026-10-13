import { createContext, useContext } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { ProgrammeLock } from '../lib/api';

/**
 * The programme of a meeting becomes the record a week after the meeting
 * (13 October 2026). The server decides — `assignmentsApi.locks` — and the
 * screens only draw its answer, so a phone in another time zone or a page
 * open past midnight cannot disagree with the server about a week.
 *
 * `ProgrammeRetroContext` is true while an administrator or the coordinator
 * of the body of elders is correcting a frozen week on purpose: every write
 * made under it carries `retroactive`, and the server marks it so in the
 * journal and tells nobody.
 */
export const ProgrammeRetroContext = createContext(false);

export function useProgrammeRetro(): boolean {
  return useContext(ProgrammeRetroContext);
}

const day = (iso: string, lang: string) => dayjs(iso).locale(lang).format('D MMMM');

/** One meeting's standing, at the head of its block. */
export function ProgrammeLockNote({
  lock,
  retro,
}: {
  lock: ProgrammeLock | undefined;
  retro: boolean;
}) {
  const { t, i18n } = useTranslation();
  if (!lock || !lock.held) return null;
  if (lock.frozen && !retro) {
    return (
      <View style={[styles.box, styles.frozen]}>
        <Ionicons name="lock-closed-outline" size={15} color="#475569" style={styles.icon} />
        <Text style={styles.frozenText}>
          {t('schedule.lock.frozen', { date: day(lock.meetingDate, i18n.language) })}
        </Text>
      </View>
    );
  }
  if (!lock.frozen) {
    return (
      <Text style={styles.grace}>
        {t('schedule.lock.grace', { until: day(lock.editableUntil, i18n.language) })}
      </Text>
    );
  }
  return null;
}

/**
 * The week's door to a correction after the fact — or, while one is under
 * way, the amber strip that says so and the way out.
 */
export function ProgrammeRetroBar({
  anyFrozen,
  mayFix,
  retro,
  onStart,
  onDone,
}: {
  anyFrozen: boolean;
  mayFix: boolean;
  retro: boolean;
  onStart: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  if (retro) {
    return (
      <View style={[styles.box, styles.retro]}>
        <Ionicons name="create-outline" size={16} color="#92400e" style={styles.icon} />
        <Text style={styles.retroText}>{t('schedule.lock.retroOn')}</Text>
        <Pressable onPress={onDone} style={styles.doneBtn} accessibilityRole="button">
          <Text style={styles.doneText}>{t('schedule.lock.retroDone')}</Text>
        </Pressable>
      </View>
    );
  }
  if (!anyFrozen || !mayFix) return null;
  return (
    <Pressable onPress={onStart} style={styles.fixBtn} accessibilityRole="button">
      <Ionicons name="create-outline" size={15} color="#0369a1" />
      <Text style={styles.fixText}>{t('schedule.lock.fix')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  icon: { marginTop: 1 },
  frozen: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' },
  frozenText: { flex: 1, fontSize: 13, color: '#334155', fontFamily: 'Manrope_500Medium' },
  grace: {
    marginHorizontal: 14,
    marginTop: 6,
    fontSize: 12.5,
    color: '#64748b',
    fontFamily: 'Manrope_500Medium',
  },
  retro: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  retroText: {
    flex: 1,
    fontSize: 13,
    color: '#78350f',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  doneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#92400e',
  },
  doneText: { fontSize: 13, color: '#ffffff', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  fixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#93c5fd',
  },
  fixText: { fontSize: 13.5, color: '#0369a1', fontWeight: '700', fontFamily: 'Manrope_700Bold' },
});
