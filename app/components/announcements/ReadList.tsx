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

/**
 * ONE MEETING'S ANNOUNCEMENTS, as the chairman reads them aloud (R-01).
 *
 * Large, one under another; a tap ticks one off as read and greys it, a second
 * tap takes the tick back. A letter shows its first lines and opens whole on
 * the spot — no second screen in the middle of a meeting.
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
   * Whether a tap ticks one off. Not while reading ahead or rehearsing: a
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
  const [open, setOpen] = useState<Set<string>>(new Set());

  if (!q.data) return null;
  const items = q.data.items;
  if (!items.length && hideWhenEmpty) return null;
  const big = size === 'large';
  const c = readCount(items);

  return (
    <View style={s.box}>
      <View style={s.head}>
        <Text style={[s.title, big && s.titleBig]}>{t('announcements.read.title')}</Text>
        {items.length ? (
          <Text style={s.count}>{t('announcements.read.count', { read: c.read, all: c.all })}</Text>
        ) : null}
      </View>
      {!items.length ? <Text style={s.empty}>{t('announcements.read.empty')}</Text> : null}
      {items.map((a) => {
        const letterOpen = open.has(a.id);
        const body = a.isLetter ? afterFirstLine(a.text) : '';
        return (
          <View key={a.id} style={[s.item, a.read && s.itemRead, a.byRule && !a.read && s.itemRule]}>
            <Pressable
              onPress={tick ? () => mark.mutate(a) : undefined}
              disabled={!tick}
              style={s.row}
              accessibilityRole={tick ? 'checkbox' : 'text'}
              accessibilityState={tick ? { checked: a.read } : undefined}
              accessibilityLabel={a.isLetter ? firstLine(a.text) : a.text}
            >
              {tick || a.read ? (
                <View style={[s.tick, big && s.tickBig, a.read && s.tickOn]}>
                  {a.read ? <Ionicons name="checkmark" size={big ? 20 : 16} color="#fff" /> : null}
                </View>
              ) : (
                <Text style={[s.num, big && s.numBig]}>{items.indexOf(a) + 1}</Text>
              )}
              <View style={{ flex: 1, gap: 6 }}>
                {a.byRule ? (
                  <Text style={s.ruleTag}>{t('announcements.read.byRule')}</Text>
                ) : null}
                {a.carriedFrom ? (
                  <Text style={s.carried}>{t('announcements.read.carried', { date: dayMonth(a.carriedFrom, i18n.language) })}</Text>
                ) : null}
                <Text style={[s.text, big && s.textBig, a.read && s.textRead, a.isLetter && s.letterTitle]}>
                  {a.isLetter ? firstLine(a.text) : a.text}
                </Text>
                {a.isLetter && body ? (
                  <Text
                    style={[s.text, big && s.letterBig, a.read && s.textRead]}
                    numberOfLines={letterOpen ? undefined : 3}
                  >
                    {body}
                  </Text>
                ) : null}
              </View>
            </Pressable>
            {a.isLetter && body ? (
              <Pressable
                style={s.letterBtn}
                onPress={() =>
                  setOpen((prev) => {
                    const n = new Set(prev);
                    if (n.has(a.id)) n.delete(a.id);
                    else n.add(a.id);
                    return n;
                  })
                }
                accessibilityRole="button"
              >
                <Text style={s.letterBtnText}>
                  {letterOpen ? t('announcements.read.letterClose') : t('announcements.read.letterOpen')}
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
  box: { gap: 10 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: ANN.fg },
  titleBig: { fontSize: 22 },
  count: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#475569' },
  empty: { fontFamily: 'Manrope_500Medium', fontSize: 15, color: '#475569' },
  item: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: ANN.fg,
    padding: 14,
    gap: 10,
  },
  itemRead: { backgroundColor: '#eef1f5', borderColor: '#eef1f5' },
  itemRule: { backgroundColor: '#fffaf0', borderColor: '#d97706' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  tick: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2.5,
    borderColor: ANN.fg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  tickBig: { width: 36, height: 36, borderRadius: 18 },
  num: { width: 30, fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: ANN.fg, textAlign: 'center', marginTop: 2 },
  numBig: { width: 36, fontSize: 21 },
  tickOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  text: { fontFamily: 'Manrope_500Medium', fontSize: 17, lineHeight: 25, color: '#0f172a' },
  textBig: { fontSize: 21, lineHeight: 31, fontFamily: 'Manrope_600SemiBold' },
  letterTitle: { fontFamily: 'Manrope_800ExtraBold' },
  letterBig: { fontSize: 20, lineHeight: 31 },
  textRead: { color: '#475569' },
  ruleTag: {
    alignSelf: 'flex-start',
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    color: '#78350f',
    backgroundColor: '#fde68a',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  carried: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#9a3412' },
  letterBtn: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: ANN.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: ANN.fg },
  hint: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569', lineHeight: 19 },
});
