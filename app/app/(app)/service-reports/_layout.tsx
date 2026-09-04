import { Stack, router } from 'expo-router';
import { headerOptions, HEADER_ICON } from '../../../lib/header';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';

export default function ServiceReportsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        ...headerOptions,
        headerLeft: () => <BackButton fallback="/service-reports" toParent />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('reports.title.list'),
          headerLeft: () => <BackButton fallback="/cart" toParent />,
          // ONE button. There were six unlabelled icons here — summary,
          // annual, attendance, feed, group, add — and two of them were people
          // and people-in-a-circle. Every section is now a named line on the
          // screen below, shown to whoever it belongs to; this is the one
          // action eighty-eight people come for.
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/service-reports/new' as any)}
              style={{ paddingHorizontal: 8 }}
              hitSlop={8}
            >
              <Ionicons name="add" size={28} color={HEADER_ICON} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="new" options={{ title: t('reports.title.new') }} />
      <Stack.Screen name="group" options={{ title: t('reports.title.group') }} />
      <Stack.Screen
        name="summary"
        options={{ title: t('reports.summary.title') }}
      />
      <Stack.Screen name="audit-log" options={{ title: t('reports.title.editHistory') }} />
      <Stack.Screen
        name="publisher-history"
        options={{ title: t('reports.title.publisherHistory') }}
      />
      <Stack.Screen
        name="activity"
        options={{ title: t('reports.title.activity') }}
      />
          <Stack.Screen
        name="attendance"
        options={{ title: t('attendance.pageTitle') }}
      />
      <Stack.Screen
        name="annual"
        options={{ title: t('annualReport.pageTitle') }}
      />
      <Stack.Screen
        name="pioneer-year-review"
        options={{ title: t('pioneerReview.title') }}
      />
</Stack>
  );
}
