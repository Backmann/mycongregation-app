import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  absencesApi,
  extractErrorMessage,
  UpdateAbsenceInput,
} from '../../../lib/api';
import { AbsenceForm } from '../../../components/AbsenceForm';
import { usePermissions } from '../../../lib/permissions';

export default function AbsenceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const { canManageAbsences } = usePermissions();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['absences', 'detail', id],
    queryFn: () => absencesApi.getById(id),
    enabled: !!id,
  });

  const update = useMutation({
    mutationFn: (input: UpdateAbsenceInput) => absencesApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['absences'] });
      setEditing(false);
    },
  });

  const remove = useMutation({
    mutationFn: () => absencesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['absences'] });
      router.replace('/absences' as any);
    },
  });

  const restore = useMutation({
    mutationFn: () => absencesApi.restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['absences'] }),
  });

  if (isLoading) {
    return <ActivityIndicator size="large" style={{ marginTop: 48 }} />;
  }
  if (error || !data) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          {error ? extractErrorMessage(error) : t('absences.empty')}
        </Text>
      </View>
    );
  }

  const removed = !!data.deletedAt;

  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  if (editing) {
    return (
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <AbsenceForm
          initial={data}
          submitting={update.isPending}
          error={update.error}
          onSubmit={(input) => update.mutate(input)}
          onCancel={() => setEditing(false)}
          lockedPublisher={
            canManageAbsences
              ? undefined
              : data.publisher
                ? { id: data.publisherId, label: data.publisher.displayName }
                : undefined
          }
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={styles.name}>{data.publisher?.displayName ?? '—'}</Text>
      {removed ? (
        <Text style={styles.removedBadge}>{t('absences.deleted')}</Text>
      ) : null}

      <Text style={styles.fieldLabel}>{t('absences.fields.dates')}</Text>
      <Text style={styles.fieldValue}>
        {data.endDate
          ? `${fmt(data.startDate)} – ${fmt(data.endDate)}`
          : fmt(data.startDate)}
      </Text>

      {data.note ? (
        <>
          <Text style={styles.fieldLabel}>{t('absences.fields.note')}</Text>
          <Text style={styles.fieldValue}>{data.note}</Text>
        </>
      ) : null}

      {canManageAbsences ? (
        <View style={styles.actions}>
          {removed ? (
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={() => restore.mutate()}
              disabled={restore.isPending}
            >
              <Text style={styles.btnPrimaryText}>
                {t('absences.actions.restore')}
              </Text>
            </Pressable>
          ) : confirmDelete ? (
            <>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setConfirmDelete(false)}
                disabled={remove.isPending}
              >
                <Text style={styles.btnGhostText}>
                  {t('absences.actions.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnDanger]}
                onPress={() => remove.mutate()}
                disabled={remove.isPending}
              >
                <Text style={styles.btnDangerText}>
                  {t('absences.confirmDelete')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={[styles.btn, styles.btnGhost]}
                onPress={() => setEditing(true)}
              >
                <Text style={styles.btnGhostText}>
                  {t('absences.actions.edit')}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnDanger]}
                onPress={() => setConfirmDelete(true)}
              >
                <Text style={styles.btnDangerText}>
                  {t('absences.actions.delete')}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  name: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  removedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fee2e2',
    color: '#b91c1c',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  fieldLabel: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 18,
    marginBottom: 2,
  },
  fieldValue: { fontSize: 16, color: '#0f172a' },
  errorText: { color: '#b91c1c' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 28 },
  btn: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: '#0ea5e9' },
  btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  btnGhost: { backgroundColor: '#f1f5f9' },
  btnGhostText: { color: '#475569', fontWeight: '600', fontSize: 16 },
  btnDanger: { backgroundColor: '#fee2e2' },
  btnDangerText: { color: '#b91c1c', fontWeight: '700', fontSize: 16 },
});
