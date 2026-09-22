import { Stack, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { meetingSettingsApi, specialEventsApi } from '../../../lib/api';
import { formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { effectiveVersionFor } from '../../../lib/meeting-schedule';
import { usePermissions } from '../../../lib/permissions';
import { weekRules } from '../../../lib/week-rules';
import { capitalizeFirst } from '../../../lib/relative-time';
import { FONT } from '../../../lib/typography';
import { DutiesMeetingEditor, type DutyMeeting } from '../../../components/DutiesMeetingEditor';

/** One meeting's duties on a phone — ?week=YYYY-MM-DD&meeting=midweek|weekend|memorial. */
export default function DutiesMeetingScreen() {
  const { t, i18n } = useTranslation();
  const perms = usePermissions();
  const params = useLocalSearchParams<{ week?: string; meeting?: string }>();
  const raw = Array.isArray(params.week) ? params.week[0] : params.week;
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date();
  const week = formatDateISO(startOfWeekMonday(day));
  const m = Array.isArray(params.meeting) ? params.meeting[0] : params.meeting;
  const meeting: DutyMeeting = m === 'weekend' || m === 'memorial' ? m : 'midweek';

  // The sheet below opens with the meeting's name, so the header says what the
  // sheet says only in small print — the day. Until the rules are loaded, the
  // name stands in.
  const eventsQ = useQuery({ queryKey: ['special-events', 'all'], queryFn: () => specialEventsApi.list({ all: true }) });
  const settingsQ = useQuery({ queryKey: ['meeting-settings'], queryFn: () => meetingSettingsApi.getOverview() });
  const rules = weekRules({
    weekStartISO: week,
    version: effectiveVersionFor(settingsQ.data?.versions, week),
    events: eventsQ.data ?? [],
  });
  const dateISO = meeting === 'memorial' ? (rules.memorial?.date ?? null) : rules.dateOf(meeting);
  const title =
    dateISO && settingsQ.data
      ? capitalizeFirst(
          new Date(`${dateISO}T00:00:00`).toLocaleDateString(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          }),
        )
      : t(`eventTypes.${meeting}`);

  return (
    <>
      <Stack.Screen options={{ title }} />
      {perms.canEditDuties || perms.isElder || perms.isAdmin ? (
        <DutiesMeetingEditor key={`${week}|${meeting}`} weekStartISO={week} meeting={meeting} />
      ) : (
        <Text style={{ padding: 16, fontSize: 15, fontFamily: FONT.medium, color: '#64748b' }}>
          {t('dutiesScreen.noAccess')}
        </Text>
      )}
    </>
  );
}
