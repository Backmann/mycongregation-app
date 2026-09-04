import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import 'dayjs/locale/de';

import { serviceReportsApi } from '../lib/api';
import { usePermissions } from '../lib/permissions';

/**
 * Where the collection of last month's reports stands.
 *
 * This says the thing the publisher STATUS used to say by accident. A report
 * that has not arrived yet was turning people irregular on the 1st of every
 * month and active again as the lines were typed in — the calendar talking,
 * not the congregation. A missing report during the collection window is a
 * line still to be gathered, so it belongs here, on the secretary's card, and
 * the status keeps its own slower question.
 *
 * It goes quiet when the month is closed: nothing left to collect, nothing to
 * say.
 */
export function ReportCollectionCard() {
  const { t, i18n } = useTranslation();
  const { canViewServiceSummary } = usePermissions();

  const collection = useQuery({
    queryKey: ['service-reports', 'collection'],
    queryFn: () => serviceReportsApi.getCollection(),
    enabled: canViewServiceSummary,
    staleTime: 5 * 60 * 1000,
  });

  const data = collection.data;
  if (!canViewServiceSummary || !data || data.closed) return null;

  const month = dayjs(data.reportMonth).locale(i18n.language).format('MMMM');
  const deadline = dayjs(data.deadline).locale(i18n.language).format('D MMMM');
  const allIn = data.expected > 0 && data.received >= data.expected;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={() =>
        router.push(
          `/service-reports/summary?from=${encodeURIComponent('/home')}` as any,
        )
      }
    >
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name="clipboard-outline" size={18} color="#0e7490" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {t('reports.collection.title', { month })}
          </Text>
          <Text style={styles.subtitle}>
            {allIn
              ? t('reports.collection.allIn', { expected: data.expected })
              : t('reports.collection.progress', {
                  received: data.received,
                  expected: data.expected,
                })}
          </Text>
          {/* The deadline is stated either way. Before it passes this is a
              plain fact; after it, the same line in amber — a debt tidied out
              of sight is a debt nobody goes back to settle. */}
          <Text
            style={[styles.note, data.pastDeadline && !allIn && styles.late]}
          >
            {allIn
              ? t('reports.collection.canClose')
              : data.pastDeadline
                ? t('reports.collection.overdue', { date: deadline })
                : t('reports.collection.due', { date: deadline })}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    textTransform: 'capitalize',
  },
  subtitle: {
    fontSize: 13.5,
    color: '#0f172a',
    marginTop: 1,
    fontFamily: 'Manrope_600SemiBold',
  },
  note: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 1,
  },
  late: {
    color: '#b45309',
    fontFamily: 'Manrope_600SemiBold',
  },
});
