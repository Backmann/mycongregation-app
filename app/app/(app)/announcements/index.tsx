import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../components/KeyboardScroll';
import { Editor } from '../../../components/announcements/Editor';
import { StaleMark, SuggestionsCard } from '../../../components/announcements/Suggestions';
import { ANN, dayMonth } from '../../../components/announcements/ReadList';
import {
  announcementsApi,
  type Announcement,
  type AnnouncementKind,
  type AnnouncementMeeting,
  type AnnouncementUnread,
} from '../../../lib/api';
import { firstLine, moved, nextMeeting } from '../../../lib/announcements';
import { addDays, formatDateISO, parseISODate, startOfWeekMonday } from '../../../lib/dates';
import { formatWeekRange } from '../../../lib/week-range';
import { failsScreen } from '../../../lib/screen-failure';
import { reportSuccess } from '../../../lib/error-bus';
import { BRAND } from '../../../lib/header';

/** «Среда», not «среда», at the head of a card. */
const capital = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Two columns of meetings from this width. */
const TWO_COLUMNS_FROM = 900;

/**
 * «Объявления» — the writers' screen (R-01, 24 November 2026).
 *
 * One week at a time, as the coordinator thinks of it: the week's meetings,
 * each with who reads and the list in its order; under each, «Добавить».
 * Above them, what was left unread at a meeting already held — moved on with
 * one tap, or let go. Nothing moves by itself.
 */
