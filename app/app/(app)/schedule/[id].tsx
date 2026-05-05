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

export default function AssignmentDetailScreen() {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['assignment', id] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => assignmentsApi.remove(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
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

  const confirmRemove = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('Remove this assignment?')) {
        removeMutation.mutate();
      }
      return;
    }
    Alert.alert('Remove assignment', null as any, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        onPress: () => removeMutation.mutate(),
        style: 'destructive',
      },
    ]);
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
            : 'Not found'}
        </Text>
      </View>
    );
  }

  const a = assignmentQuery.data;

  return (
    <View style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      {a.deletedAt && (
        <View style={styles.removedBanner}>
          <Text style={styles.removedText}>This assignment is removed</Text>
        </View>
      )}

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
        isSubmitting={updateMutation.isPending}
        submitLabel="Save"
        lockIdentity
      />

      <View style={styles.bottomActions}>
        {a.deletedAt ? (
          <Pressable
            style={[styles.button, styles.buttonRestore]}
            onPress={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {restoreMutation.isPending ? 'Restoring…' : 'Restore'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.buttonRemove]}
            onPress={confirmRemove}
            disabled={removeMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {removeMutation.isPending ? 'Removing…' : 'Remove'}
            </Text>
          </Pressable>
        )}
      </View>
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
  bottomActions: {
    padding: 16,
    backgroundColor: '#f1f5f9',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonRemove: { backgroundColor: '#dc2626' },
  buttonRestore: { backgroundColor: '#059669' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
