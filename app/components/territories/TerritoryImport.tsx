import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  extractErrorMessage,
  publishersApi,
  territoriesApi,
  type TerritoryChecks,
  type TerritoryImportAssignment,
} from '../../lib/api';
import {
  guessCard,
  numberKey,
  pairNumbers,
  readBoundaryKml,
  readMapExport,
  readS13Xlsx,
  reconcile,
  type Boundary,
  type MapExport,
  type SourceLine,
} from '../../lib/territory-import';
import { keptFrom } from '../../lib/service-year';
import { formatDateISO } from '../../lib/dates';
import { formatDayShort } from '../../lib/territory-view';
import { confirm } from '../ConfirmHost';
import { DateField } from '../DateField';
import { dateForAddress } from '../../lib/no-call';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../reports/ReportBits';

/**
 * Bringing the records over, on the territory servant's own computer
 * (11 November 2026). Three files are read here; he checks what was matched;
 * only then is it sent — and the section stays his alone until he confirms.
 *
 * Steps: the files → what was matched (numbers, people, disagreements,
 * do-not-call) → sending → what the checks found → «Данные проверены».
 */

type Picked<T> = { name: string; data: T } | null;
type Card = { id: string; name: string };

const NO_CARD = '';

type NoCallDraft = { address: string; surname: string; notedOn: string };

async function pickFile(types: string[]): Promise<{ name: string; blob: Blob } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: types, multiple: false, copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  const blob = (asset as unknown as { file?: Blob } | undefined)?.file;
  if (!asset || !blob) return null;
  return { name: asset.name, blob };
}

