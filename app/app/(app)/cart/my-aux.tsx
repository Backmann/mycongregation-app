import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  auxApplicationsApi,
  auxiliaryPioneersApi,
  type MyAuxApplication,
} from '../../../lib/api';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { failsScreen } from '../../../lib/screen-failure';
import { LoadFailure } from '../../../components/LoadFailure';
import { Dialog } from '../../../components/Dialog';
import { MonthPlaque, Chip, cardStyles, INK, MUTED, BRAND } from '../../../components/reports/ReportBits';
import { capitalize, monthGoals, monthName, monthsLabel } from '../../../lib/aux-application';
import { formatDateISO } from '../../../lib/dates';

/**
 * «МОЁ ПОДСОБНОЕ СЛУЖЕНИЕ» — the publisher's own (29 October 2026).
 *
 * One thing at a time, the most pressing first: an application waiting, the
 * month he serves in now, or — when neither — an invitation to apply. Who
 * cannot apply (a permanent pioneer, an unbaptized publisher) is told why in
 * one line, not shown a button the server would refuse. Nothing here names
 * the brothers or says how they answered: «на рассмотрении» until it is
 * approved. A quietly withdrawn application simply is not here any more.
 */
export default function MyAuxScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { myPublisher } = useMyPublisher();
  const thisMonth = formatDateISO(new Date()).slice(0, 7);

  const appsQ = useQuery({
    queryKey: ['aux-applications', 'mine'],
    queryFn: () => auxApplicationsApi.mine(),
    throwOnError: failsScreen,
  });
  const servingQ = useQuery({
    queryKey: ['aux-pioneers', 'mine', `${thisMonth}-01`],
    queryFn: () => auxiliaryPioneersApi.mine(`${thisMonth}-01`),
  });
  const [takingBack, setTakingBack] = useState<MyAuxApplication | null>(null);
  const takeBack = useMutation({
    mutationFn: (id: string) => auxApplicationsApi.takeBack(id),
    onSuccess: () => {
      setTakingBack(null);
      void qc.invalidateQueries({ queryKey: ['aux-applications'] });
    },
  });

  if (appsQ.isLoading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (appsQ.error || !appsQ.data) {
    return (
      <View style={styles.centre}>
        <LoadFailure error={appsQ.error} onRetry={() => void appsQ.refetch()} />
      </View>
    );
  }

  const apps = appsQ.data.applications;
  const pending = apps.find((a) => a.status === 'pending') ?? null;
  const approved = apps.filter((a) => a.status === 'approved');
  const serving = servingQ.data;
  const unbaptized =
    myPublisher?.appointment === 'unbaptized_publisher' ||
    myPublisher?.appointment === 'student';
  const permanent = !!myPublisher?.pioneerType && myPublisher.pioneerType !== 'none';
  const openEnded = !!serving?.current?.untilCancelled;
  const canApply =
    !pending && !unbaptized && !permanent && !openEnded && appsQ.data.committeeComplete;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {pending ? (
        <View style={[cardStyles.card, cardStyles.due]}>
          <View style={styles.top}>
            <MonthPlaque month={pending.months[0]} tone="due" />
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>{t('auxApp.my.applicationKicker')}</Text>
              <Text style={styles.title}>{t('auxApp.my.pending')}</Text>
            </View>
          </View>
          <Goals app={pending} lang={lang} />
          <Text style={styles.quiet}>{t('auxApp.my.pendingText')}</Text>
          {!pending.answered ? (
            <View style={styles.two}>
              <Pressable
                style={[styles.ghost, { flex: 1 }]}
                onPress={() => router.push(`/cart/aux-apply?id=${pending.id}` as never)}
                accessibilityRole="button"
              >
                <Text style={styles.ghostText}>{t('auxApp.my.change')}</Text>
              </Pressable>
              <Pressable
                style={[styles.ghost, styles.ghostGrey, { flex: 1 }]}
                onPress={() => setTakingBack(pending)}
                accessibilityRole="button"
              >
                <Text style={[styles.ghostText, { color: MUTED }]}>{t('auxApp.my.takeBack')}</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={styles.small}>{t('auxApp.my.answered')}</Text>
              <Pressable
                style={[styles.ghost, styles.ghostGrey]}
                onPress={() => setTakingBack(pending)}
                accessibilityRole="button"
              >
                <Text style={[styles.ghostText, { color: MUTED }]}>{t('auxApp.my.takeBack')}</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {serving?.current ? (
        <View style={[cardStyles.card, cardStyles.done]}>
          <View style={styles.top}>
            <MonthPlaque month={thisMonth} tone="done" />
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>{t('auxApp.my.servingKicker')}</Text>
              <Text style={styles.title}>
                {t('auxApp.my.servingTitle', {
                  month: capitalize(monthName(thisMonth, lang, false)),
                  n: serving.hourGoal ?? 30,
                })}
              </Text>
            </View>
          </View>
          <Text style={styles.quiet}>
            {serving.current.untilCancelled
              ? t('auxApp.my.untilCancelled')
              : t('auxApp.my.reportHint')}
          </Text>
        </View>
      ) : null}

      {!pending && !serving?.current ? (
        <View style={cardStyles.card}>
          <Text style={styles.kicker}>{t('auxApp.my.kicker')}</Text>
          <Text style={styles.title}>{t('auxApp.my.inviteTitle')}</Text>
          {unbaptized ? (
            <Text style={styles.quiet}>{t('auxApp.my.notBaptized')}</Text>
          ) : permanent ? (
            <Text style={styles.quiet}>{t('auxApp.my.permanent')}</Text>
          ) : !appsQ.data.committeeComplete ? (
            <Text style={styles.quiet}>{t('auxApp.my.committeeIncomplete')}</Text>
          ) : (
            <Text style={styles.quiet}>{t('auxApp.my.inviteText')}</Text>
          )}
          {canApply ? (
            <Pressable
              style={styles.btn}
              onPress={() => router.push('/cart/aux-apply' as never)}
              accessibilityRole="button"
            >
              <Text style={styles.btnText}>{t('auxApp.my.apply')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {serving?.current && canApply ? (
        <Pressable
          style={styles.row}
          onPress={() => router.push('/cart/aux-apply' as never)}
          accessibilityRole="button"
        >
          <Ionicons name="add-circle-outline" size={22} color={BRAND} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('auxApp.my.applyMore')}</Text>
            <Text style={styles.rowSub}>{t('auxApp.my.applyMoreSub')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
        </Pressable>
      ) : null}

      {approved.length > 0 ? (
        <>
          <Text style={styles.sect}>{t('auxApp.my.approvedTitle')}</Text>
          {approved.map((a) => (
            <View key={a.id} style={styles.row}>
              <MonthPlaque month={a.months[0]} tone="done" small />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {a.untilCancelled
                    ? t('auxApp.my.fromUntilCancelled', {
                        month: monthName(a.months[0], lang),
                      })
                    : capitalize(monthsLabel(a.months, lang))}
                </Text>
                <Text style={styles.rowSub}>
                  {t('auxApp.my.approvedOn', {
                    date: a.approvedAt
                      ? new Date(a.approvedAt).toLocaleDateString(lang, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : '—',
                  })}
                </Text>
              </View>
              <Chip tone="green" text={t('auxApp.my.approvedChip')} />
            </View>
          ))}
        </>
      ) : null}

      <Dialog
        visible={!!takingBack}
        title={t('auxApp.my.takeBackTitle')}
        icon="arrow-undo-outline"
        cancelLabel={t('common.cancel')}
        confirmLabel={t('auxApp.my.takeBack')}
        pending={takeBack.isPending}
        onConfirm={() => takingBack && takeBack.mutate(takingBack.id)}
        onCancel={() => setTakingBack(null)}
      >
        <Text style={styles.quiet}>{t('auxApp.my.takeBackText')}</Text>
      </Dialog>
    </ScrollView>
  );
}

function Goals({ app, lang }: { app: MyAuxApplication; lang: string }) {
  const { t } = useTranslation();
  if (app.untilCancelled) {
    return (
      <Text style={styles.goals}>
        {t('auxApp.my.fromUntilCancelled', { month: monthName(app.months[0], lang) })}
      </Text>
    );
  }
  return (
    <View style={{ marginTop: 10 }}>
      {monthGoals(app.months, app.reducedMonths, lang).map((g) => (
        <Text key={g.month} style={styles.goals}>
          {t('auxApp.my.monthGoal', { month: g.label, n: g.hours })}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 14, paddingBottom: 40 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  kicker: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  title: { fontFamily: 'Manrope_800ExtraBold', fontSize: 19, color: INK, marginTop: 2 },
  quiet: { fontFamily: 'Manrope_400Regular', fontSize: 13.5, color: MUTED, marginTop: 10, lineHeight: 19 },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: MUTED, marginTop: 10 },
  goals: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK, marginTop: 3 },
  two: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: {
    backgroundColor: BRAND,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14,
  },
  btnText: { color: '#fff', fontFamily: 'Manrope_800ExtraBold', fontSize: 15 },
  ghost: {
    borderWidth: 1,
    borderColor: '#a5f3fc',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  ghostGrey: { borderColor: '#e2e8f0' },
  ghostText: { color: BRAND, fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5 },
  sect: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11.5,
    letterSpacing: 0.6,
    color: MUTED,
    textTransform: 'uppercase',
    marginTop: 18,
    marginBottom: 8,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  rowSub: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: MUTED, marginTop: 2 },
});
