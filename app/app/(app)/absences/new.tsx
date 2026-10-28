import { goBack } from '../../../components/NavHistory';
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
  const self = myPublisher
    ? { id: myPublisher.id, label: myPublisher.displayName }
    : undefined;
  // Non-managers may only file their own absence; lock the publisher.
  // Managers default to themselves but can still change the publisher.
  const locked = !canManageAbsences ? self : undefined;
  const defaultPublisher = canManageAbsences ? self : undefined;
  // Several people away on the same days (a family) are entered at once:
  // one absence each, written one after another.
  const mutation = useMutation({
    mutationFn: async ({ input, others }: { input: CreateAbsenceInput; others: string[] }) => {
      await absencesApi.create(input);
      for (const publisherId of others) await absencesApi.create({ ...input, publisherId });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['absences'] });
      router.replace('/absences' as any);
    },
  });

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingBottom: 48, width: '100%', maxWidth: 780, alignSelf: 'center' }}
      keyboardShouldPersistTaps="handled"
    >
      <AbsenceForm
        submitting={mutation.isPending}
        error={mutation.error}
        onSubmit={(input, others) => mutation.mutate({ input, others: others ?? [] })}
        allowOthers={canManageAbsences}
        onCancel={() => goBack('/absences')}
        lockedPublisher={locked}
        defaultPublisher={defaultPublisher}
      />
    </ScrollView>
  );
}
