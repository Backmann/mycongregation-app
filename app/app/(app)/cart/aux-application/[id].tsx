import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  auxApplicationsApi,
  type AuxApplicationView,
  type AuxSeatView,
  type CommitteeSeat,
} from '../../../../lib/api';
import { failsScreen } from '../../../../lib/screen-failure';
import { LoadFailure } from '../../../../components/LoadFailure';
import { Dialog } from '../../../../components/Dialog';
import { cardStyles, Chip, INK, MUTED, BRAND } from '../../../../components/reports/ReportBits';
import { capitalize, monthGoals, monthName } from '../../../../lib/aux-application';

/**
 * AN APPLICATION, FOR THE COMMITTEE (29 October 2026).
 *
 * The three places, one under another: who answered and when, whose answer
 * is awaited, which is open to another elder and why. The reader's own
 * action is the one big button; passing his place on and taking the
 * application back quietly are small, and both ask first. The form's
 * questions for the committee are a reminder — nothing is answered here
 * but «Одобряю».
 */
export default function AuxApplicationScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({
    queryKey: ['aux-applications', 'one', id],
    queryFn: () => auxApplicationsApi.get(id),
    throwOnError: failsScreen,
    enabled: !!id,
  });
  const [ask, setAsk] = useState<null | 'pass' | 'withdraw' | { open: CommitteeSeat }>(null);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['aux-applications'] });
    void qc.invalidateQueries({ queryKey: ['me', 'pending'] });
    void qc.invalidateQueries({ queryKey: ['aux-pioneers'] });
  };
  const act = useMutation({
    mutationFn: async (
      a:
        | { kind: 'approve'; seat?: CommitteeSeat }
        | { kind: 'pass' }
        | { kind: 'open'; seat: CommitteeSeat }
        | { kind: 'withdraw' },
    ) => {
      if (a.kind === 'approve') return auxApplicationsApi.approve(id, a.seat);
      if (a.kind === 'pass') return auxApplicationsApi.pass(id);
      if (a.kind === 'open') return auxApplicationsApi.openSeat(id, a.seat);
      await auxApplicationsApi.withdraw(id);
      return null;
    },
    onSuccess: (res) => {
      setAsk(null);
      refresh();
      if (res === null) router.back();
      else qc.setQueryData(['aux-applications', 'one', id], res);
    },
  });

  if (q.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error || !q.data) {
    return (
      <View style={styles.centre}>
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} />
      </View>
    );
  }
  const a: AuxApplicationView = q.data;
  const seatName = (s: CommitteeSeat) => t(`auxApp.seat.${s}`);
  const approvedCount = a.seats.filter((s) => s.approved).length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={[cardStyles.card, a.status === 'approved' && cardStyles.done]}>
        <View style={styles.top}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {a.publisherName
                .split(' ')
                .map((x) => x[0])
                .slice(0, 2)
                .join('')}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{a.publisherName}</Text>
            <Text style={styles.sub}>
              {[
                a.groupName,
                a.source === 'paper'
                  ? t('auxApp.view.paper', {
                      date: a.paperDate
                        ? new Date(`${a.paperDate}T12:00:00`).toLocaleDateString(lang, {
                            day: 'numeric',
                            month: 'long',
                          })
                        : '—',
                    })
                  : t('auxApp.view.sent', {
                      date: new Date(a.createdAt).toLocaleDateString(lang, {
                        day: 'numeric',
                        month: 'long',
                      }),
                    }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          {a.status === 'approved' ? (
            <Chip tone="green" text={t('auxApp.view.approved')} />
          ) : (
            <Chip tone="amber" text={t('auxApp.view.ofThree', { n: approvedCount })} />
          )}
        </View>
        <View style={{ marginTop: 12 }}>
          {a.untilCancelled ? (
            <Text style={styles.goal}>
              {t('auxApp.my.fromUntilCancelled', { month: monthName(a.months[0], lang) })}
            </Text>
          ) : (
            monthGoals(a.months, a.reducedMonths, lang).map((g) => (
              <Text key={g.month} style={styles.goal}>
                {t('auxApp.my.monthGoal', { month: g.label, n: g.hours })}
              </Text>
            ))
          )}
        </View>
      </View>

      <View style={[cardStyles.card, { paddingVertical: 4 }]}>
        {a.seats.map((s, i) => (
          <Seat key={s.seat} s={s} first={i === 0} name={seatName(s.seat)} lang={lang} />
        ))}
      </View>

      {a.status === 'pending' ? (
        <View style={styles.memo}>
          <Text style={styles.memoHead}>{t('auxApp.view.questionsTitle')}</Text>
          <Text style={styles.memoText}>{t('auxApp.view.questions')}</Text>
        </View>
      ) : null}

      {a.can.approveSeat ? (
        <Pressable
          style={styles.btn}
          onPress={() => act.mutate({ kind: 'approve' })}
          disabled={act.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>{t('auxApp.view.approve')}</Text>
        </Pressable>
      ) : null}
      {a.can.approveOpenSeats.map((s) => (
        <Pressable
          key={s}
          style={styles.btn}
          onPress={() => act.mutate({ kind: 'approve', seat: s })}
          disabled={act.isPending}
          accessibilityRole="button"
        >
          <Text style={styles.btnText}>
            {t('auxApp.view.approveInstead', { seat: seatName(s) })}
          </Text>
        </Pressable>
      ))}
      {a.can.openSeats.map((s) => (
        <Pressable
          key={s}
          style={styles.ghost}
          onPress={() => setAsk({ open: s })}
          accessibilityRole="button"
        >
          <Text style={styles.ghostText}>{t('auxApp.view.openSeat', { seat: seatName(s) })}</Text>
        </Pressable>
      ))}
      {a.can.pass || a.can.withdraw ? (
        <View style={styles.links}>
          {a.can.pass ? (
            <Pressable onPress={() => setAsk('pass')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>{t('auxApp.view.pass')}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          {a.can.withdraw ? (
            <Pressable onPress={() => setAsk('withdraw')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.link}>{t('auxApp.view.withdraw')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Dialog
        visible={ask !== null}
        title={
          ask === 'pass'
            ? t('auxApp.view.passTitle')
            : ask === 'withdraw'
              ? t('auxApp.view.withdrawTitle')
              : t('auxApp.view.openTitle')
        }
        icon={ask === 'withdraw' ? 'arrow-undo-outline' : 'people-outline'}
        cancelLabel={t('common.cancel')}
        confirmLabel={
          ask === 'pass'
            ? t('auxApp.view.passConfirm')
            : ask === 'withdraw'
              ? t('auxApp.view.withdrawConfirm')
              : t('auxApp.view.openConfirm')
        }
        confirmDanger={ask === 'withdraw'}
        pending={act.isPending}
        onConfirm={() => {
          if (ask === 'pass') act.mutate({ kind: 'pass' });
          else if (ask === 'withdraw') act.mutate({ kind: 'withdraw' });
          else if (ask) act.mutate({ kind: 'open', seat: ask.open });
        }}
        onCancel={() => setAsk(null)}
      >
        <Text style={styles.dialogText}>
          {ask === 'pass'
            ? t('auxApp.view.passText')
            : ask === 'withdraw'
              ? t('auxApp.view.withdrawText')
              : ask
                ? t('auxApp.view.openText', { seat: seatName(ask.open) })
                : ''}
        </Text>
      </Dialog>
    </ScrollView>
  );
}

function Seat({
  s,
  first,
  name,
  lang,
}: {
  s: AuxSeatView;
  first: boolean;
  name: string;
  lang: string;
}) {
  const { t } = useTranslation();
  const day = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(lang, { day: 'numeric', month: 'long' }) : '';
  const holder = s.holders.map((h) => h.name).join(', ') || '—';
  let icon: keyof typeof Ionicons.glyphMap = 'ellipsis-horizontal';
  let tone = TONE.wait;
  let title = name;
  let sub = '';
  if (s.approved) {
    icon = 'checkmark';
    tone = TONE.ok;
    title = s.open ? t('auxApp.view.instead', { seat: name }) : name;
    sub = t('auxApp.view.approvedBy', { name: s.approverName ?? '—', date: day(s.approvedAt) });
  } else if (s.open) {
    icon = s.unfillable ? 'remove' : 'ellipse-outline';
    tone = TONE.open;
    // Not answered yet: the place keeps its own name; who answers there is
    // said once someone has.
    sub = t(`auxApp.view.open.${s.openReason ?? 'opened'}`, { name: holder, date: day(s.openedAt) });
    if (s.unfillable) sub = `${sub}\n${t('auxApp.view.unfillable')}`;
  } else {
    sub = t('auxApp.view.waiting', { name: holder });
  }
  return (
    <View style={[styles.seat, !first && styles.seatBorder]}>
      <View style={[styles.ic, { backgroundColor: tone.bg }]}>
        <Ionicons name={icon} size={15} color={tone.fg} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.seatTitle}>{capitalize(title)}</Text>
        <Text style={styles.seatSub}>{sub}</Text>
      </View>
    </View>
  );
}

const TONE = {
  ok: { bg: '#dcfce7', fg: '#047857' },
  wait: { bg: '#fef3c7', fg: '#92400e' },
  open: { bg: '#e0f2fe', fg: '#0369a1' },
};

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 14, paddingBottom: 40 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: 'Manrope_800ExtraBold', color: '#0369a1', fontSize: 14 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 18, color: INK },
  sub: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: MUTED, marginTop: 2 },
  goal: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK, marginTop: 3 },
  seat: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  seatBorder: { borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  ic: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  seatTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  seatSub: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: MUTED, marginTop: 1 },
  memo: { backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, marginBottom: 4 },
  memoHead: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12.5, color: '#334155' },
  memoText: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: MUTED, marginTop: 3, lineHeight: 18 },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnText: { color: '#fff', fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },
  ghost: {
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#fff',
  },
  ghostText: { color: BRAND, fontFamily: 'Manrope_800ExtraBold', fontSize: 14 },
  links: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 6 },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#94a3b8' },
  dialogText: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#334155', lineHeight: 20 },
});
