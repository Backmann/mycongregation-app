import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { WheelColumn } from './TimeWheel';

const HOURS = Array.from({ length: 13 }, (_, i) => i); // 0…12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0, 5, …, 55

/**
 * HOW LONG, ON TWO DRUMS (29 October 2026). Hours 0–12 and minutes by five,
 * turned like an alarm clock — no keyboard, so «300» for «3:00» cannot
 * happen. The same drum as the clock wheel the app already uses for meeting
 * times. Twelve hours is the most one entry may hold.
 */
export function DurationWheel({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
}) {
  const { t } = useTranslation();
  const h = Math.min(12, Math.floor(minutes / 60));
  const m = h === 12 ? 0 : Math.round((minutes % 60) / 5) * 5;
  const mIndex = useMemo(() => Math.max(0, MINUTES.indexOf(m)), [m]);
  return (
    <View style={styles.wrap}>
      <WheelColumn
        values={HOURS}
        index={h}
        format={String}
        onIndex={(i) => onChange(HOURS[i] === 12 ? 720 : HOURS[i] * 60 + m)}
      />
      <Text style={styles.unit}>{t('hoursLog.unitH')}</Text>
      <WheelColumn
        values={MINUTES}
        index={mIndex}
        format={String}
        onIndex={(i) => onChange(h === 12 ? 720 : h * 60 + MINUTES[i])}
      />
      <Text style={styles.unit}>{t('hoursLog.unitM')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingVertical: 4,
  },
  unit: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 16,
    color: '#0e7490',
    width: 44,
    marginLeft: 2,
  },
});