export default function AnnouncementsScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const thisMonday = formatDateISO(startOfWeekMonday(new Date()));
  const [offset, setOffset] = useState(0);
  const monday = formatDateISO(addDays(parseISODate(thisMonday), 7 * offset));

  // The page's week and the next one: «на ближайшую встречу» may lie there.
  const q = useQuery({
    throwOnError: failsScreen,
    queryKey: ['announcements', 'weeks', monday],
    queryFn: () => announcementsApi.weeks(monday, 2),
  });
  const nowQ = useQuery({
    queryKey: ['announcements', 'weeks', thisMonday],
    queryFn: () => announcementsApi.weeks(thisMonday, 2),
    enabled: offset !== 0,
  });
  // What the app suggests for this week, and which taken texts went stale (R-09).
  const sugQ = useQuery({
    queryKey: ['announcements', 'suggestions', monday],
    queryFn: () => announcementsApi.suggestions(monday),
    retry: false,
  });
  const stale = new Map((sugQ.data?.stale ?? []).map((x) => [x.announcementId, x.reason]));
  const current = offset === 0 ? q.data : nowQ.data;
  const week = q.data?.weeks[0] ?? null;
  const today = q.data?.today ?? thisMonday;
  const target = current ? nextMeeting(current.weeks, today) : null;

  const [editor, setEditor] = useState<{
    kind: AnnouncementKind | null;
    editing: (Announcement & { kind: AnnouncementKind }) | null;
  } | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['announcements'] });
  const orderMut = useMutation({
    mutationFn: (v: { kind: AnnouncementKind; ids: string[] }) => announcementsApi.order(monday, v.kind, v.ids),
    onSettled: refresh,
  });
  const carryMut = useMutation({
    mutationFn: (v: { a: AnnouncementUnread; to: AnnouncementMeeting }) =>
      announcementsApi.carry(v.a.id, v.to.weekStartDate, v.to.kind),
    onSuccess: () => reportSuccess(t('announcements.unread.carried')),
    onSettled: refresh,
  });
  const dismissMut = useMutation({
    mutationFn: (id: string) => announcementsApi.dismiss(id),
    onSettled: refresh,
  });

  const dayLong = (iso: string) =>
    parseISODate(iso).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });
  const dayShort = (m: AnnouncementMeeting) =>
    m.date
      ? parseISODate(m.date).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '')
      : t(`announcements.kind.${m.kind}`);

  const unread = q.data?.unread ?? [];
  const twoColumns = width >= TWO_COLUMNS_FROM;

  const meetingCard = (m: AnnouncementMeeting) => {
    const ids = m.items.map((i) => i.id);
    const d = m.date ? parseISODate(m.date) : null;
    return (
      <View key={m.kind} style={[s.card, twoColumns && s.cardHalf]}>
        <View style={s.meetHead}>
          <View style={s.dateBox}>
            <Text style={s.dateDay}>{d ? d.getDate() : '—'}</Text>
            <Text style={s.dateMonth}>
              {d ? d.toLocaleDateString(lang, { month: 'short' }).replace('.', '').toUpperCase() : ''}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.meetTitle}>
              {d ? capital(d.toLocaleDateString(lang, { weekday: 'long' })) : ''} · {t(`announcements.kind.${m.kind}`)}
            </Text>
            <Text style={s.meetSub}>
              {[m.time, t(`announcements.where.${m.kind}`)].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>

        <View style={s.chairRow}>
          <Ionicons name="person-circle-outline" size={22} color={BRAND} />
          <Text style={s.chairText} numberOfLines={1}>
            {m.chairman
              ? t('announcements.chairman', { name: `${m.chairman.firstName} ${m.chairman.lastName}` })
              : t('announcements.noChairman')}
          </Text>
          {m.chairman && !m.chairman.published ? (
            <Text style={s.draftTag}>{t('announcements.notPublished')}</Text>
          ) : null}
        </View>

        {m.items.length === 0 ? (
          <Text style={s.emptyBox}>{t('announcements.emptyMeeting')}</Text>
        ) : (
          <View>
            {m.items.map((a, i) => (
              <View key={a.id} style={[s.item, i > 0 && s.itemLine]}>
                <View style={[s.itemNum, a.read && s.itemNumRead]}>
                  <Text style={s.itemNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 8 }}>
                <Pressable
                  style={{ gap: 6 }}
                  onPress={() => setEditor({ kind: m.kind, editing: { ...a, kind: m.kind } })}
                  accessibilityRole="button"
                  accessibilityHint={t('announcements.editHint')}
                >
                  <Text style={[s.itemText, a.isLetter && s.itemLetter]} numberOfLines={a.isLetter ? 2 : 6}>
                    {a.isLetter ? firstLine(a.text) : a.text}
                  </Text>
                  <View style={s.tags}>
                    {a.byRule ? <Text style={[s.tag, s.tagRule]}>{t('announcements.tag.byRule')}</Text> : null}
                    {a.isLetter ? <Text style={s.tag}>{t('announcements.tag.letter')}</Text> : null}
                    {a.carriedFrom ? (
                      <Text style={[s.tag, s.tagWarm]}>
                        {t('announcements.tag.carried', { date: dayMonth(a.carriedFrom, lang) })}
                      </Text>
                    ) : null}
                    {a.read ? <Text style={[s.tag, s.tagRead]}>{t('announcements.tag.read')}</Text> : null}
                  </View>
                </Pressable>
                {stale.has(a.id) ? <StaleMark id={a.id} reason={stale.get(a.id)!} /> : null}
                </View>
                {m.items.length > 1 ? (
                  <View style={s.orderBtns}>
                    <Pressable
                      disabled={i === 0 || orderMut.isPending}
                      onPress={() => orderMut.mutate({ kind: m.kind, ids: moved(ids, a.id, -1) })}
                      style={[s.orderBtn, i === 0 && s.orderOff]}
                      accessibilityRole="button"
                      accessibilityLabel={t('announcements.up')}
                    >
                      <Ionicons name="chevron-up" size={18} color="#334155" />
                    </Pressable>
                    <Pressable
                      disabled={i === m.items.length - 1 || orderMut.isPending}
                      onPress={() => orderMut.mutate({ kind: m.kind, ids: moved(ids, a.id, 1) })}
                      style={[s.orderBtn, i === m.items.length - 1 && s.orderOff]}
                      accessibilityRole="button"
                      accessibilityLabel={t('announcements.down')}
                    >
                      <Ionicons name="chevron-down" size={18} color="#334155" />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <Pressable
          style={s.addBtn}
          onPress={() => setEditor({ kind: m.kind, editing: null })}
          accessibilityRole="button"
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={s.addText}>{t('announcements.addFor', { day: dayShort(m) })}</Text>
        </Pressable>
      </View>
    );
  };

  const weekTitle = useMemo(() => formatWeekRange(parseISODate(monday), lang), [monday, lang]);

  return (
    <View style={s.container}>
      <KeyboardScroll
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}
      >
        <View style={s.frame}>
          <View style={s.weekHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.lbl}>
                {offset === 0
                  ? t('announcements.thisWeek')
                  : offset === 1
                    ? t('announcements.nextWeek')
                    : t('announcements.otherWeek')}
              </Text>
              <Text style={s.weekTitle}>{weekTitle}</Text>
            </View>
            <Pressable
              style={[s.navBtn, offset <= 0 && s.orderOff]}
              disabled={offset <= 0}
              onPress={() => setOffset((o) => Math.max(0, o - 1))}
              accessibilityRole="button"
              accessibilityLabel={t('announcements.prevWeek')}
            >
              <Ionicons name="chevron-back" size={22} color="#334155" />
            </Pressable>
            <Pressable
              style={s.navBtn}
              onPress={() => setOffset((o) => o + 1)}
              accessibilityRole="button"
              accessibilityLabel={t('announcements.nextWeekBtn')}
            >
              <Ionicons name="chevron-forward" size={22} color="#334155" />
            </Pressable>
          </View>

          {unread.map((a) => (
            <View key={a.id} style={s.unread}>
              <View style={s.unreadHead}>
                <View style={s.unreadDot} />
                <Text style={s.unreadTitle}>{t('announcements.unread.title', { day: dayLong(a.date) })}</Text>
              </View>
              <Text style={s.unreadText} numberOfLines={3}>
                {a.isLetter ? firstLine(a.text) : a.text}
              </Text>
              <View style={s.unreadBtns}>
                {target ? (
                  <Pressable
                    style={s.unreadMain}
                    disabled={carryMut.isPending}
                    onPress={() => carryMut.mutate({ a, to: target })}
                    accessibilityRole="button"
                  >
                    <Text style={s.unreadMainText}>{t('announcements.unread.to', { day: dayShort(target) })}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  style={s.unreadOther}
                  disabled={dismissMut.isPending}
                  onPress={() => dismissMut.mutate(a.id)}
                  accessibilityRole="button"
                >
                  <Text style={s.unreadOtherText}>{t('announcements.unread.dismiss')}</Text>
                </Pressable>
              </View>
            </View>
          ))}

          {week?.meetingsHeld !== false ? <SuggestionsCard data={sugQ.data} /> : null}

          {q.isLoading || !week ? (
            <ActivityIndicator size="large" style={{ marginTop: 32 }} />
          ) : (
            <>
              {!week.meetingsHeld ? (
                <View style={s.card}>
                  <Text style={s.meetTitle}>{t('announcements.noMeetings')}</Text>
                  <Text style={s.meetSub}>{t('announcements.noMeetingsSub')}</Text>
                </View>
              ) : null}
              <View style={twoColumns ? s.columns : { gap: 14 }}>{week.meetings.map(meetingCard)}</View>
              {week.unplaced.length ? (
                <View style={s.card}>
                  <Text style={s.meetTitle}>{t('announcements.unplaced')}</Text>
                  {week.unplaced.map((a) => (
                    <Text key={a.id} style={s.itemText} numberOfLines={3}>
                      {a.isLetter ? firstLine(a.text) : a.text}
                    </Text>
                  ))}
                  <Text style={s.meetSub}>{t('announcements.unplacedSub')}</Text>
                </View>
              ) : null}
              <Text style={s.foot}>{t('announcements.foot')}</Text>
            </>
          )}
        </View>
      </KeyboardScroll>

      {week ? (
        <Editor
          visible={!!editor}
          onClose={() => setEditor(null)}
          week={monday}
          meetings={week.meetings}
          initialKind={editor?.kind ?? null}
          editing={editor?.editing ?? null}
          dayLabel={dayShort}
        />
      ) : null}
    </View>
  );
}

const card = {
  backgroundColor: '#fff',
  borderRadius: 22,
  padding: 16,
  gap: 14,
  shadowColor: '#0f172a',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f5f8' },
  content: { padding: 12, paddingBottom: 48 },
  frame: { width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 14 },
  weekHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 4, paddingTop: 8 },
  lbl: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#475569' },
  weekTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 26, color: '#0f172a', letterSpacing: -0.4 },
  navBtn: { ...card, padding: 0, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  card,
  cardHalf: { flex: 1, minWidth: 0 },
  columns: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  meetHead: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dateBox: { width: 52, height: 56, borderRadius: 14, backgroundColor: '#fff4e0', alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontFamily: 'Manrope_800ExtraBold', fontSize: 22, color: '#7c4a03', lineHeight: 24 },
  dateMonth: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, color: '#7c4a03' },
  meetTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 17, color: '#0f172a' },
  meetSub: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#475569', lineHeight: 19 },
  chairRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 14, backgroundColor: '#f6f8fb' },
  chairText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#0f172a' },
  draftTag: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#92400e', backgroundColor: '#fef3c7', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  emptyBox: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#475569', textAlign: 'center', padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#cbd5e1' },
  item: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    alignItems: 'flex-start',
    borderRadius: 16,
    backgroundColor: '#f6f8fb',
    marginTop: 8,
  },
  itemLine: {},
  itemNum: { width: 30, height: 30, borderRadius: 15, backgroundColor: ANN.fg, alignItems: 'center', justifyContent: 'center' },
  itemNumRead: { backgroundColor: '#15803d' },
  itemNumText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: '#fff' },
  itemText: { fontFamily: 'Manrope_500Medium', fontSize: 15, lineHeight: 22, color: '#0f172a' },
  itemLetter: { fontFamily: 'Manrope_700Bold' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: ANN.fg, backgroundColor: ANN.bg, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  tagWarm: { color: '#9a3412', backgroundColor: '#fff7ed' },
  tagRead: { color: '#166534', backgroundColor: '#e7f6ec' },
  tagRule: { color: '#78350f', backgroundColor: '#fef3c7' },
  orderBtns: { gap: 4 },
  orderBtn: { width: 44, height: 40, borderRadius: 10, backgroundColor: '#f1f4f8', alignItems: 'center', justifyContent: 'center' },
  orderOff: { opacity: 0.35 },
  addBtn: { flexDirection: 'row', gap: 6, minHeight: 50, borderRadius: 14, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  addText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  unread: { borderRadius: 18, backgroundColor: '#fff7e6', borderWidth: 1, borderColor: '#f6d58e', padding: 14, gap: 10 },
  unreadHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#d97706' },
  unreadTitle: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: '#7c2d12' },
  unreadText: { fontFamily: 'Manrope_500Medium', fontSize: 15, lineHeight: 22, color: '#431407' },
  unreadBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  unreadMain: { flexGrow: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#9a3412', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  unreadMainText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  unreadOther: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#f6d58e', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  unreadOtherText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#7c2d12' },
  foot: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569', lineHeight: 19, paddingHorizontal: 4 },
});
