import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../../components/KeyboardScroll';
import { LoadFailure } from '../../../../components/LoadFailure';
import { confirm } from '../../../../components/ConfirmHost';
import { TerritoryMap, type MapShape } from '../../../../components/territories/TerritoryMap';
import { BRAND, INK, LINE, MUTED, Chip } from '../../../../components/reports/ReportBits';
import { failsScreen } from '../../../../lib/screen-failure';
import {
  extractErrorMessage,
  recutApi,
  type RecutMeasure,
  type RecutProposal,
  type RecutTerritory,
  type RecutView,
} from '../../../../lib/api';
import {
  decisionOf,
  filterProposals,
  isFree,
  needsHands,
  km,
  RECUT_KEY,
  longestWalk,
  myMarkOf,
  queuesOf,
  undecidedQueues,
  reviewOf,
  searchTerritories,
  summaryOf,
  walkNowAfter,
  whereOf,
  type RecutFilter,
} from '../../../../lib/recut';
import { formatDayShort } from '../../../../lib/territory-view';

const BG = '#f1f5f9';
const CUT = '#c2410c';
const JOIN = '#1d4ed8';
const BAD = '#b91c1c';

/**
 * «Перекройка — черновик» (15 November 2026; mockup approved on the Design
 * canvas, boards Main and Agree).
 *
 * The draft of re-cutting the territories: the measure, what the territories
 * would become if all were taken, where the service committee's decision
 * stands, and the proposals one by one. Nothing here changes a territory —
 * applying comes as its own step, after the committee has decided and once
 * the territory is back.
 */
