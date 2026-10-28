import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { LocalNeedsTopic } from '../../lib/api';
import { BRAND } from '../../lib/header';
import {
  type BoardSlot,
  type BoardWeek,
  dayBox,
  dayLabel,
  fullName,
  shortDayLabel,
  shortName,
} from '../../lib/local-needs';

/** The workbook's colour for «В жизни христианина». */
const LIFE = '#9b2c2c';

/**
 * One week ahead in the left column: its date, and on each of its slots the
 * topic it carries — or «Тема не выбрана» with what to do about it.
 */
export function WeekCard({
  week,
  manage,
  toCouncil,
  onChoose,
  onPlacePlanned,
  onCouncil,
}: {
  week: BoardWeek;
  manage: boolean;
  /** May bring the week to the elders' meeting. */
  toCouncil: boolean;
  onChoose: (week: BoardWeek, slot: BoardSlot) => void;
  onPlacePlanned: (week: BoardWeek, topic: LocalNeedsTopic) => void;
  onCouncil: (week: BoardWeek) => void;
}) {
  const { t, i18n } = useTranslation();
  const box = dayBox(week.day, i18n.language);
  return (
    <View style={styles.weekCard}>
      <View style={styles.dateBox}>
        <Text style={styles.dateDay}>{box.day}</Text>
        <Text style={styles.dateMonth}>{box.month}</Text>
      </View>
      <View style={{ flex: 1, gap: 14 }}>
        {week.slots.map((slot, i) => (
          <Slot
            key={slot.part?.id ?? `p${slot.topic?.id ?? i}`}
            week={week}
            slot={slot}
            manage={manage}
            toCouncil={toCouncil}
            onChoose={onChoose}
            onPlacePlanned={onPlacePlanned}
            onCouncil={onCouncil}
            t={t}
          />
        ))}
      </View>
    </View>
  );
}

