import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { announcementsApi, type Announcement, type AnnouncementKind } from '../../lib/api';
import { afterFirstLine, firstLine, readCount } from '../../lib/announcements';

/** «29 ноября» — the day an announcement was first meant for. */
export function dayMonth(iso: string, lang: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'long' });
}

/** The colours of the announcements, the same as the tasks' area «Объявления». */
export const ANN = { fg: '#0C447C', bg: '#E6F1FB' };
const DONE = { fg: '#166534', bg: '#e7f6ec', solid: '#15803d' };
export const RULE = { fg: '#78350f', edge: '#b45309', ground: '#fffaf0' };

/**
 * ONE MEETING'S ANNOUNCEMENTS, as the chairman reads them aloud (R-01).
 *
 * Each one is its own card with its number, so «первое, второе, третье» can
 * be told apart from a step away: a navy number, what it is (an
 * announcement, a branch letter, a step by the guidelines), the words large.
 *
 * At the meeting the first one not yet read is marked «Сейчас» and framed;
 * under each, a button of its own — «Прочитано» — so scrolling through a long
 * letter never ticks anything by accident. A read one folds into a single
 * green line with its number and a check, and the list grows shorter as the
 * evening goes on; a tap on that line opens it again and lets the tick be
 * taken back.
 *
 * A letter opens whole when it is the one to read now; otherwise it shows its
 * first lines and opens on the spot — no second screen mid-meeting.
 *
 * It asks the server itself, so a caller passes only the meeting. Whoever the
 * server does not answer — anyone but the chairman of that meeting and the
 * writers — sees nothing at all: no frame, no «no access» in the middle of the
 * conduct screen.
 */
