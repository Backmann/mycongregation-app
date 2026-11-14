import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import {
  extractErrorMessage,
  territoriesApi,
  type DivisionMode,
  type DivisionPart,
  type DivisionPreview,
  type DivisionStreet,
  type TerritoryDivision,
} from '../../../../lib/api';
import { LoadFailure } from '../../../../components/LoadFailure';
import { failsScreen } from '../../../../lib/screen-failure';
import { NoAccess } from '../../../../components/NoAccess';
import { Sheet } from '../../../../components/Sheet';
import { QrCode } from '../../../../components/QrCode';
import { confirm } from '../../../../components/ConfirmHost';
import {
  TerritoryMap,
  type MapDot,
  type MapPoint,
  type MapRoute,
} from '../../../../components/territories/TerritoryMap';
import { StreetLine } from '../../../../components/territories/StreetLine';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../../../../components/reports/ReportBits';
import { siteOrigin } from '../../../../lib/territory-view';
import {
  clockOf,
  offerComplete,
  partAcross,
  partColor,
  partDone,
  PARTS_FIRST,
  rangeText,
  PARTS_MAX,
  PARTS_MIN,
  routeTo,
  streetsToTake,
  tooFine,
  walkedOf,
  walkingOrder,
  withTicks,
} from '../../../../lib/division';
import { useStreetTicks } from '../../../../lib/useStreetTicks';
import { useHere } from '../../../../lib/useHere';

const NC = '#c2410c';
const HERE = '#2563eb';

/** What the map draws of a division, saved or only looked at. */
function mapOf(
  parts: DivisionPart[],
  start: [number, number] | null,
  opts: { numbers: boolean; noCalls: boolean; here: [number, number] | null },
) {
  const routes: MapRoute[] = parts.flatMap((p) =>
    p.streets.map((x) => ({ lines: x.lines, color: partColor(p.n), walked: !!x.walkedAt })),
  );
  const dots: MapDot[] = parts.flatMap((p) =>
    p.streets.flatMap((x) =>
      (x.dots ?? []).map(([lon, lat]) => ({ lon, lat, color: partColor(p.n), walked: !!x.walkedAt })),
    ),
  );
  const points: MapPoint[] = [];
  if (start) points.push({ label: '', lon: start[0], lat: start[1], done: false, color: INK, kind: 'start' });
  for (const p of parts) {
    // «Каждой своё» has no common start: each part's own beginning, numbered.
    if (!start && p.start) {
      points.push({ label: String(p.n), lon: p.start[0], lat: p.start[1], done: partDone(p), color: partColor(p.n) });
    }
    if (opts.numbers) {
      walkingOrder(p.streets).forEach((x) => {
        const line = x.lines[0];
        const mid = line?.[Math.floor(line.length / 2)];
        if (mid && !x.walkedAt) {
          points.push({ label: String(x.step), lon: mid[0], lat: mid[1], done: false, color: partColor(p.n) });
        }
      });
    }
    if (opts.noCalls) {
      for (const c of p.noCalls ?? []) {
        if (c.at) points.push({ label: '!', lon: c.at[0], lat: c.at[1], done: false, color: NC, kind: 'nocall' });
      }
    }
  }
  if (opts.here) points.push({ label: '', lon: opts.here[0], lat: opts.here[1], done: false, color: HERE, kind: 'here' });
  return { routes, dots, points };
}

/**
 * A territory divided between pairs for today (13 November 2026; mockups
 * «Участок на группы», «Пары на участке»). Whoever sees the territory today
 * opens it: a division is looked at before it is saved («пары рядом» from
 * one start, or «каждой своё»; a pair may ask for less), the first division
 * of the day holds for everyone, each part reaches its pair in the app, by
 * a link good today only, or as a QR code held out on the spot; «street
 * walked» is ticked by whoever walks it — kept on the phone without a
 * connection — and seen by all. A pair done early takes a street of a pair
 * that has not started.
 */