function Slot({
  week,
  slot,
  manage,
  toCouncil,
  onChoose,
  onPlacePlanned,
  onCouncil,
  t,
}: {
  week: BoardWeek;
  slot: BoardSlot;
  manage: boolean;
  toCouncil: boolean;
  onChoose: (week: BoardWeek, slot: BoardSlot) => void;
  onPlacePlanned: (week: BoardWeek, topic: LocalNeedsTopic) => void;
  onCouncil: (week: BoardWeek) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const { part, topic, planned } = slot;
  if (planned && topic) {
    return (
      <View>
        <Text style={styles.kicker}>
          {week.hasProgramme ? t('localNeeds.board.plannedKicker') : t('localNeeds.board.noProgramme')}
        </Text>
        <Text style={styles.slotTitle}>{topic.title}</Text>
        <Text style={styles.slotSub}>{fullName(topic.speaker) ?? t('localNeeds.board.noSpeaker')}</Text>
        {week.hasProgramme && manage ? (
          <Pressable style={styles.primaryBtn} onPress={() => onPlacePlanned(week, topic)} accessibilityRole="button">
            <Text style={styles.primaryBtnText}>{t('localNeeds.board.placeNow')}</Text>
          </Pressable>
        ) : (
          <View style={[styles.pill, styles.pillBlue]}>
            <Text style={[styles.pillText, { color: '#0369a1' }]}>
              {week.hasProgramme ? t('localNeeds.board.plannedHint') : t('localNeeds.board.waitImport')}
            </Text>
          </View>
        )}
      </View>
    );
  }
  if (!part) return null;
  const minutes = part.partDurationMin ? ` · ${t('localNeeds.place.min', { n: part.partDurationMin })}` : '';
  const kicker = (part.localNeeds ? t('localNeeds.title.list') : t('localNeeds.board.lifeKicker')) + minutes;
  const empty = !topic;
  return (
    <View>
      <Text style={styles.kicker}>{kicker.toUpperCase()}</Text>
      <Text style={[styles.slotTitle, empty && styles.slotEmpty]}>
        {topic ? topic.title : t('localNeeds.board.notChosen')}
      </Text>
      {part.speaker ? <Text style={styles.slotSub}>{fullName(part.speaker)}</Text> : null}
      {topic ? (
        <View style={styles.filledRow}>
          <View style={[styles.pill, styles.pillGreen]}>
            <Ionicons name="checkmark" size={12} color="#047857" />
            <Text style={[styles.pillText, { color: '#047857' }]}>{t('localNeeds.board.inProgramme')}</Text>
          </View>
          {manage ? (
            <Pressable onPress={() => onChoose(week, slot)} hitSlop={8} accessibilityRole="button">
              <Text style={styles.quietLink}>{t('localNeeds.board.replace')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.btnRow}>
          {manage ? (
            <Pressable style={styles.primaryBtn} onPress={() => onChoose(week, slot)} accessibilityRole="button">
              <Text style={styles.primaryBtnText}>{t('localNeeds.board.choose')}</Text>
            </Pressable>
          ) : null}
          {toCouncil ? (
            <Pressable style={styles.ghostBtn} onPress={() => onCouncil(week)} accessibilityRole="button">
              <Ionicons name="people-outline" size={14} color={BRAND} />
              <Text style={styles.ghostBtnText}>{t('localNeeds.toCouncil.cta')}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

/**
 * A topic in the bank: what it is, who wrote it down and when, who is meant
 * to give it, and when it was given before — for two years.
 */
export function TopicCard({
  topic,
  manage,
  mode,
  onPlace,
  onEdit,
  onRestore,
}: {
  topic: LocalNeedsTopic;
  manage: boolean;
  mode: 'bank' | 'past' | 'archive';
  onPlace: (t: LocalNeedsTopic) => void;
  onEdit: (t: LocalNeedsTopic) => void;
  onRestore: (t: LocalNeedsTopic) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [open, setOpen] = useState(false);
  const uses = topic.uses ?? [];
  const history = uses
    .map((u) => {
      const who = shortName(u.speaker);
      const day = dayLabel(u.meetingDate ?? u.weekStartDate, lang);
      return who ? `${day} · ${who}` : day;
    })
    .join('; ');
  return (
    <View style={[styles.topicCard, mode !== 'bank' && styles.topicQuiet]}>
      <View style={styles.titleRow}>
        <Text style={styles.topicTitle}>{topic.title}</Text>
        {topic.createdByName ? (
          <View style={[styles.pill, styles.pillAmber, { marginTop: 0 }]}>
            <Text style={[styles.pillText, { color: '#92400e' }]}>
              {t('localNeeds.card.proposedBy', { name: topic.createdByName })}
            </Text>
          </View>
        ) : null}
      </View>
      {topic.notes ? (
        <Pressable onPress={() => setOpen((v) => !v)}>
          <Text style={styles.notes} numberOfLines={open ? undefined : 2}>
            {topic.notes}
          </Text>
        </Pressable>
      ) : null}
      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Text style={styles.metaText}>
            {t('localNeeds.card.speaker', {
              name: fullName(topic.speaker) ?? t('localNeeds.card.noSpeaker'),
            })}
          </Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.metaText}>
            {t('localNeeds.card.written', { date: dayLabel(topic.createdAt.slice(0, 10), lang) })}
          </Text>
        </View>
        {topic.plannedWeek ? (
          <View style={[styles.meta, styles.pillBlue]}>
            <Ionicons name="calendar-outline" size={12} color="#0369a1" />
            <Text style={[styles.metaText, { color: '#0369a1' }]}>
              {t('localNeeds.card.plannedFor', { day: shortDayLabel(topic.plannedWeek, lang) })}
            </Text>
          </View>
        ) : null}
      </View>
      {history ? (
        <Text style={styles.history}>
          <Text style={styles.historyHead}>{t('localNeeds.card.given')} </Text>
          {history}
        </Text>
      ) : null}
      {manage ? (
        <View style={styles.btnRow}>
          {mode === 'archive' ? (
            <Pressable style={styles.softBtn} onPress={() => onRestore(topic)} accessibilityRole="button">
              <Text style={styles.softBtnText}>{t('localNeeds.restore')}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.softBtn} onPress={() => onPlace(topic)} accessibilityRole="button">
                <Text style={styles.softBtnText}>
                  {mode === 'past' ? t('localNeeds.card.placeAgain') : t('localNeeds.card.place')}
                </Text>
                <Ionicons name="chevron-down" size={14} color={BRAND} />
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={() => onEdit(topic)} accessibilityRole="button">
                <Text style={styles.outlineBtnText}>{t('localNeeds.edit')}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  weekCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 12,
  },
  dateBox: { width: 46, alignItems: 'center', paddingTop: 2 },
  dateDay: { fontFamily: 'Manrope_800ExtraBold', fontSize: 24, color: '#0f172a', lineHeight: 28 },
  dateMonth: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#64748b', letterSpacing: 0.5 },
  kicker: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: LIFE, letterSpacing: 0.5, marginBottom: 2 },
  slotTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#0f172a' },
  slotEmpty: { color: '#94a3b8', fontFamily: 'Manrope_600SemiBold' },
  slotSub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b', marginTop: 1 },
  filledRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  quietLink: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#64748b', marginTop: 6 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  primaryBtn: {
    backgroundColor: BRAND,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  primaryBtnText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 13.5 },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 8,
  },
  ghostBtnText: { color: BRAND, fontFamily: 'Manrope_600SemiBold', fontSize: 13 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 6,
  },
  pillText: { fontFamily: 'Manrope_700Bold', fontSize: 12 },
  pillGreen: { backgroundColor: '#ecfdf5' },
  pillBlue: { backgroundColor: '#e0f2fe' },
  pillAmber: { backgroundColor: '#fef3c7' },
  topicCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 12,
  },
  topicQuiet: { backgroundColor: '#f8fafc' },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  topicTitle: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#0f172a', flexShrink: 1 },
  notes: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#475569', marginTop: 4, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#334155' },
  history: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#64748b', marginTop: 8, lineHeight: 18 },
  historyHead: { fontFamily: 'Manrope_700Bold', color: '#047857' },
  softBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  softBtnText: { color: BRAND, fontFamily: 'Manrope_700Bold', fontSize: 13.5 },
  outlineBtn: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  outlineBtnText: { color: '#475569', fontFamily: 'Manrope_600SemiBold', fontSize: 13.5 },
});
