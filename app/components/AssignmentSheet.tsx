import {
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Assignment,
  assignmentsApi,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from '../lib/api';
import { AssignmentForm, AssignmentFormCoPicker } from './AssignmentForm';
import { SongPicker } from './SongPicker';

interface Props {
  /** The assignment being edited, or null when the sheet is closed. */
  assignment: Assignment | null;
  /** ISO Monday of the week currently shown — used to target the cache. */
  weekStartISO: string;
  canEdit: boolean;
  onClose: () => void;
  /** When set (planning mode), shows a "Next" button to jump to the
   * next unassigned part. */
  onNext?: (() => void) | null;
  /** Circuit overseer for the week (CO-visit week only); enables CO talk
   * titles and CO-led prayers in the form. */
  circuitOverseer?: { displayName: string; role?: string | null } | null;
  /** Forwarded to the form: manager-only visiting-overseer picker. */
  coPicker?: AssignmentFormCoPicker | null;
}

const SONG_KEYS = ['mid_song', 'weekend_song', 'weekend_opening_song'];

/**
 * Bottom-sheet editor for a single assignment. Opens over the schedule so the
 * week, scroll position and open block are preserved. Pickers save instantly
 * with an optimistic cache update, so the row fills in before the network
 * round-trip completes.
 */
export function AssignmentSheet({
  assignment,
  weekStartISO,
  canEdit,
  onClose,
  onNext,
  circuitOverseer,
  coPicker,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  // Wide screens (desktop web) get a centered dialog; narrow stays a bottom sheet.
  const centered = Platform.OS === 'web' && width >= 700;
  const queryClient = useQueryClient();
  const open = !!assignment;
  // Keep the last assignment mounted through the close animation so the
  // sheet doesn't briefly collapse to an empty header before fading out.
  const [active, setActive] = useState<Assignment | null>(assignment);
  useEffect(() => {
    if (assignment) {
      setActive(assignment);
      return;
    }
    const timer = setTimeout(() => setActive(null), 240);
    return () => clearTimeout(timer);
  }, [assignment]);
  const queryKey = ['assignments', weekStartISO];

  const updateMutation = useMutation({
    mutationFn: (input: UpdateAssignmentInput) =>
      assignmentsApi.update(assignment!.id, input),
    // Optimistic: patch the cached week immediately.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<{ data: Assignment[] }>(queryKey);
      if (prev) {
        queryClient.setQueryData(queryKey, {
          ...prev,
          data: prev.data.map((row) =>
            row.id === assignment!.id ? { ...row, ...input } : row,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSuccess: (result) => {
      const warnings = (result as Assignment).ruleWarnings;
      if (warnings && warnings.length) {
        const msg = warnings
          .map((w) =>
            t('rules.warn.prayerCapability', { name: w.publisherName }),
          )
          .join('\n');
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert(t('rules.warn.title'), msg);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      if (assignment) {
        queryClient.invalidateQueries({
          queryKey: ['assignment', assignment.id],
        });
      }
    },
  });

  const unassignMutation = useMutation({
    mutationFn: () =>
      assignmentsApi.update(assignment!.id, {
        publisherId: null,
        assistantPublisherId: null,
        speakerName: null,
        speakerCongregation: null,
        publicTalkId: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      onClose();
    },
  });

  const confirmUnassign = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('schedule.unassign.confirmWebMessage'))) {
        unassignMutation.mutate();
      }
      return;
    }
    unassignMutation.mutate();
  };

  const isSong = !!active && SONG_KEYS.includes(active.partKey);

  return (
    <Modal
      visible={open}
      transparent
      animationType={centered ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={centered ? styles.centerWrap : styles.bottomWrap}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.sheet,
            centered ? styles.sheetCentered : styles.sheetBottom,
          ]}
        >
          {centered ? null : <View style={styles.handleBar} />}
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {active ? active.partTitle || t('schedule.sheet.title') : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {onNext ? (
              <Pressable onPress={onNext} hitSlop={8} style={styles.nextBtn}>
                <Text style={styles.nextText}>{t('schedule.sheet.next')}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
              <Text style={styles.closeText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>

        {active ? (
          isSong ? (
            <SongPicker
              key={active.id}
              currentTitle={active.partTitle}
              readOnly={!canEdit}
              isSaving={updateMutation.isPending}
              onSave={(pt) =>
                updateMutation
                  .mutateAsync({ partTitle: pt ?? '' })
                  .then(() => onClose())
              }
            />
          ) : (
            <>
              <AssignmentForm
                key={active.id}
                initial={{
                  weekStartDate: active.weekStartDate,
                  eventType: active.eventType,
                  partKey: active.partKey,
                  partOrder: active.partOrder,
                  partTitle: active.partTitle ?? undefined,
                  partDurationMin: active.partDurationMin ?? undefined,
                  publisherId: active.publisherId,
                  assistantPublisherId: active.assistantPublisherId,
                  publicTalkId: active.publicTalkId ?? null,
                  speakerName: active.speakerName ?? null,
                  speakerCongregation: active.speakerCongregation ?? null,
                  status: active.status,
                  notes: active.notes ?? undefined,
                }}
                onSubmit={(data: CreateAssignmentInput) =>
                  updateMutation.mutateAsync(data).then(() => onClose())
                }
                onInstantSave={
                  canEdit
                    ? (patch) => updateMutation.mutateAsync(patch)
                    : undefined
                }
                onCancel={onClose}
                isSubmitting={updateMutation.isPending}
                lockIdentity
                circuitOverseer={circuitOverseer}
                coPicker={coPicker}
                readOnly={!canEdit}
              />
              {canEdit && (
                <Pressable
                  style={({ pressed }) => [
                    styles.unassignLink,
                    pressed && styles.unassignLinkPressed,
                    (unassignMutation.isPending || !active.publisherId) &&
                      styles.unassignLinkDisabled,
                  ]}
                  onPress={confirmUnassign}
                  disabled={unassignMutation.isPending || !active.publisherId}
                >
                  <Text style={styles.unassignLinkText}>
                    {unassignMutation.isPending
                      ? t('schedule.unassign.unassigning')
                      : t('schedule.unassign.button')}
                  </Text>
                </Pressable>
              )}
            </>
          )
        ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  bottomWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end' },
  centerWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: { backgroundColor: '#f1f5f9', overflow: 'hidden' },
  sheetBottom: {
    width: '100%',
    maxHeight: '90%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 8,
    ...(Platform.OS === 'web'
      ? { maxWidth: 680, alignSelf: 'center' as never }
      : null),
  },
  sheetCentered: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    borderRadius: 16,
    paddingBottom: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.3,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  handleBar: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0f172a' },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  closeText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nextText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  unassignLink: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  unassignLinkPressed: { opacity: 0.6 },
  unassignLinkDisabled: { opacity: 0.35 },
  unassignLinkText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
});
