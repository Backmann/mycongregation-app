import { Stack } from 'expo-router';
import { headerOptions } from '../../../lib/header';
import { useTranslation } from 'react-i18next';
import { BackButton } from '../../../components/BackButton';
import { screenGate } from '../../../components/ScreenGate';

export default function ServiceReportsLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenLayout={screenGate('/service-reports')}
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
          // The «+» is set by the screen itself (28 October 2026): it shows
          // only while there is a month left to hand in.
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
        name="s21-totals"
        options={{ title: t('s21Totals.title') }}
      />
      <Stack.Screen
        name="pioneer-year-review"
        options={{ title: t('pioneerReview.title') }}
      />
      <Stack.Screen
        name="pioneer-meetings"
        options={{ title: t('pioneerMeeting.short') }}
      />
      <Stack.Screen
        name="pioneer-meeting"
        options={{ title: t('pioneerMeeting.short') }}
      />
</Stack>
  );
}
