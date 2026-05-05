import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FamilyForm } from '../../../components/FamilyForm';
import { CreateFamilyInput, familiesApi } from '../../../lib/api';

export default function NewFamilyScreen() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (input: CreateFamilyInput) => familiesApi.create(input),
    onSuccess: (family) => {
      queryClient.invalidateQueries({ queryKey: ['families'] });
      router.replace(`/families/${family.id}` as any);
    },
  });

  return (
    <FamilyForm
      onSubmit={createMutation.mutateAsync}
      isSubmitting={createMutation.isPending}
      submitLabel="Create"
      onCancel={() => router.back()}
    />
  );
}
