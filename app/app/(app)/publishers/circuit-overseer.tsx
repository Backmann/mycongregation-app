import dayjs from 'dayjs';
import { useState } from 'react';
import {
  ActivityIndicator,
  
  
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
  specialEventsApi,
  extractErrorMessage,
  CircuitOverseer,
  CircuitOverseerRole,
} from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Sheet } from '../../../components/Sheet';
import { notify } from '../../../lib/error-bus';
import { confirm } from '../../../components/ConfirmHost';
import { failsScreen } from '../../../lib/screen-failure';

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
    throwOnError: failsScreen,
    queryKey: ['circuit-overseers'],
    queryFn: () => circuitOverseersApi.list(),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [serverError, setServerError] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['circuit-overseers'] });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        wifeName: form.wifeName.trim() || null,
        role: form.role,
        isPrimary: form.isPrimary,
      };
      if (!form.id) return circuitOverseersApi.create(payload);
      /**
       * A name corrected here reaches the visits to come only when asked
       * (24 October 2026). The directory holds whoever serves the circuit:
       * the record is sometimes rewritten for a NEW overseer, and the visits
       * already arranged are still the old one's — so the app asks rather
       * than guesses. The visit's own save then puts the name on his talks.
       */
      const was = (data ?? []).find((c) => c.id === form.id);
      const renamed =
        !!was &&
        (was.firstName !== payload.firstName ||
          was.lastName !== payload.lastName);
      const saved = await circuitOverseersApi.update(form.id, payload);
      if (!renamed || !was) return saved;
      // Visits still ahead (or this week's): a past one keeps the name it
      // was held under, and the server would refuse to change it anyway.
      const today = dayjs().format('YYYY-MM-DD');
      const visits = (await specialEventsApi.list()).filter(
        (e) =>
          e.type === 'circuit_overseer_visit' &&
          (e.endDate || e.date) >= today &&
          (e.coFirstName ?? '') === was.firstName &&
          (e.coLastName ?? '') === was.lastName,
      );
      if (visits.length === 0) return saved;
      const yes = await confirm({
        title: t('circuitOverseer.respellTitle'),
        body: t('circuitOverseer.respellBody', {
          count: visits.length,
          from: `${was.firstName} ${was.lastName}`.trim(),
          to: `${payload.firstName} ${payload.lastName}`.trim(),
        }),
        confirmLabel: t('circuitOverseer.respellYes'),
        cancelLabel: t('circuitOverseer.respellNo'),
      });
      if (!yes) return saved;
      for (const v of visits) {
        await specialEventsApi.update(v.id, {
          coFirstName: payload.firstName,
          coLastName: payload.lastName,
        });
      }
      qc.invalidateQueries({ queryKey: ['special-events'] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
      return saved;
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
      notify(t('common.error'), extractErrorMessage(err)),
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

  const confirmDelete = async (c: CircuitOverseer) => {
    const name = `${c.firstName} ${c.lastName}`.trim();
    if (
      await confirm({
        title: t('circuitOverseer.deleteConfirmTitle'),
        body: t('circuitOverseer.deleteConfirmBody', { name }),
        confirmLabel: t('common.delete'),
        danger: true,
      })
    ) {
      deleteMutation.mutate(c.id);
    }
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
        <Text style={styles.intro}>{t(isAdmin ? 'circuitOverseer.listIntro' : 'circuitOverseer.listIntroRead')}</Text>

        {list.length === 0 ? (
          <Text style={styles.empty}>{t(isAdmin ? 'circuitOverseer.emptyList' : 'circuitOverseer.emptyListRead')}</Text>
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

        {isAdmin ? <Text style={styles.note}>{t('circuitOverseer.note')}</Text> : null}
      </ScrollView>

      <Sheet
        visible={modalOpen}
        variant="bottom"
        title={
          form.id ? t('circuitOverseer.editTitle') : t('circuitOverseer.addTitle')
        }
        onClose={() => setModalOpen(false)}
        footer={
          <>
            {serverError ? (
              <Text style={styles.errorBoxText}>{serverError}</Text>
            ) : null}
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
          </>
        }
      >
        <View>

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

                      </View>
      </Sheet>
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
  intro: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#475569', marginBottom: 12, lineHeight: 20 },
  empty: {
    fontFamily: 'Manrope_400Regular',
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
    fontFamily: 'Manrope_700Bold',
    color: '#0e7490',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  primaryBadge: {
    fontSize: 10,
    fontFamily: 'Manrope_700Bold',
    color: '#fff',
    backgroundColor: '#0ea5e9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
  name: { fontSize: 16, fontFamily: 'Manrope_600SemiBold', color: '#0f172a', marginTop: 3 },
  wife: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#64748b', marginTop: 2 },
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
  addBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_600SemiBold',},
  note: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
  errorBoxText: {
    fontFamily: 'Manrope_400Regular',
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
    fontSize: 13,
    color: '#475569',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 6,
  },
  fieldHint: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12.5,
    color: '#94a3b8',
    lineHeight: 17,
    marginTop: -8,
    marginBottom: 14,
  },
  input: {
    fontFamily: 'Manrope_400Regular',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
    marginBottom: 14,
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
  chipText: { fontSize: 13, color: '#475569', fontFamily: 'Manrope_600SemiBold',},
  chipTextActive: { color: '#fff' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e8edf3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  toggleLabel: { fontFamily: 'Manrope_400Regular', fontSize: 14, color: '#334155' },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    paddingVertical: 13,
    borderRadius: 12,
  },
  submitButtonText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_600SemiBold',},
});
