import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  extractErrorMessage,
  notHeldApi,
  NotHeldMeeting,
  NotHeldRestorable,
} from '../lib/api';

/**
 * Assignments on a meeting that is not held (8 November 2026).
 *
 * A convention, the Memorial or an event «instead of the meeting» takes the
 * meeting away while its parts and duties stay. The programme hid them, so
 * nobody could see or take them off. This card shows them for one week —
 * only to whoever may edit that meeting (the server filters) — takes them
 * off quietly, and gives them back: at once («Вернуть» after taking off),
 * or later when the event has moved and the meeting is held again.
 *
 * `scope="duties"` is the duties screens' view: the duties only.
 */
export const NOT_HELD_KEY = ['not-held'] as const;

export function useNotHeld(enabled = true) {
  return useQuery({ queryKey: NOT_HELD_KEY, queryFn: () => notHeldApi.view(), enabled });
}

type Scope = 'programme' | 'duties';

function shown(m: NotHeldMeeting, scope: Scope) {
  const parts = scope === 'programme' && m.canParts ? m.parts : [];
  const duties = m.canDuties ? m.duties : [];
  return { parts, duties, count: parts.length + duties.length };
}

export function NotHeldCard({
  week,
  scope = 'programme',
  kind,
}: {
  week: string;
  scope?: Scope;
  /** Only this meeting of the week (a duties card of one meeting). */
  kind?: 'midweek' | 'weekend';
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const q = useNotHeld();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [undo, setUndo] = useState<{ ids: string[]; count: number } | null>(null);
  const [skipped, setSkipped] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: NOT_HELD_KEY });
    void qc.invalidateQueries({ queryKey: ['assignments'] });
    void qc.invalidateQueries({ queryKey: ['duties'] });
    void qc.invalidateQueries({ queryKey: ['readiness'] });
  };

  const clear = useMutation({
    mutationFn: async (meetings: NotHeldMeeting[]) => {
      const ids: string[] = [];
      let count = 0;
      for (const m of meetings) {
        const s = shown(m, scope);
        const r = await notHeldApi.clear({
          weekStartDate: m.weekStartDate,
          eventType: m.eventType,
          parts: s.parts.length > 0,
          duties: s.duties.length > 0,
        });
        ids.push(r.clearanceId);
        count += r.parts + r.duties;
      }
      return { ids, count };
    },
    onSuccess: (r) => {
      setError(null);
      setSkipped(null);
      setUndo(r);
      refresh();
    },
    onError: (e) => {
      setError(extractErrorMessage(e));
      refresh();
    },
  });

  const restore = useMutation({
    mutationFn: async (ids: string[]) => {
      const skippedNames: string[] = [];
      for (const id of ids) {
        const r = await notHeldApi.restore(id);
        skippedNames.push(...r.skipped);
      }
      return skippedNames;
    },
    onSuccess: (names) => {
      setError(null);
      setUndo(null);
      setSkipped(names);
      refresh();
    },
    onError: (e) => {
      setError(extractErrorMessage(e));
      refresh();
    },
  });

  const lang = i18n.language;
  const meetings = (q.data?.meetings ?? [])
    .filter((m) => m.weekStartDate === week && (!kind || m.eventType === kind))
    .filter((m) => shown(m, scope).count > 0);
  // A record gives back all it took: on the duties screens only those that
  // took duties alone, or a duties coordinator would give back parts too.
  const ours = (q.data?.restorable ?? []).filter(
    (r) =>
      r.weekStartDate === week &&
      (!kind || r.eventType === kind) &&
      (scope === 'programme' || (r.duties > 0 && r.parts === 0)) &&
      !undo?.ids.includes(r.clearanceId),
  );
  const back: NotHeldRestorable[] = ours.filter((r) => r.heldAgain);
  // Taken off earlier and the meeting is still not held: the undo, kept.
  const later: NotHeldRestorable[] = ours.filter((r) => !r.heldAgain);
  const busy = clear.isPending || restore.isPending;

  if (
    meetings.length === 0 &&
    back.length === 0 &&
    later.length === 0 &&
    !undo &&
    !skipped?.length &&
    !error
  ) {
    return null;
  }

  const total = meetings.reduce((n, m) => n + shown(m, scope).count, 0);
  const meetingName = (m: NotHeldMeeting) =>
    t(`notHeld.meeting.${m.eventType}`, {
      day: m.date ? dayjs(m.date).locale(lang).format('dd D MMMM') : '',
    });
  const backTotal = back.reduce((n, r) => n + (scope === 'programme' ? r.parts : 0) + r.duties, 0);

  return (
    <View style={styles.wrap} testID="not-held-card">
      {meetings.length > 0 && (
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('notHeld.title', { count: total })}</Text>
            <Text style={styles.text}>{t('notHeld.lead')}</Text>
          </View>
          {meetings.map((m) => {
            const s = shown(m, scope);
            const key = `${m.weekStartDate}|${m.eventType}`;
            const expanded = !!open[key];
            const guest = s.parts.find((p) => p.guest);
            return (
              <View key={key}>
                <View style={styles.group}>
                  <Pressable
                    style={styles.groupName}
                    onPress={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    hitSlop={6}
                  >
                    <Ionicons
                      name={expanded ? 'chevron-down' : 'chevron-forward'}
                      size={18}
                      color="#64748b"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.groupTitle}>{meetingName(m)}</Text>
                      <Text style={styles.groupSub}>
                        {[
                          s.parts.length ? t('notHeld.parts', { count: s.parts.length }) : null,
                          s.duties.length ? t('notHeld.duties', { count: s.duties.length }) : null,
                          guest ? t('notHeld.guestShort') : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.btn, (pressed || busy) && styles.btnPressed]}
                    disabled={busy}
                    onPress={() => clear.mutate([m])}
                    accessibilityRole="button"
                    testID={`not-held-clear-${m.eventType}`}
                  >
                    <Text style={styles.btnText}>
                      {t('notHeld.clearN', { n: s.count })}
                    </Text>
                  </Pressable>
                </View>
                {expanded && (
                  <View style={styles.items}>
                    {s.parts.map((p) => (
                      <View key={p.id}>
                        <View style={styles.item}>
                          <Text style={styles.itemLabel}>{p.label}</Text>
                          <Text style={styles.itemWho} numberOfLines={2}>
                            {p.guest ?? (p.people.join(', ') || '—')}
                          </Text>
                        </View>
                        {p.guest ? <Text style={styles.guest}>{t('notHeld.guest')}</Text> : null}
                      </View>
                    ))}
                    {s.duties.map((d) => (
                      <View key={d.id} style={styles.item}>
                        <Text style={styles.itemLabel}>{d.label}</Text>
                        <Text style={styles.itemWho}>{d.person ?? '—'}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
          <View style={styles.foot}>
            <Text style={styles.footText}>{t('notHeld.canGiveBack')}</Text>
            {meetings.length > 1 && (
              <Pressable
                style={({ pressed }) => [styles.btn, (pressed || busy) && styles.btnPressed]}
                disabled={busy}
                onPress={() => clear.mutate(meetings)}
                accessibilityRole="button"
                testID="not-held-clear-all"
              >
                <Text style={styles.btnText}>{t('notHeld.clearAll', { n: total })}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {back.length > 0 && (
        <View style={[styles.card, styles.backCard]}>
          <View style={[styles.head, styles.backHead]}>
            <Text style={[styles.title, styles.backTitle]}>{t('notHeld.heldAgainTitle')}</Text>
            <Text style={[styles.text, styles.backTitle]}>
              {t('notHeld.heldAgainText', {
                n: backTotal,
                day: dayjs(back[0].clearedAt).locale(lang).format('D MMMM'),
              })}
            </Text>
          </View>
          <View style={styles.foot}>
            <Text style={styles.footText}>{t('notHeld.heldAgainHint')}</Text>
            <Pressable
              style={({ pressed }) => [styles.btn, styles.btnBack, (pressed || busy) && styles.btnPressed]}
              disabled={busy}
              onPress={() => restore.mutate(back.map((r) => r.clearanceId))}
              accessibilityRole="button"
              testID="not-held-restore"
            >
              <Text style={styles.btnText}>{t('notHeld.giveBack', { n: backTotal })}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {later.length > 0 && !undo && (
        <View style={styles.later} testID="not-held-later">
          <Text style={styles.laterText}>
            {t('notHeld.clearedOn', {
              day: dayjs(later[0].clearedAt).locale(lang).format('D MMMM'),
              n: later.reduce((n, r) => n + r.parts + r.duties, 0),
            })}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.laterBtn, (pressed || busy) && styles.btnPressed]}
            disabled={busy}
            onPress={() => restore.mutate(later.map((r) => r.clearanceId))}
            accessibilityRole="button"
            testID="not-held-later-restore"
          >
            <Text style={styles.laterBtnText}>{t('notHeld.undo')}</Text>
          </Pressable>
        </View>
      )}

      {busy && <ActivityIndicator style={{ marginTop: 8 }} />}

      {undo && !busy && (
        <View style={styles.toast} testID="not-held-undo">
          <Text style={styles.toastText}>{t('notHeld.cleared', { n: undo.count })}</Text>
          <Pressable
            onPress={() => restore.mutate(undo.ids)}
            accessibilityRole="button"
            hitSlop={8}
            style={styles.toastAction}
          >
            <Text style={styles.toastActionText}>{t('notHeld.undo')}</Text>
          </Pressable>
        </View>
      )}

      {skipped && skipped.length > 0 && (
        <Text style={styles.warn}>
          {t('notHeld.skipped', { names: skipped.join(', ') })}
        </Text>
      )}
      {error && <Text style={styles.warn}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 12, marginHorizontal: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#fcd9a8',
    overflow: 'hidden',
    marginBottom: 8,
  },
  head: { backgroundColor: '#fff7ed', paddingVertical: 12, paddingHorizontal: 14 },
  title: { fontSize: 15.5, fontFamily: 'Manrope_800ExtraBold', color: '#7c2d12' },
  text: {
    fontSize: 13.5,
    fontFamily: 'Manrope_500Medium',
    color: '#7c2d12',
    marginTop: 3,
    lineHeight: 19,
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    minHeight: 48,
  },
  groupName: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupTitle: { fontSize: 15, fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  groupSub: { fontSize: 13, fontFamily: 'Manrope_500Medium', color: '#475569', marginTop: 1 },
  btn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#b45309',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnBack: { backgroundColor: '#0e7490' },
  btnPressed: { opacity: 0.7 },
  btnText: { color: '#fff', fontFamily: 'Manrope_800ExtraBold', fontSize: 14 },
  items: { paddingBottom: 6 },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    paddingLeft: 40,
    paddingRight: 14,
  },
  itemLabel: { flex: 1, fontSize: 14, fontFamily: 'Manrope_500Medium', color: '#0f172a' },
  itemWho: {
    flexShrink: 1,
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
    color: '#0e7490',
    textAlign: 'right',
  },
  guest: {
    marginLeft: 40,
    marginRight: 14,
    marginBottom: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: 'Manrope_500Medium',
    color: '#1e3a8a',
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  footText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Manrope_500Medium',
    color: '#475569',
  },
  backCard: { borderColor: '#bae6fd' },
  backHead: { backgroundColor: '#f0f9ff' },
  backTitle: { color: '#0c4a6e' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    minHeight: 48,
  },
  toastText: { color: '#fff', fontSize: 14.5, fontFamily: 'Manrope_600SemiBold', flexShrink: 1 },
  toastAction: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  toastActionText: { color: '#7dd3fc', fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5 },
  later: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingLeft: 14,
    paddingRight: 6,
    minHeight: 52,
    marginBottom: 8,
  },
  laterText: { flex: 1, fontSize: 14, lineHeight: 19, fontFamily: 'Manrope_600SemiBold', color: '#334155' },
  laterBtn: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  laterBtnText: { color: '#0e7490', fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5 },
  warn: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: 'Manrope_600SemiBold',
    color: '#7c2d12',
    marginBottom: 8,
  },
});
