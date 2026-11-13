import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import {
  extractErrorMessage,
  territoriesApi,
  type BusinessGroup,
  type BusinessVisitState,
  type TerritoryBusinessList,
  type TerritoryBusinessRow,
} from '../../lib/api';
import { progressOf, rowsOf } from '../../lib/business-view';
import { formatDayShort } from '../../lib/territory-view';
import type { MapPoint } from './TerritoryMap';
import { BRAND, INK, LINE, MUTED, cardStyles } from '../reports/ReportBits';

const DONE = '#15803d';
const LATER = '#b45309';
const POINT = '#7c3aed';

/** The kinds offered when a business is added by hand, by group. */
const HAND_KINDS: Record<BusinessGroup, string[]> = {
  shop: ['supermarket', 'convenience', 'kiosk', 'bakery', 'butcher', 'clothes', 'shoes', 'jewelry', 'mobile_phone', 'florist', 'optician', 'furniture', 'car', 'shop'],
  food: ['restaurant', 'cafe', 'fast_food', 'pub', 'bar', 'ice_cream'],
  service: ['hairdresser', 'beauty', 'bank', 'travel_agency', 'car_repair', 'driving_school', 'fitness_centre', 'tailor', 'laundry', 'office'],
  health: ['pharmacy', 'doctors', 'dentist', 'physiotherapist'],
  lodging: ['hotel', 'guest_house'],
  other: ['other'],
};
const GROUPS: BusinessGroup[] = ['shop', 'food', 'service', 'health', 'lodging', 'other'];

export const businessesKey = (territoryId: string) => ['territories', 'businesses', territoryId];

/** The list of a business territory, shared by the screen's map and list. */
export function useBusinesses(territoryId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: businessesKey(territoryId ?? ''),
    queryFn: () => territoriesApi.businesses(territoryId!),
    enabled: enabled && !!territoryId,
  });
}

/**
 * The list as numbered dots for the map, green once visited; shops that
 * stand together are one dot «10–13», as they are one row of the list.
 */
export function pointsOf(list: TerritoryBusinessList | undefined): MapPoint[] {
  return rowsOf((list?.items ?? []).filter((b) => b.lon !== null && b.lat !== null)).map((r) => {
    const all = Array.isArray(r) ? r : [r];
    const first = all[0];
    const last = all[all.length - 1];
    return {
      label: all.length > 1 ? `${first.n}–${last.n}` : String(first.n),
      lon: first.lon!,
      lat: first.lat!,
      done: all.every((b) => b.visit?.state === 'visited'),
    };
  });
}

/** A kind in words: its own name if we have one, else its group's. */
function useKindLabel() {
  const { t, i18n } = useTranslation();
  return (kind: string, group: BusinessGroup) => {
    const key = `territories.business.kind.${kind}`;
    return i18n.exists(key) ? t(key) : t(`territories.business.group.${group}`);
  };
}

/**
 * The list of a business territory (13 November 2026; mockup «Деловые
 * территории»). The territory servant keeps it — from the map or by hand;
 * whoever has the territory now marks «visited» or «closed — again later».
 * The marks go when the territory comes back; nothing about people is kept.
 */
