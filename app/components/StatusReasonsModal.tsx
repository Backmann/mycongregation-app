import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { publishersApi } from '../lib/api';
import { formatMonthLabel } from '../lib/i18n';

/**
 * WHY the badge says what it says.
 *
 * Four facts, in the order a person asks them: what was weighed, from when he
 * is counted, when a sixth silent month would fall — with its service year,
 * because that is the question the annual report asks — and whether the status
 * was set by hand at all.
 */
export function StatusReasonsModal({
  target,
  onClose,
}: {
  /** Whose standing to explain; null closes the window. */
  target: { publisherId: string; displayName: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['status-explained', target?.publisherId],
    queryFn: () => publishersApi.explainStatus(target!.publisherId),
    enabled: !!target,
  });

  const month = (m: string | null) =>
    m ? formatMonthLabel(`${m}-01`) : '—';

  return (
    <Modal
      visible={!!target}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.name}>{target?.displayName}</Text>
          {isLoading || !data ? (
            <ActivityIndicator style={{ marginTop: 16 }} />
          ) : (
            <View style={{ marginTop: 10, gap: 9 }}>
              <Text style={styles.line}>
                {data.windowFrom
                  ? t('reports.reasons.window', {
                      from: month(data.windowFrom),
                      to: month(data.windowTo),
                      served: data.served,
                      expected: data.expected,
                    })
                  : t('reports.reasons.nothingClosed')}
              </Text>
              <Text style={styles.line}>
                {data.restarted
                  ? t('reports.reasons.restarted', {
                      month: month(data.startMonth),
                    })
                  : t('reports.reasons.countsFrom', {
                      month: month(data.startMonth),
                    })}
              </Text>
              {data.sixthSilentMonth ? (
                <Text style={styles.line}>
                  {t('reports.reasons.sixth', {
                    month: month(data.sixthSilentMonth),
                    from: data.sixthSilentServiceYear,
                    to: (data.sixthSilentServiceYear ?? 0) + 1,
                  })}
                </Text>
              ) : null}
              {data.manuallyOverridden ? (
                <Text style={styles.warn}>
                  {t('reports.reasons.manual')}
                </Text>
              ) : null}
            </View>
          )}
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>{t('common.close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    width: '100%',
    maxWidth: 420,
  },
  name: {
    fontSize: 17,
    color: '#0f172a',
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
  },
  line: { fontSize: 14, color: '#334155', lineHeight: 20 },
  warn: { fontSize: 14, color: '#b45309', lineHeight: 20 },
  close: {
    marginTop: 16,
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  closeText: {
    color: '#0e7490',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
});
