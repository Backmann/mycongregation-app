import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PublisherForm } from '../../../components/PublisherForm';
import { CreatePublisherInput, publishersApi } from '../../../lib/api';
import { useTranslation } from 'react-i18next';

export default function NewPublisherScreen() {
  const { t } = useTranslation();
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
      submitLabel={t('common.create')}
      onCancel={() => router.back()}
    />
  );
}
