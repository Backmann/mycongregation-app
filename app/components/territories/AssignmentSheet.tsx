import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import {
  extractErrorMessage,
  territoriesApi,
  type TerritoryAssignmentRow,
  type TerritoryMethod,
} from '../../lib/api';
import { formatDateISO } from '../../lib/dates';
import { addDaysISO } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

export type AssignmentAction = 'complete' | 'return' | 'extend' | 'edit';

export const METHODS: TerritoryMethod[] = ['door_to_door', 'letters', 'campaign', 'other'];

/**
 * One sheet for what is done to a territory already given out
 * (11 November 2026):
 *  - complete — «Участок пройден»: the day and how it was worked;
 *  - return — «Вернуть без обработки»: the day (the S-13 keeps the «worked»
 *    column empty);
 *  - extend — «Нужно ещё время»: the holder asks once for a month (no day to
 *    pick), a keeper sets any later day;
 *  - edit — a keeper's correction of the dates or the method, or removing a
 *    line made by mistake (current service year; the server checks).
 */
export function AssignmentSheet({
  action,
  assignment,
  keeps,
  onClose,
}: {
  action: AssignmentAction | null;
  assignment: Pick<
    TerritoryAssignmentRow,
    'id' | 'assignedOn' | 'dueOn' | 'completedOn' | 'returnedOn' | 'method' | 'extended'
  > | null;
  /** A keeper: may pick the day of an extension, and correct. */
  keeps: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const today = formatDateISO(new Date());
  const [day, setDay] = useState(today);
  const [due, setDue] = useState('');
  const [method, setMethod] = useState<TerritoryMethod>('door_to_door');
  const [assigned, setAssigned] = useState('');
  const [end, setEnd] = useState<'open' | 'completed' | 'returned'>('open');
  const [error, setError] = useState<string | null>(null);
  // Removing asks twice: the first tap only turns the button red.
  const [sure, setSure] = useState(false);

  useEffect(() => {
    if (!action || !assignment) return;
    setError(null);
    setSure(false);
    setDay(
      action === 'edit'
        ? (assignment.completedOn ?? assignment.returnedOn ?? today)
        : today,
    );
    // Correcting keeps the day it is due; extending offers a month on from
    // that day — or from today when it has passed (12 November 2026: the
    // correction used to move the day by itself).
    const base = assignment.dueOn && assignment.dueOn > today ? assignment.dueOn : today;
    setDue(action === 'edit' ? (assignment.dueOn ?? '') : addDaysISO(base, 30));
    setMethod(assignment.method ?? 'door_to_door');
    setAssigned(assignment.assignedOn);
    setEnd(assignment.completedOn ? 'completed' : assignment.returnedOn ? 'returned' : 'open');
  }, [action, assignment, today]);

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['territories'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!assignment) return null;
      if (action === 'complete') {
        return territoriesApi.complete(assignment.id, { completedOn: day, method });
      }
      if (action === 'return') {
        return territoriesApi.giveBack(assignment.id, { returnedOn: day });
      }
      if (action === 'extend') {
        return territoriesApi.extend(assignment.id, keeps ? { dueOn: due } : {});
      }
      return territoriesApi.editAssignment(assignment.id, {
        assignedOn: assigned,
        ...(end === 'open'
          ? { reopen: true, ...(due ? { dueOn: due } : {}) }
          : end === 'completed'
            ? { completedOn: day, method }
            : { returnedOn: day }),
      });
    },
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => territoriesApi.removeAssignment(assignment!.id),
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });

  if (!action || !assignment) return null;
  const busy = save.isPending || remove.isPending;
  const title = t(`territories.action.${action}.title`);
  const holderExtends = action === 'extend' && !keeps;

  return (
    <Sheet
      visible
      title={title}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= 900 ? 'centered' : 'bottom'}
      footer={
        <View style={s.foot}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            onPress={() => save.mutate()}
            disabled={busy}
            style={[s.go, busy && s.goOff]}
            accessibilityRole="button"
          >
            {save.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.goText}>{t(`territories.action.${action}.confirm`)}</Text>
            )}
          </Pressable>
          {action === 'edit' && keeps ? (
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
          ) : null}
        </View>
      }
    >
      {holderExtends ? (
        <Text style={s.lead}>
          {assignment.extended
            ? t('territories.action.extend.already')
            : t('territories.action.extend.once')}
        </Text>
      ) : null}

      {action === 'edit' ? (
        <>
          <DateField label={t('territories.action.edit.assigned')} value={assigned} onChange={setAssigned} />
          <View style={s.chips}>
            {(['open', 'completed', 'returned'] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setEnd(k)}
                style={[s.chip, end === k && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: end === k }}
              >
                <Text style={[s.chipText, end === k && s.chipTextOn]}>
                  {t(`territories.action.edit.${k}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {action === 'complete' || action === 'return' || (action === 'edit' && end !== 'open') ? (
        <DateField
          label={
            action === 'return' || (action === 'edit' && end === 'returned')
              ? t('territories.action.returnedOn')
              : t('territories.action.completedOn')
          }
          value={day}
          onChange={setDay}
        />
      ) : null}

      {(action === 'extend' && keeps) || (action === 'edit' && end === 'open') ? (
        <DateField label={t('territories.action.dueOn')} value={due} onChange={setDue} />
      ) : null}

      {action === 'complete' || (action === 'edit' && end === 'completed') ? (
        <View style={s.methods}>
          <Text style={s.label}>{t('territories.action.method')}</Text>
          <View style={s.chips}>
            {METHODS.map((m) => (
              <Pressable
                key={m}
                onPress={() => setMethod(m)}
                style={[s.chip, method === m && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === m }}
              >
                <Text style={[s.chipText, method === m && s.chipTextOn]}>
                  {t(`territories.method.${m}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {action === 'return' ? <Text style={s.lead}>{t('territories.action.return.hint')}</Text> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, color: MUTED, lineHeight: 19, marginBottom: 10 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginBottom: 8 },
  methods: { marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  foot: { gap: 8 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  remove: { paddingVertical: 10, alignItems: 'center' },
  removeSure: { backgroundColor: '#b91c1c', borderRadius: 14 },
  removeText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#b91c1c' },
  removeTextSure: { color: '#fff' },
});