export default function DivisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const key = ['territories', 'division', id];
  const [ended, setEnded] = useState(false);
  const q = useQuery({
    queryKey: key,
    queryFn: () => territoriesApi.division(id!),
    enabled: !!id && !ended,
    retry: false,
    throwOnError: failsScreen,
    // Other pairs tick their streets: keep the picture fresh on the spot.
    refetchInterval: 60 * 1000,
  });
  const [count, setCount] = useState(PARTS_FIRST);
  const [mode, setMode] = useState<DivisionMode>('near');
  const [smaller, setSmaller] = useState<number[]>([]);
  const [again, setAgain] = useState(false);
  const [moving, setMoving] = useState<DivisionStreet | null>(null);
  const [taking, setTaking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const here = useHere();

  const done = (d: TerritoryDivision) => {
    qc.setQueryData(key, d);
    setError(null);
  };
  const d = q.data;
  const split = d?.split ?? null;
  // Plain values, not `split!.id`: the compiler reads what a callback uses while rendering.
  const splitId = split?.id ?? '';
  const assignmentId = d?.assignmentId ?? '';
  const choosing = !!d && (!split || again);

  const preview = useQuery({
    queryKey: ['territories', 'division-preview', id, count, mode, smaller.join(','), d?.walked ?? 0],
    queryFn: () => territoriesApi.previewDivision(id!, count, { mode, smaller }),
    enabled: !!id && choosing,
    retry: false,
    staleTime: 60 * 1000,
  });

  const divide = useMutation({
    mutationFn: (redo: boolean) => territoriesApi.divide(id!, count, redo, { mode, smaller }),
    onSuccess: (r) => {
      done(r);
      setAgain(false);
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const ticks = useStreetTicks<TerritoryDivision>(
    split ? `div:${split.id}` : null,
    (k, walked) => territoriesApi.markStreet(splitId, k, walked),
    done,
  );
  const move = useMutation({
    mutationFn: (v: { key: string; to: number }) => territoriesApi.moveStreet(splitId, v.key, v.to),
    onSuccess: (r) => {
      done(r);
      setMoving(null);
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const take = useMutation({
    mutationFn: (v: { key: string; to: number }) => territoriesApi.takeStreet(splitId, v.key, v.to),
    onSuccess: (r) => {
      done(r);
      setTaking(null);
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => territoriesApi.removeDivision(splitId),
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const complete = useMutation({
    mutationFn: () => territoriesApi.complete(assignmentId),
    onSuccess: () => {
      setEnded(true);
      void qc.invalidateQueries({ queryKey: ['territories'] });
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  // The ticks still waiting on the phone are shown as made.
  const parts = useMemo(
    () => split?.parts.map((p) => ({ ...p, streets: withTicks(p.streets, ticks.queue) })) ?? [],
    [split, ticks.queue],
  );
  const shown: DivisionPreview | null = choosing ? (preview.data ?? null) : null;
  const drawn = useMemo(
    () =>
      shown
        ? mapOf(shown.parts, shown.start, { numbers: false, noCalls: false, here: here.here })
        : mapOf(parts, split?.start ?? null, { numbers: false, noCalls: true, here: here.here }),
    [shown, parts, split, here.here],
  );

  if (ended) {
    return (
      <View style={s.center}>
        <Ionicons name="checkmark-circle" size={36} color="#15803d" />
        <Text style={s.endedText}>{t('territories.division.completed')}</Text>
      </View>
    );
  }
  if (q.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (q.error instanceof AxiosError && q.error.response?.status === 403) return <NoAccess />;
  if (q.error || !d) {
    // «Not given out» and the like: the server's words, not a crash screen.
    if (q.error instanceof AxiosError && q.error.response?.status === 409) {
      return (
        <View style={s.center}>
          <Text style={s.muted}>{extractErrorMessage(q.error)}</Text>
        </View>
      );
    }
    return <LoadFailure error={q.error} onRetry={() => q.refetch()} />;
  }

  const left = d.houses - d.walked;
  const busy = divide.isPending || move.isPending || take.isPending || remove.isPending || ticks.busy;
  const allDone = parts.length > 0 && walkedOf(parts).streetsWalked === walkedOf(parts).streets;
  const toggleSmaller = (n: number) =>
    setSmaller((was) => (was.includes(n) ? was.filter((x) => x !== n) : [...was, n].sort()));
  const askRemove = async () => {
    const ok = await confirm({
      title: t('territories.division.removeTitle'),
      body: t('territories.division.removeBody'),
      confirmLabel: t('territories.division.remove'),
      danger: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <View style={s.screen}>
      <Stack.Screen options={{ title: t('territories.division.title', { number: d.number }) }} />
      <ScrollView contentContainerStyle={s.content}>
        <View style={[cardStyles.card, s.card]}>
          <Text style={s.kicker}>{d.locality ?? t('territories.division.kicker')}</Text>
          <Text style={s.number}>{d.number}</Text>
          <Text style={s.progressText}>
            {t('territories.division.walked', { walked: d.walked, count: d.houses })}
            {d.lastWalkedAt ? ` · ${t('territories.division.lastAt', { time: clockOf(d.lastWalkedAt) })}` : ''}
          </Text>
          <View style={s.bar}>
            <View style={[s.barFill, { width: `${d.houses ? Math.round((d.walked / d.houses) * 100) : 0}%` }]} />
          </View>
        </View>

        {Platform.OS === 'web' && (split || shown) ? (
          <View>
            <TerritoryMap
              shapes={[{ id: 'division', number: d.number, geometry: d.geometry, tone: 'mine' }]}
              focus="division"
              height={340}
              routes={drawn.routes}
              dots={drawn.dots}
              points={drawn.points}
            />
            <MapLegend common={!!(shown ? shown.start : split?.start)} here={here} />
          </View>
        ) : null}

        {choosing ? (
          <View style={[cardStyles.card, s.card]}>
            <Text style={s.h}>{t('territories.division.how')}</Text>
            <View style={s.seg}>
              {Array.from({ length: PARTS_MAX - PARTS_MIN + 1 }, (_, i) => PARTS_MIN + i).map((n) => (
                <Pressable
                  key={n}
                  onPress={() => {
                    setCount(n);
                    setSmaller((was) => was.filter((x) => x <= n));
                  }}
                  style={[s.segItem, count === n && s.segOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: count === n }}
                >
                  <Text style={[s.segText, count === n && s.segTextOn]}>{n}</Text>
                </Pressable>
              ))}
            </View>

            <View style={s.modes}>
              {(['near', 'own'] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[s.mode, mode === m && s.modeOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: mode === m }}
                >
                  <View style={[s.radio, mode === m && s.radioOn]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.modeTitle}>{t(`territories.division.mode.${m}`)}</Text>
                    <Text style={s.modeHint}>{t(`territories.division.mode.${m}Hint`)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            <Text style={s.hint}>{t('territories.division.sidesHint')}</Text>

            <PreviewParts
              preview={shown}
              loading={preview.isFetching && !shown}
              failed={preview.error ? extractErrorMessage(preview.error) : null}
              smaller={smaller}
              onSmaller={toggleSmaller}
              onFewer={(n) => {
                setCount(n);
                setSmaller((was) => was.filter((x) => x <= n));
              }}
            />

            {d.walked > 0 ? (
              <Text style={s.hint}>{t('territories.division.restHint', { count: left })}</Text>
            ) : null}
            <Text style={s.hint}>{t('territories.division.firstHolds')}</Text>
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Pressable
              onPress={() => divide.mutate(!!split)}
              disabled={busy || (d.walked > 0 && left <= 0)}
              style={({ pressed }) => [s.cta, (busy || pressed) && { opacity: 0.75 }]}
              accessibilityRole="button"
            >
              {divide.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.ctaText}>
                  {d.walked > 0
                    ? t('territories.division.divideRest', { count })
                    : t('territories.division.divide', { count })}
                </Text>
              )}
            </Pressable>
            {again ? (
              <Pressable onPress={() => setAgain(false)} style={s.second} accessibilityRole="button">
                <Text style={s.secondText}>{t('common.cancel')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {split && !again ? (
          <>
            {error || ticks.error ? <Text style={s.error}>{error ?? ticks.error}</Text> : null}
            {ticks.stuck && ticks.queue.length > 0 ? (
              <View style={s.offline}>
                <Ionicons name="cloud-offline-outline" size={16} color="#92400e" />
                <Text style={s.offlineText}>
                  {t('territories.division.waiting', { count: ticks.queue.length })}
                </Text>
              </View>
            ) : null}
            {parts.map((p) => (
              <PartCard
                key={p.n}
                part={p}
                parts={parts}
                number={d.number}
                divisionId={split.id}
                mayMove={d.mayRedo && parts.length > 1}
                // A pair done early may take a street of a pair that has not started.
                canTake={partDone(p) && streetsToTake(parts, p.n).length > 0}
                stuck={ticks.stuck}
                busy={busy}
                onMark={(k, w) => void ticks.tick(k, w)}
                onMove={(x) => setMoving(x)}
                onTake={() => setTaking(p.n)}
              />
            ))}
            {split.leftOut > 0 ? (
              <Text style={s.hint}>{t('territories.division.leftOut', { count: split.leftOut })}</Text>
            ) : null}
            {offerComplete(parts, !!d.mayComplete) && ticks.queue.length === 0 ? (
              <View style={[cardStyles.card, s.card, s.completeCard]}>
                <Text style={s.completeTitle}>{t('territories.division.completeAsk')}</Text>
                <Text style={s.hint}>{t('territories.division.completeHint')}</Text>
                <Pressable
                  onPress={() => complete.mutate()}
                  disabled={complete.isPending}
                  style={({ pressed }) => [s.cta, s.ctaGreen, (complete.isPending || pressed) && { opacity: 0.75 }]}
                  accessibilityRole="button"
                >
                  {complete.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={s.ctaText}>{t('territories.division.complete')}</Text>
                  )}
                </Pressable>
              </View>
            ) : allDone ? (
              <Text style={s.allDone}>{t('territories.division.allWalked')}</Text>
            ) : null}
            {d.mayRedo ? (
              <View style={{ gap: 8 }}>
                <Pressable
                  onPress={() => {
                    setCount(Math.min(PARTS_MAX, Math.max(PARTS_MIN, split.parts.length)));
                    setMode(split.mode ?? 'near');
                    setSmaller([]);
                    setAgain(true);
                    setError(null);
                  }}
                  style={s.ghost}
                  accessibilityRole="button"
                >
                  <Ionicons name="cut-outline" size={17} color={INK} />
                  <Text style={s.ghostText}>
                    {d.walked > 0 ? t('territories.division.againRest') : t('territories.division.again')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => void askRemove()} disabled={busy} style={s.ghost} accessibilityRole="button">
                  <Ionicons name="close-outline" size={18} color="#b91c1c" />
                  <Text style={[s.ghostText, { color: '#b91c1c' }]}>{t('territories.division.remove')}</Text>
                </Pressable>
                <Text style={s.hint}>{t('territories.division.removeWho')}</Text>
              </View>
            ) : (
              <Text style={s.hint}>{t('territories.division.againWho')}</Text>
            )}
          </>
        ) : null}
      </ScrollView>

      <Sheet
        visible={!!moving}
        title={t('territories.division.moveTitle')}
        subtitle={moving ? <StreetLine street={moving} /> : undefined}
        onClose={() => setMoving(null)}
        variant="bottom"
      >
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {parts.map((p) => {
            const there = p.streets.some((x) => x.key === moving?.key);
            return (
              <Pressable
                key={p.n}
                disabled={there || move.isPending}
                onPress={() => moving && move.mutate({ key: moving.key, to: p.n })}
                style={[s.moveTo, { borderLeftColor: partColor(p.n) }, there && { opacity: 0.45 }]}
                accessibilityRole="button"
              >
                <Text style={s.partTitle}>{t('territories.division.part', { n: p.n })}</Text>
                <Text style={s.partHouses}>
                  {there ? t('territories.division.here') : t('territories.division.houses', { count: p.houses })}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>

      <Sheet
        visible={taking !== null}
        title={t('territories.division.takeTitle')}
        subtitle={<Text style={s.hint}>{t('territories.division.takeHint')}</Text>}
        onClose={() => setTaking(null)}
        variant="bottom"
      >
        <View style={{ gap: 8, paddingBottom: 8 }}>
          {taking !== null
            ? streetsToTake(parts, taking).map(({ from, street }) => (
                <Pressable
                  key={street.key}
                  disabled={take.isPending}
                  onPress={() => take.mutate({ key: street.key, to: taking })}
                  style={[s.moveTo, { borderLeftColor: partColor(from) }]}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <StreetLine street={street} />
                  </View>
                  <Text style={[s.partHouses, { color: partColor(from) }]}>
                    {t('territories.division.part', { n: from })}
                  </Text>
                </Pressable>
              ))
            : null}
        </View>
      </Sheet>
    </View>
  );
}

/** What the marks on the map mean, and «вы здесь» — asked for only on a tap. */
function MapLegend({ common, here }: { common: boolean; here: ReturnType<typeof useHere> }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <View style={s.legend}>
      {common ? (
        <View style={s.legendItem}>
          <View style={[s.legendDot, { backgroundColor: INK, borderWidth: 2, borderColor: '#fff' }]} />
          <Text style={s.legendText}>{t('territories.division.legendStart')}</Text>
        </View>
      ) : null}
      <View style={s.legendItem}>
        <View style={[s.legendDot, { backgroundColor: '#9ca3af', width: 8, height: 8 }]} />
        <Text style={s.legendText}>{t('territories.division.legendWalked')}</Text>
      </View>
      {here.available ? (
        <Pressable onPress={here.toggle} style={[s.hereBtn, here.on && s.hereOn]} accessibilityRole="button">
          <Ionicons name="locate-outline" size={14} color={here.on ? '#fff' : HERE} />
          <Text style={[s.hereText, here.on && { color: '#fff' }]}>{t('territories.division.whereAmI.button')}</Text>
        </Pressable>
      ) : null}
      {here.on ? <Text style={s.legendNote}>{t('territories.division.whereAmI.private')}</Text> : null}
      <Text
        style={[s.legendNote, s.sourcesLink]}
        onPress={() => router.push('/legal?doc=sources' as never)}
        accessibilityRole="link"
      >
        {t('territories.division.sources')}
      </Text>
      {here.failed ? <Text style={s.legendNote}>{t('territories.division.whereAmI.failed')}</Text> : null}
    </View>
  );
}

/** The parts of a division looked at before saving: how even, and «поменьше». */
function PreviewParts({
  preview,
  loading,
  failed,
  smaller,
  onSmaller,
  onFewer,
}: {
  preview: DivisionPreview | null;
  loading: boolean;
  failed: string | null;
  smaller: number[];
  onSmaller: (n: number) => void;
  onFewer: (n: number) => void;
}) {
  const { t } = useTranslation();
  if (failed) return <Text style={s.error}>{failed}</Text>;
  if (!preview) return loading ? <ActivityIndicator color={BRAND} style={{ marginTop: 12 }} /> : null;
  const doors = preview.parts.map((p) => p.doors);
  const fine = tooFine(preview.parts, smaller);
  return (
    <View style={s.preview}>
      {fine ? (
        <View style={s.fine}>
          <Text style={s.fineText}>
            {fine.why === 'small'
              ? t('territories.division.tooSmall', { count: fine.least, pairs: preview.parts.length })
              : t('territories.division.tooUneven', { count: preview.parts.length })}
          </Text>
          <Pressable onPress={() => onFewer(fine.fewer)} style={s.fineBtn} accessibilityRole="button">
            <Text style={s.fineBtnText}>{t('territories.division.fewer', { count: fine.fewer })}</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={s.previewHead}>
        {t('territories.division.previewDoors', { doors: doors.join(' · ') })}
        {preview.start
          ? ` · ${t(preview.startFrom === 'meeting' ? 'territories.division.startMeeting' : 'territories.division.startMiddle')}`
          : ''}
      </Text>
      {preview.parts.map((p) => (
        <View key={p.n} style={[s.previewPart, { borderLeftColor: partColor(p.n) }]}>
          <View style={s.previewTop}>
            <Text style={s.previewTitle}>{t('territories.division.part', { n: p.n })}</Text>
            <Text style={[s.partHouses, { color: partColor(p.n) }]}>
              {t('territories.division.doors', { count: p.doors })}
            </Text>
          </View>
          <Text style={s.previewStreets} numberOfLines={3}>
            {p.streets
              .map((x) => [x.name, rangeText(x)].filter(Boolean).join(' '))
              .join(' · ')}
          </Text>
          <Pressable
            onPress={() => onSmaller(p.n)}
            style={[s.smaller, smaller.includes(p.n) && s.smallerOn]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: smaller.includes(p.n) }}
          >
            <Text style={[s.smallerText, smaller.includes(p.n) && { color: '#fff' }]}>
              {t('territories.division.smaller')}
            </Text>
          </Pressable>
        </View>
      ))}
      {preview.leftOut > 0 ? (
        <Text style={s.hint}>{t('territories.division.leftOut', { count: preview.leftOut })}</Text>
      ) : null}
    </View>
  );
}

function PartCard({
  part,
  parts,
  number,
  divisionId,
  mayMove,
  canTake,
  stuck,
  busy,
  onMark,
  onMove,
  onTake,
}: {
  part: DivisionPart & { streets: (DivisionStreet & { pending: boolean })[] };
  parts: DivisionPart[];
  number: string;
  divisionId: string;
  mayMove: boolean;
  canTake: boolean;
  /** Ticks wait for a connection: say so on them. */
  stuck: boolean;
  busy: boolean;
  onMark: (key: string, walked: boolean) => void;
  onMove: (s: DivisionStreet) => void;
  onTake: () => void;
}) {
  const { t } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const color = partColor(part.n);
  const w = walkedOf([part]);
  const route = routeTo(part.start);

  const link = useMutation({
    mutationFn: () => territoriesApi.partLink(divisionId, part.n),
  });
  const urlOf = async () => `${siteOrigin()}${(await link.mutateAsync()).path}`;
  const send = async () => {
    try {
      const url = await urlOf();
      const text = t('territories.division.linkMessage', { number, n: part.n, url });
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'share' in navigator) {
        await (navigator as Navigator & { share: (d: { text: string }) => Promise<void> }).share({ text });
      } else if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        await Share.share({ message: text });
      }
      setLinkNote(t('territories.division.linkReady'));
    } catch (e) {
      // Closed without sending is no failure; a refusal is.
      if (e instanceof AxiosError) setLinkNote(extractErrorMessage(e));
    }
  };
  const showQr = async () => {
    if (qr) {
      setQr(null);
      return;
    }
    try {
      setQr(await urlOf());
    } catch (e) {
      setLinkNote(extractErrorMessage(e));
    }
  };

  return (
    <View style={[cardStyles.card, s.part, { borderLeftColor: color }]}>
      <View style={s.partHead}>
        <View style={[s.dot, { backgroundColor: color }]} />
        <Text style={s.partTitle}>{t('territories.division.part', { n: part.n })}</Text>
        <Text style={[s.partHouses, { color }]}>{t('territories.division.houses', { count: part.houses })}</Text>
      </View>
      <Text style={s.partSub}>
        {partDone(part)
          ? t('territories.division.partDone')
          : t('territories.division.streetsWalked', { walked: w.streetsWalked, count: w.streets })}
      </Text>

      <View style={{ marginTop: 6 }}>
        {walkingOrder(part.streets).map((x) => (
          <View key={x.key} style={s.street}>
            <Text style={[s.step, { color: x.walkedAt ? MUTED : color }]}>{x.step}</Text>
            <Pressable
              onPress={() => onMark(x.key, !x.walkedAt)}
              disabled={busy}
              style={[s.box, x.walkedAt && s.boxOn, x.pending && stuck && s.boxPending]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!x.walkedAt }}
              accessibilityLabel={x.name}
              hitSlop={8}
            >
              {x.walkedAt ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
            </Pressable>
            <Pressable
              style={{ flex: 1, minWidth: 0 }}
              onPress={mayMove ? () => onMove(x) : undefined}
              disabled={!mayMove}
              accessibilityRole={mayMove ? 'button' : undefined}
            >
              <StreetLine street={x} across={partAcross(parts, part.n, x)} pending={x.pending && stuck} />
            </Pressable>
            {x.walkedAt && !x.pending ? <Text style={s.walkedAt}>{clockOf(x.walkedAt)}</Text> : null}
          </View>
        ))}
      </View>

      {part.noCalls && part.noCalls.length > 0 ? (
        <View style={s.nc}>
          <Text style={s.ncHead}>
            {t('territories.division.noCalls', { count: part.noCalls.length })}
          </Text>
          {part.noCalls.map((c) => (
            <Text key={c.id} style={s.ncText}>
              {c.address}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={s.partActions}>
        <Pressable onPress={() => void send()} style={s.chip} accessibilityRole="button">
          <Ionicons name="share-outline" size={15} color={BRAND} />
          <Text style={s.chipText}>{t('territories.division.link')}</Text>
        </Pressable>
        <Pressable onPress={() => void showQr()} style={[s.chip, qr && s.chipOn]} accessibilityRole="button">
          <Ionicons name="qr-code-outline" size={15} color={qr ? '#fff' : BRAND} />
          <Text style={[s.chipText, qr && { color: '#fff' }]}>{t('territories.division.qr')}</Text>
        </Pressable>
        {route ? (
          <Pressable onPress={() => void Linking.openURL(route)} style={s.chip} accessibilityRole="link">
            <Ionicons name="navigate-outline" size={15} color={BRAND} />
            <Text style={s.chipText}>{t('territories.division.route')}</Text>
          </Pressable>
        ) : null}
        {canTake ? (
          <Pressable onPress={onTake} style={s.chip} accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={15} color={BRAND} />
            <Text style={s.chipText}>{t('territories.division.take')}</Text>
          </Pressable>
        ) : null}
        {link.isPending ? <ActivityIndicator color={BRAND} /> : null}
      </View>
      {linkNote ? <Text style={s.hint}>{linkNote}</Text> : null}
      {qr ? (
        <View style={s.qr}>
          <QrCode value={qr} size={220} />
          <Text style={s.qrHint}>{t('territories.division.qrHint', { n: part.n })}</Text>
        </View>
      ) : null}
      {part.noCalls && part.noCalls.length > 0 ? (
        <Text style={s.ncLink}>{t('territories.division.noCallsByLink')}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f3f5f7' },
  content: { padding: 16, paddingBottom: 48, maxWidth: 760, width: '100%', alignSelf: 'center', gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  muted: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: MUTED, textAlign: 'center' },
  endedText: { fontFamily: 'Manrope_700Bold', fontSize: 16, color: INK, textAlign: 'center', maxWidth: 360 },
  card: { marginBottom: 0 },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  number: { fontFamily: 'Manrope_800ExtraBold', fontSize: 24, color: INK, marginTop: 2 },
  progressText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: MUTED, marginTop: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: LINE, overflow: 'hidden', marginTop: 8 },
  barFill: { height: '100%', backgroundColor: '#16a34a', borderRadius: 4 },
  h: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },
  seg: { flexDirection: 'row', gap: 6, marginTop: 10 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff' },
  segOn: { backgroundColor: INK, borderColor: INK },
  segText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: MUTED },
  segTextOn: { color: '#fff' },
  modes: { gap: 8, marginTop: 12 },
  mode: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: LINE, backgroundColor: '#fff' },
  modeOn: { borderColor: BRAND, backgroundColor: '#f0fdfa' },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: LINE, marginTop: 1 },
  radioOn: { borderColor: BRAND, borderWidth: 6 },
  modeTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  modeHint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 17 },
  preview: { marginTop: 12, gap: 8 },
  fine: { backgroundColor: '#fff7ed', borderRadius: 12, padding: 10, gap: 8 },
  fineText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#9a3412', lineHeight: 17 },
  fineBtn: { alignSelf: 'flex-start', borderRadius: 999, backgroundColor: '#9a3412', paddingHorizontal: 12, paddingVertical: 6 },
  fineBtnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12.5, color: '#fff' },
  previewHead: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#15803d' },
  previewPart: { borderLeftWidth: 4, borderRadius: 10, backgroundColor: '#f8fafc', padding: 10, gap: 4 },
  previewTop: { flexDirection: 'row', alignItems: 'center' },
  previewTitle: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  previewStreets: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: INK, lineHeight: 17 },
  smaller: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, borderColor: LINE, paddingHorizontal: 10, paddingVertical: 4, marginTop: 2, backgroundColor: '#fff' },
  smallerOn: { backgroundColor: INK, borderColor: INK },
  smallerText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: INK },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 8, lineHeight: 17 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 8 },
  cta: { backgroundColor: BRAND, borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  ctaGreen: { backgroundColor: '#15803d' },
  ctaText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  second: { paddingVertical: 10, alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: LINE, marginTop: 8 },
  secondText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fef3c7', borderRadius: 12, padding: 10 },
  offlineText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#92400e' },
  part: { marginBottom: 0, borderLeftWidth: 5 },
  partHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  partTitle: { flex: 1, fontFamily: 'Manrope_800ExtraBold', fontSize: 16, color: INK },
  partHouses: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: MUTED },
  partSub: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: MUTED, marginTop: 2 },
  street: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: LINE },
  step: { width: 18, textAlign: 'center', fontFamily: 'Manrope_800ExtraBold', fontSize: 14 },
  box: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: LINE, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  boxPending: { backgroundColor: '#d97706', borderColor: '#d97706' },
  walkedAt: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#15803d' },
  nc: { backgroundColor: '#fff4ed', borderRadius: 12, padding: 10, marginTop: 8, gap: 2 },
  ncHead: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: NC },
  ncText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK, marginLeft: 4 },
  ncLink: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: NC, marginTop: 6 },
  partActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#ecfeff' },
  chipOn: { backgroundColor: BRAND },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  qr: { alignItems: 'center', gap: 8, marginTop: 12 },
  qrHint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 320 },
  allDone: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#15803d', textAlign: 'center' },
  completeCard: { borderLeftWidth: 5, borderLeftColor: '#15803d' },
  completeTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: INK },
  ghost: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderColor: LINE, borderRadius: 14, paddingVertical: 12, backgroundColor: '#fff' },
  ghostText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  moveTo: { borderLeftWidth: 5, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 14, height: 14, borderRadius: 7 },
  legendText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: MUTED },
  sourcesLink: { color: BRAND, textDecorationLine: 'underline' },
  legendNote: { width: '100%', fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: MUTED },
  hereBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, borderWidth: 1, borderColor: HERE, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 'auto' },
  hereOn: { backgroundColor: HERE },
  hereText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: HERE },
});
