import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, type TerritoryCandidates } from '../../lib/api';
import { formatDayShort } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

export type Candidate = TerritoryCandidates['people'][number];

/**
 * Choosing a person for a territory (11 November 2026; one component since
 * 17 November 2026 for giving out, handing on and correcting a record).
 * Under each name the two things the territory servant weighs: what he
 * holds now and when he last had this one. Inactive and departed cards are
 * not offered.
 */
export function PersonPicker({
  data,
  loading,
  error,
  chosen,
  onChoose,
  except,
}: {
  data: TerritoryCandidates | undefined;
  loading: boolean;
  error: unknown;
  chosen: string | null;
  onChoose: (p: Candidate) => void;
  /** Left out: the one who holds it now. */
  except?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const people = useMemo(() => {
    const all = (data?.people ?? []).filter((p) => p.publisherId !== except);
    const needle = query.trim().toLowerCase();
    return needle ? all.filter((p) => p.name.toLowerCase().includes(needle)) : all;
  }, [data, query, except]);

  return (
    <>
      <View style={s.search}>
        <Ionicons name="search" size={16} color={MUTED} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('territories.assign.search')}
          placeholderTextColor="#94a3b8"
          style={s.searchInput}
          accessibilityLabel={t('territories.assign.search')}
        />
      </View>
      {loading ? (
        <ActivityIndicator color={BRAND} style={{ marginVertical: 20 }} />
      ) : error ? (
        <Text style={s.error}>{extractErrorMessage(error)}</Text>
      ) : (
        <View style={s.list}>
          {people.map((p) => {
            const on = p.publisherId === chosen;
            const holds = p.holds.length
              ? t('territories.assign.holds', { count: p.holds.length, list: p.holds.join(', ') })
              : t('territories.assign.holdsNone');
            const had = p.hadThisOn
              ? t('territories.assign.hadOn', { date: formatDayShort(p.hadThisOn, i18n.language) })
              : t('territories.assign.hadNever');
            return (
              <Pressable
                key={p.publisherId}
                onPress={() => onChoose(p)}
                style={[s.person, on && s.personOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>
                    {p.name}
                    {p.pioneer ? <Text style={s.pioneer}>  {t('territories.assign.pioneer')}</Text> : null}
                  </Text>
                  <Text style={[s.meta, p.overdue > 0 && s.metaDue]}>
                    {holds}
                    {p.overdue > 0 ? ` · ${t('territories.assign.overdue', { count: p.overdue })}` : ''}
                    {' · '}
                    {had}
                  </Text>
                </View>
                {on ? <Ionicons name="checkmark-circle" size={22} color={BRAND} /> : null}
              </Pressable>
            );
          })}
          {people.length === 0 ? <Text style={s.meta}>{t('territories.assign.nobody')}</Text> : null}
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    marginTop: 14,
    backgroundColor: '#fff',
  },
  searchInput: { flex: 1, paddingVertical: 10, fontFamily: 'Manrope_500Medium', fontSize: 14, color: INK },
  list: { marginTop: 10, gap: 6 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#fff',
  },
  personOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  pioneer: { fontFamily: 'Manrope_800ExtraBold', fontSize: 10.5, color: '#15803d', letterSpacing: 0.5 },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  metaDue: { color: '#c2410c' },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
});
