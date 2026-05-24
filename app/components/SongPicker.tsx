import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { songsApi } from '../lib/api';

function currentNumberFromTitle(title: string | null | undefined): number | null {
  if (!title) return null;
  const m = title.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Picks a song from the catalog for a song part (opening / pre-study / middle).
 * Tapping a song saves "Песня N" into the part's title; the clear button
 * removes the song. Read-only mode just shows the current selection + list.
 */
export function SongPicker({
  currentTitle,
  readOnly,
  isSaving,
  onSave,
}: {
  currentTitle: string | null;
  readOnly?: boolean;
  isSaving?: boolean;
  onSave: (partTitle: string | null) => void;
}) {
  const [search, setSearch] = useState('');
  const songsQuery = useQuery({
    queryKey: ['songs', 'list'],
    queryFn: () => songsApi.list({ limit: 500 }),
    staleTime: 1000 * 60 * 60,
  });

  const songs = useMemo(
    () => songsQuery.data?.data ?? [],
    [songsQuery.data],
  );
  const current = currentNumberFromTitle(currentTitle);
  const currentSong = songs.find((s) => s.number === current);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        String(s.number).startsWith(q) || s.title.toLowerCase().includes(q),
    );
  }, [songs, search]);

  return (
    <View style={styles.container}>
      <View style={styles.currentBox}>
        <Text style={styles.currentLabel}>Текущая песня</Text>
        <Text style={styles.currentValue}>
          {current
            ? `Песня ${current}${currentSong ? ` — ${currentSong.title}` : ''}`
            : 'Не выбрана'}
        </Text>
      </View>

      {!readOnly && (
        <>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Поиск по номеру или названию"
            placeholderTextColor="#94a3b8"
            style={styles.search}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {current != null && (
            <Pressable
              style={styles.clearRow}
              onPress={() => onSave(null)}
              disabled={isSaving}
            >
              <Ionicons name="close-circle-outline" size={18} color="#dc2626" />
              <Text style={styles.clearText}>Убрать песню</Text>
            </Pressable>
          )}
        </>
      )}

      {songsQuery.isLoading ? (
        <ActivityIndicator style={{ marginTop: 24 }} />
      ) : songs.length === 0 ? (
        <Text style={styles.empty}>
          Каталог песен пуст. Импортируйте песни в разделе Профиль → Песни.
        </Text>
      ) : (
        <ScrollView
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {filtered.map((s) => {
            const active = s.number === current;
            return (
              <Pressable
                key={s.id}
                style={({ pressed }) => [
                  styles.row,
                  active && styles.rowActive,
                  pressed && !readOnly && styles.rowPressed,
                ]}
                onPress={readOnly ? undefined : () => onSave(`Песня ${s.number}`)}
                disabled={readOnly || isSaving}
              >
                <View style={[styles.badge, active && styles.badgeActive]}>
                  <Text
                    style={[styles.badgeText, active && styles.badgeTextActive]}
                  >
                    {s.number}
                  </Text>
                </View>
                <Text
                  style={[styles.rowTitle, active && styles.rowTitleActive]}
                  numberOfLines={2}
                >
                  {s.title}
                </Text>
                {active && (
                  <Ionicons name="checkmark" size={20} color="#0ea5e9" />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  currentBox: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  currentLabel: {
    fontSize: 11,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  currentValue: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  search: {
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    fontSize: 15,
    color: '#0f172a',
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  clearText: { color: '#dc2626', fontSize: 14, fontWeight: '500' },
  empty: {
    textAlign: 'center',
    color: '#64748b',
    fontSize: 14,
    marginTop: 32,
    paddingHorizontal: 32,
    lineHeight: 20,
  },
  list: { flex: 1, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowActive: { borderColor: '#0ea5e9', backgroundColor: '#f0f9ff' },
  rowPressed: { opacity: 0.6 },
  badge: {
    minWidth: 36,
    height: 28,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeActive: { backgroundColor: '#0ea5e9' },
  badgeText: { fontSize: 13, fontWeight: '700', color: '#0369a1' },
  badgeTextActive: { color: '#fff' },
  rowTitle: { flex: 1, fontSize: 14, color: '#0f172a' },
  rowTitleActive: { fontWeight: '600' },
});
