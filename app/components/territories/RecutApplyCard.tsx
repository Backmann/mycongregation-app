import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { confirm } from '../ConfirmHost';
import { extractErrorMessage, recutApi, type RecutProposal } from '../../lib/api';
import { PART_COLORS, RECUT_KEY } from '../../lib/recut';
import { formatDayShort } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

const OK = '#15803d';
const AMBER = '#b45309';
const BAD = '#b91c1c';

/**
 * «Применить» on a decided proposal (16 November 2026, step 5 of the
 * re-cutting draft; board 6a). What stands in the way, or what it makes:
 * the parts and their numbers, the day they count as last worked, where
 * the «не посещать» addresses go — those the official addresses do not
 * place, the keeper places. Applied, it offers «Вернуть как было» while no
 * part has been given out (the server checks that).
 */
export function RecutApplyCard({ p }: { p: RecutProposal }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  // Applied a moment ago: the draft has not said so yet — not asked again.
  const [justApplied, setJustApplied] = useState(false);
  const open = p.state === 'open' && !!p.approvedAt && !justApplied;
  const checkQ = useQuery({
    queryKey: [...RECUT_KEY, 'apply', p.id],
    queryFn: () => recutApi.applyCheck(p.id),
    enabled: open,
  });
  const c = checkQ.data;
  const [choice, setChoice] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => {
    setChoice({});
    setError(null);
  }, [p.id]);
  useEffect(() => {
    if (p.state === 'open') setJustApplied(false);
  }, [p.state]);

  // The check of an applied proposal is refused by the server: it is not
  // asked again once applied or undone, only the rest is refreshed.
  const refresh = () => {
    qc.removeQueries({ queryKey: [...RECUT_KEY, 'apply', p.id] });
    return qc.invalidateQueries({
      queryKey: ['territories'],
      predicate: (q) => !(q.queryKey[2] === 'apply' && q.queryKey[3] === p.id),
    });
  };
  const apply = useMutation({
    mutationFn: () =>
      recutApi.apply(p.id, {
        updatedAt: c!.updatedAt,
        noCalls: Object.entries(choice).map(([id, part]) => ({ id, part })),
      }),
    onSuccess: async (r) => {
      setJustApplied(true);
      setError(null);
      setDone(t('territories.recut.apply.done', { list: [r.kept, ...r.made].join(', ') }));
      await refresh();
    },
    onError: (e) => {
      setError(extractErrorMessage(e));
      void checkQ.refetch();
    },
  });
  const unapply = useMutation({
    mutationFn: () => recutApi.unapply(p.id),
    onSuccess: async () => {
      setError(null);
      setDone(t('territories.recut.apply.undone'));
      await refresh();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const hold = useMutation({
    mutationFn: (x: { territoryId: string; on: boolean }) => recutApi.hold(p.id, x.territoryId, x.on),
    onSuccess: () => void refresh(),
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const busy = apply.isPending || unapply.isPending || hold.isPending;

  // Applied: what happened, and the way back.
  if (p.state === 'applied') {
    return (
      <View style={[s.card, s.cardDone]}>
        <Text style={[s.kicker, { color: OK }]}>{t('territories.recut.apply.appliedKicker')}</Text>
        <Text style={s.body}>
          {p.appliedAt ? t('territories.recut.apply.appliedOn', { date: formatDayShort(p.appliedAt.slice(0, 10), lang) }) : ''}
        </Text>
        {done ? <Text style={[s.body, { color: OK }]}>{done}</Text> : null}
        <Pressable
          onPress={async () => {
            const ok = await confirm({
              title: t('territories.recut.apply.undoTitle'),
              body: t('territories.recut.apply.undoBody'),
              confirmLabel: t('territories.recut.apply.undo'),
            });
            if (ok) unapply.mutate();
          }}
          disabled={busy}
          style={({ pressed }) => [s.ghost, busy && s.off, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Ionicons name="arrow-undo-outline" size={16} color={BRAND} />
          <Text style={s.ghostText}>{t('territories.recut.apply.undo')}</Text>
        </Pressable>
        <Text style={s.quiet}>{t('territories.recut.apply.undoHint')}</Text>
        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    );
  }
  if (!open) return null;
  if (checkQ.isLoading || !c) {
    return (
      <View style={s.card}>
        {checkQ.error ? (
          <Text style={s.error}>{extractErrorMessage(checkQ.error)}</Text>
        ) : (
          <ActivityIndicator color={BRAND} />
        )}
      </View>
    );
  }

  const cut = c.kind === 'cut';
  const ready = c.blocks.length === 0;
  const unplaced = c.noCalls.filter((n) => n.part === null);
  const placed = c.noCalls.length - unplaced.length;
  const allChosen = unplaced.every((n) => choice[n.id] !== undefined);
  const may = ready && allChosen && !busy;
  const conditions: [boolean, string][] = [
    [!c.blocks.includes('held'), cut ? 'territories.recut.apply.condFreeCut' : 'territories.recut.apply.condFreeJoin'],
    [!c.blocks.includes('meeting'), 'territories.recut.apply.condMeeting'],
    [
      !c.blocks.includes('changed') && !c.blocks.includes('shape') && !c.blocks.includes('gone'),
      cut ? 'territories.recut.apply.condBorder' : 'territories.recut.apply.condBorderJoin',
    ],
  ];
  if (cut) conditions.push([!c.blocks.includes('number'), 'territories.recut.apply.condNumbers']);

  return (
    <View style={[s.card, ready && s.cardReady]}>
      <Text style={[s.kicker, { color: ready ? OK : AMBER }]}>
        {t(ready ? 'territories.recut.apply.kickerReady' : 'territories.recut.apply.kickerWait')}
      </Text>
      {conditions.map(([ok, key]) => (
        <View key={key} style={s.cond}>
          <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={ok ? OK : MUTED} />
          <Text style={[s.body, { flex: 1 }]}>
            {t(key)}
          </Text>
        </View>
      ))}
      {c.takenNumber ? (
        <Text style={s.error}>{t('territories.recut.apply.numberTaken', { number: c.takenNumber })}</Text>
      ) : null}

      {/* A join still waiting: who is out, and holding the free ones back */}
      {!cut && c.standing && c.standing.waiting.length ? (
        <View style={{ gap: 6 }}>
          <Text style={s.body}>
            {t('territories.recut.apply.freeOf', {
              free: c.standing.free,
              total: c.standing.total,
              list: c.standing.waiting
                .map((w) => t('territories.recut.apply.heldSince', { number: w.number, date: formatDayShort(w.since, lang) }))
                .join(', '),
            })}
          </Text>
          {p.territories
            .filter((x) => !x.held)
            .map((x) => {
              const on = c.holdIds.includes(x.id);
              return (
                <View key={x.id} style={s.holdRow}>
                  <Text style={[s.body, { flex: 1 }]}>
                    {x.number}
                    {on ? <Text style={{ color: AMBER }}>{` · ${t('territories.recut.apply.heldShort')}`}</Text> : null}
                  </Text>
                  <Pressable
                    onPress={() => hold.mutate({ territoryId: x.id, on: !on })}
                    disabled={busy}
                    style={({ pressed }) => [s.ghostSmall, busy && s.off, pressed && s.pressed]}
                    accessibilityRole="button"
                  >
                    <Text style={s.ghostText}>{t(on ? 'territories.recut.apply.letGo' : 'territories.recut.apply.hold')}</Text>
                  </Pressable>
                </View>
              );
            })}
          <Text style={s.quiet}>{t('territories.recut.apply.holdHint')}</Text>
        </View>
      ) : null}

      {/* What it makes */}
      {c.parts.length ? (
        <View style={{ gap: 6, marginTop: 4 }}>
          {c.parts.map((part, i) => (
            <View key={i} style={s.part}>
              <View
                style={[s.swatch, { backgroundColor: cut ? PART_COLORS[i % PART_COLORS.length] : '#1d4ed8' }]}
              />
              <Text style={[s.strong, { flex: 1 }]}>{part.number}</Text>
              <Text style={s.quiet}>
                {part.keeps ? t('territories.recut.apply.keepsHistory') : t('territories.recut.apply.newNumber')}
              </Text>
            </View>
          ))}
          <Text style={s.quiet}>
            {c.lastWorkedOn
              ? t(cut ? 'territories.recut.apply.lastWorkedCut' : 'territories.recut.apply.lastWorkedJoin', {
                  date: formatDayShort(c.lastWorkedOn, lang),
                })
              : t('territories.recut.apply.lastWorkedNever')}
          </Text>
        </View>
      ) : null}

      {/* «Не посещать»: placed by the official addresses, or by hand */}
      {cut && c.noCalls.length ? (
        <View style={s.noCalls}>
          <Text style={[s.kicker, { color: AMBER }]}>{t('territories.recut.apply.noCallsKicker', { count: c.noCalls.length })}</Text>
          {placed ? <Text style={s.body}>{t('territories.recut.apply.noCallsPlaced', { count: placed })}</Text> : null}
          {unplaced.map((n) => (
            <View key={n.id} style={{ gap: 6 }}>
              <Text style={s.strong}>{t('territories.recut.apply.noCallsChoose', { address: n.address })}</Text>
              <View style={s.chips}>
                {c.parts.map((part, i) => {
                  const on = choice[n.id] === i;
                  return (
                    <Pressable
                      key={i}
                      onPress={() => setChoice((x) => ({ ...x, [n.id]: i }))}
                      style={[s.chip, on && s.chipOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[s.chipText, on && s.chipTextOn]}>{part.number}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {!cut && c.noCallsTwice ? (
        <Text style={s.quiet}>{t('territories.recut.apply.noCallsTwice', { count: c.noCallsTwice })}</Text>
      ) : null}

      {done ? <Text style={[s.body, { color: OK }]}>{done}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable
        onPress={async () => {
          const ok = await confirm({
            title: cut
              ? t('territories.recut.apply.confirmCut', { number: p.territories[0]?.number ?? '', count: c.parts.length })
              : t('territories.recut.apply.confirmJoin', { list: p.territories.map((x) => x.number).join(' + ') }),
            body: t('territories.recut.apply.confirmBody'),
            confirmLabel: t(cut ? 'territories.recut.apply.buttonCut' : 'territories.recut.apply.buttonJoin', { count: c.parts.length }),
          });
          if (ok) apply.mutate();
        }}
        disabled={!may}
        style={({ pressed }) => [s.btn, !may && s.off, pressed && s.pressed]}
        accessibilityRole="button"
      >
        {apply.isPending ? <ActivityIndicator color="#fff" size="small" /> : null}
        <Text style={s.btnText}>
          {t(cut ? 'territories.recut.apply.buttonCut' : 'territories.recut.apply.buttonJoin', { count: c.parts.length })}
        </Text>
      </Pressable>
      {ready && !allChosen ? <Text style={s.quiet}>{t('territories.recut.apply.chooseFirst')}</Text> : null}
      <Text style={s.quiet}>{t('territories.recut.apply.undoHint')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: LINE, padding: 16, gap: 8 },
  cardReady: { borderColor: BRAND, borderWidth: 2 },
  cardDone: { borderColor: '#bbf7d0', backgroundColor: '#f0fdf4' },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  body: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: INK, lineHeight: 19 },
  strong: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  quiet: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 18 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: BAD },
  cond: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  holdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  part: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  noCalls: { gap: 8, marginTop: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: LINE },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1' },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: BRAND,
    borderRadius: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    marginTop: 4,
  },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ghostSmall: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ghostText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND },
  off: { opacity: 0.5 },
  pressed: { opacity: 0.85 },
});
