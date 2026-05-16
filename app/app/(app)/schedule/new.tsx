import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AssignmentForm } from '../../../components/AssignmentForm';
import {
  assignmentsApi,
  CreateAssignmentInput,
} from '../../../lib/api';
import {
  formatDateISO,
  startOfWeekMonday,
} from '../../../lib/dates';
import { useTranslation } from 'react-i18next';

export default function NewAssignmentScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (input: CreateAssignmentInput) =>
      assignmentsApi.create(input),
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      router.replace(`/schedule/${assignment.id}` as any);
    },
  });

  // Default week start = Monday of current week
  const defaultWeekStart = formatDateISO(startOfWeekMonday(new Date()));

  return (
    <AssignmentForm
      initial={{
        weekStartDate: defaultWeekStart,
        eventType: 'midweek',
        partKey: '',
        partOrder: 0,
        status: 'draft',
      }}
      onSubmit={createMutation.mutateAsync}
      isSubmitting={createMutation.isPending}
      submitLabel={t('common.create')}
      onCancel={() => router.back()}
    />
  );
}
