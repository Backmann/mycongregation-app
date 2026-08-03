import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
  PioneerSchoolHelper,
  extractErrorMessage,
  pioneerSchoolApi,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { LoadFailure } from '../../../components/LoadFailure';

/**
 * The brothers who may serve at the school.
 *
 * Most of them belong to other congregations and have no card here, so this is
 * a list of its own rather than a view of the roster. When a brother IS one of
 * ours, linking his card is what lets the schedule notice that he is away that
 * week or already on a microphone at our own meeting — so the link is offered,
 * and never required.
 */
export default function PioneerSchoolHelpersScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { canManagePioneerSchool, canViewPioneerSchool } = usePermissions();

  const query = useQuery({
    queryKey: ['pioneer-school', 'helpers'],
    queryFn: () => pioneerSchoolApi.listHelpers(),
    enabled: canViewPioneerSchool,
  });

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [congregationName, setCongregationName] = useState('');
  const [publisherId, setPublisherId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['pioneer-school'] });

  const saveMut = useMutation({
    mutationFn: () => {
      const input = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        congregationName: congregationName.trim() || null,
        publisherId,
      };
      return editId
        ? pioneerSchoolApi.updateHelper(editId, input)
        : pioneerSchoolApi.createHelper(input);
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
    },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => pioneerSchoolApi.removeHelper(id),
    onSuccess: invalidate,
  });

  const rows = useMemo(() => {
    const list = query.data ?? [];
    const needle = search.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((h) =>
      `${h.firstName} ${h.lastName} ${h.congregationName ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [query.data, search]);

  function openNew() {
    setEditId(null);
    setFirstName('');
    setLastName('');
    setCongregationName('');
    setPublisherId(null);
    saveMut.reset();
    setOpen(true);
  }
  function openEdit(h: PioneerSchoolHelper) {
    setEditId(h.id);
    setFirstName(h.firstName);
    setLastName(h.lastName);
    setCongregationName(h.congregationName ?? '');
    setPublisherId(h.publisherId);
    saveMut.reset();
    setOpen(true);
  }

  if (!canViewPioneerSchool) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{t('pioneerSchool.noAccess')}</Text>
      </View>
    );
  }
  if (query.isLoading) {
    return <ActivityIndicator size="large" style={{ marginTop: 32 }} />;
  }
  if (query.error) {
    return <LoadFailure error={query.error} onRetry={query.refetch} />;
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.intro}>{t('pioneerSchool.helpers.intro')}</Text>

        {canManagePioneerSchool && (
          <Pressable style={styles.addBtn} onPress={openNew}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.addBtnText}>
              {t('pioneerSchool.helpers.add')}
            </Text>
          </Pressable>
        )}

        {(query.data ?? []).length > 0 && (
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={16} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('pioneerSchool.helpers.search')}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
            />
          </View>
        )}

        {rows.length === 0 ? (
          <Text style={styles.empty}>{t('pioneerSchool.helpers.empty')}</Text>
        ) : (
          rows.map((h) => (
            <View key={h.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {h.firstName} {h.lastName}
                </Text>
                <View style={styles.metaRow}>
                  {h.congregationName ? (
                    <Text style={styles.meta}>{h.congregationName}</Text>
                  ) : null}
                  {h.publisherId ? (
                    <View style={styles.oursChip}>
                      <Text style={styles.oursText}>
                        {t('pioneerSchool.helpers.ours')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {canManagePioneerSchool && (
                <View style={styles.rowActions}>
                  <Pressable onPress={() => openEdit(h)} hitSlop={6}>
                    <Ionicons name="create-outline" size={20} color="#0ea5e9" />
                  </Pressable>
                  <Pressable onPress={() => removeMut.mutate(h.id)} hitSlop={6}>
                    <Ionicons name="trash-outline" size={20} color="#ef4444" />
                  </Pressable>
                </View>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={open} transparent animationType="slide">
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
          />
          <View style={styles.sheet}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>
                {editId
                  ? t('pioneerSchool.helpers.editTitle')
                  : t('pioneerSchool.helpers.newTitle')}
              </Text>

              <Text style={styles.label}>
                {t('pioneerSchool.helpers.firstName')}
              </Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
              />
              <Text style={styles.label}>
                {t('pioneerSchool.helpers.lastName')}
              </Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
              />
              <Text style={styles.label}>
                {t('pioneerSchool.helpers.congregation')}
              </Text>
              <TextInput
                style={styles.input}
                value={congregationName}
                onChangeText={setCongregationName}
                placeholder={t('pioneerSchool.helpers.congregationHint')}
                placeholderTextColor="#94a3b8"
              />

              <PublisherSelector
                label={t('pioneerSchool.helpers.linkPublisher')}
                value={publisherId}
                onChange={setPublisherId}
              />
              <Text style={styles.hint}>
                {t('pioneerSchool.helpers.linkHint')}
              </Text>

              {saveMut.isError ? (
                <Text style={styles.error}>
                  {extractErrorMessage(saveMut.error)}
                </Text>
              ) : null}
              <Pressable
                style={[
                  styles.addBtn,
                  (!firstName.trim() || !lastName.trim()) && styles.btnOff,
                ]}
                disabled={
                  !firstName.trim() || !lastName.trim() || saveMut.isPending
                }
                onPress={() => saveMut.mutate()}
              >
                <Text style={styles.addBtnText}>{t('common.save')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  intro: { fontSize: 13.5, color: '#64748b', lineHeight: 19, marginBottom: 14 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 13,
    marginBottom: 12,
    marginTop: 8,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  btnOff: { opacity: 0.5 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#0f172a' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 8,
  },
  rowActions: { flexDirection: 'row', gap: 14 },
  name: { fontSize: 15, color: '#0f172a', fontFamily: 'Manrope_600SemiBold' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  meta: { fontSize: 12.5, color: '#64748b' },
  oursChip: {
    backgroundColor: '#e0f2fe',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  oursText: {
    fontSize: 11.5,
    color: '#0369a1',
    fontFamily: 'Manrope_600SemiBold',
  },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    maxHeight: '88%',
  },
  sheetTitle: {
    fontSize: 17,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    color: '#475569',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 6, lineHeight: 16 },
  error: { color: '#dc2626', fontSize: 13, marginTop: 8 },
});
