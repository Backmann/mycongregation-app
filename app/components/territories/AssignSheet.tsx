import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { SegmentedControl } from '../SegmentedControl';
import { router } from 'expo-router';
import { extractErrorMessage, recutApi, territoriesApi } from '../../lib/api';
import { RECUT_KEY } from '../../lib/recut';
import { formatDateISO } from '../../lib/dates';
import { addDaysISO, TERM_DAYS } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';
import { HandOver } from './HandOver';
import { PersonPicker } from './PersonPicker';
import { RecutWaitingCard } from './RecutWaitingCard';

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
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const today = formatDateISO(new Date());
  const [whom, setWhom] = useState<Whom>('person');
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

  // A territory the service committee decided to cut or join (16 November
  // 2026, step 5 of the re-cutting draft): warned before it goes out again.
  const waitingQ = useQuery({
    queryKey: [...RECUT_KEY, 'waiting'],
    queryFn: () => recutApi.waiting(),
    enabled: visible,
    retry: false,
  });
  const waiting = waitingQ.data?.find((w) => w.territoryId === territoryId) ?? null;
  const [anyway, setAnyway] = useState(false);
  const hold = useMutation({
    mutationFn: (w: { proposalId: string }) => recutApi.hold(w.proposalId, territoryId, true),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['territories'] });
      onClose();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  const q = useQuery({
    queryKey: ['territories', 'candidates', territoryId],
    queryFn: () => territoriesApi.candidates(territoryId),
    enabled: visible,
  });

  useEffect(() => {
    if (!visible) return;
    setWhom('person');
    setChosen(null);
    setGroupId(null);
    setDueOn(addDaysISO(today, TERM_DAYS));
    setError(null);
    setHanding(null);
    setAnyway(false);
  }, [visible, today]);

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
        // Held back for a join: the keeper chose to give it out anyway.
        ...(anyway && waiting?.hold ? { releaseHold: true } : {}),
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
  // Until the keeper has answered the warning, nothing is given out.
  const warned = !!waiting && !anyway;
  // Not given out before the draft has been asked (a keeper only; a refusal
  // or a failure there does not stop the giving out).
  const asked = !waitingQ.isLoading;
  const ready = !!chosen && dueOn > today && (whom === 'person' || !!groupId) && !warned && asked;

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
      {warned && waiting ? (
        <View style={{ marginBottom: 14 }}>
          <RecutWaitingCard
            row={waiting}
            giving
            busy={hold.isPending}
            onOpen={() => {
              onClose();
              router.push(`/cart/recut/${waiting.proposalId}` as never);
            }}
            onHold={() => hold.mutate({ proposalId: waiting.proposalId })}
            onAnyway={() => setAnyway(true)}
          />
        </View>
      ) : null}
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

      <PersonPicker
        data={q.data}
        loading={q.isLoading}
        error={q.error}
        chosen={chosen}
        onChoose={(p) => {
          setChosen(p.publisherId);
          setGroupId(null);
        }}
      />

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
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
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
