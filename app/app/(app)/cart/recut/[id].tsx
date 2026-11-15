import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyboardScroll } from '../../../../components/KeyboardScroll';
import { LoadFailure } from '../../../../components/LoadFailure';
import { confirm } from '../../../../components/ConfirmHost';
import { TerritoryMap, type MapShape } from '../../../../components/territories/TerritoryMap';
import { BRAND, INK, LINE, MUTED, Chip } from '../../../../components/reports/ReportBits';
import { failsScreen } from '../../../../lib/screen-failure';
import { extractErrorMessage, recutApi, type RecutView } from '../../../../lib/api';
import { km, PART_COLORS, RECUT_KEY, whereOf } from '../../../../lib/recut';
import { formatDayShort } from '../../../../lib/territory-view';

const BG = '#f1f5f9';
const OK = '#15803d';
const BAD = '#b91c1c';

/**
 * One proposal of the draft of re-cutting (15 November 2026; boards Cut,
 * Merge and Agree of the approved mockup): what the territory is now and
 * what it would become, on the map in the parts' colours, what still stands
 * before applying it, and the brothers' remarks — about the border only.
 */
export default function RecutProposalScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const tr = (k: string, o?: Record<string, unknown>) => t(k, o);
  const lang = i18n.language;
  const router = useRouter();
  const qc = useQueryClient();
  const viewQ = useQuery({
    queryKey: RECUT_KEY,
    queryFn: () => recutApi.view(),
    throwOnError: failsScreen,
    // While the parts' walks are being worked out, look again every few seconds.
    refetchInterval: (q) => (q.state.data?.walking ? 3000 : false),
  });
  const [error, setError] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState('');

  const put = (v: RecutView) => qc.setQueryData(RECUT_KEY, v);
  const fail = (e: unknown) => setError(extractErrorMessage(e));
  const remark = useMutation({
    mutationFn: (body: { ok: boolean; text?: string }) => recutApi.remark(id!, body),
    onSuccess: (v) => {
      put(v);
      setError(null);
      setWriting(false);
      setText('');
    },
    onError: fail,
  });
  const unremark = useMutation({
    mutationFn: () => recutApi.unremark(id!),
    onSuccess: (v) => {
      put(v);
      setError(null);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => recutApi.remove(id!),
    onSuccess: (v) => {
      put(v);
      router.back();
    },
    onError: fail,
  });

  const view = viewQ.data;
  const p = view?.proposals.find((x) => x.id === id) ?? null;
  const byId = useMemo(() => new Map((view?.territories ?? []).map((x) => [x.id, x])), [view]);

  if (viewQ.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={BRAND} />
      </View>
    );
  }
  if (viewQ.error || !view) return <LoadFailure error={viewQ.error} onRetry={() => viewQ.refetch()} />;
  if (!p) {
    return (
      <View style={{ flex: 1, backgroundColor: BG }}>
        <Stack.Screen options={{ title: t('territories.recut.title') }} />
        <View style={s.content}>
          <View style={s.card}>
            <Text style={s.body}>{t('territories.recut.proposal.notFound')}</Text>
          </View>
        </View>
      </View>
    );
  }

  const numbers = p.territories.map((x) => x.number);
  const nParts = Math.max(p.parts.length, (p.lines?.length ?? 0) + 1);
  const title =
    p.kind === 'cut'
      ? t('territories.recut.proposal.titleCut', { number: numbers[0], count: nParts })
      : t('territories.recut.proposal.titleMerge', { list: numbers.join(' + ') });
  const first = byId.get(p.territories[0]?.id ?? '');

  // The map: the parts in their colours (a cut), or the territories joined (a merge).
  const shapes: MapShape[] =
    p.kind === 'cut' && p.parts.length
      ? p.parts.map((part, i) => ({
          id: `${p.id}-${i}`,
          number: part.number,
          geometry: part.geometry,
          tone: 'free' as const,
          color: PART_COLORS[i % PART_COLORS.length],
        }))
      : p.territories
          .filter((x) => x.geometry)
          .map((x, i) => ({
            id: x.id,
            number: x.number,
            geometry: x.geometry!,
            tone: 'free' as const,
            color: p.kind === 'merge' ? '#1d4ed8' : PART_COLORS[i % PART_COLORS.length],
          }));

  const keepNumber =
    p.kind === 'merge' ? p.territories.find((x) => x.id === p.keepId)?.number ?? numbers[0] : numbers[0];
  const mine = p.remarks.find((r) => r.mine) ?? null;
  const meetingOn = p.territories.find((x) => x.meetingOn)?.meetingOn ?? null;
  const decided = !!p.approvedAt;
  const free = !p.blocks.includes('held') && !p.blocks.includes('meeting');
  const border = !p.blocks.includes('changed') && !p.blocks.includes('gone') && !p.blocks.includes('shape');
  const busy = remark.isPending || unremark.isPending || remove.isPending;
  const walkText = (w: number | null) =>
    w === null
      ? view.walking
        ? t('territories.recut.proposal.kmWait')
        : null
      : t('territories.recut.proposal.km', { km: km(w, lang) });

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* The header holds the territory; the full title is on the page, where it may wrap. */}
      <Stack.Screen
        options={{ title: numbers.length > 1 ? `${numbers[0]} +${numbers.length - 1}` : numbers[0] }}
      />
      <KeyboardScroll style={{ flex: 1 }} contentContainerStyle={s.content}>
        <View style={{ gap: 6 }}>
          <Text style={s.h1}>{title}</Text>
          <Text style={s.quiet}>
            {[whereOf(first, tr, lang), t('territories.recut.list.queue', { n: p.queue })].filter(Boolean).join(' · ')}
          </Text>
          <View style={s.chips}>
            {decided ? (
              <Chip
                tone="green"
                text={t('territories.recut.proposal.decidedAt', { date: formatDayShort(p.approvedAt!.slice(0, 10), lang) })}
              />
            ) : p.reopenedAt ? (
              <Chip tone="amber" text={t('territories.recut.proposal.reopenedAt')} />
            ) : null}
            {p.blocks
              .filter((b) => b !== 'notApproved')
              .map((b) => (
                <Chip
                  key={b}
                  // On the page's grey a grey chip is lost: blue for what only waits.
                  tone={b === 'held' || b === 'meeting' ? 'blue' : 'amber'}
                  text={t(`territories.recut.block.${b}`, { date: meetingOn ? formatDayShort(meetingOn, lang) : '' })}
                />
              ))}
          </View>
        </View>

        {error ? (
          <View style={s.error} accessibilityLiveRegion="polite">
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        {Platform.OS === 'web' && shapes.length ? (
          <View style={s.mapWrap}>
            <TerritoryMap shapes={shapes} height={340} />
            {p.kind === 'cut' ? (
              <Text style={[s.quiet, { padding: 10 }]}>{t('territories.recut.proposal.mapHint')}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Now */}
        <View style={s.card}>
          <Text style={s.kicker}>{t('territories.recut.proposal.now')}</Text>
          {p.territories.map((x) => {
            const f = byId.get(x.id);
            return (
              <View key={x.id} style={s.line}>
                <Text style={s.lineNum}>{x.number}</Text>
                <Text style={s.lineText}>
                  {f && f.homes != null && f.walkKm != null
                    ? [
                        t('territories.recut.proposal.nowLine', { homes: f.homes, km: km(f.walkKm, lang) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')
                    : '—'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Becomes */}
        <View style={s.card}>
          <Text style={s.kicker}>{t('territories.recut.proposal.becomes')}</Text>
          {p.kind === 'cut' ? (
            p.parts.length ? (
              p.parts.map((part, i) => (
                <View key={i} style={s.line}>
                  <View style={[s.swatch, { backgroundColor: PART_COLORS[i % PART_COLORS.length] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.lineStrong}>
                      {[
                        t('territories.recut.proposal.part', { number: part.number, homes: part.homes ?? '—' }),
                        walkText(part.walkKm),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    <Text style={s.quiet}>
                      {i === p.keep ? t('territories.recut.proposal.keeps') : t('territories.recut.proposal.newNumber')}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[s.body, { color: BAD }]}>{t('territories.recut.block.shape')}</Text>
            )
          ) : (
            <>
              <View style={s.line}>
                <View style={[s.swatch, { backgroundColor: '#1d4ed8' }]} />
                <Text style={[s.lineStrong, { flex: 1 }]}>
                  {[
                    t('territories.recut.proposal.part', {
                      number: keepNumber,
                      homes:
                        p.parts[0]?.homes ?? p.territories.reduce((n, x) => n + (byId.get(x.id)?.homes ?? 0), 0),
                    }),
                    walkText(p.parts[0]?.walkKm ?? null),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Text style={s.quiet}>{t('territories.recut.proposal.joinedKeeps', { number: keepNumber })}</Text>
            </>
          )}
        </View>

        {/* When it can be applied */}
        <View style={s.card}>
          <Text style={s.kicker}>{t('territories.recut.proposal.applyWhen')}</Text>
          {(
            [
              [decided, 'condDecided'],
              [free, 'condFree'],
              [border, 'condBorder'],
            ] as [boolean, string][]
          ).map(([ok, key]) => (
            <View key={key} style={s.cond}>
              <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={ok ? OK : MUTED} />
              <Text style={[s.lineText, { flex: 1 }]}>{t(`territories.recut.proposal.${key}`)}</Text>
            </View>
          ))}
          <Text style={s.quiet}>{t('territories.recut.proposal.applyLater')}</Text>
        </View>

        {/* Remarks */}
        <View style={s.card}>
          <Text style={s.kicker}>{t('territories.recut.remarks.title')}</Text>
          {p.remarks.length === 0 ? <Text style={s.quiet}>{t('territories.recut.remarks.none')}</Text> : null}
          {p.remarks.map((r, i) => (
            <View key={i} style={s.remark}>
              <Ionicons
                name={r.ok ? 'checkmark-circle-outline' : 'chatbubble-ellipses-outline'}
                size={16}
                color={r.ok ? OK : BRAND}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.lineText}>{r.ok ? t('territories.recut.remarks.okBy') : `«${r.text ?? ''}»`}</Text>
                <Text style={s.quiet}>
                  {[r.mine ? t('territories.recut.remarks.mine') : r.by, formatDayShort(r.at.slice(0, 10), lang)].join(' · ')}
                </Text>
              </View>
            </View>
          ))}

          {writing ? (
            <View style={{ gap: 6 }}>
              <Text style={s.fieldLabel}>{t('territories.recut.remarks.label')}</Text>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                maxLength={500}
                style={s.input}
                accessibilityLabel={t('territories.recut.remarks.label')}
              />
              <Text style={s.quiet}>{t('territories.recut.remarks.hint')}</Text>
              <View style={s.btnRow}>
                <Pressable
                  onPress={() => setWriting(false)}
                  style={({ pressed }) => [s.btnGhost, pressed && s.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={s.btnGhostText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => remark.mutate({ ok: false, text: text.trim() })}
                  disabled={busy || !text.trim()}
                  style={({ pressed }) => [s.btn, (busy || !text.trim()) && s.off, pressed && s.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={s.btnText}>{t('territories.recut.remarks.send')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={s.btnRow}>
              {!mine?.ok ? (
                <Pressable
                  onPress={() => remark.mutate({ ok: true })}
                  disabled={busy}
                  style={({ pressed }) => [s.btnGhost, busy && s.off, pressed && s.pressed]}
                  accessibilityRole="button"
                >
                  <Ionicons name="checkmark" size={16} color={OK} />
                  <Text style={[s.btnGhostText, { color: OK }]}>{t('territories.recut.remarks.ok')}</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => {
                  setText(mine && !mine.ok ? mine.text ?? '' : '');
                  setWriting(true);
                }}
                disabled={busy}
                style={({ pressed }) => [s.btnGhost, busy && s.off, pressed && s.pressed]}
                accessibilityRole="button"
              >
                <Ionicons name="chatbubble-outline" size={16} color={BRAND} />
                <Text style={s.btnGhostText}>{t('territories.recut.remarks.words')}</Text>
              </Pressable>
              {mine ? (
                <Pressable
                  onPress={() => unremark.mutate()}
                  disabled={busy}
                  style={({ pressed }) => [s.btnGhost, busy && s.off, pressed && s.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={[s.btnGhostText, { color: MUTED }]}>{t('territories.recut.remarks.takeBack')}</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        {view.canEdit ? (
          <Pressable
            onPress={async () => {
              const ok = await confirm({
                title: t('territories.recut.proposal.removeTitle'),
                body: t('territories.recut.proposal.removeBody'),
                confirmLabel: t('territories.recut.proposal.remove'),
                danger: true,
              });
              if (ok) remove.mutate();
            }}
            disabled={busy}
            style={({ pressed }) => [s.remove, busy && s.off, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="trash-outline" size={16} color={BAD} />
            <Text style={s.removeText}>{t('territories.recut.proposal.remove')}</Text>
          </Pressable>
        ) : null}
      </KeyboardScroll>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 110, gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  h1: { fontFamily: 'Manrope_800ExtraBold', fontSize: 21, color: INK },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mapWrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1, borderColor: LINE },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineNum: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK, minWidth: 70 },
  lineText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  lineStrong: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  cond: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remark: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fieldLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  input: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    fontFamily: 'Manrope_500Medium',
    fontSize: 14.5,
    color: INK,
  },
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
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 10 },
  removeText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BAD },
});
