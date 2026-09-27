import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { specialEventsApi } from '../lib/api';
import {
  EventFormValue,
  SpecialEventForm,
  eventConflicts,
  eventFormProblem,
  formKind,
} from './SpecialEventForm';

/**
 * The event form as a screen (27 September): the form scrolls, the save
 * button stays at the bottom with what still stops it — on a phone it used to
 * be found only after scrolling past the whole form, the note included.
 *
 * Both the new event and the edit of one use it, so the two cannot drift.
 */
export function EventFormScreen({
  value,
  onChange,
  pastLocked = false,
  isNew = false,
  selfId = null,
  saving,
  errorText,
  onSave,
  onCancel,
}: {
  value: EventFormValue;
  onChange: (v: EventFormValue) => void;
  pastLocked?: boolean;
  isNew?: boolean;
  selfId?: string | null;
  saving: boolean;
  errorText: string | null;
  onSave: () => void;
  onCancel?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [multiDay, setMultiDay] = useState(false);
  // Everything recorded, for «as last time» and for what the server would
  // refuse (a second Memorial in a service year, a second visit in a week).
  const othersQ = useQuery({
    queryKey: ['special-events', 'form-history'],
    queryFn: () => specialEventsApi.list({ all: true }),
  });
  const conflict = eventConflicts(
    value,
    othersQ.data,
    selfId,
    t,
    i18n.language,
  );
  const problem = eventFormProblem(value, t, multiDay) ?? conflict.problem;
  const kind = formKind(value);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <SpecialEventForm
          value={value}
          onChange={onChange}
          pastLocked={pastLocked}
          onMultiDayChange={setMultiDay}
          isNew={isNew}
          others={othersQ.data}
          selfId={selfId}
        />
      </ScrollView>
      <View style={styles.bar}>
        {problem ? <Text style={styles.problem}>{problem}</Text> : null}
        {errorText ? <Text style={styles.error}>{errorText}</Text> : null}
        <View style={styles.buttons}>
          {onCancel ? (
            <Pressable style={styles.cancel} onPress={onCancel}>
              <Text style={styles.cancelText}>
                {t('specialEvents.actions.cancel')}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.save, (!!problem || saving) && styles.disabled]}
            disabled={!!problem || saving}
            onPress={onSave}
            accessibilityRole="button"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveText}>
                {t(`specialEvents.form.save.${kind}`)}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 24 },
  bar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 6,
  },
  problem: { color: '#b45309', textAlign: 'center', fontSize: 13.5 },
  error: { color: '#b91c1c', textAlign: 'center', fontSize: 13.5 },
  buttons: { flexDirection: 'row', gap: 10 },
  save: {
    flex: 1,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  disabled: { opacity: 0.45 },
  cancel: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  cancelText: {
    color: '#334155',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
});
