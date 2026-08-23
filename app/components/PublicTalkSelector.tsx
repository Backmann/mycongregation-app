import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
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
import { Sheet } from './Sheet';

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

  /**
   * Retired talks are ASKED FOR, not hidden.
   *
   * Two reasons, and the first is a plain fault: a talk already chosen for a
   * week and later retired would vanish from this list, and the field would go
   * blank — the assignment still holds it, the screen simply could not name
   * it. The second is Lionel's decision: warn rather than forbid, because the
   * coordinator may know something the catalogue does not.
   */
  const { data, isLoading } = useQuery({
    queryKey: ['public-talks', 'all-for-picker'],
    queryFn: () => publicTalksApi.list({ limit: 500, includeInactive: true }),
  });

  const allTalks = data?.data ?? [];
  const selectedTalk = allTalks.find((t) => t.id === value);

  const matches = allTalks.filter((t) => {
    if (search.trim() === '') return true;
    const s = search.trim().toLowerCase();
    return (
      t.title.toLowerCase().includes(s) ||
      t.number.toString().startsWith(s)
    );
  });

  // Still-given talks first; the retired ones stay reachable at the end, where
  // they cannot be picked by a careless tap.
  const filtered = [
    ...matches.filter((t) => t.isActive),
    ...matches.filter((t) => !t.isActive),
  ];

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
        {/* On the closed field too: a talk chosen months ago and retired since
            must say so where the week is being read, not only where it is
            being picked. */}
        {selectedTalk && !selectedTalk.isActive ? (
          <RetiredHint talk={selectedTalk} inline />
        ) : null}
        {selectedTalk &&
          selectedTalk.isActive &&
          (selectedTalk.lastGivenAt || selectedTalk.nextGivenAt) && (
            <RecencyHint talk={selectedTalk} inline />
          )}
      </Pressable>

      <Sheet
        visible={open}
        title={label}
        onClose={() => setOpen(false)}
      >
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
              </Sheet>
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
  return (
    <Pressable
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
      onPress={onPress}
    >
      <View style={[styles.numberBadge, !talk.isActive && styles.numberBadgeRetired]}>
        <Text style={[styles.numberText, !talk.isActive && styles.numberTextRetired]}>
          {talk.number}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.optionTitle, !talk.isActive && styles.optionTitleRetired]}
          numberOfLines={2}
        >
          {talk.title}
        </Text>
        {/* Said in the moment of choosing, which is the only moment it can
            prevent anything. */}
        {!talk.isActive ? <RetiredHint talk={talk} /> : null}
        {talk.isActive && (talk.lastGivenAt || talk.nextGivenAt) ? (
          <RecencyHint talk={talk} />
        ) : null}
      </View>
      {isSelected && <Ionicons name="checkmark" size={20} color="#0ea5e9" />}
    </Pressable>
  );
}

/**
 * «Снята с 1 сентября 2026 г.» — or just «снята» for one retired by hand
 * before the date was recorded.
 */
export function RetiredHint({
  talk,
  inline,
}: {
  talk: PublicTalk;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.retiredRow, inline && styles.retiredRowInline]}>
      <Ionicons name="close-circle" size={13} color="#b45309" />
      <Text style={styles.retiredText} numberOfLines={1}>
        {talk.retiredFrom
          ? t('publicTalks.retiredFrom', {
              date: new Date(`${talk.retiredFrom}T00:00:00`).toLocaleDateString(
                i18n.language,
                { day: 'numeric', month: 'long', year: 'numeric' },
              ),
            })
          : t('publicTalks.retiredPlain')}
      </Text>
    </View>
  );
}

function RecencyHint({ talk, inline }: { talk: PublicTalk; inline?: boolean }) {
  const colors: Record<Recency, string> = {
    recent: '#dc2626',
    caution: '#d97706',
    ok: '#94a3b8',
    never: '#cbd5e1',
  };
  const icon: Record<Recency, 'warning' | 'warning-outline' | 'time-outline'> = {
    recent: 'warning',
    caution: 'warning-outline',
    ok: 'time-outline',
    never: 'time-outline',
  };
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  const recency = getRecency(talk.lastGivenAt);
  const rowStyle = [styles.hintRow, inline && { marginTop: 4 }];
  return (
    <>
      {talk.nextGivenAt ? (
        <View style={rowStyle}>
          <Ionicons name="calendar-outline" size={11} color="#0369a1" />
          <Text style={[styles.hintText, { color: '#0369a1' }]}>
            {i18n.t('pickers.upcoming', { date: fmt(talk.nextGivenAt) })}
            {talk.nextGivenBy ? ` · ${talk.nextGivenBy}` : ''}
          </Text>
        </View>
      ) : null}
      {talk.lastGivenAt ? (
        <View style={rowStyle}>
          <Ionicons name={icon[recency]} size={11} color={colors[recency]} />
          <Text style={[styles.hintText, { color: colors[recency] }]}>
            {i18n.t('pickers.lastGiven', { date: fmt(talk.lastGivenAt) })}
            {talk.lastGivenBy ? ` · ${talk.lastGivenBy}` : ''}
          </Text>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  numberBadgeRetired: { backgroundColor: '#fef3c7' },
  numberTextRetired: { color: '#b45309' },
  /* Struck through: the talk exists, it is simply not to be given. */
  optionTitleRetired: { color: '#94a3b8', textDecorationLine: 'line-through' },
  retiredRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  retiredRowInline: { marginTop: 0 },
  retiredText: { fontSize: 12, color: '#b45309', flexShrink: 1 },
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
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
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
  numberText: { fontSize: 13, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },

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
