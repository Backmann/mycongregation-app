import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Dialog } from './Dialog';
import { HallPlan } from './HallPlan';
import { FONT } from '../lib/typography';

/**
 * The hall plan with this week's windows marked, read-only — one window for
 * every place that shows the weekly cleaning (my assignments, the feed, the
 * cleaning list), instead of a copy in each.
 */
export function WindowsPlanDialog({ windows, onClose }: { windows: number[] | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog
      visible={windows !== null}
      title={t('cleaning.windows.title')}
      icon="grid-outline"
      iconTint="#0284c7"
      iconBg="#e0f2fe"
      cancelLabel={t('common.close')}
      onCancel={onClose}
      scroll
    >
      <HallPlan selected={windows ?? []} />
    </Dialog>
  );
}

/**
 * «Windows: 5, 7 · On the plan» under a weekly cleaning — the numbers, and one
 * tap to the plan that shows where those windows are. A number alone means
 * nothing to someone who has not memorised the hall.
 */
export function WindowsLine({ windows, onOpen }: { windows: number[]; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.line}>
      <Text style={styles.text}>{t('cleaningHall.windows', { list: windows.join(', ') })}</Text>
      <Pressable
        onPress={onOpen}
        hitSlop={8}
        style={({ pressed }) => [styles.link, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={t('cleaning.windows.title')}
      >
        <Ionicons name="map-outline" size={14} color="#0369a1" />
        <Text style={styles.linkText}>{t('cleaning.windows.map')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  text: { fontSize: 13.5, fontFamily: FONT.semibold, color: '#b45309' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28, paddingHorizontal: 2 },
  linkText: { fontSize: 13.5, fontFamily: FONT.bold, color: '#0369a1' },
  pressed: { opacity: 0.6 },
});
