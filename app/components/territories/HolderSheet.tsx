import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { SegmentedControl } from '../SegmentedControl';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryAssignmentRow,
  type TerritoryMethod,
} from '../../lib/api';
import { formatDateISO } from '../../lib/dates';
import { addDaysISO, formatDayShort, TERM_DAYS } from '../../lib/territory-view';
import { keptFromOf, neighboursOf, recordProblem, type RecordDraft } from '../../lib/territory-record';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';
import { METHODS } from './AssignmentSheet';
import { PersonPicker } from './PersonPicker';

type Who = 'person' | 'group' | 'off';
type End = 'completed' | 'returned' | 'open';

/**
 * A line of the S-13 by hand (17 November 2026; mockup boards 2 and 3), for
 * the territory servant:
 *  - edit — «Исправить запись»: who took it (a person, a group, or «нет в
 *    списке» — a name by hand), the days and how it ended;
 *  - past — «Прошлая запись»: a line from the paper S-13, to start the
 *    record in the app; «Добавить и следующую» keeps the sheet open.
 *
 * The same rules as the server, said before «Сохранить» rather than after:
 * the current and the previous service year only, never two lines over
 * each other, «на руках» only on the last line and only with a card.
 */
export function HolderSheet({
  mode,
  territoryId,
  number,
  rows,
  row,
  onClose,
}: {
  mode: 'edit' | 'past' | null;
  territoryId: string;
  number: string;
  /** Every line of the territory the card shows. */
  rows: TerritoryAssignmentRow[];
  /** The line corrected (edit). */
  row: TerritoryAssignmentRow | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const today = formatDateISO(new Date());
  const keptFrom = keptFromOf(today);
  const [who, setWho] = useState<Who>('person');
  const [picking, setPicking] = useState(false);
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [holderChanged, setHolderChanged] = useState(false);
  const [assigned, setAssigned] = useState('');
  const [due, setDue] = useState('');
  const [end, setEnd] = useState<End>('completed');
  const [endedOn, setEndedOn] = useState('');
  const [method, setMethod] = useState<TerritoryMethod>('door_to_door');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [sure, setSure] = useState(false);

  const q = useQuery({
    queryKey: ['territories', 'candidates', territoryId],
    queryFn: () => territoriesApi.candidates(territoryId),
    enabled: !!mode,
  });
  const groups = q.data?.groups ?? [];

  const reset = () => {
    setError(null);
    setSure(false);
    if (mode === 'edit' && row) {
      setWho(row.publisherId === null ? 'off' : row.forGroupId ? 'group' : 'person');
      setPicking(false);
      setPublisherId(row.publisherId);
      setName(row.publisherId === null ? row.holderName : '');
      setGroupId(row.forGroupId);
      setHolderChanged(false);
      setAssigned(row.assignedOn);
      setDue(row.dueOn ?? '');
      setEnd(row.completedOn ? 'completed' : row.returnedOn ? 'returned' : 'open');
      setEndedOn(row.completedOn ?? row.returnedOn ?? '');
      setMethod(row.method ?? 'door_to_door');
    } else {
      setWho('person');
      setPicking(true);
      setPublisherId(null);
      setName('');
      setGroupId(null);
      setHolderChanged(true);
      setAssigned('');
      setDue('');
      setEnd('completed');
      setEndedOn('');
      setMethod('door_to_door');
    }
  };
  useEffect(() => {
    if (mode) {
      reset();
      setAdded(0);
    }
    // Opened afresh for each line; `reset` reads the props of that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, row?.id]);

  const others = useMemo(() => rows.filter((r) => r.id !== row?.id || mode !== 'edit'), [rows, row, mode]);
  const draft: RecordDraft = {
    assignedOn: assigned,
    endedOn: end === 'open' ? null : endedOn,
  };
  const problem = recordProblem(draft, others, today, keptFrom, mode === 'past' ? 'start' : 'end');
  const day = (iso: string) => formatDayShort(iso, lang);
  const spanOf = (r: TerritoryAssignmentRow) =>
    `${day(r.assignedOn)} → ${r.completedOn ? day(r.completedOn) : r.returnedOn ? day(r.returnedOn) : t('territories.detail.stillHeld')}`;
  const problemText =
    problem?.kind === 'over'
      ? t('territories.holder.over', { who: problem.with.holderName, span: spanOf(problem.with) })
      : problem?.kind === 'tooOld'
        ? t('territories.holder.tooOld', { date: day(keptFrom) })
        : problem?.kind === 'future'
          ? t('territories.holder.future')
          : problem?.kind === 'endBeforeStart'
            ? t('territories.holder.endBeforeStart')
            : null;

  const chosenName =
    who === 'off'
      ? name.trim()
      : (q.data?.people.find((p) => p.publisherId === publisherId)?.name ??
        (publisherId === row?.publisherId ? row?.holderName : null) ??
        null);
  const holderReady =
    who === 'off' ? name.trim().length >= 2 : !!publisherId && (who !== 'group' || !!groupId);
  const openNeedsCard = end === 'open' && who === 'off';
  const ready =
    holderReady && !!assigned && (end === 'open' || !!endedOn) && !problem && !openNeedsCard;

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['territories'] });
  };
  const save = useMutation({
    mutationFn: async () => {
      const holder =
        who === 'off'
          ? { holderName: name.trim() }
          : { publisherId: publisherId!, ...(who === 'group' && groupId ? { forGroupId: groupId } : {}) };
      if (mode === 'past') {
        return territoriesApi.addPast(territoryId, {
          ...holder,
          assignedOn: assigned,
          ...(due ? { dueOn: due } : {}),
          end,
          ...(end !== 'open' ? { endedOn } : {}),
          ...(end === 'completed' ? { method } : {}),
        });
      }
      return territoriesApi.editAssignment(row!.id, {
        // Only what changed: the same card again would make the server treat
        // a change of group as a change of holder (review of 17 November 2026).
        ...(holderChanged
          ? who === 'off'
            ? { holderName: name.trim() }
            : {
                ...(publisherId !== row!.publisherId ? { publisherId: publisherId! } : {}),
                forGroupId: who === 'group' ? groupId : null,
              }
          : {}),
        assignedOn: assigned,
        ...(due ? { dueOn: due } : {}),
        ...(end === 'open'
          ? { reopen: true }
          : end === 'completed'
            ? { completedOn: endedOn, method }
            : { returnedOn: endedOn }),
      });
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => territoriesApi.removeAssignment(row!.id),
    onSuccess: async () => {
      await done();
      onClose();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const submit = (next: boolean) =>
    save.mutate(undefined, {
      onSuccess: async () => {
        await done();
        if (next) {
          reset();
          setAdded((n) => n + 1);
        } else onClose();
      },
    });

  if (!mode || (mode === 'edit' && !row)) return null;
  const busy = save.isPending || remove.isPending;
  // «На руках» only on the territory's last line.
  const later = rows.some(
    (r) => (mode !== 'edit' || r.id !== row?.id) && assigned && r.assignedOn > assigned,
  );
  const canHold = !later || !assigned;
  const near = mode === 'edit' && row ? neighboursOf(row, rows) : null;
  const line = (r: TerritoryAssignmentRow) =>
    `${r.forGroupName ? `${r.forGroupName} · ` : ''}${r.holderName} · ${spanOf(r)}`;

  return (
    <Sheet
      visible
      title={mode === 'edit' ? t('territories.holder.titleEdit') : t('territories.holder.titlePast')}
      subtitle={mode === 'past' ? t('territories.holder.pastSub', { number }) : number}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= 900 ? 'centered' : 'bottom'}
      footer={
        <View style={s.foot}>
          {problemText ? <Text style={s.warn}>{problemText}</Text> : null}
          {error ? <Text style={s.error}>{error}</Text> : null}
          {mode === 'past' ? (
            <View style={s.row2}>
              <Pressable
                onPress={() => submit(true)}
                disabled={!ready || busy}
                style={[s.second, (!ready || busy) && s.goOff]}
                accessibilityRole="button"
              >
                <Text style={s.secondText}>{t('territories.holder.addNext')}</Text>
              </Pressable>
              <Pressable
                onPress={() => submit(false)}
                disabled={!ready || busy}
                style={[s.go, { flex: 1 }, (!ready || busy) && s.goOff]}
                accessibilityRole="button"
              >
                {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('territories.holder.add')}</Text>}
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => submit(false)}
                disabled={!ready || busy}
                style={[s.go, (!ready || busy) && s.goOff]}
                accessibilityRole="button"
              >
                {save.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('territories.holder.save')}</Text>}
              </Pressable>
              <Pressable
                onPress={() => (sure ? remove.mutate() : setSure(true))}
                disabled={busy}
                style={[s.remove, sure && s.removeSure]}
                accessibilityRole="button"
              >
                <Text style={[s.removeText, sure && s.removeTextSure]}>
                  {sure ? t('territories.action.edit.removeSure') : t('territories.action.edit.remove')}
                </Text>
              </Pressable>
            </>
          )}
          {mode === 'past' ? (
            <Text style={s.rule}>{t('territories.holder.pastRule', { date: day(keptFrom) })}</Text>
          ) : null}
        </View>
      }
    >
      {added > 0 ? <Text style={s.added}>{t('territories.holder.added')}</Text> : null}

      {near ? (
        <View style={s.near}>
          {near.before ? (
            <Text style={s.nearText}>
              <Text style={s.nearKey}>{t('territories.holder.before')}: </Text>
              {line(near.before)}
            </Text>
          ) : null}
          <Text style={[s.nearText, s.nearThis]}>
            <Text style={s.nearKey}>{t('territories.holder.this')}: </Text>
            {line(row!)}
          </Text>
          {near.after ? (
            <Text style={s.nearText}>
              <Text style={s.nearKey}>{t('territories.holder.after')}: </Text>
              {line(near.after)}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text style={s.label}>{t('territories.holder.who')}</Text>
      <SegmentedControl<Who>
        segments={[
          { key: 'person', label: t('territories.holder.toPerson') },
          { key: 'group', label: t('territories.holder.toGroup') },
          { key: 'off', label: t('territories.holder.offList') },
        ]}
        value={who}
        onChange={(w) => {
          setWho(w);
          setHolderChanged(true);
          if (w === 'off') setPicking(false);
          else if (!publisherId) setPicking(true);
          if (w === 'group' && !groupId) {
            const p = q.data?.people.find((x) => x.publisherId === publisherId);
            const led = groups.find((g) => g.overseerPublisherId === publisherId);
            setGroupId(led?.id ?? p?.serviceGroupId ?? null);
          }
        }}
      />

      {who === 'off' ? (
        <>
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setHolderChanged(true);
            }}
            placeholder={t('territories.holder.offListName')}
            placeholderTextColor="#94a3b8"
            style={s.input}
            maxLength={160}
            accessibilityLabel={t('territories.holder.offList')}
          />
          <Text style={s.hint}>{t('territories.holder.offListHint')}</Text>
        </>
      ) : picking ? (
        <PersonPicker
          data={q.data}
          loading={q.isLoading}
          error={q.error}
          chosen={publisherId}
          onChoose={(p) => {
            setPublisherId(p.publisherId);
            setHolderChanged(true);
            setPicking(false);
            if (who === 'group') {
              const led = groups.find((g) => g.overseerPublisherId === p.publisherId);
              setGroupId(led?.id ?? p.serviceGroupId ?? null);
            }
          }}
        />
      ) : (
        <View style={s.chosen}>
          <Text style={s.chosenName}>
            {who === 'group' && groupId ? `${groups.find((g) => g.id === groupId)?.name ?? ''} · ` : ''}
            {chosenName ?? '—'}
          </Text>
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button" hitSlop={8}>
            <Text style={s.link}>{t('territories.holder.change')}</Text>
          </Pressable>
        </View>
      )}

      {who === 'group' && publisherId && !picking ? (
        <View style={s.block}>
          <Text style={s.label}>{t('territories.holder.whichGroup')}</Text>
          <View style={s.chips}>
            {groups.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => {
                  setGroupId(g.id);
                  setHolderChanged(true);
                }}
                style={[s.chip, groupId === g.id && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: groupId === g.id }}
              >
                <Text style={[s.chipText, groupId === g.id && s.chipTextOn]}>{g.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={s.dates}>
        <View style={{ flex: 1, minWidth: 150 }}>
          <DateField
            label={t('territories.holder.given')}
            value={assigned}
            onChange={(v) => {
              setAssigned(v);
              if (mode === 'past' && v && !due) setDue(addDaysISO(v, TERM_DAYS));
            }}
          />
        </View>
        <View style={{ flex: 1, minWidth: 150 }}>
          <DateField label={t('territories.holder.due')} value={due} onChange={setDue} />
        </View>
      </View>

      <Text style={s.label}>{t('territories.holder.end')}</Text>
      <View style={s.chips}>
        {(['completed', 'returned', 'open'] as const).map((k) => {
          const off = k === 'open' && (!canHold || who === 'off');
          return (
            <Pressable
              key={k}
              onPress={() => setEnd(k)}
              disabled={off}
              style={[s.chip, end === k && s.chipOn, off && s.chipOff]}
              accessibilityRole="radio"
              accessibilityState={{ selected: end === k, disabled: off }}
            >
              <Text style={[s.chipText, end === k && s.chipTextOn]}>
                {t(`territories.holder.${k === 'completed' ? 'endWorked' : k === 'returned' ? 'endReturned' : 'endHeld'}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.hint}>{t('territories.holder.heldOnlyLast')}</Text>

      {end !== 'open' ? (
        <View style={s.dates}>
          <View style={{ flex: 1, minWidth: 150 }}>
            <DateField
              label={end === 'completed' ? t('territories.holder.worked') : t('territories.holder.returned')}
              value={endedOn}
              onChange={setEndedOn}
            />
          </View>
        </View>
      ) : null}

      {end === 'completed' ? (
        <View style={s.block}>
          <Text style={s.label}>{t('territories.holder.method')}</Text>
          <View style={s.chips}>
            {METHODS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                style={[s.chip, method === m && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === m }}
              >
                <Text style={[s.chipText, method === m && s.chipTextOn]}>{t(`territories.method.${m}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  near: { gap: 3, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: LINE, borderRadius: 12, padding: 10, marginBottom: 6 },
  nearText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 18 },
  nearThis: { color: INK, fontFamily: 'Manrope_700Bold' },
  nearKey: { fontFamily: 'Manrope_700Bold' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginTop: 16, marginBottom: 8 },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 6, lineHeight: 17 },
  input: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    color: INK,
    backgroundColor: '#fff',
  },
  chosen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BRAND,
    backgroundColor: '#ecfeff',
  },
  chosenName: { flex: 1, fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  link: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: BRAND },
  block: { marginTop: 4 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipOff: { opacity: 0.4 },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  added: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#15803d', marginBottom: 6 },
  foot: { gap: 8 },
  warn: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b45309', lineHeight: 18 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  row2: { flexDirection: 'row', gap: 8 },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  second: { borderWidth: 1, borderColor: BRAND, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14, alignItems: 'center' },
  secondText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND },
  remove: { paddingVertical: 10, alignItems: 'center' },
  removeSure: { backgroundColor: '#b91c1c', borderRadius: 14 },
  removeText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#b91c1c' },
  removeTextSure: { color: '#fff' },
  rule: { fontFamily: 'Manrope_500Medium', fontSize: 11.5, color: MUTED, lineHeight: 16 },
});
