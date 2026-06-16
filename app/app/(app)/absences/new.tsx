import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { absencesApi, CreateAbsenceInput } from '../../../lib/api';
import { AbsenceForm } from '../../../components/AbsenceForm';
import { usePermissions } from '../../../lib/permissions';
import { useMyPublisher } from '../../../lib/useMyPublisher';

export default function NewAbsenceScreen() {
  const qc = useQueryClient();
  const { canManageAbsences } = usePermissions();
  const { myPublisher } = useMyPublisher();
  // Non-managers may only file their own absence; lock the publisher.
  const locked =
    !canManageAbsences && myPublisher
      ? { id: myPublisher.id, label: myPublisher.displayName }
      : undefined;
  const mutation = useMutation({
    mutationFn: (input: CreateAbsenceInput) => absencesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['absences'] });
      router.replace('/absences' as any);
    },
  });

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <AbsenceForm
        submitting={mutation.isPending}
        error={mutation.error}
        onSubmit={(input) => mutation.mutate(input)}
        onCancel={() => router.back()}
        lockedPublisher={locked}
      />
    </ScrollView>
  );
}