export function BusinessList({
  territoryId,
  keeps,
  canMark,
}: {
  territoryId: string;
  /** The territory servant: suggest, add, correct, remove. */
  keeps: boolean;
  /** Whoever has the territory now (and the servant): the marks. */
  canMark: boolean;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const kindLabel = useKindLabel();
  const qc = useQueryClient();
  const q = useBusinesses(territoryId, true);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [suggesting, setSuggesting] = useState(false);
  const [editing, setEditing] = useState<{ row: TerritoryBusinessRow | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mark = useMutation({
    mutationFn: ({ id, state }: { id: string; state: BusinessVisitState | null }) =>
      territoriesApi.markBusiness(id, state),
    onSuccess: () => void qc.invalidateQueries({ queryKey: businessesKey(territoryId) }),
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const list = q.data;
  const rows = useMemo(() => rowsOf(list?.items ?? []), [list]);
  if (q.isLoading) return <ActivityIndicator color={BRAND} />;
  if (q.error || !list) {
    return <Text style={s.error}>{extractErrorMessage(q.error)}</Text>;
  }
  const p = progressOf(list.items);
  const marking = canMark && !!list.assignmentId;

  const one = (b: TerritoryBusinessRow, inner = false) => {
    const state = b.visit?.state ?? null;
    const toggle = (to: BusinessVisitState) => {
      setError(null);
      mark.mutate({ id: b.id, state: state === to ? null : to });
    };
    return (
      <View key={b.id} style={[s.row, inner && s.inner]}>
        <View style={[s.num, state === 'visited' && s.numDone, state === 'later' && s.numLater]}>
          <Text style={s.numText}>{b.n}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{b.name}</Text>
          <Text style={s.meta}>
            {kindLabel(b.kind, b.group)}
            {b.gone ? ` · ${t('territories.business.gone')}` : ''}
            {state && b.visit ? ` · ${t(`territories.business.${state}On`, { date: formatDayShort(b.visit.onDate, lang) })}` : ''}
          </Text>
        </View>
        {marking ? (
          <View style={s.marks}>
            <Pressable
              onPress={() => toggle('visited')}
              style={[s.mark, state === 'visited' && s.markDone]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: state === 'visited' }}
              accessibilityLabel={t('territories.business.visited')}
            >
              <Text style={[s.markText, state === 'visited' && { color: DONE }]}>
                {t('territories.business.visited')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggle('later')}
              style={[s.mark, state === 'later' && s.markLater]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: state === 'later' }}
              accessibilityLabel={t('territories.business.later')}
            >
              <Text style={[s.markText, state === 'later' && { color: LATER }]}>
                {t('territories.business.later')}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {keeps ? (
          <Pressable
            onPress={() => setEditing({ row: b })}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('territories.business.edit')}
          >
            <Ionicons name="create-outline" size={17} color={MUTED} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={[cardStyles.card, s.card]}>
      {marking && p.total > 0 ? (
        <View style={s.progress}>
          <View style={s.bar}>
            <View style={[s.barFill, { width: `${Math.round((p.visited / p.total) * 100)}%` }]} />
          </View>
          <Text style={s.meta}>
            {t('territories.business.progress', { visited: p.visited, total: p.total })}
            {p.later ? ` · ${t('territories.business.laterCount', { count: p.later })}` : ''}
          </Text>
        </View>
      ) : null}

      {list.items.length === 0 ? (
        <Text style={s.empty}>{t(keeps ? 'territories.business.emptyKeeper' : 'territories.business.empty')}</Text>
      ) : (
        rows.map((r) => {
          if (!Array.isArray(r)) return one(r);
          const key = r[0].id;
          const shown = open.has(key);
          const done = r.filter((b) => b.visit?.state === 'visited').length;
          return (
            <View key={key}>
              <Pressable
                onPress={() =>
                  setOpen((cur) => {
                    const next = new Set(cur);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  })
                }
                style={s.row}
                accessibilityRole="button"
                accessibilityState={{ expanded: shown }}
              >
                <View style={[s.num, s.numMany, done === r.length && s.numDone]}>
                  <Ionicons name="business-outline" size={12} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{t('territories.business.together', { count: r.length })}</Text>
                  <Text style={s.meta}>
                    {`${r[0].n}–${r[r.length - 1].n} · ${r.map((b) => b.name).slice(0, 3).join(', ')}${r.length > 3 ? '…' : ''}`}
                    {marking ? ` · ${t('territories.business.progress', { visited: done, total: r.length })}` : ''}
                  </Text>
                </View>
                <Ionicons name={shown ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
              </Pressable>
              {shown ? r.map((b) => one(b, true)) : null}
            </View>
          );
        })
      )}

      {error ? <Text style={s.error}>{error}</Text> : null}
      {keeps ? (
        <View style={s.tools}>
          <Pressable onPress={() => setSuggesting(true)} style={s.tool} accessibilityRole="button">
            <Ionicons name="map-outline" size={16} color={BRAND} />
            <Text style={s.toolText}>{t('territories.business.suggest')}</Text>
          </Pressable>
          <Pressable onPress={() => setEditing({ row: null })} style={s.tool} accessibilityRole="button">
            <Ionicons name="add" size={17} color={BRAND} />
            <Text style={s.toolText}>{t('territories.business.add')}</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={s.small}>{t('territories.business.rule')}</Text>

      {suggesting ? (
        <SuggestSheet territoryId={territoryId} onClose={() => setSuggesting(false)} />
      ) : null}
      {editing ? (
        <BusinessSheet territoryId={territoryId} row={editing.row} onClose={() => setEditing(null)} />
      ) : null}
    </View>
  );
}

/** The map's businesses inside the territory, to take into the list. */
function SuggestSheet({ territoryId, onClose }: { territoryId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const kindLabel = useKindLabel();
  const wide = useWindowDimensions().width >= 900;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['territories', 'businesses', territoryId, 'suggest'],
    queryFn: () => territoriesApi.businessSuggest(territoryId),
  });
  // Everything is chosen to begin with: the servant takes away what is not.
  const [off, setOff] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const places = q.data?.places ?? [];
  const chosen = places.filter((p) => !off.has(p.osmId));
  const take = useMutation({
    mutationFn: () => territoriesApi.addBusinesses(territoryId, chosen.map((p) => ({ osmId: p.osmId }))),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: businessesKey(territoryId) });
      onClose();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const flip = (id: string) =>
    setOff((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Sheet
      visible
      title={t('territories.business.suggestTitle')}
      subtitle={
        q.data?.builtAt
          ? t('territories.business.mapOf', { date: formatDayShort(q.data.builtAt.slice(0, 10), i18n.language) })
          : t('territories.business.noMap')
      }
      onClose={onClose}
      variant={wide ? 'centered' : 'bottom'}
      footer={
        places.length > 0 ? (
          <Pressable
            onPress={() => take.mutate()}
            disabled={chosen.length === 0 || take.isPending}
            style={[s.go, (chosen.length === 0 || take.isPending) && { opacity: 0.45 }]}
            accessibilityRole="button"
          >
            {take.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.goText}>{t('territories.business.take', { count: chosen.length })}</Text>
            )}
          </Pressable>
        ) : undefined
      }
    >
      {q.isLoading ? (
        <ActivityIndicator color={BRAND} />
      ) : places.length === 0 ? (
        <Text style={s.empty}>{t('territories.business.nothingNew')}</Text>
      ) : (
        <>
          <Text style={s.small}>{t('territories.business.suggestHint')}</Text>
          {GROUPS.filter((g) => places.some((p) => p.group === g)).map((g) => {
            const mine = places.filter((p) => p.group === g);
            return (
              <View key={g} style={{ marginTop: 10 }}>
                <Text style={s.groupTitle}>
                  {t(`territories.business.group.${g}`)} — {mine.length}
                </Text>
                {mine.map((p) => {
                  const on = !off.has(p.osmId);
                  return (
                    <Pressable
                      key={p.osmId}
                      onPress={() => flip(p.osmId)}
                      style={s.pick}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      <Ionicons name={on ? 'checkbox' : 'square-outline'} size={19} color={on ? BRAND : '#94a3b8'} />
                      <Text style={s.pickText}>
                        {p.name}
                        <Text style={s.meta}> · {kindLabel(p.kind, p.group)}</Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
          <Text style={[s.small, { marginTop: 10 }]}>{t('territories.business.notPlaces')}</Text>
        </>
      )}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </Sheet>
  );
}

/** A business added by hand, or one corrected or taken off the list. */
function BusinessSheet({
  territoryId,
  row,
  onClose,
}: {
  territoryId: string;
  row: TerritoryBusinessRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  const wide = useWindowDimensions().width >= 900;
  const qc = useQueryClient();
  const [name, setName] = useState(row?.name ?? '');
  const [group, setGroup] = useState<BusinessGroup>(row?.group ?? 'shop');
  const [kind, setKind] = useState(row?.kind ?? HAND_KINDS.shop[0]);
  const [error, setError] = useState<string | null>(null);
  const done = async () => {
    await qc.invalidateQueries({ queryKey: businessesKey(territoryId) });
    onClose();
  };
  const save = useMutation({
    mutationFn: async (): Promise<void> => {
      if (row) await territoriesApi.editBusiness(row.id, { name: name.trim(), kind });
      else await territoriesApi.addBusinesses(territoryId, [{ name: name.trim(), kind }]);
    },
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => territoriesApi.removeBusiness(row!.id),
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const kinds = HAND_KINDS[group].includes(kind) ? HAND_KINDS[group] : [kind, ...HAND_KINDS[group]];

  return (
    <Sheet
      visible
      title={row ? t('territories.business.edit') : t('territories.business.add')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={wide ? 'centered' : 'bottom'}
      footer={
        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => save.mutate()}
            disabled={!name.trim() || save.isPending}
            style={[s.go, (!name.trim() || save.isPending) && { opacity: 0.45 }]}
            accessibilityRole="button"
          >
            <Text style={s.goText}>{t('common.save')}</Text>
          </Pressable>
          {row ? (
            <Pressable onPress={() => remove.mutate()} style={s.removeBtn} accessibilityRole="button">
              <Text style={s.removeText}>{t('territories.business.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <Text style={s.label}>{t('territories.business.name')}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={s.input}
        maxLength={160}
        autoFocus={!row}
        accessibilityLabel={t('territories.business.name')}
      />
      <Text style={s.label}>{t('territories.business.kindLabel')}</Text>
      <View style={s.chips}>
        {GROUPS.map((g) => (
          <Pressable
            key={g}
            onPress={() => {
              setGroup(g);
              setKind(HAND_KINDS[g][0]);
            }}
            style={[s.chip, group === g && s.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: group === g }}
          >
            <Text style={[s.chipText, group === g && s.chipTextOn]}>{t(`territories.business.group.${g}`)}</Text>
          </Pressable>
        ))}
      </View>
      {group !== 'other' ? (
        <View style={[s.chips, { marginTop: 8 }]}>
          {kinds.map((k) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={[s.chip, kind === k && s.chipOn]}
              accessibilityRole="radio"
              accessibilityState={{ selected: kind === k }}
            >
              <Text style={[s.chipText, kind === k && s.chipTextOn]}>{kindLabel(k, group)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {!row ? <Text style={[s.small, { marginTop: 10 }]}>{t('territories.business.handHint')}</Text> : null}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  card: { padding: 12, gap: 2 },
  progress: { marginBottom: 8, gap: 4 },
  bar: { height: 8, borderRadius: 4, backgroundColor: LINE, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: DONE },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  inner: { paddingLeft: 18 },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: POINT, alignItems: 'center', justifyContent: 'center' },
  numDone: { backgroundColor: DONE },
  numLater: { backgroundColor: LATER },
  numMany: { backgroundColor: '#475569' },
  numText: { fontFamily: 'Manrope_700Bold', fontSize: 11, color: '#fff' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },
  marks: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  mark: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  markDone: { borderColor: DONE, backgroundColor: '#f0fdf4' },
  markLater: { borderColor: LATER, backgroundColor: '#fffbeb' },
  markText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12, color: MUTED },
  empty: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, paddingVertical: 6 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c', marginTop: 6 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tool: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: BRAND, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  toolText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: BRAND },
  small: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, lineHeight: 17, marginTop: 8 },
  groupTitle: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK, marginBottom: 2 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  pickText: { flex: 1, fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: INK },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  removeBtn: { paddingVertical: 8, alignItems: 'center' },
  removeText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#b91c1c' },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginTop: 10, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: LINE, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: 'Manrope_500Medium', fontSize: 15, color: INK, backgroundColor: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: LINE, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: MUTED },
  chipTextOn: { color: BRAND, fontFamily: 'Manrope_700Bold' },
});
