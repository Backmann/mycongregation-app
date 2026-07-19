import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

/**
 * Shown where data should have been. Until now a failed load left the screen
 * looking empty — on the home card that reads as "nothing assigned this week",
 * which is the opposite of the truth — so a failure says so and offers to try
 * again rather than pretending there is nothing to show.
 */
export function LoadError({
  onRetry,
  compact,
}: {
  onRetry?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Ionicons name="cloud-offline-outline" size={compact ? 18 : 22} color="#b45309" />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{t('common.loadFailed')}</Text>
        {!compact ? (
          <Text style={styles.hint}>{t('common.loadFailedHint')}</Text>
        ) : null}
      </View>
      {onRetry ? (
        <Pressable
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          onPress={onRetry}
          hitSlop={6}
        >
          <Text style={styles.retryText}>{t('common.retry')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginHorizontal: 12,
    marginTop: 10,
  },
  cardCompact: { paddingVertical: 10, marginHorizontal: 0, marginTop: 0 },
  title: {
    fontSize: 13.5,
    color: '#92400e',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  hint: { fontSize: 12.5, color: '#a16207', marginTop: 2, lineHeight: 17 },
  retry: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryText: {
    fontSize: 12.5,
    color: '#92400e',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  pressed: { opacity: 0.85 },
});
