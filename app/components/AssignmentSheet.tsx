import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Assignment,
  assignmentsApi,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from '../lib/api';
import { AssignmentForm } from './AssignmentForm';
import { SongPicker } from './SongPicker';

interface Props {
  /** The assignment being edited, or null when the sheet is closed. */
  assignment: Assignment | null;
  /** ISO Monday of the week currently shown — used to target the cache. */
  weekStartISO: string;
  canEdit: boolean;
  onClose: () => void;
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
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const open = !!assignment;
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

  const isSong = !!assignment && SONG_KEYS.includes(assignment.partKey);

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handleBar} />
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {assignment?.partTitle || t('schedule.sheet.title')}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </Pressable>
        </View>

        {assignment ? (
          isSong ? (
            <SongPicker
              key={assignment.id}
              currentTitle={assignment.partTitle}
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
                key={assignment.id}
                initial={{
                  weekStartDate: assignment.weekStartDate,
                  eventType: assignment.eventType,
                  partKey: assignment.partKey,
                  partOrder: assignment.partOrder,
                  partTitle: assignment.partTitle ?? undefined,
                  partDurationMin: assignment.partDurationMin ?? undefined,
                  publisherId: assignment.publisherId,
                  assistantPublisherId: assignment.assistantPublisherId,
                  status: assignment.status,
                  notes: assignment.notes ?? undefined,
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
                readOnly={!canEdit}
              />
              {canEdit && (
                <Pressable
                  style={({ pressed }) => [
                    styles.unassignLink,
                    pressed && styles.unassignLinkPressed,
                    (unassignMutation.isPending || !assignment.publisherId) &&
                      styles.unassignLinkDisabled,
                  ]}
                  onPress={confirmUnassign}
                  disabled={unassignMutation.isPending || !assignment.publisherId}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '90%',
    backgroundColor: '#f1f5f9',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 8,
    ...(Platform.OS === 'web'
      ? { maxWidth: 680, marginHorizontal: 'auto' as never }
      : null),
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
  unassignLink: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  unassignLinkPressed: { opacity: 0.6 },
  unassignLinkDisabled: { opacity: 0.35 },
  unassignLinkText: { color: '#dc2626', fontSize: 14, fontWeight: '600' },
});
