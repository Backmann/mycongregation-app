import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  circuitOverseersApi,
  extractErrorMessage,
  CircuitOverseer,
  CircuitOverseerRole,
} from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

type FormState = {
  id: string | null;
  firstName: string;
  lastName: string;
  wifeName: string;
  role: CircuitOverseerRole;
  isPrimary: boolean;
};

const emptyForm = (): FormState => ({
  id: null,
  firstName: '',
  lastName: '',
  wifeName: '',
  role: 'overseer',
  isPrimary: false,
});

/**
 * Circuit overseers the congregation may host — the regular overseer plus any
 * substitutes. One is marked primary and pre-fills a new visit; the visit form
 * lets you pick a different one when needed. Each visit keeps its own name
 * snapshot, so editing here never rewrites past visits.
 */
export default function CircuitOverseerScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const { data, isLoading } = useQuery({
    queryKey: ['circuit-overseers'],
    queryFn: () => circuitOverseersApi.list(),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [serverError, setServerError] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['circuit-overseers'] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        wifeName: form.wifeName.trim() || null,
        role: form.role,
        isPrimary: form.isPrimary,
      };
      return form.id
        ? circuitOverseersApi.update(form.id, payload)
        : circuitOverseersApi.create(payload);
    },
    onSuccess: () => {
      invalidate();
      setModalOpen(false);
    },
    onError: (err: unknown) => setServerError(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => circuitOverseersApi.remove(id),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      Alert.alert(t('common.error'), extractErrorMessage(err)),
  });

  const roleLabel = (role: CircuitOverseerRole) =>
    role === 'overseer'
      ? t('circuitOverseer.roleOverseer')
      : t('circuitOverseer.roleSubstitute');

  const openAdd = () => {
    setForm(emptyForm());
    setServerError(null);
    setModalOpen(true);
  };

  const openEdit = (c: CircuitOverseer) => {
    setForm({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      wifeName: c.wifeName ?? '',
      role: c.role,
      isPrimary: c.isPrimary,
    });
    setServerError(null);
    setModalOpen(true);
  };

  const confirmDelete = (c: CircuitOverseer) => {
    const name = `${c.firstName} ${c.lastName}`.trim();
    const body = t('circuitOverseer.deleteConfirmBody', { name });
    if (Platform.OS === 'web') {
      if (window.confirm(body)) deleteMutation.mutate(c.id);
      return;
    }
    Alert.alert(t('circuitOverseer.deleteConfirmTitle'), body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => deleteMutation.mutate(c.id),
      },
    ]);
  };

  const canSubmit =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    !saveMutation.isPending;

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#0ea5e9" />
      </View>
    );
  }

  const list = data ?? [];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
        <Text style={styles.intro}>{t('circuitOverseer.listIntro')}</Text>

        {list.length === 0 ? (
          <Text style={styles.empty}>{t('circuitOverseer.emptyList')}</Text>
        ) : (
          list.map((c) => (
            <View key={c.id} style={styles.card}>
              <View style={{ flex: 1 }}>
                <View style={styles.cardTop}>
                  <Text style={styles.roleTag}>{roleLabel(c.role)}</Text>
                  {c.isPrimary && (
                    <Text style={styles.primaryBadge}>
                      {t('circuitOverseer.primaryBadge')}
                    </Text>
                  )}
                </View>
                <Text style={styles.name}>
                  {c.firstName} {c.lastName}
                </Text>
                {c.wifeName ? (
                  <Text style={styles.wife}>
                    {t('circuitOverseer.wifeName')}: {c.wifeName}
                  </Text>
                ) : null}
              </View>
              {isAdmin && (
                <View style={styles.cardActions}>
                  <Pressable
                    onPress={() => openEdit(c)}
                    hitSlop={8}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="pencil" size={20} color="#0ea5e9" />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDelete(c)}
                    hitSlop={8}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}

        {isAdmin && (
          <Pressable onPress={openAdd} style={styles.addBtn}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>
              {t('circuitOverseer.addButton')}
            </Text>
          </Pressable>
        )}

        <Text style={styles.note}>{t('circuitOverseer.note')}</Text>
      </ScrollView>

      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalWrap}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setModalOpen(false)}
            accessibilityRole="button"
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {form.id
                  ? t('circuitOverseer.editTitle')
                  : t('circuitOverseer.addTitle')}
              </Text>
              <Pressable onPress={() => setModalOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              {serverError && (
                <Text style={styles.errorBoxText}>{serverError}</Text>
              )}

              <Text style={styles.fieldLabel}>
                {t('circuitOverseer.roleLabel')}
              </Text>
              <View style={styles.chipRow}>
                {(['overseer', 'substitute'] as CircuitOverseerRole[]).map(
                  (r) => (
                    <Pressable
                      key={r}
                      onPress={() => setForm((f) => ({ ...f, role: r }))}
                      style={[
                        styles.chip,
                        form.role === r && styles.chipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          form.role === r && styles.chipTextActive,
                        ]}
                      >
                        {roleLabel(r)}
                      </Text>
                    </Pressable>
                  ),
                )}
              </View>

              <Text style={styles.fieldLabel}>
                {t('circuitOverseer.firstName')}
              </Text>
              <TextInput
                style={styles.input}
                value={form.firstName}
                onChangeText={(x) => setForm((f) => ({ ...f, firstName: x }))}
                autoCapitalize="words"
                autoCorrect={false}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>
                {t('circuitOverseer.lastName')}
              </Text>
              <TextInput
                style={styles.input}
                value={form.lastName}
                onChangeText={(x) => setForm((f) => ({ ...f, lastName: x }))}
                autoCapitalize="words"
                autoCorrect={false}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>
                {t('circuitOverseer.wifeName')}
              </Text>
              <TextInput
                style={styles.input}
                value={form.wifeName}
                onChangeText={(x) => setForm((f) => ({ ...f, wifeName: x }))}
                autoCapitalize="words"
                autoCorrect={false}
                placeholderTextColor="#94a3b8"
              />
              <Text style={styles.fieldHint}>
                {t('circuitOverseer.wifeHint')}
              </Text>

              <Pressable
                onPress={() => setForm((f) => ({ ...f, isPrimary: !f.isPrimary }))}
                style={styles.toggleRow}
              >
                <Ionicons
                  name={form.isPrimary ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={form.isPrimary ? '#0ea5e9' : '#94a3b8'}
                />
                <Text style={styles.toggleLabel}>
                  {t('circuitOverseer.makePrimary')}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => saveMutation.mutate()}
                disabled={!canSubmit}
                style={({ pressed }) => [
                  styles.submitButton,
                  !canSubmit && { opacity: 0.5 },
                  pressed && canSubmit && { opacity: 0.85 },
                ]}
              >
                {saveMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="save" size={18} color="#fff" />
                    <Text style={styles.submitButtonText}>
                      {t('common.save')}
                    </Text>
                  </>
                )}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  intro: { fontSize: 14, color: '#475569', marginBottom: 12, lineHeight: 20 },
  empty: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginVertical: 24,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0e7490',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  primaryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#0ea5e9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  name: { fontSize: 16, fontWeight: '600', color: '#0f172a', marginTop: 3 },
  wife: { fontSize: 13, color: '#64748b', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconBtn: { padding: 6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0ea5e9',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  note: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  modalWrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#0006' },
  modalCard: {
    backgroundColor: '#f1f5f9',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  errorBoxText: {
    color: '#991b1b',
    fontSize: 13,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 16,
  },
  fieldHint: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  chipText: { fontSize: 13, color: '#475569', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  toggleLabel: { fontSize: 14, color: '#334155' },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    marginTop: 22,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
