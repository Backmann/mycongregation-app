import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  assignmentsApi,
  extractErrorMessage,
  UpdateAssignmentInput,
} from '../../../lib/api';
import { AssignmentForm } from '../../../components/AssignmentForm';
import { SongPicker } from '../../../components/SongPicker';
import { usePermissions } from '../../../lib/permissions';
import { useTranslation } from 'react-i18next';

export default function AssignmentDetailScreen() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const assignmentQuery = useQuery({
    queryKey: ['assignment', id],
    queryFn: () => assignmentsApi.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateAssignmentInput) =>
      assignmentsApi.update(id!, input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment', id] });
      if (result.partKey === 'treasures_talk') {
        queryClient.invalidateQueries({ queryKey: ['duties'] });
      }
      const warnings = result.ruleWarnings;
      if (warnings && warnings.length) {
        const msg = warnings
          .map((w) =>
            w.code === 'mic_taken'
              ? t('rules.warn.micTaken')
              : w.code === 'mic_capability_off'
                ? t('rules.warn.micCapability', { name: w.publisherName })
                : t('rules.warn.prayerCapability', { name: w.publisherName }),
          )
          .join('\n');
        if (Platform.OS === 'web') {
          window.alert(msg);
        } else {
          Alert.alert(t('rules.warn.title'), msg);
        }
      }
    },
  });

  const unassignMutation = useMutation({
    mutationFn: () =>
      assignmentsApi.update(id!, {
        publisherId: null,
        assistantPublisherId: null,
        speakerName: null,
        speakerCongregation: null,
        publicTalkId: null,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment', id] });
      if (result.partKey === 'treasures_talk') {
        queryClient.invalidateQueries({ queryKey: ['duties'] });
      }
      router.back();
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => assignmentsApi.restore(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment', id] });
    },
  });

  const confirmUnassign = () => {
    if (Platform.OS === 'web') {
      if (window.confirm(t('schedule.unassign.confirmWebMessage'))) {
        unassignMutation.mutate();
      }
      return;
    }
    Alert.alert(
      t('schedule.unassign.confirmTitle'),
      t('schedule.unassign.confirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('schedule.unassign.button'),
          onPress: () => unassignMutation.mutate(),
        },
      ],
    );
  };

  if (assignmentQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (assignmentQuery.error || !assignmentQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {assignmentQuery.error
            ? extractErrorMessage(assignmentQuery.error)
            : t('common.notFound')}
        </Text>
      </View>
    );
  }

  const a = assignmentQuery.data;
  const canEdit =
    a.eventType === 'weekend'
      ? perms.canEditWeekendSchedule
      : a.eventType === 'midweek'
        ? perms.canEditMidweekSchedule
        : perms.isAdmin;

  const isSong =
    a.partKey === 'mid_song' ||
    a.partKey === 'weekend_song' ||
    a.partKey === 'weekend_opening_song';

  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      {a.deletedAt && (
        <View style={styles.removedBanner}>
          <Text style={styles.removedText}>{t('schedule.removedBanner')}</Text>
        </View>
      )}
      {!canEdit && (
        <View style={styles.removedBanner}>
          <Text style={styles.removedText}>{t('schedule.readOnlyBanner')}</Text>
        </View>
      )}

      {isSong ? (
        <SongPicker
          currentTitle={a.partTitle}
          readOnly={!canEdit}
          isSaving={updateMutation.isPending}
          onSave={(pt) =>
            updateMutation
              .mutateAsync({ partTitle: pt ?? '' })
              .then(() => router.back())
          }
        />
      ) : (
        <AssignmentForm
          initial={{
            weekStartDate: a.weekStartDate,
            eventType: a.eventType,
            partKey: a.partKey,
            partOrder: a.partOrder,
            partTitle: a.partTitle ?? undefined,
            partDurationMin: a.partDurationMin ?? undefined,
            publisherId: a.publisherId,
            assistantPublisherId: a.assistantPublisherId,
            status: a.status,
            notes: a.notes ?? undefined,
          }}
          onSubmit={updateMutation.mutateAsync}
          onInstantSave={canEdit ? updateMutation.mutateAsync : undefined}
          isSubmitting={updateMutation.isPending}
          lockIdentity
          readOnly={!canEdit}
        />
      )}

      {canEdit && !isSong && (
      <View style={styles.bottomActions}>
        {a.deletedAt ? (
          <Pressable
            style={[styles.button, styles.buttonRestore]}
            onPress={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {restoreMutation.isPending ? t('common.restoring') : t('common.restore')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.unassignLink,
              pressed && styles.unassignLinkPressed,
              (unassignMutation.isPending || !a.publisherId) &&
                styles.unassignLinkDisabled,
            ]}
            onPress={confirmUnassign}
            disabled={unassignMutation.isPending || !a.publisherId}
          >
            <Text style={styles.unassignLinkText}>
              {unassignMutation.isPending
                ? t('schedule.unassign.unassigning')
                : t('schedule.unassign.button')}
            </Text>
          </Pressable>
        )}
      </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: '#dc2626', fontSize: 16, textAlign: 'center' },
  removedBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderBottomWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  removedText: { color: '#92400e', fontWeight: '600', fontSize: 13 },
  unassignLink: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  unassignLinkPressed: { opacity: 0.6 },
  unassignLinkDisabled: { opacity: 0.35 },
  unassignLinkText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomActions: {
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonRemove: { backgroundColor: '#dc2626' },
  buttonUnassign: { backgroundColor: '#d97706' },
  buttonRestore: { backgroundColor: '#059669' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
