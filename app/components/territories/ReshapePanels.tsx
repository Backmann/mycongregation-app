import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryMergeCheck,
  type TerritoryNoCallRow,
  type TerritoryRow,
  type TerritorySplitCheck,
} from '../../lib/api';
import { confirm } from '../ConfirmHost';
import type { PreviewShape } from './OutlineEditor';
import type { Pt } from '../../lib/outline-edit';
import { formatDayShort } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../reports/ReportBits';

/** The two parts of a cut, and a join, on the map. */
export const PART_COLORS = ['#0e7490', '#ea580c'] as const;

/**
 * «Провести границу» (12 November 2026, mockup «Разделить»): the line drawn
 * on the map is sent to the server, which cuts the territory; the two parts
 * come back with their houses. The territory servant chooses which part
 * keeps the number and the S-13 history, the other's number, and where each
 * «не посещать» address goes. Only a free territory is cut.
 */
export function CutPanel({
  territory,
  line,
  noCalls,
  onPreview,
  onDone,
}: {
  territory: TerritoryRow;
  line: Pt[] | null;
  noCalls: TerritoryNoCallRow[];
  onPreview: (p: PreviewShape[]) => void;
  onDone: (text: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [check, setCheck] = useState<TerritorySplitCheck | null>(null);
  const [keep, setKeep] = useState<0 | 1>(0);
  const [number, setNumber] = useState('');
  const [parts, setParts] = useState<Record<string, 0 | 1>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const held = !!territory.holder;

  useEffect(() => {
    setCheck(null);
    setError(null);
    onPreview([]);
    if (!line || held) return;
    let gone = false;
    territoriesApi
      .splitCheck(territory.id, line)
      .then((c) => {
        if (gone) return;
        setCheck(c);
        setKeep(c.keep);
        setNumber(c.newNumber);
        // Every address stays with the part that keeps the number until moved.
        setParts(Object.fromEntries(noCalls.map((n) => [n.id, c.keep])));
        onPreview(c.parts.map((p, i) => ({ geometry: p.geometry, color: PART_COLORS[i] })));
      })
      .catch((e) => !gone && setError(extractErrorMessage(e)));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, territory.id, held]);

  const go = async () => {
    if (!check || !line) return;
    setBusy(true);
    setError(null);
    try {
      const r = await territoriesApi.split(territory.id, {
        line,
        keep,
        newNumber: number.trim(),
        updatedAt: territory.updatedAt ?? '',
        noCalls: Object.entries(parts).map(([id, part]) => ({ id, part })),
      });
      onPreview([]);
      await qc.invalidateQueries({ queryKey: ['territories'] });
      onDone(t('territories.reshape.cutDone', { kept: r.kept.number, made: r.made.number }));
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (held) return <Text style={s.warn}>{t('territories.reshape.held', { number: territory.number })}</Text>;
  return (
    <View style={s.wrap}>
      <Text style={s.help}>{t('territories.reshape.cutHelp')}</Text>
      {!line ? null : !check ? (
        error ? null : <ActivityIndicator color={BRAND} />
      ) : (
        <>
          {check.parts.map((p, i) => (
            <View key={i} style={[cardStyles.card, s.box]}>
              <View style={s.row}>
                <View style={[s.swatch, { backgroundColor: PART_COLORS[i] }]} />
                <Text style={s.partTitle}>
                  {p.houses !== null
                    ? t('territories.reshape.partHouses', { n: i + 1, houses: p.houses })
                    : t('territories.reshape.part', { n: i + 1 })}
                </Text>
              </View>
              <Pressable
                onPress={() => setKeep(i as 0 | 1)}
                style={s.row}
                accessibilityRole="radio"
                accessibilityState={{ selected: keep === i }}
              >
                <View style={[s.radio, keep === i && s.radioOn]} />
                <Text style={s.text}>{t('territories.reshape.keeps', { number: territory.number })}</Text>
              </Pressable>
              {keep !== i ? (
                <>
                  <Text style={s.label}>{t('territories.reshape.newNumber')}</Text>
                  <TextInput
                    value={number}
                    onChangeText={setNumber}
                    style={s.input}
                    maxLength={40}
                    autoCapitalize="none"
                    accessibilityLabel={t('territories.reshape.newNumber')}
                  />
                  <Text style={s.hint}>
                    {check.lastWorkedOn
                      ? t('territories.reshape.lastWorked', {
                          date: formatDayShort(check.lastWorkedOn, i18n.language),
                          number: territory.number,
                        })
                      : t('territories.reshape.neverWorked')}
                  </Text>
                </>
              ) : null}
            </View>
          ))}
          {noCalls.length > 0 ? (
            <View style={[cardStyles.card, s.box]}>
              <Text style={s.label}>{t('territories.reshape.noCalls')}</Text>
              {noCalls.map((n) => (
                <View key={n.id} style={s.ncRow}>
                  <Text style={[s.text, { flex: 1 }]}>{n.address}</Text>
                  {[0, 1].map((i) => (
                    <Pressable
                      key={i}
                      onPress={() => setParts((p) => ({ ...p, [n.id]: i as 0 | 1 }))}
                      style={[s.chip, parts[n.id] === i && { backgroundColor: PART_COLORS[i], borderColor: PART_COLORS[i] }]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: parts[n.id] === i }}
                    >
                      <Text style={[s.chipText, parts[n.id] === i && { color: '#fff' }]}>
                        {i === keep ? territory.number : number.trim() || '…'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>
          ) : null}
          <Pressable
            onPress={() => void go()}
            disabled={busy || !number.trim()}
            style={[s.go, (busy || !number.trim()) && s.off]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('territories.reshape.cut')}</Text>}
          </Pressable>
        </>
      )}
      {error ? <Text style={s.bad}>{error}</Text> : null}
    </View>
  );
}

/**
 * «Убрать границу» (mockup «Объединить»): the neighbour clicked on the map
 * is joined with this territory on the server; the territory servant
 * chooses which number stays. The joined one counts as last worked on the
 * older date; the other goes out of use with its S-13 lines kept.
 */
export function JoinPanel({
  territory,
  otherId,
  onPreview,
  onDone,
}: {
  territory: TerritoryRow;
  otherId: string | null;
  onPreview: (p: PreviewShape[]) => void;
  onDone: (text: string, keptId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [check, setCheck] = useState<TerritoryMergeCheck | null>(null);
  const [keepId, setKeepId] = useState(territory.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCheck(null);
    setError(null);
    onPreview([]);
    if (!otherId) return;
    let gone = false;
    territoriesApi
      .mergeCheck(territory.id, otherId)
      .then((c) => {
        if (gone) return;
        setCheck(c);
        setKeepId(territory.id);
        onPreview([{ geometry: c.geometry, color: PART_COLORS[0] }]);
      })
      .catch((e) => !gone && setError(extractErrorMessage(e)));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId, territory.id]);

  const date = (d: string | null) =>
    d ? formatDayShort(d, i18n.language) : t('territories.reshape.never');
  const held = check?.territories.find((x) => x.held);

  const go = async () => {
    if (!check || !otherId) return;
    const [a, b] = check.territories;
    setBusy(true);
    setError(null);
    try {
      const r = await territoriesApi.merge(territory.id, {
        otherId,
        keepId,
        updatedAt: a.updatedAt,
        otherUpdatedAt: b.updatedAt,
      });
      onPreview([]);
      await qc.invalidateQueries({ queryKey: ['territories'] });
      onDone(t('territories.reshape.joinDone', { kept: r.kept.number, gone: r.archived.number }), r.kept.id);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.wrap}>
      <Text style={s.help}>{t('territories.reshape.joinHelp')}</Text>
      {!otherId ? null : !check ? (
        error ? null : <ActivityIndicator color={BRAND} />
      ) : (
        <>
          <View style={[cardStyles.card, s.box]}>
            <Text style={s.label}>{t('territories.reshape.whichStays')}</Text>
            {check.territories.map((x) => (
              <Pressable
                key={x.id}
                onPress={() => setKeepId(x.id)}
                style={s.row}
                accessibilityRole="radio"
                accessibilityState={{ selected: keepId === x.id }}
              >
                <View style={[s.radio, keepId === x.id && s.radioOn]} />
                <Text style={s.text}>
                  <Text style={s.strong}>{x.number}</Text>
                  {x.houses !== null ? ` · ${t('territories.reshape.houses', { houses: x.houses })}` : ''}
                  {` · ${t('territories.reshape.worked', { date: date(x.lastWorkedOn) })}`}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={[cardStyles.card, s.box]}>
            {check.houses !== null ? (
              <Text style={s.text}>{t('territories.reshape.together', { houses: check.houses })}</Text>
            ) : null}
            <Text style={s.text}>{t('territories.reshape.olderDate', { date: date(check.lastWorkedOn) })}</Text>
            <Text style={s.text}>
              {t('territories.reshape.archived', {
                number: check.territories.find((x) => x.id !== keepId)?.number ?? '',
              })}
            </Text>
            {(check.territories.find((x) => x.id !== keepId)?.noCalls ?? 0) > 0 ? (
              <Text style={s.text}>
                {t('territories.reshape.noCallsMove', {
                  n: check.territories.find((x) => x.id !== keepId)?.noCalls ?? 0,
                })}
              </Text>
            ) : null}
          </View>
          {held ? (
            <Text style={s.warn}>{t('territories.reshape.held', { number: held.number })}</Text>
          ) : (
            <Pressable
              onPress={() => void go()}
              disabled={busy}
              style={[s.go, busy && s.off]}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('territories.reshape.join')}</Text>}
            </Pressable>
          )}
        </>
      )}
      {error ? <Text style={s.bad}>{error}</Text> : null}
    </View>
  );
}

/** «Вернуть как было»: the last cut, join or new territory, while nothing happened since. */
export function UndoReshape({ territory, onDone }: { territory: TerritoryRow; onDone: (text: string) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const undo = async () => {
    const ok = await confirm({
      title: t('territories.reshape.undoTitle'),
      body: t('territories.reshape.undoBody'),
      confirmLabel: t('territories.reshape.undo'),
    });
    if (!ok) return;
    setError(null);
    try {
      await territoriesApi.undoReshape(territory.id);
      await qc.invalidateQueries({ queryKey: ['territories'] });
      onDone(t('territories.reshape.undone'));
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };
  return (
    <View>
      <Pressable onPress={() => void undo()} style={s.undo} accessibilityRole="button">
        <Text style={s.undoText}>{t('territories.reshape.undo')}</Text>
      </Pressable>
      {error ? <Text style={s.bad}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10 },
  help: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 18 },
  box: { marginBottom: 0, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  partTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14.5, color: INK },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#cbd5e1' },
  radioOn: { borderWidth: 5, borderColor: BRAND },
  text: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: INK, lineHeight: 18, flexShrink: 1 },
  strong: { fontFamily: 'Manrope_800ExtraBold' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK },
  input: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 14,
    color: INK,
    backgroundColor: '#fff',
  },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, lineHeight: 16 },
  ncRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 12, color: INK },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  off: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  warn: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#b45309', lineHeight: 17 },
  bad: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, color: '#b91c1c', lineHeight: 17 },
  undo: { paddingVertical: 8, alignItems: 'center' },
  undoText: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: BRAND },
});
