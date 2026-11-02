import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { cartWeeksApi } from '../../lib/api';

/** Up to two, as the server takes. */
export const PARTNERS_MAX = 2;

/**
 * «С кем хотели бы» (2 November 2026, Lionel): chosen from the list rather
 * than typed — names only, of everybody the stand is open to, so a brother
 * of another group can be picked too. Whoever is not on it (a guest, a
 * relative, someone without «Стенд» on the card) is written in by hand
 * under «Нет в списке». Only whoever arranges reads either.
 */
export function PartnerPicker({
  value,
  onChange,
  note,
  onNote,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  note: string;
  onNote: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [writing, setWriting] = useState(note.trim().length > 0);
  const list = useQuery({
    queryKey: ['cart-partners'],
    queryFn: () => cartWeeksApi.partners(),
    staleTime: 5 * 60_000,
  });
  const people = useMemo(() => list.data ?? [], [list.data]);
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '';
  const full = value.length >= PARTNERS_MAX;

  // Every word typed must begin a word of the name: «ан ве» finds «Вебер Анна».
  const found = useMemo(() => {
    const words = q.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return people
      .filter((p) => !value.includes(p.id))
      .filter((p) => {
        const parts = p.name.toLocaleLowerCase().split(/\s+/);
        return words.every((w) => parts.some((x) => x.startsWith(w)));
      })
      .slice(0, 6);
  }, [q, people, value]);

  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{t('witnessing.withWhomLabel')}</Text>

      {value.length > 0 && (
        <View style={styles.chips}>
          {value.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={t('witnessing.partnerRemove', { name: nameOf(id) })}
              onPress={() => onChange(value.filter((x) => x !== id))}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{nameOf(id)}</Text>
              <Ionicons name="close" size={16} color="#14532d" />
            </Pressable>
          ))}
        </View>
      )}

      {!full && (
        <>
          <View style={styles.search}>
            <Ionicons name="search" size={16} color="#64748b" />
            <TextInput
              value={q}
              onChangeText={setQ}
              maxLength={60}
              placeholder={t('witnessing.partnerSearch')}
              placeholderTextColor="#64748b"
              style={styles.searchInput}
              autoCorrect={false}
            />
          </View>
          {found.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => {
                onChange([...value, p.id]);
                setQ('');
              }}
              style={styles.row}
            >
              <Ionicons name="add-circle-outline" size={18} color="#15803d" />
              <Text style={styles.rowText}>{p.name}</Text>
            </Pressable>
          ))}
          {q.trim().length > 0 && found.length === 0 && !list.isLoading && (
            <Text style={styles.small}>{t('witnessing.partnerNone')}</Text>
          )}
        </>
      )}

      {writing ? (
        <View style={{ gap: 4 }}>
          <Text style={styles.small}>{t('witnessing.partnerWriteLabel')}</Text>
          <TextInput
            value={note}
            onChangeText={onNote}
            maxLength={200}
            placeholder={t('witnessing.partnerWritePlaceholder')}
            placeholderTextColor="#64748b"
            style={styles.input}
          />
        </View>
      ) : (
        <Pressable onPress={() => setWriting(true)} style={{ paddingVertical: 4 }}>
          <Text style={styles.link}>{t('witnessing.partnerWrite')}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#475569' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#14532d' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    paddingVertical: 10,
    color: '#0f172a',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  rowText: { fontFamily: 'Manrope_600SemiBold', fontSize: 15, color: '#0f172a' },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569', lineHeight: 18 },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#0e7490' },
  input: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
  },
});
