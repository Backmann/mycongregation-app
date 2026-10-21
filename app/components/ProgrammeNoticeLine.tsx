import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  assignmentsApi,
  extractErrorMessage,
  NoticeStatus,
  PendingNoticeRow,
} from '../lib/api';
import { formatDateISO } from '../lib/dates';
import { reportError } from '../lib/error-bus';

/**
 * THE LINE THAT TOOK THE «УВЕДОМИТЬ» BUTTON'S PLACE (21 October 2026).
 *
 * An edit of a published meeting is said by the server itself — ten minutes
 * after the last edit, a minute when the meeting is near, at 18:00 when held
 * for the evening, never at night (server: assignments/programme-notice). The
 * card only says when, and to whom, and offers the two choices that are worth
 * having: now, or this evening. Whoever nothing can reach is named in amber,
 * so that the editor tells them in person.
 *
 * After the sending, «Сообщено в 11:46 · names» stays until the day is over.
 */
export function ProgrammeNoticeLine({
  weekStartDate,
  eventType,
  changed,
}: {
  weekStartDate: string;
  eventType: 'midweek' | 'weekend';
  /**
   * What the screen knows of the marks: their number and the latest edit.
   * A change of it asks the server again — every edit restarts the wait.
   */
  changed: string;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'now' | 'evening' | null>(null);
  const key = ['notice-status', weekStartDate, eventType, changed];
  const status = useQuery({
    queryKey: key,
    queryFn: () => assignmentsApi.noticeStatus({ weekStartDate, eventType }),
    staleTime: 0,
    refetchInterval: (q) => {
      const s = q.state.data?.state;
      return s === 'pending' || s === 'evening' ? 30_000 : false;
    },
  });
  const data = status.data;

  // The minutes count down on screen; when the time has come, the server is
  // asked again — and the programme, whose «ещё не сообщено» marks are gone.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (data?.state !== 'pending' && data?.state !== 'evening') return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [data?.state]);
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!data?.dueAt || data.state === 'evening') return;
    const due = Date.parse(data.dueAt);
    if (now < due + 20_000 || asked.current === data.dueAt) return;
    asked.current = data.dueAt;
    void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    void status.refetch();
  }, [now, data?.dueAt, data?.state, queryClient, status]);

  if (!data || data.state === 'none') return null;

  const refresh = async (next?: NoticeStatus) => {
    if (next) queryClient.setQueryData(key, next);
    await queryClient.invalidateQueries({ queryKey: ['assignments'] });
    await queryClient.invalidateQueries({ queryKey: ['notice-status', weekStartDate, eventType] });
  };
  const sendNow = async () => {
    setBusy('now');
    try {
      await assignmentsApi.notifyChanges({ weekStartDate, eventType });
      await refresh();
    } catch (e) {
      reportError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const evening = async () => {
    setBusy('evening');
    try {
      await refresh(await assignmentsApi.noticeLater({ weekStartDate, eventType }));
    } catch (e) {
      reportError(extractErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const hhmm = (iso: string) => dayjs(iso).format('HH:mm');

  if (data.state === 'sent') {
    const at = data.sentAt ?? '';
    // Pressed at night, it waits for the morning: «Уйдёт в 08:00».
    const future = !!data.sentNames && Date.parse(at) > Date.now() + 60_000;
    const time = hhmm(at);
    return (
      <View style={s.sent}>
        <Ionicons
          name={future ? 'time-outline' : 'checkmark'}
          size={16}
          color={future ? '#0e7490' : '#15803d'}
        />
        <Text style={[s.sentText, future && s.sentTextFuture]}>
          {data.sentNames
            ? t(future ? 'schedule.notice.goesAt' : 'schedule.notice.sentAt', {
                time,
                names: data.sentNames,
              })
            : t('schedule.notice.sentNobody', { time })}
        </Text>
      </View>
    );
  }

  const reached = data.rows.filter((r) => r.reach !== 'none');
  const unreached = data.rows.filter((r) => r.reach === 'none');
  const who = (r: PendingNoticeRow) =>
    t(`schedule.notice.row.${r.tone}`, { name: r.displayName, label: r.label }) +
    (r.reach === 'email' ? t('schedule.notice.byEmail') : '');

  const due = data.dueAt ? Date.parse(data.dueAt) : now;
  const mins = Math.max(0, Math.ceil((due - now) / 60_000));
  const sameDay = formatDateISO(new Date(due)) === formatDateISO(new Date(now));
  const tone = data.state === 'evening' ? 'evening' : data.soon ? 'soon' : 'pending';
  const headline =
    tone === 'evening'
      ? t('schedule.notice.evening', { time: hhmm(data.dueAt ?? '') })
      : mins === 0
        ? t('schedule.notice.goingNow')
        : tone === 'soon'
          ? t('schedule.notice.soon', { count: mins })
          : sameDay
            ? t('schedule.notice.pending', { time: hhmm(data.dueAt ?? ''), count: mins })
            : t('schedule.notice.pendingTomorrow', { time: hhmm(data.dueAt ?? '') });
  const c = COLORS[tone];

  return (
    <View>
      <View style={[s.box, { backgroundColor: c.bg, borderColor: c.border }]}>
        <View style={s.head}>
          <Ionicons
            name={tone === 'evening' ? 'moon-outline' : 'time-outline'}
            size={18}
            color={c.strong}
          />
          <Text style={[s.headline, { color: c.strong }]}>{headline}</Text>
        </View>
        {reached.length > 0 ? (
          <Text style={[s.body, { color: c.text }]}>
            {t('schedule.notice.who', {
              count: reached.length,
              list: reached.map(who).join('; '),
            })}
          </Text>
        ) : (
          <Text style={[s.body, { color: c.text }]}>{t('schedule.notice.nobody')}</Text>
        )}
        <View style={s.buttons}>
          <Pressable
            onPress={sendNow}
            disabled={!!busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              s.btn,
              tone === 'evening'
                ? s.btnQuiet
                : { backgroundColor: c.strong, borderColor: c.strong },
              (pressed || !!busy) && s.pressed,
            ]}
          >
            {busy === 'now' ? (
              <ActivityIndicator size="small" color={tone === 'evening' ? '#0f172a' : '#ffffff'} />
            ) : (
              <Text style={[s.btnText, tone === 'evening' ? s.btnTextQuiet : s.btnTextSolid]}>
                {t('schedule.notice.sendNow')}
              </Text>
            )}
          </Pressable>
          {tone === 'pending' && data.eveningAt ? (
            <Pressable
              onPress={evening}
              disabled={!!busy}
              accessibilityRole="button"
              style={({ pressed }) => [
                s.btn,
                { backgroundColor: '#ffffff', borderColor: c.border },
                (pressed || !!busy) && s.pressed,
              ]}
            >
              {busy === 'evening' ? (
                <ActivityIndicator size="small" color={c.strong} />
              ) : (
                <Text style={[s.btnText, { color: c.strong }]}>
                  {t('schedule.notice.sendEvening')}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
        {tone === 'pending' ? (
          <Text style={[s.hint, { color: c.text }]}>{t('schedule.notice.hint')}</Text>
        ) : null}
      </View>
      {unreached.map((r, i) => (
        <View key={`${r.publisherId}:${i}`} style={s.unreached}>
          <Ionicons name="call-outline" size={16} color="#b45309" style={s.unreachedIcon} />
          <Text style={s.unreachedText}>
            <Text style={s.unreachedName}>{r.displayName}</Text>
            {t('schedule.notice.unreached', { label: r.label })}
          </Text>
        </View>
      ))}
    </View>
  );
}

const COLORS = {
  pending: { bg: '#ecfeff', border: '#a5f3fc', strong: '#0e7490', text: '#155e75' },
  evening: { bg: '#f8fafc', border: '#e2e8f0', strong: '#334155', text: '#475569' },
  soon: { bg: '#fff7ed', border: '#fed7aa', strong: '#c2410c', text: '#7c2d12' },
} as const;

const s = StyleSheet.create({
  box: {
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { flex: 1, fontSize: 14, fontFamily: 'Manrope_700Bold' },
  body: { fontSize: 13, lineHeight: 19, marginTop: 6, fontFamily: 'Manrope_500Medium' },
  buttons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnQuiet: { backgroundColor: '#ffffff', borderColor: '#cbd5e1' },
  btnText: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  btnTextSolid: { color: '#ffffff' },
  btnTextQuiet: { color: '#0f172a' },
  pressed: { opacity: 0.7 },
  hint: { fontSize: 12, marginTop: 8, fontFamily: 'Manrope_500Medium' },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 12,
  },
  sentText: { flex: 1, fontSize: 13, color: '#15803d', fontFamily: 'Manrope_600SemiBold' },
  sentTextFuture: { color: '#0e7490' },
  unreached: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  unreachedIcon: { marginTop: 1 },
  unreachedText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: '#78350f',
    fontFamily: 'Manrope_500Medium',
  },
  unreachedName: { fontFamily: 'Manrope_700Bold' },
});
