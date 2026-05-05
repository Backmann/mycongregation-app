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
import { publishersApi } from '../lib/api';

interface Props {
  label: string;
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  excludeIds?: string[];
}

export function PublisherSelector({
  label,
  value,
  onChange,
  excludeIds = [],
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['publishers', 'all'],
    queryFn: () => publishersApi.list({ limit: 200 }),
  });

  const allPublishers = data?.data ?? [];
  const selectedPublisher = allPublishers.find((p) => p.id === value);

  const filtered = allPublishers.filter(
    (p) =>
      !excludeIds.includes(p.id) &&
      (search === '' ||
        p.displayName.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.field, pressed && styles.fieldPressed]}
        onPress={() => setOpen(true)}
      >
        <Text style={styles.label}>{label}</Text>
        <View style={styles.row}>
          <Text
            style={[
              styles.value,
              !selectedPublisher && styles.valuePlaceholder,
            ]}
          >
            {selectedPublisher ? selectedPublisher.displayName : 'None'}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </View>
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
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="Search…"
            placeholderTextColor="#cbd5e1"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {isLoading ? (
            <ActivityIndicator size="large" style={{ marginTop: 32 }} />
          ) : (
            <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
            >
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
                <Text style={styles.optionText}>None</Text>
                {value == null && (
                  <Ionicons name="checkmark" size={20} color="#0ea5e9" />
                )}
              </Pressable>

              {filtered.length === 0 && search !== '' && (
                <Text style={styles.empty}>No matches</Text>
              )}

              {filtered.map((p) => (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [
                    styles.option,
                    pressed && styles.optionPressed,
                  ]}
                  onPress={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <View style={styles.optionMain}>
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor:
                            p.gender === 'brother' ? '#0ea5e9' : '#ec4899',
                        },
                      ]}
                    />
                    <Text style={styles.optionText}>{p.displayName}</Text>
                  </View>
                  {value === p.id && (
                    <Ionicons name="checkmark" size={20} color="#0ea5e9" />
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fieldPressed: { backgroundColor: '#f8fafc' },
  label: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 4,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontSize: 16, color: '#0f172a' },
  valuePlaceholder: { color: '#cbd5e1' },

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

  search: {
    margin: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },

  list: { flex: 1, backgroundColor: '#fff' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  optionPressed: { backgroundColor: '#f8fafc' },
  optionMain: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  optionText: { fontSize: 15, color: '#0f172a' },
  empty: {
    textAlign: 'center',
    color: '#94a3b8',
    padding: 32,
    fontSize: 14,
  },
});
