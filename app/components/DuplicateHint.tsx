import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from '../lib/i18n';
import { cardMergeApi, type DuplicateWhy } from '../lib/api';
import { formatDay } from '../lib/date-range';

/**
 * «Похожая карточка уже есть» — while a new card is being entered (1
 * November 2026). A duplicate caught here is a merge nobody has to make.
 * The server decides what is alike (the same both names, e-mail or phone,
 * departed cards too — he may have come back); this only says so, and does
 * not stop anyone: namesakes exist.
 *
 * `only` shows the matches of one kind where they belong: the name under
 * the names, the phone and e-mail under the contacts.
 */
export function DuplicateHint({
  firstName,
  lastName,
  email,
  phone,
  only,
}: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  only: 'name' | 'contacts';
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState({ firstName, lastName, email, phone });
  useEffect(() => {
    const id = setTimeout(() => setQ({ firstName, lastName, email, phone }), 500);
    return () => clearTimeout(id);
  }, [firstName, lastName, email, phone]);

  const named = !!q.firstName?.trim() && !!q.lastName?.trim();
  const phoned = (q.phone ?? '').replace(/\D/g, '').length >= 7;
  const mailed = (q.email ?? '').includes('@');
  const res = useQuery({
    queryKey: ['card-merge', 'duplicates', q],
    queryFn: () =>
      cardMergeApi.duplicates({
        firstName: q.firstName?.trim() || undefined,
        lastName: q.lastName?.trim() || undefined,
        email: mailed ? q.email!.trim() : undefined,
        phone: phoned ? q.phone : undefined,
      }),
    enabled: named || phoned || mailed,
    staleTime: 60 * 1000,
  });

  const wanted = (why: DuplicateWhy[]) =>
    only === 'name' ? why.includes('name') : !why.includes('name');
  const found = (res.data ?? []).filter((d) => wanted(d.why));
  if (found.length === 0) return null;
  const lang = i18n.language;
  return (
    <View style={styles.box} testID="duplicate-hint">
      <Text style={styles.title}>{t('merge.duplicate.title')}</Text>
      {found.map((d) => (
        <View key={d.id} style={styles.item}>
          <Text style={styles.text}>
            {[
              d.displayName,
              d.group ?? t('merge.facts.noGroup'),
              d.departed ? t('merge.facts.departed') : null,
              d.memberSince
                ? t('merge.facts.since', { date: formatDay(d.memberSince, lang) })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
          <Text style={styles.text}>
            {t('merge.duplicate.why', {
              list: d.why.map((w) => t(`merge.duplicate.by.${w}`)).join(', '),
            })}
          </Text>
          <Pressable
            style={styles.open}
            onPress={() => router.push(`/publishers/${d.id}` as never)}
            accessibilityRole="link"
          >
            <Text style={styles.openText}>{t('merge.duplicate.open')}</Text>
          </Pressable>
        </View>
      ))}
      <Text style={styles.small}>{t('merge.duplicate.namesakes')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#7c2d12' },
  item: { gap: 6 },
  text: { fontFamily: 'Manrope_400Regular', fontSize: 14, lineHeight: 20, color: '#7c2d12' },
  small: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#9a3412' },
  open: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fdba74',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  openText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#7c2d12' },
});
