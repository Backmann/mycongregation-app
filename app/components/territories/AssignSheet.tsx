import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
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
import { DateField } from '../DateField';
import { SegmentedControl } from '../SegmentedControl';
import { extractErrorMessage, territoriesApi } from '../../lib/api';
import { formatDateISO } from '../../lib/dates';
import { addDaysISO, formatDayShort, TERM_DAYS } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';
import { HandOver } from './HandOver';

type Whom = 'person' | 'group';

/**
 * «Выдать участок» (11 November 2026, mockup «Выдать участок»).
 *
 * Always to a person; «Участок группы» marks it for his group, and the
 * group is then the one whose members see it. Under each name: what he
 * holds now and when he last had this one — the two things the territory
 * servant weighs. Inactive and departed cards are not offered (the server
 * leaves them out and refuses them anyway).
 */
export function AssignSheet({
  territoryId,
  visible,
  onClose,
  onPrint,
}: {
  territoryId: string;
  visible: boolean;
  onClose: () => void;
  /** Offered on the web: once given out, print the holder's map. */
  onPrint?: (territoryId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const today = formatDateISO(new Date());
  const [whom, setWhom] = useState<Whom>('person');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [dueOn, setDueOn] = useState(addDaysISO(today, TERM_DAYS));
  const [error, setError] = useState<string | null>(null);
  // Given out: how he gets the map (13 November 2026).
  const [handing, setHanding] = useState<{
    assignmentId: string;
    dueOn: string | null;
    name: string;
    hasApp: boolean;
    noCalls: number;
    number: string;
  } | null>(null);

  const q = useQuery({
    queryKey: ['territories', 'candidates', territoryId],
    queryFn: () => territoriesApi.candidates(territoryId),
    enabled: visible,
  });

  useEffect(() => {
    if (!visible) return;
    setWhom('person');
    setQuery('');
    setChosen(null);
    setGroupId(null);
    setDueOn(addDaysISO(today, TERM_DAYS));
    setError(null);
    setHanding(null);
  }, [visible, today]);

  const people = useMemo(() => {
    const all = q.data?.people ?? [];
    const needle = query.trim().toLowerCase();
    return needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;
  }, [q.data, query]);
  const person = q.data?.people.find((p) => p.publisherId === chosen) ?? null;
  const groups = q.data?.groups ?? [];

  // «Участок группы»: his own group unless another is picked; an overseer
  // first offers the group he leads.
  useEffect(() => {
    if (whom !== 'group' || !person) return;
    const led = groups.find((g) => g.overseerPublisherId === person.publisherId);
    setGroupId((g) => g ?? led?.id ?? person.serviceGroupId ?? null);
  }, [whom, person, groups]);

  const give = useMutation({
    mutationFn: () =>
      territoriesApi.assign(territoryId, {
        publisherId: chosen!,
        dueOn,
        ...(whom === 'group' && groupId ? { forGroupId: groupId } : {}),
      }),
    onSuccess: async (r) => {
      // The list must know the new holder before a map is printed for him.
      await qc.invalidateQueries({ queryKey: ['territories'] });
      const noCalls = await territoriesApi
        .detail(territoryId)
        .then((d) => d.noCalls.length)
        .catch(() => 0);
      setHanding({
        assignmentId: r.id,
        dueOn: r.dueOn,
        name: person?.name ?? r.holderName,
        hasApp: !!person?.hasApp,
        noCalls,
        number: q.data?.territory.number ?? '',
      });
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const months = Math.round((Date.parse(dueOn) - Date.parse(today)) / (30.4 * 86_400_000));
  const ready = !!chosen && dueOn > today && (whom === 'person' || !!groupId);

  if (handing) {
    return (
      <Sheet
        visible={visible}
        title={t('territories.handover.title')}
        onClose={onClose}
        hideClose
        variant={width >= 900 ? 'centered' : 'bottom'}
      >
        <HandOver
          assignmentId={handing.assignmentId}
          number={handing.number}
          holderName={handing.name}
          dueOn={handing.dueOn}
          hasApp={handing.hasApp}
          noCalls={handing.noCalls}
          onDone={onClose}
          onPrintNow={
            onPrint && Platform.OS === 'web'
              ? () => {
                  onClose();
                  onPrint(territoryId);
                }
              : undefined
          }
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      title={t('territories.assign.title')}
      subtitle={q.data ? q.data.territory.number : undefined}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      // Rises from the edge on a phone, a card in the middle on a wide screen.
      variant={width >= 900 ? 'centered' : 'bottom'}
      footer={
        <View style={s.foot}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            onPress={() => give.mutate()}
            disabled={!ready || give.isPending}
            style={[s.go, (!ready || give.isPending) && s.goOff]}
            accessibilityRole="button"
          >
            {give.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.goText}>
                {person
                  ? t('territories.assign.giveTo', { name: person.name })
                  : t('territories.assign.choose')}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <SegmentedControl<Whom>
        segments={[
          { key: 'person', label: t('territories.assign.toPerson') },
          { key: 'group', label: t('territories.assign.toGroup') },
        ]}
        value={whom}
        onChange={setWhom}
      />
      {whom === 'group' ? (
        <Text style={s.hint}>{t('territories.assign.groupHint')}</Text>
      ) : null}

      <View style={s.search}>
        <Ionicons name="search" size={16} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('territories.assign.search')}
          placeholderTextColor="#94a3b8"
          style={s.searchInput}
        />
      </View>

      {q.isLoading ? (
        <ActivityIndicator color={BRAND} style={{ marginVertical: 20 }} />
      ) : q.error ? (
        <Text style={s.error}>{extractErrorMessage(q.error)}</Text>
      ) : (
        <View style={s.list}>
          {people.map((p) => {
            const on = p.publisherId === chosen;
            const holds = p.holds.length
              ? t('territories.assign.holds', { count: p.holds.length, list: p.holds.join(', ') })
              : t('territories.assign.holdsNone');
            const had = p.hadThisOn
              ? t('territories.assign.hadOn', { date: formatDayShort(p.hadThisOn, i18n.language) })
              : t('territories.assign.hadNever');
            return (
              <Pressable
                key={p.publisherId}
                onPress={() => {
                  setChosen(p.publisherId);
                  setGroupId(null);
                }}
                style={[s.person, on && s.personOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>
                    {p.name}
                    {p.pioneer ? <Text style={s.pioneer}>  {t('territories.assign.pioneer')}</Text> : null}
                  </Text>
                  <Text style={[s.meta, p.overdue > 0 && s.metaDue]}>
                    {holds}
                    {p.overdue > 0 ? ` · ${t('territories.assign.overdue', { count: p.overdue })}` : ''}
                    {' · '}
                    {had}
                  </Text>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={22} color={BRAND} /> : null}
              </Pressable>
            );
          })}
          {people.length === 0 ? <Text style={s.meta}>{t('territories.assign.nobody')}</Text> : null}
        </View>
      )}

      {whom === 'group' && person ? (
        <View style={s.groups}>
          <Text style={s.label}>{t('territories.assign.whichGroup')}</Text>
          <View style={s.chips}>
            {groups.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => setGroupId(g.id)}
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


      <View style={s.due}>
        <DateField label={t('territories.assign.dueOn')} value={dueOn} onChange={setDueOn} />
        {months > 0 ? (
          <Text style={s.meta}>{t('territories.assign.months', { count: months })}</Text>
        ) : null}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 8 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 14,
    backgroundColor: '#fff',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontFamily: 'Manrope_500Medium', fontSize: 14, color: INK },
  list: { marginTop: 10, gap: 6 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#fff',
  },
  personOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  pioneer: { fontFamily: 'Manrope_800ExtraBold', fontSize: 10.5, color: '#15803d', letterSpacing: 0.5 },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  metaDue: { color: '#c2410c' },
  groups: { marginTop: 16 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  due: { marginTop: 16, gap: 4 },
  foot: { gap: 8 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
});
