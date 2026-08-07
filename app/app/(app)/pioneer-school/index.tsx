import { useState } from 'react';
import {
  ActivityIndicator,
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
import { router } from 'expo-router';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';

import { PioneerSchool, extractErrorMessage, pioneerSchoolApi } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { DateField } from '../../../components/DateField';
import { LoadFailure } from '../../../components/LoadFailure';
import { Sheet } from '../../../components/Sheet';

/** «23–29 ноября 2026» — one line, no repeated month or year. */
export function schoolDates(
  start: string,
  end: string,
  locale: string,
): string {
  const a = dayjs(start).locale(locale);
  const b = dayjs(end).locale(locale);
  if (a.isSame(b, 'day')) return a.format('D MMMM YYYY');
  if (a.isSame(b, 'month')) {
    return `${a.format('D')}\u2009\u2013\u2009${b.format('D MMMM YYYY')}`;
  }
  if (a.isSame(b, 'year')) {
    return `${a.format('D MMMM')}\u2009\u2013\u2009${b.format('D MMMM YYYY')}`;
  }
  return `${a.format('D MMMM YYYY')}\u2009\u2013\u2009${b.format('D MMMM YYYY')}`;
}

export default function PioneerSchoolsScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { canViewPioneerSchool, canManagePioneerSchool } = usePermissions();

  const query = useQuery({
    queryKey: ['pioneer-school'],
    queryFn: () => pioneerSchoolApi.list(),
    enabled: canViewPioneerSchool,
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      pioneerSchoolApi.create({
        title: title.trim() || t('pioneerSchool.defaultTitle'),
        startDate,
        endDate,
      }),
    onSuccess: (school) => {
      qc.invalidateQueries({ queryKey: ['pioneer-school'] });
      setOpen(false);
      router.push(`/pioneer-school/${school.id}` as never);
    },
  });

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

  const schools = query.data ?? [];
  const canCreate = !!startDate && !!endDate && endDate >= startDate;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={styles.intro}>{t('pioneerSchool.intro')}</Text>

        {canManagePioneerSchool && (
          <View style={styles.actions}>
            <Pressable style={styles.addBtn} onPress={() => setOpen(true)}>
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addBtnText}>{t('pioneerSchool.add')}</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => router.push('/pioneer-school/helpers' as never)}
            >
              <Ionicons name="people-outline" size={18} color="#0ea5e9" />
              <Text style={styles.secondaryBtnText}>
                {t('pioneerSchool.helpers.title')}
              </Text>
            </Pressable>
          </View>
        )}

        {schools.length === 0 ? (
          <Text style={styles.empty}>{t('pioneerSchool.empty')}</Text>
        ) : (
          schools.map((s: PioneerSchool) => (
            <Pressable
              key={s.id}
              style={styles.card}
              onPress={() => router.push(`/pioneer-school/${s.id}` as never)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{s.title}</Text>
                <Text style={styles.cardDates}>
                  {schoolDates(s.startDate, s.endDate, i18n.language)}
                </Text>
                {s.hallName ? (
                  <View style={styles.hallRow}>
                    <Ionicons name="location-outline" size={13} color="#64748b" />
                    <Text style={styles.cardHall}>{s.hallName}</Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </Pressable>
          ))
        )}
      </ScrollView>

      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        variant="bottom"
        title={t('pioneerSchool.newTitle')}
        footer={
          <Pressable
            style={[styles.addBtn, !canCreate && styles.btnOff]}
            disabled={!canCreate || createMut.isPending}
            onPress={() => createMut.mutate()}
          >
            <Text style={styles.addBtnText}>{t('common.create')}</Text>
          </Pressable>
        }
      >
        <Text style={styles.label}>{t('pioneerSchool.fields.title')}</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder={t('pioneerSchool.defaultTitle')}
          placeholderTextColor="#94a3b8"
        />
        <DateField
          label={t('pioneerSchool.fields.startDate')}
          value={startDate}
          onChange={setStartDate}
        />
        <DateField
          label={t('pioneerSchool.fields.endDate')}
          value={endDate}
          onChange={setEndDate}
        />
        {createMut.isError ? (
          <Text style={styles.error}>
            {extractErrorMessage(createMut.error)}
          </Text>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  intro: { fontSize: 13.5, color: '#64748b', lineHeight: 19, marginBottom: 14 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 13,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontFamily: 'Manrope_700Bold' },
  btnOff: { opacity: 0.5 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  secondaryBtnText: {
    color: '#0ea5e9',
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginBottom: 10,
  },
  cardTitle: { fontSize: 16, color: '#0f172a', fontFamily: 'Manrope_700Bold' },
  cardDates: { fontSize: 13.5, color: '#0369a1', marginTop: 2 },
  hallRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  cardHall: { fontSize: 12.5, color: '#64748b' },
  empty: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 24 },
  label: {
    fontSize: 13,
    color: '#475569',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 8,
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
  error: { color: '#dc2626', fontSize: 13, marginTop: 8 },
});