export default function RecutScreen() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const router = useRouter();
  const qc = useQueryClient();
  const viewQ = useQuery({
    queryKey: RECUT_KEY,
    queryFn: () => recutApi.view(),
    throwOnError: failsScreen,
    // While the figures are being worked out, look again every few seconds.
    refetchInterval: (q) => (q.state.data?.computing || q.state.data?.walking ? 3000 : false),
  });
  const [filter, setFilter] = useState<RecutFilter>('all');
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const put = (v: RecutView) => qc.setQueryData(RECUT_KEY, v);
  const fail = (e: unknown) => {
    setNotice(null);
    setError(extractErrorMessage(e));
  };
  const figures = useMutation({ mutationFn: () => recutApi.figures(), onSuccess: put, onError: fail });
  const suggest = useMutation({
    mutationFn: () => recutApi.suggest(),
    onSuccess: (v) => {
      put(v);
      setError(null);
      const made = v.suggested.made.length;
      const byHand = v.suggested.byHand;
      setNotice(
        [
          made ? t('territories.recut.suggest.done', { count: made }) : t('territories.recut.suggest.nothing'),
          byHand.length ? t('territories.recut.suggest.byHand', { list: byHand.join(', ') }) : null,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    },
    onError: fail,
  });
  const approve = useMutation({
    mutationFn: (queue: number) => recutApi.approve(queue),
    onSuccess: (v, queue) => {
      put(v);
      setError(null);
      setNotice(t('territories.recut.decision.doneQueue', { n: queue }));
    },
    onError: fail,
  });
  const setClass = useMutation({
    mutationFn: (x: { id: string; cls: 'city' | 'far' | null }) => recutApi.setClass(x.id, x.cls),
    onSuccess: put,
    onError: fail,
  });

  const view = viewQ.data;
  const byId = useMemo(() => new Map((view?.territories ?? []).map((x) => [x.id, x])), [view]);

  if (viewQ.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (viewQ.error || !view) return <LoadFailure error={viewQ.error} onRetry={() => viewQ.refetch()} />;

  const m = view.measure;
  const open = view.proposals.filter((p) => p.state === 'open');
  const sum = summaryOf(view.territories.length, open);
  const queues = queuesOf(open);
  const longest = longestWalk(view.territories, open);
  const dec = decisionOf(open);
  const toDecide = undecidedQueues(open);
  const review = reviewOf(open);
  const shown = filterProposals(open, filter);
  const counts: Record<RecutFilter, number> = {
    all: open.length,
    cut: open.filter((p) => p.kind === 'cut').length,
    merge: open.filter((p) => p.kind === 'merge').length,
    hands: open.filter(needsHands).length,
    free: open.filter(isFree).length,
  };

  const shapes: MapShape[] = open.flatMap((p) =>
    p.territories
      .filter((x) => x.geometry)
      .map((x) => ({
        id: p.id,
        number: x.number,
        geometry: x.geometry!,
        tone: 'free' as const,
        color: p.kind === 'cut' ? CUT : JOIN,
      })),
  );

  const busy = figures.isPending || suggest.isPending || approve.isPending;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <Stack.Screen options={{ title: t('territories.recut.title') }} />
      <KeyboardScroll style={{ flex: 1 }} contentContainerStyle={s.content}>
        <View>
          <View style={s.badge}>
            <Ionicons name="document-text-outline" size={14} color="#92400e" />
            <Text style={s.badgeText}>{t('territories.recut.badge')}</Text>
          </View>
        </View>

        {error ? (
          <View style={s.error} accessibilityLiveRegion="polite">
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}
        {notice ? (
          <View style={s.notice} accessibilityLiveRegion="polite">
            <Text style={s.noticeText}>{notice}</Text>
          </View>
        ) : null}

        {/* Going through one by one: my own marks */}
        {open.length ? (
          <View style={s.card}>
            <Text style={s.kicker}>{t('territories.recut.review.title')}</Text>
            <Text style={s.body}>
              {t('territories.recut.review.progress', { done: review.done, total: review.total })}
            </Text>
            <View
              style={s.track}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: review.total, now: review.done }}
            >
              <View style={[s.fill, { width: `${Math.round((review.done / review.total) * 100)}%` }]} />
            </View>
            {review.next ? (
              <>
                <Text style={s.quiet}>{t('territories.recut.review.hint')}</Text>
                <View style={s.btnRow}>
                  <Pressable
                    onPress={() => router.push(`/cart/recut/${review.next!.id}` as never)}
                    style={({ pressed }) => [s.btn, { maxWidth: '100%' }, pressed && s.pressed]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="play-forward-outline" size={16} color="#fff" />
                    {/* Short, as in the rows: a join of four does not run off a phone's screen. */}
                    <Text style={[s.btnText, { flexShrink: 1 }]}>
                      {t(review.done ? 'territories.recut.review.continue' : 'territories.recut.review.start', {
                        number:
                          review.next.territories.length > 1
                            ? `${review.next.territories[0].number} +${review.next.territories.length - 1}`
                            : review.next.territories[0]?.number ?? '',
                      })}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Text style={s.quiet}>{t('territories.recut.review.allDone')}</Text>
            )}
          </View>
        ) : null}


        {/* The measure */}
        <View style={s.card}>
          <Text style={s.kicker}>{t('territories.recut.measure.title')}</Text>
          {editing ? (
            <MeasureForm
              measure={m}
              onCancel={() => setEditing(false)}
              onSaved={(v) => {
                put(v);
                setEditing(false);
                setError(null);
              }}
            />
          ) : (
            <>
              <View style={s.measureRow}>
                <View style={s.measureBox}>
                  <Text style={s.measureName}>{t('territories.recut.measure.city')}</Text>
                  <Text style={s.measureLine}>{t('territories.recut.measure.maxKm', { km: km(m.cityMaxKm, lang) })}</Text>
                  <Text style={s.measureLine}>{t('territories.recut.measure.partKm', { km: km(m.cityTargetKm, lang) })}</Text>
                </View>
                <View style={s.measureBox}>
                  <Text style={s.measureName}>{t('territories.recut.measure.far')}</Text>
                  <Text style={s.measureLine}>{t('territories.recut.measure.maxKm', { km: km(m.remoteMaxKm, lang) })}</Text>
                  <Text style={s.measureLine}>{t('territories.recut.measure.partKm', { km: km(m.remoteTargetKm, lang) })}</Text>
                </View>
              </View>
              <Text style={s.quiet}>
                {t('territories.recut.measure.farFrom', { min: km(m.remoteMinutes, lang), km: km(m.minKm, lang) })}
              </Text>
              {view.canEdit ? (
                <Pressable onPress={() => setEditing(true)} style={s.linkBtn} accessibilityRole="button">
                  <Ionicons name="create-outline" size={16} color={BRAND} />
                  <Text style={s.linkText}>{t('territories.recut.measure.edit')}</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        {/* The figures */}
        <View style={s.card}>
          <Text style={s.kicker}>{t('territories.recut.figures.title')}</Text>
          <Text style={s.body}>
            {view.computing
              ? t('territories.recut.figures.computing')
              : view.metricsAt
                ? t('territories.recut.figures.at', { date: formatDayShort(view.metricsAt.slice(0, 10), lang) })
                : t('territories.recut.figures.never')}
          </Text>
          {view.halls.length ? (
            <Text style={s.quiet}>
              {t('territories.recut.figures.halls', {
                list: view.halls.filter((h) => h.found).map((h) => h.name).join(', ') || '—',
              })}
            </Text>
          ) : null}
          {view.halls
            .filter((h) => !h.found)
            .map((h) => (
              <Text key={h.name} style={[s.quiet, { color: BAD }]}>
                {t('territories.recut.figures.hallMissing', { name: h.name })}
              </Text>
            ))}
          {view.canEdit ? (
            <View style={s.btnRow}>
              <Pressable
                onPress={() => figures.mutate()}
                disabled={busy || view.computing}
                style={({ pressed }) => [s.btnGhost, (busy || view.computing) && s.off, pressed && s.pressed]}
                accessibilityRole="button"
              >
                {view.computing || figures.isPending ? (
                  <ActivityIndicator size="small" color={BRAND} />
                ) : (
                  <Ionicons name="refresh" size={16} color={BRAND} />
                )}
                <Text style={s.btnGhostText}>
                  {view.metricsAt ? t('territories.recut.figures.run') : t('territories.recut.figures.first')}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* If all is taken */}
        <View style={s.card}>
          <Text style={s.kicker}>{t('territories.recut.summary.title')}</Text>
          <View style={s.sumRow}>
            <Text style={s.sumBig}>
              {sum.before} → {sum.after}
            </Text>
            <Text style={s.sumUnit}>{t('territories.recut.summary.unit', { count: sum.after })}</Text>
          </View>
          {sum.cuts || sum.joins ? (
            <Text style={s.quiet}>
              {[
                sum.cuts ? t('territories.recut.summary.cuts', { cuts: sum.cuts, count: sum.parts }) : null,
                sum.joins ? t('territories.recut.summary.joins', { joined: sum.joined, count: sum.joins }) : null,
              ]
                .filter(Boolean)
                .join(' · ')
                .replace(/^./, (c) => c.toUpperCase())}
            </Text>
          ) : null}
          {queues.length ? (
            <View style={s.queues}>
              {queues.map((q) => (
                <View key={q.queue} style={s.queue}>
                  <Text style={s.queueName}>{t('territories.recut.summary.queue', { n: q.queue })}</Text>
                  <Text style={s.quiet}>
                    {[
                      q.joins ? t('territories.recut.summary.qJoins', { count: q.joins }) : null,
                      q.cuts ? t('territories.recut.summary.qCuts', { count: q.cuts }) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {longest.now !== null && open.length ? (
            <Text style={s.body}>
              {longest.after !== null
                ? t('territories.recut.summary.longest', { now: km(longest.now, lang), after: km(longest.after, lang) })
                : t('territories.recut.summary.longestWait', { now: km(longest.now, lang) })}
            </Text>
          ) : null}
        </View>

        {/* The committee's decision */}
        {open.length ? (
          <View style={s.card}>
            <Text style={s.kicker}>{t('territories.recut.decision.title')}</Text>
            <View style={s.chips}>
              {dec.waiting ? <Chip tone="amber" text={t('territories.recut.decision.waiting', { count: dec.waiting })} /> : null}
              {dec.decided ? <Chip tone="green" text={t('territories.recut.decision.decided', { count: dec.decided })} /> : null}
              {dec.reopened ? <Chip tone="amber" text={t('territories.recut.decision.reopened', { count: dec.reopened })} /> : null}
              {dec.remarks ? <Chip tone="blue" text={t('territories.recut.decision.remarks', { count: dec.remarks })} /> : null}
            </View>
            <Text style={s.quiet}>{t('territories.recut.decision.note')}</Text>
            {view.canDecide && toDecide.length ? (
              <>
                <Text style={s.quiet}>{t('territories.recut.decision.byQueue')}</Text>
                <View style={s.btnRow}>
                  {toDecide.map((q) => (
                    <Pressable
                      key={q.queue}
                      onPress={async () => {
                        const what = [
                          q.joins ? t('territories.recut.decision.joins', { count: q.joins }) : '',
                          q.cuts ? t('territories.recut.decision.cuts', { count: q.cuts }) : '',
                        ]
                          .filter(Boolean)
                          .join(', ');
                        const ok = await confirm({
                          title: t('territories.recut.decision.confirmQueueTitle', { n: q.queue }),
                          body: t('territories.recut.decision.confirmQueueBody', { n: q.queue, what }),
                          confirmLabel: t('territories.recut.decision.confirmYes'),
                        });
                        if (ok) approve.mutate(q.queue);
                      }}
                      disabled={busy}
                      style={({ pressed }) => [s.btn, busy && s.off, pressed && s.pressed]}
                      accessibilityRole="button"
                    >
                      <Ionicons name="checkmark-done" size={16} color="#fff" />
                      <Text style={s.btnText}>
                        {t('territories.recut.decision.buttonQueue', { n: q.queue, count: q.count })}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        {/* Suggest by the measure */}
        {view.canEdit ? (
          <View style={s.card}>
            <Text style={s.quiet}>{t('territories.recut.suggest.hint')}</Text>
            <View style={s.btnRow}>
              <Pressable
                onPress={() => suggest.mutate()}
                disabled={busy || view.computing || !view.metricsAt}
                style={({ pressed }) => [s.btn, (busy || view.computing || !view.metricsAt) && s.off, pressed && s.pressed]}
                accessibilityRole="button"
              >
                {suggest.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="sparkles-outline" size={16} color="#fff" />
                )}
                <Text style={s.btnText}>{t('territories.recut.suggest.button')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* The map of the draft */}
        {Platform.OS === 'web' && shapes.length ? (
          <View style={s.mapWrap}>
            <TerritoryMap
              shapes={shapes}
              height={360}
              onSelect={(id) => router.push(`/cart/recut/${id}` as never)}
            />
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: CUT }]} />
                <Text style={s.legendText}>{t('territories.recut.legend.cut')}</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: JOIN }]} />
                <Text style={s.legendText}>{t('territories.recut.legend.merge')}</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* The proposals */}
        {open.length ? (
          <View style={s.filters}>
            {(['all', 'cut', 'merge', 'hands', 'free'] as RecutFilter[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFilter(f)}
                style={[s.filter, filter === f && s.filterOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === f }}
              >
                <Text style={[s.filterText, filter === f && s.filterTextOn]}>
                  {t(`territories.recut.filter.${f}`, { count: counts[f] })}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {open.length === 0 ? (
          <View style={s.card}>
            <Text style={s.body}>{t('territories.recut.list.empty')}</Text>
            {view.canEdit ? <Text style={s.quiet}>{t('territories.recut.list.emptyHint')}</Text> : null}
          </View>
        ) : (
          shown.map((p) => (
            <ProposalRow
              key={p.id}
              p={p}
              first={byId.get(p.territories[0]?.id ?? '')}
              byId={byId}
              lang={lang}
              onOpen={() => router.push(`/cart/recut/${p.id}` as never)}
            />
          ))
        )}

        {/* All territories by the measure */}
        {view.territories.length ? (
          <View style={s.card}>
            <Pressable
              onPress={() => setShowAll((x) => !x)}
              style={s.allHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: showAll }}
            >
              <Text style={[s.kicker, { flex: 1 }]}>{t('territories.recut.all.title')}</Text>
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={18} color={MUTED} />
            </Pressable>
            <Text style={s.quiet}>{t('territories.recut.all.hint')}</Text>
            {showAll ? (
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t('territories.recut.all.search')}
                placeholderTextColor="#94a3b8"
                style={[s.input, s.search]}
                accessibilityLabel={t('territories.recut.all.search')}
                autoCorrect={false}
                autoCapitalize="none"
              />
            ) : null}
            {showAll
              ? searchTerritories([...view.territories], query)
                  .sort((a, b) => (b.walkKm ?? 0) - (a.walkKm ?? 0))
                  .map((x) => (
                    <TerritoryLine
                      key={x.id}
                      x={x}
                      lang={lang}
                      canEdit={view.canEdit}
                      busy={setClass.isPending}
                      onClass={(cls) => setClass.mutate({ id: x.id, cls })}
                    />
                  ))
              : null}
          </View>
        ) : null}
      </KeyboardScroll>
    </View>
  );
}

function ProposalRow({
  p,
  first,
  byId,
  lang,
  onOpen,
}: {
  p: RecutProposal;
  first: RecutTerritory | undefined;
  byId: Map<string, RecutTerritory>;
  lang: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const numbers = p.territories.map((x) => x.number);
  const n = Math.max(p.parts.length, (p.lines?.length ?? 0) + 1);
  const what =
    p.kind === 'cut'
      ? t('territories.recut.list.cut', { count: n })
      : t('territories.recut.list.merge', { list: numbers.join(' + ') });
  const remarks = p.remarks.filter((r) => !r.ok).length;
  const mark = myMarkOf(p);
  const walk = walkNowAfter(p, byId);
  const walkText =
    walk.now === null
      ? null
      : walk.after === null
        ? t('territories.recut.list.walkNow', { now: km(walk.now, lang) })
        : t('territories.recut.list.walk', { now: km(walk.now, lang), after: km(walk.after, lang) });
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [s.row, pressed && s.pressed]}
      accessibilityRole="button"
    >
      <View style={[s.rowMark, { backgroundColor: p.kind === 'cut' ? CUT : JOIN }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.rowHead}>
          <Text style={s.rowTitle}>
            {p.kind === 'cut' ? numbers[0] : `${numbers[0]}${numbers.length > 1 ? ` +${numbers.length - 1}` : ''}`}
          </Text>
          <Text style={s.rowWhere}>{whereOf(first, (k, o) => t(k, o), lang)}</Text>
        </View>
        <Text style={s.rowWhat}>
          {[what, walkText, t('territories.recut.list.queue', { n: p.queue })].filter(Boolean).join(' · ')}
        </Text>
        <View style={s.chips}>
          {p.blocks
            .filter((b) => b !== 'notApproved')
            .map((b) => (
              <Chip
                key={b}
                tone={b === 'held' || b === 'meeting' ? 'grey' : 'amber'}
                text={t(`territories.recut.block.${b}`, {
                  date: formatDayShort(p.territories.find((x) => x.meetingOn)?.meetingOn ?? '', lang),
                })}
              />
            ))}
          {p.approvedAt ? (
            <Chip
              tone="green"
              text={
                p.blocks.length === 0
                  ? t('territories.recut.apply.rowReadyChip')
                  : t('territories.recut.list.decided')
              }
            />
          ) : null}
          {remarks ? <Chip tone="blue" text={t('territories.recut.decision.remarks', { count: remarks })} /> : null}
          {mark === 'ok' ? <Chip tone="green" text={t('territories.recut.review.markOk')} /> : null}
          {mark === 'remark' ? <Chip tone="blue" text={t('territories.recut.review.markRemark')} /> : null}
          {mark === 'stale' ? <Chip tone="amber" text={t('territories.recut.review.markStale')} /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={MUTED} />
    </Pressable>
  );
}

function TerritoryLine({
  x,
  lang,
  canEdit,
  busy,
  onClass,
}: {
  x: RecutTerritory;
  lang: string;
  canEdit: boolean;
  busy: boolean;
  onClass: (cls: 'city' | 'far' | null) => void;
}) {
  const { t } = useTranslation();
  const v = x.verdict;
  const verdict = x.inProposal
    ? t('territories.recut.all.inProposal')
    : !v
      ? ''
      : v.action === 'cut'
        ? t('territories.recut.all.cut', { count: v.parts })
        : v.action === 'merge'
          ? t('territories.recut.all.merge')
          : t('territories.recut.all.keep');
  const facts = [
    x.walkKm != null ? t('territories.recut.all.walk', { km: km(x.walkKm, lang) }) : null,
    x.homes != null ? t('territories.recut.list.homes', { count: x.homes }) : null,
    x.driveMinutes != null ? t('territories.recut.all.drive', { min: km(x.driveMinutes, lang) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const options: { key: 'city' | 'far' | null; label: string }[] = [
    { key: null, label: t('territories.recut.all.setAuto') },
    { key: 'city', label: t('territories.recut.all.setCity') },
    { key: 'far', label: t('territories.recut.all.setFar') },
  ];
  return (
    <View style={s.tline}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={s.tnum}>{x.number}</Text>
        <Text style={s.tfacts}>{facts}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Text style={[s.tverdict, v?.action === 'cut' && { color: CUT }, v?.action === 'merge' && { color: JOIN }]}>
          {[x.cls === 'far' ? t('territories.recut.where.farNoMin') : t('territories.recut.where.cityNoMin'), verdict]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {canEdit ? (
          <View style={s.seg}>
            {options.map((o) => {
              const on = x.word === o.key;
              return (
                <Pressable
                  key={String(o.key)}
                  disabled={busy || on}
                  onPress={() => onClass(o.key)}
                  style={[s.segBtn, on && s.segOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const FIELDS: (keyof RecutMeasure)[] = [
  'cityMaxKm',
  'cityTargetKm',
  'remoteMaxKm',
  'remoteTargetKm',
  'minKm',
  'remoteMinutes',
];

function MeasureForm({
  measure,
  onCancel,
  onSaved,
}: {
  measure: RecutMeasure;
  onCancel: () => void;
  onSaved: (v: RecutView) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [vals, setVals] = useState<Record<keyof RecutMeasure, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f, km(measure[f], lang)])) as Record<keyof RecutMeasure, string>,
  );
  const [error, setError] = useState<string | null>(null);
  const parsed = Object.fromEntries(
    FIELDS.map((f) => [f, Number(vals[f].replace(',', '.').trim())]),
  ) as unknown as RecutMeasure;
  const bad =
    FIELDS.some((f) => !Number.isFinite(parsed[f]) || parsed[f] <= 0) ||
    parsed.cityTargetKm > parsed.cityMaxKm ||
    parsed.remoteTargetKm > parsed.remoteMaxKm;
  const save = useMutation({
    mutationFn: () => recutApi.setMeasure(parsed),
    onSuccess: onSaved,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      {FIELDS.map((f) => (
        <View key={f} style={s.field}>
          <Text style={s.fieldLabel}>{t(`territories.recut.measure.${f}`)}</Text>
          <TextInput
            value={vals[f]}
            onChangeText={(x) => setVals((v) => ({ ...v, [f]: x }))}
            keyboardType="decimal-pad"
            style={s.input}
            accessibilityLabel={t(`territories.recut.measure.${f}`)}
          />
        </View>
      ))}
      <Text style={s.quiet}>{t('territories.recut.measure.reopenNote')}</Text>
      {bad ? <Text style={[s.quiet, { color: BAD }]}>{t('territories.recut.measure.bad')}</Text> : null}
      {error ? <Text style={[s.quiet, { color: BAD }]}>{error}</Text> : null}
      <View style={s.btnRow}>
        <Pressable onPress={onCancel} style={({ pressed }) => [s.btnGhost, pressed && s.pressed]} accessibilityRole="button">
          <Text style={s.btnGhostText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          onPress={() => save.mutate()}
          disabled={bad || save.isPending}
          style={({ pressed }) => [s.btn, (bad || save.isPending) && s.off, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Text style={s.btnText}>{t('territories.recut.measure.save')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 110, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#fef3c7',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: '#92400e' },
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 16, gap: 8 },
  kicker: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 0.6,
    color: '#94a3b8',
    textTransform: 'uppercase',
  },
  body: { fontFamily: 'Manrope_600SemiBold', fontSize: 14.5, color: INK },
  quiet: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 18 },
  measureRow: { flexDirection: 'row', gap: 8 },
  measureBox: { flex: 1, backgroundColor: '#f8fafc', borderRadius: 14, borderWidth: 1, borderColor: '#eef2f7', padding: 12, gap: 2 },
  measureName: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: INK },
  measureLine: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: MUTED },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  linkText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND },
  sumRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  sumBig: { fontFamily: 'Manrope_800ExtraBold', fontSize: 28, color: INK, fontVariant: ['tabular-nums'] },
  sumUnit: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: MUTED },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  btnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnGhostText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
  error: { backgroundColor: '#fef2f2', borderRadius: 12, borderWidth: 1, borderColor: '#fecaca', padding: 12 },
  errorText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: BAD },
  notice: { backgroundColor: '#f0fdf4', borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0', padding: 12 },
  noticeText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: '#166534', lineHeight: 19 },
  mapWrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: LINE },
  track: { height: 6, borderRadius: 3, backgroundColor: '#e2e8f0', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: '#15803d' },
  queues: { gap: 4, marginTop: 2 },
  queue: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  queueName: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK, minWidth: 74 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 3 },
  legendText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: MUTED },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterOn: { backgroundColor: INK, borderColor: INK },
  filterText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  filterTextOn: { color: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
  },
  rowMark: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  rowTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },
  rowWhere: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: MUTED },
  rowWhat: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  allHead: { flexDirection: 'row', alignItems: 'center' },
  tline: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8, gap: 4 },
  tnum: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK },
  tfacts: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED },
  tverdict: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: MUTED },
  seg: { flexDirection: 'row', borderRadius: 10, borderWidth: 1, borderColor: LINE, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 9, paddingVertical: 5, backgroundColor: '#fff' },
  segOn: { backgroundColor: '#e0f2fe' },
  segText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: MUTED },
  segTextOn: { color: '#0369a1' },
  search: { maxWidth: 420, width: '100%' },
  field: { gap: 4 },
  fieldLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  input: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 9 : 6,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 15,
    color: INK,
    maxWidth: 160,
  },
});
