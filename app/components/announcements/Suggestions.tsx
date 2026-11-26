import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import {
  announcementsApi,
  type AnnouncementKind,
  type AnnouncementSuggestion,
  type AnnouncementSuggestions,
} from '../../lib/api';
import { parseISODate } from '../../lib/dates';
import { reportSuccess } from '../../lib/error-bus';
import { BRAND } from '../../lib/header';

/** The colour of each source, as on the Events screen where there is one. */
const TOPIC_LOOK: Record<string, { fg: string; bg: string }> = {
  general_cleaning: { fg: '#065f46', bg: '#d1fae5' },
  co_visit: { fg: '#075985', bg: '#e0f2fe' },
  memorial: { fg: '#9f1239', bg: '#ffe4e6' },
  convention: { fg: '#5b21b6', bg: '#ede9fe' },
  field_service: { fg: '#166534', bg: '#dcfce7' },
  accounts_month: { fg: '#3730a3', bg: '#e0e7ff' },
  accounts_audit: { fg: '#3730a3', bg: '#e0e7ff' },
};

const dayShort = (iso: string, lang: string) =>
  parseISODate(iso)
    .toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(',', '');

/**
 * «Приложение предлагает» (announcements R-09, 26 November 2026): what the
 * app knows should be announced this week — from the events, the meetings
 * for field service, the accounts. Nothing is put on a list by itself: the
 * writer adds it, with his own words if he likes, or says «not needed».
 */
