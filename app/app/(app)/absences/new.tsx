import { ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { absencesApi, CreateAbsenceInput } from '../../../lib/api';
import { AbsenceForm } from '../../../components/AbsenceForm';

export default function NewAbsenceScreen() {
  const qc = useQueryClient();
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
      />
    </ScrollView>
  );
}