export function TerritoryImport({ onDone }: { onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const today = formatDateISO(new Date());
  const from = keptFrom(today);

  const [map, setMap] = useState<Picked<MapExport>>(null);
  const [sheet, setSheet] = useState<Picked<SourceLine[]>>(null);
  const [boundary, setBoundary] = useState<Picked<Boundary>>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  /** The card chosen for each written name; '' = keep the name, no card. */
  const [cardOf, setCardOf] = useState<Record<string, string>>({});
  /** Names typed for lines no source names. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  /**
   * Comments taken over as «не посещать»: per territory, one or more
   * addresses as edited, the surname on the door where it is needed, and the
   * day noted — the date the note itself carries, or today (12 November 2026).
   */
  const [noCalls, setNoCalls] = useState<Record<string, NoCallDraft[]>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [checks, setChecks] = useState<TerritoryChecks | null>(null);

  const rosterQ = useQuery({
    queryKey: ['publishers', 'roster'],
    queryFn: () => publishersApi.roster(),
    staleTime: 5 * 60 * 1000,
  });
  const cards: Card[] = useMemo(
    () => (rosterQ.data?.data ?? []).map((p) => ({ id: p.id, name: p.displayName })),
    [rosterQ.data],
  );

  const pairs = useMemo(
    () =>
      map && sheet
        ? pairNumbers(
            sheet.data.map((l) => l.number),
            map.data.territories.map((x) => x.number),
          )
        : new Map<string, string>(),
    [map, sheet],
  );
  const renamed = [...pairs].filter(([a, b]) => numberKey(a) !== numberKey(b));
  const unpaired = sheet ? [...new Set(sheet.data.map((l) => l.number))].filter((n) => !pairs.has(n)) : [];

  // Only the kept service years come over.
  const lines = useMemo(
    () =>
      map
        ? reconcile(map.data.lines, sheet?.data ?? [], pairs).filter(
            (l) => !l.completedOn || l.completedOn >= from,
          )
        : [],
    [map, sheet, pairs, from],
  );
  const names = useMemo(() => {
    const count = new Map<string, number>();
    for (const l of lines) if (l.name) count.set(l.name, (count.get(l.name) ?? 0) + 1);
    return [...count].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lines]);
  const guessed = useMemo(() => {
    const g: Record<string, string> = {};
    for (const [n] of names) g[n] = guessCard(n, cards)?.id ?? NO_CARD;
    return g;
  }, [names, cards]);
  const cardFor = (name: string) => (name in cardOf ? cardOf[name] : guessed[name]);
  const unnamed = lines.filter((l) => !l.name);
  const lineKey = (l: { number: string; assignedOn: string }) => `${l.number}|${l.assignedOn}`;
  const disagree = lines.filter((l) => l.disagrees).length;
  const open = lines.filter((l) => !l.completedOn).length;
  const comments = map?.data.territories.filter((x) => x.comment) ?? [];
  const missingNames = unnamed.filter((l) => !(typed[lineKey(l)] ?? '').trim()).length;

  const readMap = async () => {
    setFileError(null);
    try {
      const f = await pickFile(['application/geo+json', 'application/json', '*/*']);
      if (!f) return;
      setMap({ name: f.name, data: readMapExport(await f.blob.text()) });
    } catch (e) {
      setFileError(t('territories.import.fileUnreadable', { reason: extractErrorMessage(e) }));
    }
  };
  const readSheet = async () => {
    setFileError(null);
    try {
      const f = await pickFile([
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '*/*',
      ]);
      if (!f) return;
      setSheet({ name: f.name, data: await readS13Xlsx(await f.blob.arrayBuffer()) });
    } catch (e) {
      setFileError(t('territories.import.fileUnreadable', { reason: extractErrorMessage(e) }));
    }
  };
  const readBoundary = async () => {
    setFileError(null);
    try {
      const f = await pickFile(['application/vnd.google-earth.kml+xml', '*/*']);
      if (!f) return;
      setBoundary({ name: f.name, data: readBoundaryKml(await f.blob.text()) });
    } catch (e) {
      setFileError(t('territories.import.fileUnreadable', { reason: extractErrorMessage(e) }));
    }
  };

  const send = async () => {
    if (!map) return;
    setSendError(null);
    setChecks(null);
    try {
      setSending(t('territories.import.sendingReset'));
      await territoriesApi.reset();
      if (boundary) {
        setSending(t('territories.import.sendingBoundary'));
        await territoriesApi.importBoundary({
          geometry: boundary.data.geometry,
          description: boundary.data.description,
          validFrom: boundary.data.validFrom ?? undefined,
        });
      }
      const ts = map.data.territories;
      for (let i = 0; i < ts.length; i += 20) {
        setSending(t('territories.import.sendingTerritories', { done: i, total: ts.length }));
        await territoriesApi.importTerritories(
          ts.slice(i, i + 20).map((x) => ({
            number: x.number,
            locality: x.locality ?? undefined,
            geometry: x.geometry,
            lastCompletedOn: x.lastCompletedOn ?? undefined,
          })),
        );
      }
      const items: TerritoryImportAssignment[] = lines.map((l) => {
        const name = l.name ?? (typed[lineKey(l)] ?? '').trim();
        const card = l.name ? cardFor(l.name) : NO_CARD;
        const holder = card ? cards.find((c) => c.id === card)?.name ?? name : name;
        return {
          number: l.number,
          holderName: holder,
          publisherId: card || undefined,
          assignedOn: l.assignedOn,
          completedOn: l.completedOn ?? undefined,
        };
      });
      for (let i = 0; i < items.length; i += 200) {
        setSending(t('territories.import.sendingAssignments', { done: i, total: items.length }));
        await territoriesApi.importAssignments(items.slice(i, i + 200));
      }
      const calls = Object.entries(noCalls).flatMap(([number, rows]) =>
        rows
          .filter((r) => r.address.trim())
          .map((r) => ({
            number,
            address: r.address.trim(),
            ...(r.surname.trim() ? { surname: r.surname.trim() } : {}),
            notedOn: r.notedOn <= today ? r.notedOn : today,
          })),
      );
      if (calls.length) {
        setSending(t('territories.import.sendingNoCalls'));
        await territoriesApi.importNoCalls(calls);
      }
      setSending(t('territories.import.sendingChecks'));
      setChecks(await territoriesApi.checks());
      void qc.invalidateQueries({ queryKey: ['territories'] });
    } catch (e) {
      setSendError(extractErrorMessage(e));
    } finally {
      setSending(null);
    }
  };

  const confirmVerified = async () => {
    const ok = await confirm({
      title: t('territories.import.verifyTitle'),
      body: t('territories.import.verifyBody'),
      confirmLabel: t('territories.import.verifyConfirm'),
    });
    if (!ok) return;
    try {
      await territoriesApi.verify();
      void qc.invalidateQueries({ queryKey: ['territories'] });
      onDone();
    } catch (e) {
      setSendError(extractErrorMessage(e));
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={cardStyles.card}>
        <Text style={s.lead}>{t('territories.import.computerOnly')}</Text>
      </View>
    );
  }

  return (
    <View>
      <View style={cardStyles.card}>
        <Text style={s.kicker}>{t('territories.import.step1')}</Text>
        <Text style={s.lead}>{t('territories.import.filesLead')}</Text>
        <FileRow
          icon="map-outline"
          title={t('territories.import.mapFile')}
          hint={t('territories.import.mapFileHint')}
          picked={map ? t('territories.import.mapRead', { name: map.name, count: map.data.territories.length, lines: map.data.lines.length }) : null}
          onPick={readMap}
          pickLabel={t('territories.import.choose')}
        />
        <FileRow
          icon="grid-outline"
          title={t('territories.import.sheetFile')}
          hint={t('territories.import.sheetFileHint')}
          picked={sheet ? t('territories.import.sheetRead', { name: sheet.name, count: sheet.data.length }) : null}
          onPick={readSheet}
          pickLabel={t('territories.import.choose')}
        />
        <FileRow
          icon="scan-outline"
          title={t('territories.import.boundaryFile')}
          hint={t('territories.import.boundaryFileHint')}
          picked={
            boundary
              ? t('territories.import.boundaryRead', {
                  name: boundary.name,
                  date: boundary.data.validFrom ? formatDayShort(boundary.data.validFrom, i18n.language) : '—',
                })
              : null
          }
          onPick={readBoundary}
          pickLabel={t('territories.import.choose')}
        />
        {fileError ? <Text style={s.error}>{fileError}</Text> : null}
        <Text style={s.privacy}>{t('territories.import.privacy')}</Text>
      </View>

      {map ? (
        <View style={cardStyles.card}>
          <Text style={s.kicker}>{t('territories.import.step2')}</Text>
          <View style={s.tiles}>
            <Tile value={map.data.territories.length} label={t('territories.import.tileTerritories')} />
            <Tile value={lines.length} label={t('territories.import.tileLines', { from: formatDayShort(from, i18n.language) })} />
            <Tile value={open} label={t('territories.import.tileOpen')} />
          </View>

          {renamed.length || unpaired.length ? (
            <View style={s.block}>
              <Text style={s.blockTitle}>{t('territories.import.numbersTitle')}</Text>
              {renamed.map(([a, b]) => (
                <Text key={a} style={s.row}>
                  {a} → <Text style={s.strong}>{b}</Text>
                </Text>
              ))}
              {unpaired.length ? (
                <Text style={s.warn}>{t('territories.import.unpaired', { list: unpaired.join(', ') })}</Text>
              ) : null}
            </View>
          ) : null}

          {disagree ? (
            <View style={s.block}>
              <Text style={s.blockTitle}>{t('territories.import.disagreeTitle', { count: disagree })}</Text>
              <Text style={s.hint}>{t('territories.import.disagreeHint')}</Text>
            </View>
          ) : null}

          {names.length ? (
            <View style={s.block}>
              <Text style={s.blockTitle}>{t('territories.import.peopleTitle', { count: names.length })}</Text>
              <Text style={s.hint}>{t('territories.import.peopleHint')}</Text>
              {names.map(([name, n]) => (
                <PersonRow
                  key={name}
                  name={name}
                  lines={n}
                  cards={cards}
                  value={cardFor(name)}
                  onChange={(id) => setCardOf((c) => ({ ...c, [name]: id }))}
                />
              ))}
            </View>
          ) : null}

          {unnamed.length ? (
            <View style={s.block}>
              <Text style={s.blockTitle}>{t('territories.import.unnamedTitle', { count: unnamed.length })}</Text>
              {unnamed.map((l) => (
                <View key={lineKey(l)} style={s.inputRow}>
                  <Text style={s.rowLabel}>
                    {l.number} · {l.assignedOn}
                  </Text>
                  <TextInput
                    style={s.input}
                    value={typed[lineKey(l)] ?? ''}
                    onChangeText={(v) => setTyped((x) => ({ ...x, [lineKey(l)]: v }))}
                    placeholder={t('territories.import.unnamedPlaceholder')}
                    accessibilityLabel={t('territories.import.unnamedPlaceholder')}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {comments.length ? (
            <View style={s.block}>
              <Text style={s.blockTitle}>{t('territories.import.commentsTitle', { count: comments.length })}</Text>
              <Text style={s.hint}>{t('territories.import.commentsHint')}</Text>
              {comments.map((c) => {
                const on = c.number in noCalls;
                const rows = noCalls[c.number] ?? [];
                const setRow = (i: number, patch: Partial<NoCallDraft>) =>
                  setNoCalls((x) => ({
                    ...x,
                    [c.number]: (x[c.number] ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)),
                  }));
                const fresh = (): NoCallDraft => ({ address: '', surname: '', notedOn: today });
                return (
                  <View key={c.number} style={s.comment}>
                    <Pressable
                      onPress={() =>
                        setNoCalls((x) => {
                          const next = { ...x };
                          if (on) delete next[c.number];
                          else next[c.number] = [fresh()];
                          return next;
                        })
                      }
                      style={s.check}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? BRAND : MUTED} />
                      <Text style={s.rowLabel}>{c.number}</Text>
                    </Pressable>
                    <Text style={s.commentText}>{c.comment}</Text>
                    {rows.map((r, i) => (
                      <View key={i} style={s.ncRow}>
                        <TextInput
                          style={s.input}
                          value={r.address}
                          onChangeText={(v) =>
                            // The date follows the line of the note naming
                            // this street; an undated line means today.
                            setRow(i, {
                              address: v,
                              notedOn: dateForAddress(c.comment ?? '', v) ?? today,
                            })
                          }
                          placeholder={t('territories.import.addressPlaceholder')}
                          accessibilityLabel={t('territories.import.addressPlaceholder')}
                        />
                        <View style={s.ncPair}>
                          <TextInput
                            style={s.input}
                            value={r.surname}
                            onChangeText={(v) => setRow(i, { surname: v })}
                            placeholder={t('territories.import.surnamePlaceholder')}
                            accessibilityLabel={t('territories.import.surnamePlaceholder')}
                          />
                          <View style={s.ncDate}>
                            <DateField
                              label={t('territories.import.notedOn')}
                              value={r.notedOn}
                              onChange={(v) => setRow(i, { notedOn: v })}
                            />
                          </View>
                        </View>
                        {rows.length > 1 ? (
                          <Pressable
                            onPress={() =>
                              setNoCalls((x) => ({
                                ...x,
                                [c.number]: (x[c.number] ?? []).filter((_, j) => j !== i),
                              }))
                            }
                            accessibilityRole="button"
                          >
                            <Text style={s.ncRemove}>{t('territories.import.removeAddress')}</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                    {on ? (
                      <Pressable
                        onPress={() =>
                          setNoCalls((x) => ({ ...x, [c.number]: [...(x[c.number] ?? []), fresh()] }))
                        }
                        accessibilityRole="button"
                      >
                        <Text style={s.ncMore}>{t('territories.import.moreAddress')}</Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {map ? (
        <View style={cardStyles.card}>
          <Text style={s.kicker}>{t('territories.import.step3')}</Text>
          <Text style={s.lead}>{t('territories.import.sendLead')}</Text>
          {missingNames ? (
            <Text style={s.warn}>{t('territories.import.namesMissing', { count: missingNames })}</Text>
          ) : null}
          <Pressable
            style={[s.button, (sending || missingNames > 0) && s.buttonOff]}
            disabled={!!sending || missingNames > 0}
            onPress={send}
            accessibilityRole="button"
          >
            <Text style={s.buttonText}>{sending ?? t('territories.import.send')}</Text>
          </Pressable>
          {sendError ? <Text style={s.error}>{sendError}</Text> : null}
        </View>
      ) : null}

      {checks ? (
        <View style={cardStyles.card}>
          <Text style={s.kicker}>{t('territories.import.step4')}</Text>
          {!checks.hasBoundary ? <Text style={s.warn}>{t('territories.import.noBoundary')}</Text> : null}
          {checks.outsideBoundary.length ? (
            <View style={s.block}>
              <Text style={s.blockTitle}>{t('territories.import.outsideTitle', { count: checks.outsideBoundary.length })}</Text>
              <Text style={s.row}>
                {checks.outsideBoundary.map((o) => t('territories.import.outsideItem', { number: o.number, share: o.share })).join(', ')}
              </Text>
            </View>
          ) : null}
          {checks.overlapping.length ? (
            <View style={s.block}>
              <Text style={s.blockTitle}>{t('territories.import.overlapTitle', { count: checks.overlapping.length })}</Text>
              <Text style={s.row}>{checks.overlapping.map(([a, b]) => `${a} / ${b}`).join(', ')}</Text>
            </View>
          ) : null}
          <Text style={s.hint}>{t('territories.import.checksHint')}</Text>
          <Text style={s.lead}>{t('territories.import.freshLead')}</Text>
          <Pressable style={s.button} onPress={confirmVerified} accessibilityRole="button">
            <Text style={s.buttonText}>{t('territories.import.verify')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function FileRow(props: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  picked: string | null;
  onPick: () => void;
  pickLabel: string;
}) {
  return (
    <View style={s.file}>
      <View style={[s.fileIcon, props.picked ? s.fileIconDone : null]}>
        <Ionicons name={props.picked ? 'checkmark' : props.icon} size={18} color={props.picked ? '#fff' : BRAND} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.fileTitle}>{props.title}</Text>
        <Text style={s.hint}>{props.picked ?? props.hint}</Text>
      </View>
      <Pressable style={s.pick} onPress={props.onPick} accessibilityRole="button">
        <Text style={s.pickText}>{props.pickLabel}</Text>
      </Pressable>
    </View>
  );
}

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <View style={s.tile}>
      <Text style={s.tileValue}>{value}</Text>
      <Text style={s.tileLabel}>{label}</Text>
    </View>
  );
}

function PersonRow(props: {
  name: string;
  lines: number;
  cards: Card[];
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const chosen = props.cards.find((c) => c.id === props.value);
  const found = q.trim()
    ? props.cards.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8)
    : [];
  return (
    <View style={s.person}>
      <Pressable style={s.personHead} onPress={() => setOpen((o) => !o)} accessibilityRole="button">
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>{props.name}</Text>
          <Text style={s.hint}>{t('territories.import.personLines', { count: props.lines })}</Text>
        </View>
        <Text style={[s.personCard, !chosen && s.personNoCard]}>
          {chosen ? chosen.name : t('territories.import.noCard')}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
      </Pressable>
      {open ? (
        <View style={s.personPick}>
          <TextInput
            style={s.input}
            value={q}
            onChangeText={setQ}
            placeholder={t('territories.import.findCard')}
            accessibilityLabel={t('territories.import.findCard')}
          />
          {found.map((c) => (
            <Pressable
              key={c.id}
              style={s.option}
              onPress={() => {
                props.onChange(c.id);
                setOpen(false);
              }}
              accessibilityRole="button"
            >
              <Text style={s.row}>{c.name}</Text>
            </Pressable>
          ))}
          <Pressable
            style={s.option}
            onPress={() => {
              props.onChange(NO_CARD);
              setOpen(false);
            }}
            accessibilityRole="button"
          >
            <Text style={[s.row, { color: MUTED }]}>{t('territories.import.keepNameOnly')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, color: BRAND, textTransform: 'uppercase' },
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 14.5, color: INK, marginTop: 6, lineHeight: 21 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 18 },
  privacy: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 12, lineHeight: 18 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 8 },
  warn: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b45309', marginTop: 6 },
  file: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: LINE },
  fileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#e0f1f5', alignItems: 'center', justifyContent: 'center' },
  fileIconDone: { backgroundColor: '#15803d' },
  fileTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: INK },
  pick: { borderWidth: 1.5, borderColor: BRAND, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  pickText: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  tile: { flexGrow: 1, flexBasis: 120, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#eef2f7', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  tileValue: { fontFamily: 'Manrope_800ExtraBold', fontSize: 20, color: INK },
  tileLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 11.5, color: MUTED, marginTop: 1 },
  block: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: LINE },
  blockTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  row: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: INK, marginTop: 4 },
  strong: { fontFamily: 'Manrope_700Bold' },
  rowLabel: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: INK },
  inputRow: { marginTop: 8 },
  input: { borderWidth: 1.5, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, fontFamily: 'Manrope_500Medium', fontSize: 14, color: INK },
  comment: { marginTop: 10 },
  ncRow: { marginLeft: 28, marginTop: 4 },
  // Surname, then the date under it: a date field needs its room.
  ncPair: { gap: 4 },
  ncDate: { maxWidth: 260 },
  ncRemove: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#b91c1c', marginTop: 4 },
  ncMore: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: BRAND, marginLeft: 28, marginTop: 8 },
  commentText: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, marginTop: 2, marginLeft: 28 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  person: { borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, minHeight: 44 },
  personCard: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#15803d', maxWidth: '45%', textAlign: 'right' },
  personNoCard: { color: '#b45309' },
  personPick: { paddingBottom: 10 },
  option: { paddingVertical: 8, paddingHorizontal: 4, minHeight: 36 },
  button: { backgroundColor: BRAND, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 14, paddingHorizontal: 16 },
  buttonOff: { opacity: 0.5 },
  buttonText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5, color: '#fff' },
});
