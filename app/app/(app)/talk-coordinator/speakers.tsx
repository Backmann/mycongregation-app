import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  VisitingSpeaker,
  visitingSpeakersApi,
  externalCongregationsApi,
  publicTalksApi,
  talkExchangeApi,
  PublicTalk,
  extractErrorMessage,
} from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import {
  computeSpeakerStats,
  SpeakerStats,
  visitedRecently,
} from '../../../lib/speaker-stats';
import { dayDiff, formatRelativeDay } from '../../../lib/relative-time';

const QK = ['visiting-speakers'] as const;

function speakerName(s: { firstName: string; lastName: string | null }): string {
  return [s.firstName, s.lastName].filter(Boolean).join(' ');
}

export default function SpeakersScreen() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const qc = useQueryClient();

  // editingId: a speaker id, or 'new' for the add form, or null
  const { edit: editParam } = useLocalSearchParams<{ edit?: string }>();
  const handledEditRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [congId, setCongId] = useState<string | null>(null);
  const [addingCong, setAddingCong] = useState(false);
  const [newCongName, setNewCongName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [talks, setTalks] = useState<number[]>([]);
  const [talkInput, setTalkInput] = useState('');

  const listQuery = useQuery({ queryKey: QK, queryFn: () => visitingSpeakersApi.list() });
  const congQuery = useQuery({
    queryKey: ['external-congregations'],
    queryFn: () => externalCongregationsApi.list(),
  });
  const talksQuery = useQuery({
    queryKey: ['public-talks', 'all'],
    queryFn: () => publicTalksApi.list({ includeInactive: true, limit: 300 }),
  });
  const entriesQuery = useQuery({
    queryKey: ['talk-exchange'],
    queryFn: () => talkExchangeApi.list(),
  });

  const titleByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const pt of talksQuery.data?.data ?? []) map.set(pt.number, pt.title);
    return map;
  }, [talksQuery.data]);

  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<
    'recency' | 'congregation' | 'name'
  >('recency');
  const [filterMode, setFilterMode] = useState<
    'all' | 'upcoming' | 'overdue' | 'never'
  >('all');
  const today = new Date().toLocaleDateString('en-CA');
  const talkById = useMemo(() => {
    const m = new Map<string, PublicTalk>();
    for (const tk of talksQuery.data?.data ?? []) m.set(tk.id, tk);
    return m;
  }, [talksQuery.data]);
  const statsById = useMemo(() => {
    const m = new Map<string, SpeakerStats>();
    const entries = entriesQuery.data ?? [];
    for (const sp of listQuery.data ?? [])
      m.set(sp.id, computeSpeakerStats(sp, entries, talkById, today));
    return m;
  }, [listQuery.data, entriesQuery.data, talkById, today]);
  const rows = useMemo(() => {
    let list = [...(listQuery.data ?? [])];
    const q = search.trim().toLowerCase();
    if (q)
      list = list.filter(
        (sp) =>
          speakerName(sp).toLowerCase().includes(q) ||
          (sp.externalCongregation?.name ?? '').toLowerCase().includes(q),
      );
    if (filterMode !== 'all')
      list = list.filter((sp) => {
        const st = statsById.get(sp.id);
        if (!st) return false;
        if (filterMode === 'upcoming') return !!st.nextVisit;
        if (filterMode === 'never') return st.count === 0 && !st.nextVisit;
        return (
          !!st.lastVisit &&
          !st.nextVisit &&
          Math.abs(dayDiff(st.lastVisit.date, today)) > 120
        );
      });
    const nameOf = (sp: VisitingSpeaker) => speakerName(sp).toLowerCase();
    list.sort((a, b) => {
      if (sortMode === 'name') return nameOf(a).localeCompare(nameOf(b));
      if (sortMode === 'congregation') {
        const ca = a.externalCongregation?.name ?? '\uffff';
        const cb = b.externalCongregation?.name ?? '\uffff';
        return ca.localeCompare(cb) || nameOf(a).localeCompare(nameOf(b));
      }
      const la = statsById.get(a.id)?.lastVisit?.date ?? '';
      const lb = statsById.get(b.id)?.lastVisit?.date ?? '';
      return la.localeCompare(lb) || nameOf(a).localeCompare(nameOf(b));
    });
    return list;
  }, [listQuery.data, search, filterMode, sortMode, statsById, today]);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });
  const showError = (e: unknown) => {
    const msg = extractErrorMessage(e);
    if (Platform.OS === 'web') window.alert(msg);
    else Alert.alert(t('talkCoordinator.errorTitle'), msg);
  };

  const createMutation = useMutation({
    mutationFn: visitingSpeakersApi.create,
    onSuccess: invalidate,
    onError: showError,
  });
  const updateMutation = useMutation({
    mutationFn: (v: { id: string; input: Parameters<typeof visitingSpeakersApi.update>[1] }) =>
      visitingSpeakersApi.update(v.id, v.input),
    onSuccess: invalidate,
    onError: showError,
  });
  const removeMutation = useMutation({
    mutationFn: (id: string) => visitingSpeakersApi.remove(id),
    onSuccess: invalidate,
    onError: showError,
  });

  const pending =
    createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  const resetFields = () => {
    setFirstName('');
    setLastName('');
    setCongId(null);
    setAddingCong(false);
    setNewCongName('');
    setPhone('');
    setNote('');
    setTalks([]);
    setTalkInput('');
  };

  const startAdd = () => {
    resetFields();
    setEditingId('new');
  };

  const startEdit = (s: VisitingSpeaker) => {
    setFirstName(s.firstName);
    setLastName(s.lastName ?? '');
    setCongId(s.externalCongregationId);
    setAddingCong(false);
    setNewCongName('');
    setPhone(s.phone ?? '');
    setNote(s.note ?? '');
    setTalks([...s.talkNumbers].sort((a, b) => a - b));
    setTalkInput('');
    setEditingId(s.id);
  };

  // Deep-link from the speaker profile screen: open the editor for ?edit=<id>
  // once the list has loaded. Runs a single time so cancelling won't reopen it.
  useEffect(() => {
    if (handledEditRef.current || !editParam) return;
    const sp = (listQuery.data ?? []).find((x) => x.id === editParam);
    if (sp) {
      handledEditRef.current = true;
      startEdit(sp);
    }
  }, [editParam, listQuery.data]);

  const cancel = () => setEditingId(null);

  const addTalk = () => {
    const n = parseInt(talkInput.trim(), 10);
    if (!Number.isFinite(n) || n < 1 || n > 300) return;
    if (!talks.includes(n)) setTalks([...talks, n].sort((a, b) => a - b));
    setTalkInput('');
  };
  const removeTalk = (n: number) => setTalks(talks.filter((x) => x !== n));

  const canSave = firstName.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    let resolvedCongId = congId;
    if (addingCong && newCongName.trim()) {
      const created = await externalCongregationsApi.create({ name: newCongName.trim() });
      qc.invalidateQueries({ queryKey: ['external-congregations'] });
      resolvedCongId = created.id;
    }
    const input = {
      firstName: firstName.trim(),
      lastName: lastName.trim() || null,
      externalCongregationId: resolvedCongId,
      phone: phone.trim() || null,
      note: note.trim() || null,
      talkNumbers: talks,
    };
    if (editingId && editingId !== 'new') await updateMutation.mutateAsync({ id: editingId, input });
    else await createMutation.mutateAsync(input);
    setEditingId(null);
  };

  const confirmDelete = (s: VisitingSpeaker) => {
    const doDelete = () => removeMutation.mutate(s.id);
    if (Platform.OS === 'web') {
      if (window.confirm(`${t('talkCoordinator.speakers.deleteTitle')}\n\n${speakerName(s)}`)) doDelete();
      return;
    }
    Alert.alert(t('talkCoordinator.speakers.deleteTitle'), speakerName(s), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: doDelete },
    ]);
  };

  if (!perms.canCoordinatePublicTalks) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('talkCoordinator.noAccess')}</Text>
      </View>
    );
  }
  if (listQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const congregations = congQuery.data ?? [];

  const editor = (key: string) => (
    <View key={key} style={styles.editorCard}>
      <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.firstName')}</Text>
      <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholderTextColor="#94a3b8" autoFocus />

      <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.lastName')}</Text>
      <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholderTextColor="#94a3b8" />

      <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.congregation')}</Text>
      <View style={styles.chipWrap}>
        <Pressable
          style={[styles.pickChip, congId === null && !addingCong && styles.pickChipActive]}
          onPress={() => {
            setCongId(null);
            setAddingCong(false);
          }}
        >
          <Text style={[styles.pickChipText, congId === null && !addingCong && styles.pickChipTextActive]}>
            {t('talkCoordinator.speakers.noCongregation')}
          </Text>
        </Pressable>
        {congregations.map((c) => (
          <Pressable
            key={c.id}
            style={[styles.pickChip, congId === c.id && !addingCong && styles.pickChipActive]}
            onPress={() => {
              setCongId(c.id);
              setAddingCong(false);
            }}
          >
            <Text style={[styles.pickChipText, congId === c.id && !addingCong && styles.pickChipTextActive]}>
              {c.name}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.pickChip, styles.newChip, addingCong && styles.pickChipActive]}
          onPress={() => {
            setAddingCong(true);
            setCongId(null);
          }}
        >
          <Ionicons name="add" size={14} color={addingCong ? '#0369a1' : '#475569'} />
          <Text style={[styles.pickChipText, addingCong && styles.pickChipTextActive]}>
            {t('talkCoordinator.speakers.newCongregation')}
          </Text>
        </Pressable>
      </View>
      {addingCong && (
        <TextInput
          style={styles.input}
          value={newCongName}
          onChangeText={setNewCongName}
          placeholder={t('talkCoordinator.speakers.newCongregationPlaceholder')}
          placeholderTextColor="#94a3b8"
          autoFocus
        />
      )}

      <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.phone')}</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholderTextColor="#94a3b8"
      />

      <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.repertoire')}</Text>
      <View style={styles.talkAddRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={talkInput}
          onChangeText={setTalkInput}
          keyboardType="number-pad"
          placeholder={t('talkCoordinator.speakers.talkNumberPlaceholder')}
          placeholderTextColor="#94a3b8"
          onSubmitEditing={addTalk}
        />
        <Pressable style={styles.talkAddBtn} onPress={addTalk}>
          <Ionicons name="add" size={20} color="#0369a1" />
        </Pressable>
      </View>
      {talks.length > 0 && (
        <View style={styles.chipWrap}>
          {talks.map((n) => (
            <Pressable key={n} style={styles.talkChip} onPress={() => removeTalk(n)}>
              <Text style={styles.talkChipText} numberOfLines={1}>
                №{n}
                {titleByNumber.get(n) ? ` · ${titleByNumber.get(n)}` : ''}
              </Text>
              <Ionicons name="close" size={14} color="#6d28d9" />
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.fieldLabel}>{t('talkCoordinator.speakers.note')}</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} multiline placeholderTextColor="#94a3b8" />

      <View style={styles.editorActions}>
        <Pressable style={styles.cancelBtn} onPress={cancel} disabled={pending}>
          <Text style={styles.cancelText}>{t('common.cancel')}</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, (!canSave || pending) && styles.disabled]}
          onPress={() => void save()}
          disabled={!canSave || pending}
        >
          <Text style={styles.saveText}>{t('common.save')}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>{t('talkCoordinator.speakers.hint')}</Text>

        {editingId === 'new' ? (
          editor('new')
        ) : (
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed, pending && styles.disabled]}
            onPress={startAdd}
            disabled={pending}
          >
            <Ionicons name="add-circle-outline" size={18} color="#0369a1" />
            <Text style={styles.addBtnText}>{t('talkCoordinator.speakers.add')}</Text>
          </Pressable>
        )}

        {editingId === null ? (
          <View style={styles.toolbar}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color="#94a3b8" />
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder={t('talkCoordinator.speakers.searchPlaceholder')}
                placeholderTextColor="#94a3b8"
              />
              {search ? (
                <Pressable hitSlop={8} onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color="#cbd5e1" />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.segmentRow}>
              {(['recency', 'congregation', 'name'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[styles.segment, sortMode === m && styles.segmentActive]}
                  onPress={() => setSortMode(m)}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      sortMode === m && styles.segmentTextActive,
                    ]}
                  >
                    {t(`talkCoordinator.speakers.sort.${m}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.filterRow}>
              {(['all', 'upcoming', 'overdue', 'never'] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.filterChip,
                    filterMode === m && styles.filterChipActive,
                  ]}
                  onPress={() => setFilterMode(m)}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      filterMode === m && styles.filterChipTextActive,
                    ]}
                  >
                    {t(`talkCoordinator.speakers.filter.${m}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {rows.length === 0 && editingId !== 'new' ? (
          <Text style={styles.empty}>
            {search || filterMode !== 'all'
              ? t('talkCoordinator.speakers.noResults')
              : t('talkCoordinator.speakers.empty')}
          </Text>
        ) : (
          rows.map((s) =>
            editingId === s.id ? (
              editor(s.id)
            ) : (
              <View key={s.id} style={styles.row}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() =>
                    router.push(
                      `/talk-coordinator/speaker-profile/${s.id}` as any,
                    )
                  }
                  disabled={pending}
                >
                  <Text style={styles.name}>{speakerName(s)}</Text>
                  {!!s.externalCongregation && (
                    <Text style={styles.sub}>
                      {s.externalCongregation.name}
                    </Text>
                  )}
                  {(() => {
                    const st = statsById.get(s.id);
                    if (!st || (st.count === 0 && !st.nextVisit))
                      return (
                        <Text style={styles.statusNever}>
                          {t('talkCoordinator.speakers.status.never')}
                        </Text>
                      );
                    const recent = visitedRecently(st, today);
                    return (
                      <View style={styles.statusRow}>
                        {st.count > 0 && st.lastVisit ? (
                          <Text
                            style={[
                              styles.statusText,
                              recent && styles.statusRecent,
                            ]}
                          >
                            {t('talkCoordinator.speakers.status.lastSeen', {
                              count: st.count,
                              rel: formatRelativeDay(st.lastVisit.date, today, t),
                            })}
                          </Text>
                        ) : null}
                        {st.nextVisit ? (
                          <View style={styles.upcomingTag}>
                            <Ionicons
                              name="airplane"
                              size={11}
                              color="#0369a1"
                            />
                            <Text style={styles.upcomingText}>
                              {formatRelativeDay(st.nextVisit.date, today, t)}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}
                </Pressable>
                <Pressable hitSlop={8} onPress={() => startEdit(s)} style={styles.iconBtn} disabled={pending}>
                  <Ionicons name="create-outline" size={20} color="#0369a1" />
                </Pressable>
                <Pressable hitSlop={8} onPress={() => confirmDelete(s)} style={styles.iconBtn} disabled={pending}>
                  <Ionicons name="trash-outline" size={20} color="#dc2626" />
                </Pressable>
              </View>
            ),
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  muted: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  container: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  empty: { padding: 18, color: '#94a3b8', fontSize: 14, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  name: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  sub: { fontSize: 13, color: '#475569', marginTop: 1 },
  toolbar: { marginBottom: 12, gap: 8 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 0 },
  segmentRow: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 10,
    padding: 2,
  },
  segment: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  segmentActive: { backgroundColor: '#fff' },
  segmentText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  segmentTextActive: { color: '#0f172a', fontWeight: '700' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  filterChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  filterChipText: { fontSize: 13, color: '#475569' },
  filterChipTextActive: { color: '#fff', fontWeight: '600' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 3,
  },
  statusText: { fontSize: 13, color: '#64748b' },
  statusRecent: { color: '#b45309', fontWeight: '600' },
  statusNever: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginTop: 3 },
  upcomingTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  upcomingText: { fontSize: 13, color: '#0369a1', fontWeight: '600' },
  iconBtn: { padding: 6 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
  },
  addBtnPressed: { backgroundColor: '#e0f2fe' },
  addBtnText: { fontSize: 14, fontWeight: '600', color: '#0369a1' },
  disabled: { opacity: 0.5 },
  editorCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    padding: 14,
    marginBottom: 8,
  },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#64748b', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  pickChipActive: { backgroundColor: '#e0f2fe', borderColor: '#0ea5e9' },
  pickChipText: { fontSize: 13, color: '#475569' },
  pickChipTextActive: { color: '#0369a1', fontWeight: '600' },
  newChip: { borderStyle: 'dashed' },
  talkAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  talkAddBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  talkChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#ede9fe',
  },
  talkChipText: { fontSize: 12, color: '#6d28d9', fontWeight: '500', flexShrink: 1 },
  editorActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 14 },
  cancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 10, backgroundColor: '#0ea5e9' },
  saveText: { fontSize: 15, color: '#fff', fontWeight: '600' },
});
