import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { PublicTalk, publicTalksApi } from '../lib/api';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';

interface Props {
  label: string;
  value: string | null | undefined;
  /** Receives the full talk so caller can use number/title (or null when cleared). */
  onChange: (talk: PublicTalk | null) => void;
}

type Recency = 'recent' | 'caution' | 'ok' | 'never';

function getRecency(lastGivenAt: string | null): Recency {
  if (!lastGivenAt) return 'never';
  const monthsAgo =
    (Date.now() - new Date(lastGivenAt).getTime()) /
    (1000 * 60 * 60 * 24 * 30);
  if (monthsAgo < 3) return 'recent';
  if (monthsAgo < 6) return 'caution';
  return 'ok';
}

export function PublicTalkSelector({ label, value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['public-talks', 'all-for-picker'],
    queryFn: () => publicTalksApi.list({ limit: 500 }),
  });

  const allTalks = data?.data ?? [];
  const selectedTalk = allTalks.find((t) => t.id === value);

  const filtered = allTalks.filter((t) => {
    if (search.trim() === '') return true;
    const s = search.trim().toLowerCase();
    return (
      t.title.toLowerCase().includes(s) ||
      t.number.toString().startsWith(s)
    );
  });

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.fieldRow}>
          <Text
            style={[
              styles.fieldValue,
              !selectedTalk && styles.fieldValuePlaceholder,
            ]}
            numberOfLines={2}
          >
            {selectedTalk
              ? `№${selectedTalk.number}. ${selectedTalk.title}`
              : t('common.none')}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </View>
        {selectedTalk && selectedTalk.lastGivenAt && (
          <RecencyHint
            recency={getRecency(selectedTalk.lastGivenAt)}
            lastGivenAt={selectedTalk.lastGivenAt}
            lastGivenBy={selectedTalk.lastGivenBy}
            inline
          />
        )}
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={8}>
              <Text style={styles.doneText}>{t('common.done')}</Text>
            </Pressable>
          </View>

          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color="#94a3b8" />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={t('pickers.searchByNumberOrTitle')}
              placeholderTextColor="#cbd5e1"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="#cbd5e1" />
              </Pressable>
            )}
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" style={{ marginTop: 32 }} />
          ) : (
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              <Pressable
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.optionPressed,
                ]}
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Text style={styles.optionText}>{t('common.none')}</Text>
                {value == null && (
                  <Ionicons name="checkmark" size={20} color="#0ea5e9" />
                )}
              </Pressable>

              {filtered.length === 0 && (
                <Text style={styles.empty}>
                  {search ? t('pickers.noMatches') : t('pickers.noTalksInCatalog')}
                </Text>
              )}

              {filtered.map((talk) => (
                <TalkOption
                  key={talk.id}
                  talk={talk}
                  isSelected={value === talk.id}
                  onPress={() => {
                    onChange(talk);
                    setOpen(false);
                  }}
                />
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

function TalkOption({
  talk,
  isSelected,
  onPress,
}: {
  talk: PublicTalk;
  isSelected: boolean;
  onPress: () => void;
}) {
  const recency = getRecency(talk.lastGivenAt);

  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
    >
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{talk.number}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle} numberOfLines={2}>
          {talk.title}
        </Text>
        {talk.lastGivenAt && (
          <RecencyHint
            recency={recency}
            lastGivenAt={talk.lastGivenAt}
            lastGivenBy={talk.lastGivenBy}
          />
        )}
      </View>
      {isSelected && <Ionicons name="checkmark" size={20} color="#0ea5e9" />}
    </Pressable>
  );
}

function RecencyHint({
  recency,
  lastGivenAt,
  lastGivenBy,
  inline,
}: {
  recency: Recency;
  lastGivenAt: string;
  lastGivenBy: string | null;
  inline?: boolean;
}) {
  const colors: Record<Recency, string> = {
    recent: '#dc2626',
    caution: '#d97706',
    ok: '#94a3b8',
    never: '#cbd5e1',
  };
  const icon: Record<Recency, any> = {
    recent: 'warning',
    caution: 'warning-outline',
    ok: 'time-outline',
    never: 'time-outline',
  };
  const future = lastGivenAt.slice(0, 10) > new Date().toLocaleDateString('en-CA');
  const color = future ? '#0369a1' : colors[recency];
  const dateStr = new Date(lastGivenAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <View style={[styles.hintRow, inline && { marginTop: 4 }]}>
      <Ionicons name={future ? 'calendar-outline' : icon[recency]} size={11} color={color} />
      <Text style={[styles.hintText, { color }]}>
        {future
          ? i18n.t('pickers.upcoming', { date: dateStr })
          : i18n.t('pickers.lastGiven', { date: dateStr })}
        {lastGivenBy ? ` · ${lastGivenBy}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fieldPressed: { backgroundColor: '#f8fafc' },
  fieldLabel: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldValue: { fontSize: 15, color: '#0f172a', flex: 1, marginRight: 8 },
  fieldValuePlaceholder: { color: '#cbd5e1' },

  modal: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    ...(Platform.OS === 'web' && { paddingTop: 0 }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  doneText: { color: '#0ea5e9', fontSize: 16, fontWeight: '600' },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a' },

  list: { flex: 1, backgroundColor: '#fff' },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  optionPressed: { backgroundColor: '#f8fafc' },
  optionText: { fontSize: 15, color: '#0f172a', flex: 1 },
  optionTitle: { fontSize: 14, color: '#0f172a', lineHeight: 20 },
  numberBadge: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 1,
  },
  numberText: { fontSize: 13, fontWeight: '700', color: '#0369a1' },

  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  hintText: { fontSize: 11 },

  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: 32,
    fontSize: 14,
  },
});