export function SuggestionsCard({ data }: { data: AnnouncementSuggestions | undefined }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const [open, setOpen] = useState<AnnouncementSuggestion | null>(null);
  const notNeeded = useMutation({
    mutationFn: (key: string) => announcementsApi.suggestionNotNeeded(key),
    onSuccess: () => reportSuccess(t('announcements.suggest.letGo')),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
  if (!data || (!data.items.length && !data.upcoming.length)) return null;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.headIcon}>
          <Ionicons name="sparkles-outline" size={18} color={BRAND} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>{t('announcements.suggest.title')}</Text>
          <Text style={s.sub}>
            {data.items.length
              ? t('announcements.suggest.count', { n: data.items.length })
              : t('announcements.suggest.noneThisWeek')}
          </Text>
        </View>
      </View>

      {data.items.map((sg) => {
        const look = TOPIC_LOOK[sg.topic] ?? TOPIC_LOOK.accounts_month;
        const first = sg.meetings.find((m) => m.kind === sg.defaultKinds[0]) ?? sg.meetings[0];
        const addLabel =
          sg.defaultKinds.length > 1
            ? t('announcements.suggest.addBoth')
            : t('announcements.suggest.addFor', { day: dayShort(first.date, lang) });
        return (
          <View key={sg.key} style={s.item}>
            <View style={s.tagRow}>
              <Text style={[s.tag, { color: look.fg, backgroundColor: look.bg }]}>
                {t(`announcements.suggest.topic.${sg.topic}`)}
              </Text>
              <Text style={s.when}>{t(`announcements.suggest.stage.${sg.topic}.${sg.stage}`)}</Text>
            </View>
            <Text style={s.text}>{sg.text}</Text>
            {sg.gaps.includes('time') ? (
              <Pressable
                style={s.gap}
                disabled={!sg.eventId}
                onPress={() => sg.eventId && router.push(`/special-events/${sg.eventId}` as never)}
                accessibilityRole={sg.eventId ? 'link' : undefined}
              >
                <Ionicons name="alert-circle-outline" size={16} color="#78350f" />
                <Text style={s.gapText}>{t('announcements.suggest.gapTime')}</Text>
              </Pressable>
            ) : null}
            {sg.gaps.includes('report') ? (
              <View style={s.gap}>
                <Ionicons name="create-outline" size={16} color="#78350f" />
                <Text style={s.gapText}>{t('announcements.suggest.gapReport')}</Text>
              </View>
            ) : null}
            <View style={s.btns}>
              <Pressable style={s.addBtn} onPress={() => setOpen(sg)} accessibilityRole="button">
                <Text style={s.addText}>{addLabel}</Text>
              </Pressable>
              <Pressable
                style={s.skipBtn}
                disabled={notNeeded.isPending}
                onPress={() => notNeeded.mutate(sg.key)}
                accessibilityRole="button"
              >
                <Text style={s.skipText}>{t('announcements.suggest.notNeeded')}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {data.upcoming.length ? (
        <View style={s.later}>
          <Text style={s.lbl}>{t('announcements.suggest.later')}</Text>
          {data.upcoming.map((u) => (
            <View key={u.key} style={s.laterRow}>
              <Text style={s.laterText} numberOfLines={1}>
                {t(`announcements.suggest.topic.${u.topic}`)}
              </Text>
              <Text style={s.laterWhen}>
                {t('announcements.suggest.fromWeek', {
                  date: parseISODate(u.weekStartDate).toLocaleDateString(lang, { day: 'numeric', month: 'short' }),
                })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <TakeSheet suggestion={open} week={data.weekStartDate} onClose={() => setOpen(null)} />
    </View>
  );
}

/** Adding one: the words to read, and the meetings — one or both. */
function TakeSheet({
  suggestion,
  week,
  onClose,
}: {
  suggestion: AnnouncementSuggestion | null;
  week: string;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [kinds, setKinds] = useState<AnnouncementKind[]>([]);
  useEffect(() => {
    if (!suggestion) return;
    setText(suggestion.text);
    setKinds(suggestion.defaultKinds);
  }, [suggestion]);

  const take = useMutation({
    mutationFn: () =>
      announcementsApi.takeSuggestion({ weekStartDate: week, key: suggestion!.key, kinds, text: text.trim() }),
    onSuccess: () => {
      reportSuccess(t('announcements.edit.added'));
      onClose();
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
  const toggle = (k: AnnouncementKind) =>
    setKinds((now) => (now.includes(k) ? now.filter((x) => x !== k) : [...now, k]));
  const canSave = !!suggestion && kinds.length > 0 && text.trim().length > 0 && !take.isPending;

  return (
    <Sheet
      visible={!!suggestion}
      onClose={onClose}
      title={t('announcements.edit.titleNew')}
      variant="bottom"
      closeLabel={t('common.cancel')}
      footer={
        <Pressable
          style={[s.saveBtn, !canSave && { opacity: 0.5 }]}
          disabled={!canSave}
          onPress={() => take.mutate()}
          accessibilityRole="button"
        >
          <Text style={s.saveText}>{t('announcements.suggest.add')}</Text>
        </Pressable>
      }
    >
      {suggestion ? (
        <View style={{ gap: 18, paddingBottom: 8 }}>
          <View style={s.from}>
            <Ionicons name="sparkles-outline" size={18} color="#075985" />
            <Text style={s.fromText}>
              {t('announcements.suggest.from', { topic: t(`announcements.suggest.topic.${suggestion.topic}`) })}
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={s.lbl} nativeID="sug-text-label">
              {t('announcements.suggest.yourWords')}
            </Text>
            <TextInput
              accessibilityLabelledBy="sug-text-label"
              style={s.input}
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
              maxLength={19800}
            />
            <Text style={s.hint}>{t('announcements.suggest.wordsHint')}</Text>
          </View>
          <View style={{ gap: 8 }}>
            <Text style={s.lbl}>{t('announcements.edit.meeting')}</Text>
            <View style={s.segment}>
              {suggestion.meetings.map((m) => {
                const on = kinds.includes(m.kind);
                return (
                  <Pressable
                    key={m.kind}
                    onPress={() => toggle(m.kind)}
                    style={[s.segBtn, on && s.segOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? BRAND : '#64748b'} />
                    <Text style={[s.segText, on && s.segTextOn]}>{dayShort(m.date, i18n.language)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <Text style={s.hint}>{t('announcements.suggest.onceHint')}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

/**
 * The mark on an announcement taken from a suggestion whose event changed:
 * «Событие изменилось» and a way to take today's words (they replace the old
 * ones, edits included — said on the button).
 */
export function StaleMark({ id, reason }: { id: string; reason: 'changed' | 'moved' | 'gone' }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const refresh = useMutation({
    mutationFn: () => announcementsApi.refreshSuggestion(id),
    onSuccess: () => reportSuccess(t('announcements.suggest.refreshed')),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
  // Moved to another week: deleting it frees the suggestion for its new week.
  const remove = useMutation({
    mutationFn: () => announcementsApi.remove(id),
    onSuccess: () => reportSuccess(t('announcements.edit.deleted')),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
  const message =
    reason === 'gone'
      ? t('announcements.suggest.staleGone')
      : reason === 'moved'
        ? t('announcements.suggest.staleMoved')
        : t('announcements.suggest.staleChanged');
  return (
    <View style={s.stale}>
      <Ionicons name="warning-outline" size={16} color="#7c2d12" />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={s.staleText}>{message}</Text>
        {reason === 'changed' ? (
          <Pressable
            style={s.staleBtn}
            disabled={refresh.isPending}
            onPress={() => refresh.mutate()}
            accessibilityRole="button"
          >
            <Text style={s.staleBtnText}>{t('announcements.suggest.refresh')}</Text>
          </Pressable>
        ) : null}
        {reason === 'moved' ? (
          <Pressable
            style={s.staleBtn}
            disabled={remove.isPending}
            onPress={() => remove.mutate()}
            accessibilityRole="button"
          >
            <Text style={s.staleBtnText}>{t('announcements.suggest.delete')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const card = {
  backgroundColor: '#fff',
  borderRadius: 22,
  shadowColor: '#0f172a',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

const s = StyleSheet.create({
  card: { ...card, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 12 },
  headIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#e0f2f7', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: '#0f172a' },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#475569' },
  item: { gap: 10, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#eef1f5' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tag: { fontFamily: 'Manrope_700Bold', fontSize: 12, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  when: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: '#475569' },
  text: { fontFamily: 'Manrope_500Medium', fontSize: 15, lineHeight: 22, color: '#0f172a' },
  gap: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: '#fffbeb' },
  gapText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#78350f' },
  btns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addBtn: { minHeight: 44, borderRadius: 12, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  addText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  skipBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  skipText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#475569' },
  later: { gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eef1f5', backgroundColor: '#fafbfc' },
  lbl: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#475569' },
  laterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  laterText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#0f172a' },
  laterWhen: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#475569' },
  from: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: '#e0f2fe' },
  fromText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#075985' },
  input: {
    minHeight: 150,
    borderWidth: 1.5,
    borderColor: BRAND,
    borderRadius: 16,
    padding: 14,
    fontFamily: 'Manrope_500Medium',
    fontSize: 17,
    lineHeight: 25,
    color: '#0f172a',
  },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#475569' },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: 14, backgroundColor: '#f1f4f8' },
  segBtn: { flexGrow: 1, flexDirection: 'row', gap: 6, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  segOn: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#475569' },
  segTextOn: { fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  saveBtn: { minHeight: 52, borderRadius: 14, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  stale: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 10, borderRadius: 12, backgroundColor: '#fff7e6', borderWidth: 1, borderColor: '#f6d58e' },
  staleText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, lineHeight: 19, color: '#7c2d12' },
  staleBtn: { alignSelf: 'flex-start', minHeight: 36, borderRadius: 10, backgroundColor: '#9a3412', paddingHorizontal: 12, justifyContent: 'center' },
  staleBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#fff' },
});
