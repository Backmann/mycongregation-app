import { useEffect, useMemo, useState } from 'react';
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
import type { TFunction } from 'i18next';
import i18n from '../../../lib/i18n';
import {
  cardMergeApi,
  extractErrorMessage,
  publishersApi,
  serviceGroupsApi,
  type MergeCardFacts,
  type MergeConflict,
  type MergeFieldDiff,
  type MergePlan,
} from '../../../lib/api';
import { formatDay } from '../../../lib/date-range';
import { useAuth } from '../../../lib/auth';
import { confirm } from '../../../components/ConfirmHost';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { LoadFailure } from '../../../components/LoadFailure';
import { failsScreen } from '../../../lib/screen-failure';
import { hasMoreHistory } from '../../../lib/card-history';
import { useAllPublishers } from '../../../lib/useAllPublishers';

/**
 * «Объединить карточки» (1 November 2026, mock-up «Объединение карточек»).
 *
 * One person entered twice. What this screen shows is not a guess: the
 * server runs the merge and rolls it back (the preview), so every line here
 * is what pressing the button does. The button sends the preview's
 * fingerprint; if anything changed meanwhile the server refuses and the
 * screen reads the preview again.
 */
export default function MergeCardsScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const params = useLocalSearchParams<{ kept?: string; merged?: string }>();
  const [kept, setKept] = useState<string | null>(params.kept ?? null);
  const [merged, setMerged] = useState<string | null>(params.merged ?? null);
  const [keepUserId, setKeepUserId] = useState<string | undefined>();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [fields, setFields] = useState<Record<string, 'kept' | 'merged'>>({});
  const [changed, setChanged] = useState(false);
  // The card to keep is chosen here, not by where the window was opened
  // from (1 November 2026: the first live merge was opened from the empty
  // card with the sign-in, and kept it). Once, on the first preview; a
  // swap by hand after that is the person's own decision.
  const [ordered, setOrdered] = useState(false);
  const [details, setDetails] = useState(false);

  const preview = useQuery({
    throwOnError: failsScreen,
    queryKey: ['card-merge', 'preview', kept, merged, keepUserId],
    queryFn: () =>
      cardMergeApi.preview({ keptId: kept!, mergedId: merged!, keepUserId }),
    enabled: !!kept && !!merged && kept !== merged,
    staleTime: 0,
  });
  const plan = preview.data;

  const swap = () => {
    setKept(merged);
    setMerged(kept);
    setChoices({});
    setFields({});
    setKeepUserId(undefined);
  };
  useEffect(() => {
    if (!plan || ordered) return;
    setOrdered(true);
    if (hasMoreHistory(plan.merged, plan.kept)) swap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, ordered]);

  const missing = useMemo(
    () => (plan ? plan.conflicts.filter((c) => !choices[c.key]) : []),
    [plan, choices],
  );

  const mergeMutation = useMutation({
    mutationFn: (p: MergePlan) =>
      cardMergeApi.merge({
        keptId: kept!,
        mergedId: merged!,
        fingerprint: p.fingerprint,
        choices,
        fields,
        keepUserId:
          p.accounts === 'choose'
            ? (keepUserId ?? p.kept.account?.userId)
            : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publishers'] });
      qc.invalidateQueries({ queryKey: ['publisher'] });
      qc.invalidateQueries({ queryKey: ['card-merge'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      // The sign-in moved with the card: the access block and the users
      // list read their own caches, and showed «no sign-in» until a reload.
      qc.invalidateQueries({ queryKey: ['publisher-access'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      router.replace(`/publishers/${kept}` as never);
    },
    onError: (e: unknown) => {
      const code = (e as { response?: { data?: { code?: string } } })?.response
        ?.data?.code;
      if (code === 'MERGE_PLAN_CHANGED') {
        setChanged(true);
        preview.refetch();
      }
    },
  });

  const submit = async (p: MergePlan) => {
    if (
      await confirm({
        title: t('merge.confirmTitle'),
        body: t('merge.confirmBody', {
          merged: p.merged.displayName,
          kept: p.kept.displayName,
        }),
        confirmLabel: t('merge.action'),
      })
    ) {
      setChanged(false);
      mergeMutation.mutate(p);
    }
  };

  // ---- choosing the second card -------------------------------------------
  if (!kept || !merged) {
    return (
      <PickSecond
        kept={kept}
        onPick={(id) => {
          if (!kept) setKept(id);
          else setMerged(id);
        }}
      />
    );
  }

  if (preview.isLoading || (plan && !ordered)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (preview.error || !plan) {
    return <LoadFailure error={preview.error} onRetry={() => preview.refetch()} />;
  }

  const blocked = plan.blockers.length > 0;
  // Left the empty card on top by hand: said, with a way back.
  const poorKept = hasMoreHistory(plan.merged, plan.kept);
  const adminNeeded = plan.needsAdmin && !isAdmin;
  const canGo = !blocked && !adminNeeded && missing.length === 0;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {poorKept ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>{t('merge.poor.title')}</Text>
          <Text style={styles.warnText}>
            {t('merge.poor.body', {
              date: formatDay(plan.kept.createdAt, i18n.language),
            })}
          </Text>
          <Pressable style={styles.warnButton} onPress={swap} accessibilityRole="button">
            <Text style={styles.warnButtonText}>{t('merge.poor.back')}</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.lead}>
          {t('merge.lead', {
            name: plan.kept.displayName,
            history: [
              t('merge.facts.created', {
                date: formatDay(plan.kept.createdAt, i18n.language),
              }),
              t('merge.facts.reports', { count: plan.kept.reports }),
            ].join(', '),
          })}
        </Text>
      )}

      <Result plan={plan} fields={fields} keepUserId={keepUserId} poor={poorKept} t={t} />

      {changed ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{t('merge.changed')}</Text>
        </View>
      ) : null}

      {plan.markedDistinct ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{t('merge.markedDistinct')}</Text>
        </View>
      ) : null}

      {blocked ? (
        <View style={styles.stop}>
          {plan.blockers.map((b) => (
            <Text key={b} style={styles.stopText}>
              {t(`serverError.codes.${b}`, { defaultValue: t('merge.blockedGeneric') })}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.box}>
        <Pressable
          onPress={() => setDetails((x) => !x)}
          style={styles.detailsHead}
          accessibilityRole="button"
          accessibilityState={{ expanded: details }}
          testID="merge-details"
        >
          <Text style={styles.detailsText}>{t('merge.details')}</Text>
          <Ionicons name={details ? 'chevron-up' : 'chevron-down'} size={18} color="#475569" />
        </Pressable>
        {details ? (
          <View style={{ gap: 10 }}>
            <CardBox facts={plan.kept} tone="kept" t={t} />
            <CardBox facts={plan.merged} tone="merged" t={t} />
            <Moves plan={plan} t={t} />
          </View>
        ) : null}
      </View>

      {plan.conflicts.map((c) => (
        <ConflictBox
          key={c.key}
          conflict={c}
          chosen={choices[c.key]}
          onChoose={(id) => setChoices((x) => ({ ...x, [c.key]: id }))}
          t={t}
        />
      ))}

      <FieldChoices
        plan={plan}
        fields={fields}
        onChoose={(f, side) => setFields((x) => ({ ...x, [f]: side }))}
        t={t}
      />

      {plan.accounts === 'choose' ? (
        <View style={styles.box}>
          <Text style={styles.h2}>{t('merge.accounts.chooseTitle')}</Text>
          {[plan.kept, plan.merged].map((card) =>
            card.account ? (
              <Option
                key={card.account.userId}
                selected={
                  (keepUserId ?? plan.kept.account?.userId) === card.account.userId
                }
                onPress={() => setKeepUserId(card.account!.userId)}
                title={card.account.login ?? card.displayName}
                sub={
                  card.account.lastSeenAt
                    ? t('merge.accounts.lastSeen', {
                        date: formatDay(card.account.lastSeenAt, i18n.language),
                      })
                    : t('merge.accounts.neverSeen')
                }
              />
            ) : null,
          )}
          <Text style={styles.muted}>{t('merge.accounts.chooseHint')}</Text>
        </View>
      ) : null}

      {plan.countedTwice.length > 0 ? (
        <View style={styles.note}>
          <Text style={styles.noteText}>
            {t('merge.countedTwice', {
              months: plan.countedTwice.join(', '),
            })}
          </Text>
        </View>
      ) : null}

      {adminNeeded ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>{t('merge.adminNeeded')}</Text>
        </View>
      ) : missing.length > 0 && !blocked ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            {t('merge.chooseFirst', { count: missing.length })}
          </Text>
        </View>
      ) : null}

      {mergeMutation.error && !changed ? (
        <Text style={styles.error}>{extractErrorMessage(mergeMutation.error)}</Text>
      ) : null}

      <Pressable
        style={[styles.primary, !canGo && styles.primaryOff]}
        disabled={!canGo || mergeMutation.isPending}
        onPress={() => submit(plan)}
        accessibilityRole="button"
        testID="merge-submit"
      >
        <Text style={styles.primaryText}>
          {mergeMutation.isPending
            ? t('merge.merging')
            : poorKept
              ? t('merge.poor.anyway')
              : t('merge.action')}
        </Text>
      </Pressable>
      <Text style={styles.mutedCenter}>{t('merge.undoHint')}</Text>
      {!poorKept ? (
        <Pressable onPress={swap} style={styles.keepOther} testID="merge-swap" accessibilityRole="button">
          <Text style={styles.keepOtherText}>{t('merge.keepOther')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

/**
 * «После объединения» — the card as it will be, not two cards to compare
 * (mock-up, second row). Every line comes from the server's preview.
 */
function Result({
  plan,
  fields,
  keepUserId,
  poor,
  t,
}: {
  plan: MergePlan;
  fields: Record<string, 'kept' | 'merged'>;
  keepUserId: string | undefined;
  poor: boolean;
  t: TFunction;
}) {
  const groupDiff = plan.fields.find((f) => f.field === 'serviceGroupId');
  const groupFromMerged =
    groupDiff &&
    (groupDiff.rule === 'take' || fields.serviceGroupId === 'merged');
  const group = groupFromMerged ? plan.merged.group : plan.kept.group;
  const sameMonth = plan.conflicts.filter((c) => c.kind === 'report').length;
  const reports = plan.kept.reports + plan.merged.reports - sameMonth;
  const others = Object.entries(plan.moves).filter(
    ([table]) => table !== 'service_reports',
  );
  const taken = plan.fields.filter(
    (f) => f.rule === 'take' && f.field !== 'serviceGroupId',
  );
  let login: string | null = plan.kept.account?.login ?? null;
  let loginMoves = false;
  if (plan.accounts === 'move') {
    login = plan.merged.account?.login ?? null;
    loginMoves = true;
  } else if (plan.accounts === 'choose') {
    const id = keepUserId ?? plan.kept.account?.userId;
    const card = plan.merged.account?.userId === id ? plan.merged : plan.kept;
    login = card.account?.login ?? null;
    loginMoves = card === plan.merged;
  }
  return (
    <View style={[styles.result, poor && styles.resultPoor]} testID="merge-result">
      <Text style={styles.tag}>{t('merge.result.title')}</Text>
      <Text style={styles.resultName}>{plan.kept.displayName}</Text>
      <Line left={t('merge.fieldNames.group')} right={group ?? t('merge.facts.noGroup')} />
      <Line left={t('merge.result.reports')} right={String(reports)} />
      {others.map(([table, n]) => (
        <Line key={table} left={tableName(table, t)} right={String(n)} />
      ))}
      <View style={styles.line}>
        <Text style={styles.lineLeft}>{t('merge.accounts.line')}</Text>
        <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
          <Text style={styles.lineRight}>{login ?? t('merge.result.noLogin')}</Text>
          {loginMoves ? (
            <Text style={styles.small}>{t('merge.result.loginMoves')}</Text>
          ) : null}
        </View>
      </View>
      {poor ? (
        <Line
          left={t('merge.result.created')}
          right={formatDay(plan.kept.createdAt, i18n.language)}
          warn
        />
      ) : null}
      {taken.length > 0 ? (
        <Text style={styles.muted}>
          {t('merge.result.taken', {
            list: taken.map((f) => fieldLabel(f.field, t)).join(', '),
          })}
        </Text>
      ) : null}
      {plan.accounts !== 'none' ? (
        <Text style={styles.calm}>
          {plan.kept.gender === 'sister'
            ? t('merge.result.forHer')
            : t('merge.result.forHim')}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Which card is the second one (mock-up «Выбор второй карточки»). The two
 * cards of one person carry the same name, so the likely ones come first,
 * with what tells them apart; the whole list below shows each one's group.
 */
function PickSecond({
  kept,
  onPick,
}: {
  kept: string | null;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const lang = i18n.language;
  const card = useQuery({
    queryKey: ['publisher', kept],
    queryFn: () => publishersApi.getById(kept!),
    enabled: !!kept,
  });
  const similar = useQuery({
    queryKey: ['card-merge', 'duplicates', 'of', kept],
    queryFn: () =>
      cardMergeApi.duplicates({
        firstName: card.data!.firstName,
        lastName: card.data!.lastName,
        email: card.data!.email ?? undefined,
        phone: card.data!.mobilePhone ?? undefined,
        exceptId: kept!,
      }),
    enabled: !!card.data,
  });
  const people = useAllPublishers();
  const groups = useQuery({
    queryKey: ['service-groups'],
    queryFn: () => serviceGroupsApi.list({}),
  });
  const groupOf = useMemo(() => {
    const names = new Map((groups.data?.data ?? []).map((g) => [g.id, g.name]));
    const m = new Map<string, string>();
    for (const p of people.data?.data ?? []) {
      const n = p.serviceGroupId ? names.get(p.serviceGroupId) : null;
      if (n) m.set(p.id, n);
    }
    return m;
  }, [groups.data, people.data]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.lead}>
        {card.data
          ? t('merge.pick.lead', { name: card.data.displayName })
          : t('merge.intro')}
      </Text>
      {(similar.data ?? []).length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={styles.section}>{t('merge.pick.similar')}</Text>
          {similar.data!.map((d) => (
            <Pressable
              key={d.id}
              onPress={() => onPick(d.id)}
              style={styles.similar}
              accessibilityRole="button"
              testID="merge-similar"
            >
              <Text style={styles.name}>{d.displayName}</Text>
              <Text style={styles.muted}>
                {[
                  d.group ?? t('merge.facts.noGroup'),
                  typeof d.reports === 'number'
                    ? t('merge.facts.reports', { count: d.reports })
                    : null,
                  d.departed ? t('merge.facts.departed') : null,
                  d.memberSince
                    ? t('merge.facts.since', { date: formatDay(d.memberSince, lang) })
                    : t('merge.facts.created', { date: formatDay(d.createdAt, lang) }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text style={styles.muted}>
                {[
                  t('merge.duplicate.why', {
                    list: d.why.map((w) => t(`merge.duplicate.by.${w}`)).join(', '),
                  }),
                  d.hasAccount === undefined
                    ? null
                    : d.hasAccount
                      ? t('merge.facts.hasAccount')
                      : t('merge.facts.noAccount'),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <Text style={styles.sectionMuted}>{t('merge.pick.all')}</Text>
      <PublisherSelector
        label={t('merge.pickOther')}
        value={null}
        boxed
        excludeIds={kept ? [kept] : []}
        rowMeta={(id) => groupOf.get(id) ?? null}
        onChange={(id) => {
          if (id) onPick(id);
        }}
      />
    </ScrollView>
  );
}

function CardBox({
  facts,
  tone,
  t,
}: {
  facts: MergeCardFacts;
  tone: 'kept' | 'merged';
  t: TFunction;
}) {
  const lang = i18n.language;
  const bits = [
    facts.group ?? t('merge.facts.noGroup'),
    t(`publishers.appointment.${facts.appointment}`, {
      defaultValue: facts.appointment,
    }),
    facts.memberSince
      ? t('merge.facts.since', { date: formatDay(facts.memberSince, lang) })
      : null,
    t('merge.facts.reports', { count: facts.reports }),
  ].filter(Boolean);
  // What tells two people apart, side by side: the dates.
  const dates = [
    facts.birthDate
      ? t('merge.facts.born', { date: formatDay(facts.birthDate, lang) })
      : null,
    facts.baptismDate
      ? t('merge.facts.baptised', { date: formatDay(facts.baptismDate, lang) })
      : null,
    t('merge.facts.created', { date: formatDay(facts.createdAt, lang) }),
  ].filter(Boolean);
  return (
    <View style={[styles.card, tone === 'kept' ? styles.cardKept : styles.cardMerged]}>
      <Text style={[styles.tag, tone === 'kept' ? styles.tagKept : styles.tagMerged]}>
        {tone === 'kept' ? t('merge.kept') : t('merge.merged')}
      </Text>
      <Text style={styles.name}>{facts.displayName}</Text>
      <Text style={styles.muted}>{bits.join(' · ')}</Text>
      <Text style={styles.muted}>{dates.join(' · ')}</Text>
      <Text style={styles.muted}>
        {facts.account
          ? t('merge.facts.account', { login: facts.account.login ?? '—' })
          : t('merge.facts.noAccount')}
        {facts.departed ? ` · ${t('merge.facts.departed')}` : ''}
      </Text>
    </View>
  );
}

function tableName(table: string, t: TFunction): string {
  const key = `publishers.purge.holders.${table}`;
  const s = t(key);
  return s === key ? table : s;
}

function Moves({ plan, t }: { plan: MergePlan; t: TFunction }) {
  const moves = Object.entries(plan.moves);
  const joined = Object.entries(plan.joined);
  const taken = plan.fields.filter((f) => f.rule === 'take');
  return (
    <View style={styles.box}>
      <Text style={styles.h2}>{t('merge.movesTitle')}</Text>
      {plan.accounts !== 'none' ? (
        <Line
          left={t('merge.accounts.line')}
          right={
            plan.accounts === 'move'
              ? t('merge.accounts.sameLogin')
              : t('merge.accounts.oneStays')
          }
        />
      ) : null}
      {moves.map(([table, n]) => (
        <Line key={table} left={tableName(table, t)} right={String(n)} />
      ))}
      {taken.map((f) => (
        <Line
          key={f.field}
          left={fieldLabel(f.field, t)}
          right={t('merge.fieldTaken')}
        />
      ))}
      {moves.length === 0 && taken.length === 0 && plan.accounts === 'none' ? (
        <Text style={styles.muted}>{t('merge.nothingMoves')}</Text>
      ) : null}
      {joined.length > 0 ? (
        <Text style={styles.muted}>
          {t('merge.joined', {
            list: joined.map(([table, n]) => `${tableName(table, t)} (${n})`).join(', '),
          })}
        </Text>
      ) : null}
      <Text style={styles.muted}>{t('merge.followsLogin')}</Text>
    </View>
  );
}

function ConflictBox({
  conflict,
  chosen,
  onChoose,
  t,
}: {
  conflict: MergeConflict;
  chosen: string | undefined;
  onChoose: (id: string) => void;
  t: TFunction;
}) {
  const title =
    conflict.kind === 'report'
      ? t('merge.conflicts.report', { month: monthName(conflict.month!) })
      : t(`merge.conflicts.${conflict.kind}`);
  return (
    <View style={styles.box}>
      <Text style={styles.h2}>{title}</Text>
      {conflict.options.map((o) => {
        const f = o.facts;
        const sub =
          o.side === 'kept' ? t('merge.onKept') : t('merge.onMerged');
        const head =
          conflict.kind === 'report'
            ? [
                f.served === false
                  ? t('merge.report.notServed')
                  : t('merge.report.served'),
                typeof f.hours === 'number'
                  ? t('merge.report.hours', { count: f.hours })
                  : null,
                t('merge.report.studies', { count: Number(f.studies ?? 0) }),
              ]
                .filter(Boolean)
                .join(' · ')
            : String(f.months ?? '');
        return (
          <Option
            key={o.id}
            selected={chosen === o.id}
            onPress={() => onChoose(o.id)}
            title={head}
            sub={
              conflict.kind === 'report' && f.submittedAt
                ? `${sub} · ${formatDay(String(f.submittedAt), i18n.language)}`
                : sub
            }
          />
        );
      })}
      <Text style={styles.muted}>{t('merge.conflicts.kept')}</Text>
    </View>
  );
}

function FieldChoices({
  plan,
  fields,
  onChoose,
  t,
}: {
  plan: MergePlan;
  fields: Record<string, 'kept' | 'merged'>;
  onChoose: (field: string, side: 'kept' | 'merged') => void;
  t: TFunction;
}) {
  const choose = plan.fields.filter((f) => f.rule === 'choose');
  if (choose.length === 0) return null;
  return (
    <View style={styles.box}>
      <Text style={styles.h2}>{t('merge.fieldsTitle')}</Text>
      {choose.map((f) => (
        <View key={f.field} style={styles.fieldGroup}>
          <Text style={styles.muted}>{fieldLabel(f.field, t)}</Text>
          {(['kept', 'merged'] as const).map((side) => (
            <Option
              key={side}
              selected={(fields[f.field] ?? 'kept') === side}
              onPress={() => onChoose(f.field, side)}
              title={valueText(f, side, plan, t)}
              sub={side === 'kept' ? t('merge.onKept') : t('merge.onMerged')}
            />
          ))}
        </View>
      ))}
      <Text style={styles.muted}>{t('merge.fieldsHint')}</Text>
    </View>
  );
}

const FIELD_LABELS: Record<string, string> = {
  firstName: 'publishers.fields.firstName',
  lastName: 'publishers.fields.lastName',
  middleName: 'merge.fieldNames.middleName',
  gender: 'publishers.fields.gender',
  birthDate: 'publishers.fields.birthDate',
  mobilePhone: 'publishers.fields.mobilePhone',
  email: 'publishers.fields.email',
  address: 'publishers.fields.address',
  appointment: 'publishers.fields.appointment',
  baptismDate: 'publishers.fields.baptismDate',
  ministryStartDate: 'publishers.fields.ministryStart',
  pioneerType: 'publishers.fields.pioneerType',
  pioneerSince: 'publishers.fields.pioneerSince',
  pioneerMonthGoal: 'publishers.fields.pioneerMonthGoal',
  spiritualStatus: 'publishers.fields.spiritualStatus',
  notes: 'publishers.fields.generalNotes',
  isDeaf: 'publishers.fields.isDeaf',
  isBlind: 'publishers.fields.isBlind',
  isImprisoned: 'publishers.fields.isImprisoned',
  serviceGroupId: 'merge.fieldNames.group',
};

function fieldLabel(field: string, t: TFunction): string {
  return FIELD_LABELS[field] ? t(FIELD_LABELS[field]) : field;
}

function valueText(
  f: MergeFieldDiff,
  side: 'kept' | 'merged',
  plan: MergePlan,
  t: TFunction,
): string {
  const v = side === 'kept' ? f.kept : f.merged;
  if (f.field === 'serviceGroupId')
    return (side === 'kept' ? plan.kept.group : plan.merged.group) ?? '—';
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  const s = String(v);
  if (f.field === 'appointment')
    return t(`publishers.appointment.${s}`, { defaultValue: s });
  if (f.field === 'gender') return t(`publishers.gender.${s}`, { defaultValue: s });
  if (f.field === 'pioneerType')
    return t(`publishers.pioneer.options.${s}`, { defaultValue: s });
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return formatDay(s, i18n.language);
  return s;
}

function monthName(ym: string): string {
  const d = new Date(`${ym}-01T12:00:00Z`);
  return d.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });
}

function Line({
  left,
  right,
  warn,
}: {
  left: string;
  right: string;
  warn?: boolean;
}) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLeft}>{left}</Text>
      <Text style={[styles.lineRight, warn && styles.lineWarn]}>{right}</Text>
    </View>
  );
}

function Option({
  selected,
  onPress,
  title,
  sub,
}: {
  selected: boolean;
  onPress: () => void;
  title: string;
  sub: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
    >
      <Ionicons
        name={selected ? 'radio-button-on' : 'radio-button-off'}
        size={20}
        color={selected ? '#0e5f73' : '#64748b'}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.muted}>{sub}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, maxWidth: 720, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lead: { fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20, color: '#334155' },
  card: { backgroundColor: '#ffffff', borderRadius: 12, padding: 14, gap: 4 },
  cardKept: { borderWidth: 2, borderColor: '#0e5f73' },
  cardMerged: { borderWidth: 1, borderColor: '#94a3b8', borderStyle: 'dashed' },
  tag: { fontFamily: 'Manrope_700Bold', fontSize: 12, letterSpacing: 0.5 },
  tagKept: { color: '#0e5f73' },
  tagMerged: { color: '#9a3412' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: '#0f172a' },
  result: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 2,
    borderColor: '#0e5f73',
  },
  resultPoor: { borderColor: '#0e5f73' },
  resultName: { fontFamily: 'Manrope_700Bold', fontSize: 17, color: '#0f172a' },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#475569' },
  calm: {
    fontFamily: 'Manrope_500Medium',
    fontSize: 13,
    lineHeight: 19,
    color: '#065f46',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  lineWarn: { color: '#9a3412' },
  warnBox: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  warnTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#7c2d12' },
  warnButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fdba74',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  warnButtonText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#7c2d12' },
  detailsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 32,
  },
  detailsText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#0f172a' },
  keepOther: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  keepOtherText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: '#0369a1' },
  section: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
    color: '#0e5f73',
  },
  sectionMuted: {
    fontFamily: 'Manrope_700Bold',
    fontSize: 13,
    letterSpacing: 0.5,
    color: '#475569',
    marginTop: 4,
  },
  similar: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    gap: 4,
    borderWidth: 2,
    borderColor: '#0e5f73',
  },
  box: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  h2: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  lineLeft: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#0f172a' },
  lineRight: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#475569' },
  muted: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#475569' },
  mutedCenter: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    textAlign: 'center',
  },
  fieldGroup: { gap: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    minHeight: 44,
  },
  optionOn: { borderWidth: 2, borderColor: '#0e5f73' },
  optionTitle: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#0f172a' },
  warn: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  warnText: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20, color: '#7c2d12' },
  stop: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  stopText: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 20, color: '#991b1b' },
  note: { backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12 },
  noteText: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#334155' },
  error: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: '#991b1b' },
  primary: {
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#0e5f73',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryOff: { backgroundColor: '#94a3b8' },
  primaryText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#ffffff' },
});
