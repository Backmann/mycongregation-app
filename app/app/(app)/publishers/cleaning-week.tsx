import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatDateISO, startOfWeekMonday } from '../../../lib/dates';
import { formatWeekRange } from '../../../lib/week-range';
import { CleaningWeekEditor } from '../../../components/CleaningWeekEditor';

/** One week of hall cleaning on a phone — ?week=YYYY-MM-DD, any day of it. */
export default function CleaningWeekScreen() {
  const { i18n } = useTranslation();
  const params = useLocalSearchParams<{ week?: string }>();
  const raw = Array.isArray(params.week) ? params.week[0] : params.week;
  const day = raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date();
  const monday = startOfWeekMonday(day);
  const week = formatDateISO(monday);
  const title = formatWeekRange(monday, i18n.language);
  return (
    <>
      <Stack.Screen options={{ title }} />
      <CleaningWeekEditor key={week} weekStartISO={week} />
    </>
  );
}
