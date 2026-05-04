import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PublisherForm } from '../../../components/PublisherForm';
import { CreatePublisherInput, publishersApi } from '../../../lib/api';

export default function NewPublisherScreen() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (input: CreatePublisherInput) => publishersApi.create(input),
    onSuccess: (publisher) => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      // Replace = no back to empty form
      router.replace(`/publishers/${publisher.id}` as any);
    },
  });

  return (
    <PublisherForm
      onSubmit={createMutation.mutateAsync}
      isSubmitting={createMutation.isPending}
      submitLabel="Create"
      onCancel={() => router.back()}
    />
  );
}
