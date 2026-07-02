import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
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
  CreateLocalNeedsTopicInput,
  LocalNeedsTopic,
  UpdateLocalNeedsTopicInput,
  extractErrorMessage,
  localNeedsApi,
} from '../../../lib/api';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { usePermissions } from '../../../lib/permissions';

/** Monday (YYYY-MM-DD) of the current week, in local time. */
function thisMonday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function fmtWeek(week: string, loc: string): string {
  const d = new Date(`${week}T00:00:00`);
  return d.toLocaleDateString(loc, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function LocalNeedsScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { canManageLocalNeeds, canViewLocalNeeds } = usePermissions();

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['local-needs'],
    queryFn: () => localNeedsApi.list(),
    enabled: canViewLocalNeeds,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['local-needs'] });

  const createMut = useMutation({
    mutationFn: (input: CreateLocalNeedsTopicInput) =>
      localNeedsApi.create(input),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
  });
  const updateMut = useMutation({
    mutationFn: (vars: { id: string; input: UpdateLocalNeedsTopicInput }) =>
      localNeedsApi.update(vars.id, vars.input),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => localNeedsApi.remove(id),
    onSuccess: () => {
      invalidate();
      setConfirmDeleteId(null);
    },
  });
  const usedMut = useMutation({
    mutationFn: (vars: { id: string; usedWeek: string | null }) =>
      localNeedsApi.update(vars.id, { usedWeek: vars.usedWeek }),
    onSuccess: invalidate,
  });

  const { planned, upcoming, past } = useMemo(() => {
    const rows = data ?? [];
    const monday = thisMonday();
    const withWeek = rows.filter((r) => !!r.usedWeek);
    return {
      planned: rows.filter((r) => !r.usedWeek),
      // Placed in the schedule, the meeting is still ahead (or this week).
      upcoming: withWeek
        .filter((r) => (r.usedWeek as string) >= monday)
        .sort((a, b) =>
          (a.usedWeek as string).localeCompare(b.usedWeek as string),
        ),
      // The meeting has already passed — kept for history, collapsed.
      past: withWeek
        .filter((r) => (r.usedWeek as string) < monday)
        .sort((a, b) =>
          (b.usedWeek as string).localeCompare(a.usedWeek as string),
        ),
    };
  }, [data]);
  const [pastOpen, setPastOpen] = useState(false);

  function openNew() {
    setEditId(null);
    setTitle('');
    setNotes('');
    setSpeakerId(null);
    createMut.reset();
    updateMut.reset();
    setModalOpen(true);
  }
  function openEdit(topic: LocalNeedsTopic) {
    setEditId(topic.id);
    setTitle(topic.title);
    setNotes(topic.notes ?? '');
    setSpeakerId(topic.speakerPublisherId);
    createMut.reset();
    updateMut.reset();
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
  }

  function save() {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    if (editId) {
      updateMut.mutate({
        id: editId,
        input: {
          title: cleanTitle,
          notes: notes.trim() ? notes.trim() : null,
          speakerPublisherId: speakerId ?? null,
        },
      });
    } else {
      createMut.mutate({
        title: cleanTitle,
        notes: notes.trim() || undefined,
        speakerPublisherId: speakerId ?? undefined,
      });
    }
  }

  const saving = createMut.isPending || updateMut.isPending;
  const saveError = createMut.error || updateMut.error;

  function renderRow(item: LocalNeedsTopic) {
    const isUsed = !!item.usedWeek;
    return (
      <View key={item.id} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topicTitle}>{item.title}</Text>
          {item.notes ? (
            <Text style={styles.notes} numberOfLines={2}>
              {item.notes}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {item.speaker ? (
              <View style={styles.metaChip}>
                <Ionicons name="person-outline" size={12} color="#475569" />
                <Text style={styles.metaText}>{item.speaker.displayName}</Text>
              </View>
            ) : null}
            {isUsed ? (
              <View
                style={[
                  styles.metaChip,
                  (item.usedWeek as string) >= thisMonday()
                    ? styles.upcomingChip
                    : styles.pastChip,
                ]}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={12}
                  color="#047857"
                />
                <Text style={[styles.metaText, { color: '#047857' }]}>
                  {fmtWeek(item.usedWeek as string, i18n.language)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {canManageLocalNeeds && (
          <View style={styles.actions}>
            <Pressable
              onPress={() =>
                usedMut.mutate({
                  id: item.id,
                  usedWeek: isUsed ? null : thisMonday(),
                })
              }
              hitSlop={6}
              style={styles.actionBtn}
              accessibilityLabel={
                isUsed ? t('localNeeds.markPlanned') : t('localNeeds.markUsed')
              }
            >
              <Ionicons
                name={isUsed ? 'arrow-undo-outline' : 'checkmark-done-outline'}
                size={20}
                color={isUsed ? '#64748b' : '#059669'}
              />
            </Pressable>
            <Pressable
              onPress={() => openEdit(item)}
              hitSlop={6}
              style={styles.actionBtn}
              accessibilityLabel={t('localNeeds.edit')}
            >
              <Ionicons name="create-outline" size={20} color="#0ea5e9" />
            </Pressable>
            <Pressable
              onPress={() => setConfirmDeleteId(item.id)}
              hitSlop={6}
              style={styles.actionBtn}
              accessibilityLabel={t('localNeeds.delete')}
            >
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  if (!canViewLocalNeeds) {
    return (
      <View style={styles.container}>
        <Text style={[styles.empty, { paddingHorizontal: 24 }]}>
          {t('localNeeds.noAccess')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        <Text style={styles.intro}>{t('localNeeds.intro')}</Text>

        {canManageLocalNeeds && (
          <Pressable style={styles.addBtn} onPress={openNew}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>{t('localNeeds.add')}</Text>
          </Pressable>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{extractErrorMessage(error)}</Text>
          </View>
        )}

        {isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : (data ?? []).length === 0 ? (
          <Text style={styles.empty}>{t('localNeeds.empty')}</Text>
        ) : (
          <>
            <Text style={styles.sectionLabel}>
              {t('localNeeds.section.planned')} · {planned.length}
            </Text>
            {planned.length === 0 ? (
              <Text style={styles.sectionEmpty}>
                {t('localNeeds.noPlanned')}
              </Text>
            ) : (
              planned.map(renderRow)
            )}

            {upcoming.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 18 }]}>
                  {t('localNeeds.section.upcoming')} · {upcoming.length}
                </Text>
                {upcoming.map(renderRow)}
              </>
            )}

            {past.length > 0 && (
              <>
                <Pressable
                  style={styles.pastHeader}
                  onPress={() => setPastOpen((v) => !v)}
                >
                  <Text style={styles.sectionLabel}>
                    {t('localNeeds.section.past')} · {past.length}
                  </Text>
                  <Ionicons
                    name={pastOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="#94a3b8"
                  />
                </Pressable>
                {pastOpen ? (
                  <View style={styles.pastRow}>{past.map(renderRow)}</View>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Add / edit modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={closeModal}
            accessibilityRole="button"
          />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editId ? t('localNeeds.editTitle') : t('localNeeds.newTitle')}
              </Text>
              <Pressable onPress={closeModal} hitSlop={8}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.label}>{t('localNeeds.fields.title')}</Text>
              <TextInput
                style={styles.input}
                value={title}
                onChangeText={setTitle}
                placeholder={t('localNeeds.placeholders.title')}
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.label}>{t('localNeeds.fields.notes')}</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={notes}
                onChangeText={setNotes}
                placeholder={t('localNeeds.placeholders.notes')}
                placeholderTextColor="#94a3b8"
                multiline
              />

              <PublisherSelector
                label={t('localNeeds.fields.speaker')}
                value={speakerId}
                onChange={setSpeakerId}
                preferAppointment="elder"
              />

              {saveError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    {extractErrorMessage(saveError)}
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={closeModal}
              >
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.modalBtn,
                  styles.saveBtn,
                  (!title.trim() || saving) && styles.saveBtnDisabled,
                ]}
                onPress={save}
                disabled={!title.trim() || saving}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? t('common.saving') : t('common.save')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Delete confirm */}
      <Modal
        visible={!!confirmDeleteId}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmDeleteId(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setConfirmDeleteId(null)}
            accessibilityRole="button"
          />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmText}>
              {t('localNeeds.confirmDelete')}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[styles.modalBtn, styles.cancelBtn]}
                onPress={() => setConfirmDeleteId(null)}
              >
                <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.deleteBtn]}
                onPress={() =>
                  confirmDeleteId && removeMut.mutate(confirmDeleteId)
                }
                disabled={removeMut.isPending}
              >
                <Text style={styles.saveBtnText}>{t('localNeeds.delete')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  intro: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 6,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 32 },
  pastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  pastRow: { opacity: 0.6 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionEmpty: { fontSize: 13, color: '#94a3b8', marginBottom: 8 },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  errorText: { color: '#b91c1c' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  topicTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  notes: { fontSize: 13, color: '#64748b', marginTop: 3 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  usedChip: { backgroundColor: '#ecfdf5' },
  upcomingChip: { backgroundColor: '#e0f2fe' },
  pastChip: { backgroundColor: '#f1f5f9' },
  metaText: { fontSize: 12, color: '#475569', fontWeight: '500' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  actionBtn: { padding: 6 },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtn: { backgroundColor: '#f1f5f9' },
  cancelBtnText: { color: '#475569', fontSize: 15, fontWeight: '600' },
  saveBtn: { backgroundColor: '#0ea5e9' },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteBtn: { backgroundColor: '#ef4444' },
  confirmCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  confirmText: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
    textAlign: 'center',
  },
});
