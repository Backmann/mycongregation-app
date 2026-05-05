import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ServiceGroupForm } from '../../../components/ServiceGroupForm';
import { CreateServiceGroupInput, serviceGroupsApi } from '../../../lib/api';

export default function NewServiceGroupScreen() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (input: CreateServiceGroupInput) =>
      serviceGroupsApi.create(input),
    onSuccess: (group) => {
      queryClient.invalidateQueries({ queryKey: ['service-groups'] });
      router.replace(`/service-groups/${group.id}` as any);
    },
  });

  return (
    <ServiceGroupForm
      onSubmit={createMutation.mutateAsync}
      isSubmitting={createMutation.isPending}
      submitLabel="Create"
      onCancel={() => router.back()}
    />
  );
}
