import { Stack, useLocalSearchParams } from 'expo-router';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { usePermissions } from '../../../lib/permissions';
import { FONT } from '../../../lib/typography';
import { DutiesMeetingEditor, type DutyMeeting } from '../../../components/DutiesMeetingEditor';

/** One meeting's duties on a phone — ?week=YYYY-MM-DD&meeting=midweek|weekend|memorial. */
export default function DutiesMeetingScreen() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const params = useLocalSearchParams<{ week?: string; meeting?: string }>();
  const raw = Array.isArray(params.week) ? params.week[0] : params.week;
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date();
  const week = formatDateISO(startOfWeekMonday(day));
  const m = Array.isArray(params.meeting) ? params.meeting[0] : params.meeting;
  const meeting: DutyMeeting = m === 'weekend' || m === 'memorial' ? m : 'midweek';
  return (
    <>
      <Stack.Screen options={{ title: t(`eventTypes.${meeting}`) }} />
      {perms.canEditDuties ? (
        <DutiesMeetingEditor key={`${week}|${meeting}`} weekStartISO={week} meeting={meeting} />
      ) : (
        <Text style={{ padding: 16, fontSize: 15, fontFamily: FONT.medium, color: '#64748b' }}>{t('dutiesScreen.noAccess')}</Text>
      )}
    </>
  );
}