export function ReadList({
  week,
  kind,
  size = 'large',
  hideWhenEmpty = false,
  tick = true,
}: {
  week: string;
  kind: AnnouncementKind;
  /** «large» for the conduct mode and the tablet; «normal» elsewhere. */
  size?: 'large' | 'normal';
  hideWhenEmpty?: boolean;
  /**
   * Whether they can be ticked off. Not while reading ahead or rehearsing: a
   * list read through the evening before must not reach the coordinator as
   * «прочитано».
   */
  tick?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const key = ['announcements', 'meeting', week, kind];
  const q = useQuery({
    queryKey: key,
    queryFn: () => announcementsApi.meeting(week, kind),
    retry: false,
    staleTime: 30 * 1000,
  });
  const mark = useMutation({
    mutationFn: (a: Announcement) => announcementsApi.mark(a.id, !a.read),
    onMutate: async (a) => {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData(key, (old: typeof q.data) =>
        old ? { ...old, items: old.items.map((i) => (i.id === a.id ? { ...i, read: !a.read } : i)) } : old,
      );
    },
    // The failure itself is said by the app's one handler (app/_layout).
    onError: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
  /** Letters opened whole, and read ones unfolded again. */
  const [open, setOpen] = useState<Set<string>>(new Set());
  const setOpenFor = (id: string, on: boolean) =>
    setOpen((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  if (!q.data) return null;
  const items = q.data.items;
  if (!items.length && hideWhenEmpty) return null;
  const big = size === 'large';
  const c = readCount(items);
  // The one to read now: the first not yet read — only at the meeting itself.
  const nowId = tick ? (items.find((a) => !a.read)?.id ?? null) : null;

  return (
    <View style={s.box}>
      <View style={s.head}>
        <Text style={[s.title, big && s.titleBig]}>{t('announcements.read.title')}</Text>
        {items.length ? (
          <Text style={[s.count, tick && c.read === c.all && s.countDone]}>
            {tick
              ? t('announcements.read.count', { read: c.read, all: c.all })
              : t('announcements.read.total', { count: c.all })}
          </Text>
        ) : null}
      </View>
      {!items.length ? <Text style={s.empty}>{t('announcements.read.empty')}</Text> : null}

      {items.map((a, i) => {
        const n = i + 1;
        const isNow = a.id === nowId;
        const title = a.isLetter ? firstLine(a.text) : '';
        const body = a.isLetter ? afterFirstLine(a.text) : a.text;

        if (tick && a.read && !open.has(a.id)) {
          return (
            <Pressable
              key={a.id}
              style={s.folded}
              onPress={() => setOpenFor(a.id, true)}
              accessibilityRole="button"
              accessibilityLabel={t('announcements.read.foldedLabel', { n })}
            >
              <View style={[s.badge, s.badgeDone]}>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </View>
              <Text style={s.foldedText} numberOfLines={1}>
                {n}. {a.isLetter ? title : firstLine(a.text)}
              </Text>
              <Text style={s.foldedTag}>{t('announcements.read.readDone')}</Text>
            </Pressable>
          );
        }

        const letterWhole = isNow || open.has(a.id) || !tick;
        const label = a.byRule
          ? t('announcements.read.byRule')
          : a.isLetter
            ? t('announcements.read.kindLetter')
            : t('announcements.read.kindPlain');

        return (
          <View key={a.id} style={[s.card, a.byRule && s.cardRule, a.read && s.cardRead, isNow && s.cardNow]}>
            <View style={s.cardHead}>
              <View style={[s.badge, big && s.badgeBig, a.byRule && s.badgeRule, a.read && s.badgeDone]}>
                {a.read ? (
                  <Ionicons name="checkmark" size={big ? 22 : 18} color="#fff" />
                ) : (
                  <Text style={[s.badgeNum, big && s.badgeNumBig]}>{n}</Text>
                )}
              </View>
              <Text style={[s.kind, a.byRule && { color: RULE.fg }]}>{label}</Text>
              {isNow ? <Text style={s.nowTag}>{t('announcements.read.now')}</Text> : null}
            </View>

            {a.carriedFrom ? (
              <Text style={s.carried}>
                {t('announcements.read.carried', { date: dayMonth(a.carriedFrom, i18n.language) })}
              </Text>
            ) : null}

            {a.isLetter && title ? <Text style={[s.letterTitle, big && s.letterTitleBig]}>{title}</Text> : null}
            {body ? (
              <Text
                style={[s.text, big && s.textBig, a.isLetter && s.letterBody, a.read && s.textRead]}
                numberOfLines={a.isLetter && !letterWhole ? 3 : undefined}
              >
                {body}
              </Text>
            ) : null}

            {a.isLetter && body && !isNow && tick ? (
              <Pressable
                style={s.letterBtn}
                onPress={() => setOpenFor(a.id, !open.has(a.id))}
                accessibilityRole="button"
              >
                <Text style={s.letterBtnText}>
                  {open.has(a.id) ? t('announcements.read.letterClose') : t('announcements.read.letterOpen')}
                </Text>
              </Pressable>
            ) : null}

            {tick ? (
              <Pressable
                onPress={() => {
                  mark.mutate(a);
                  // A tick folds it; taking the tick back leaves it open.
                  if (!a.read) setOpenFor(a.id, false);
                }}
                style={[s.markBtn, a.read ? s.markDone : isNow ? s.markNow : s.markLater]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: a.read }}
                accessibilityLabel={t('announcements.read.markLabel', { n })}
              >
                <Ionicons
                  name={a.read ? 'arrow-undo-outline' : 'checkmark-circle-outline'}
                  size={22}
                  color={a.read || isNow ? '#fff' : ANN.fg}
                />
                <Text style={[s.markText, (a.read || isNow) && { color: '#fff' }]}>
                  {a.read ? t('announcements.read.undo') : t('announcements.read.markRead')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {items.length ? (
        <Text style={s.hint}>{tick ? t('announcements.read.hint') : t('announcements.read.hintAhead')}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: ANN.fg },
  titleBig: { fontSize: 22 },
  count: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#475569' },
  countDone: { color: DONE.fg },
  empty: { fontFamily: 'Manrope_500Medium', fontSize: 15, color: '#475569' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d5dbe3',
    padding: 16,
    gap: 12,
  },
  cardNow: {
    borderWidth: 2.5,
    borderColor: ANN.fg,
    shadowColor: ANN.fg,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  cardRule: { backgroundColor: RULE.ground, borderColor: RULE.edge },
  cardRead: { backgroundColor: '#f6f8fb' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ANN.fg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeBig: { width: 40, height: 40, borderRadius: 20 },
  badgeRule: { backgroundColor: RULE.edge },
  badgeDone: { backgroundColor: DONE.solid },
  badgeNum: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: '#fff' },
  badgeNumBig: { fontSize: 20 },
  kind: {
    flex: 1,
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#475569',
  },
  nowTag: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 12,
    color: '#fff',
    backgroundColor: ANN.fg,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  carried: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#9a3412' },
  letterTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, lineHeight: 25, color: '#0f172a' },
  letterTitleBig: { fontSize: 22, lineHeight: 30 },
  text: { fontFamily: 'Manrope_500Medium', fontSize: 17, lineHeight: 26, color: '#0f172a' },
  textBig: { fontSize: 21, lineHeight: 32, fontFamily: 'Manrope_600SemiBold' },
  letterBody: { fontFamily: 'Manrope_500Medium' },
  textRead: { color: '#475569' },

  letterBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: ANN.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: ANN.fg },

  markBtn: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  markNow: { backgroundColor: ANN.fg },
  markLater: { backgroundColor: ANN.bg },
  markDone: { backgroundColor: DONE.solid },
  markText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: ANN.fg },

  folded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: DONE.bg,
  },
  foldedText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#334155' },
  foldedTag: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: DONE.fg },

  hint: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569', lineHeight: 19 },
});
