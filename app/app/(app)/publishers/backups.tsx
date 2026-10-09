import { LoadFailure } from '../../../components/LoadFailure';
import { useState } from 'react';
import {
  ActivityIndicator,
  
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { backupsApi, extractErrorMessage } from '../../../lib/api';
import { notify } from '../../../lib/error-bus';
import { failsScreen } from '../../../lib/screen-failure';

/** «956,6 КБ» in Russian, «956.6 KB» in English — not the English form everywhere. */
function formatBytes(n: number, lang: string): string {
  const units = lang === 'ru' ? ['Б', 'КБ', 'МБ'] : ['B', 'KB', 'MB'];
  const num = (x: number) =>
    x.toLocaleString(lang, { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  if (n < 1024) return `${n} ${units[0]}`;
  if (n < 1024 * 1024) return `${num(n / 1024)} ${units[1]}`;
  return `${num(n / (1024 * 1024))} ${units[2]}`;
}

export default function BackupsScreen() {
  const { t, i18n } = useTranslation();
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    throwOnError: failsScreen,
    queryKey: ['backups-status'],
    queryFn: () => backupsApi.status(),
  });

  const latest = query.data?.latest ?? null;

  const handleDownload = async () => {
    if (!latest || downloading) return;
    if (Platform.OS !== 'web') {
      notify(t('backups.title'), t('backups.webOnly'));
      return;
    }
    setDownloading(true);
    try {
      const blob = await backupsApi.download(latest.name);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = latest.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(t('backups.title'), extractErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : query.isError ? (
        // A refusal (the copies belong to whoever runs the platform) is a
        // «нет доступа», not a red failure (28 September).
        <LoadFailure error={query.error} onRetry={() => void query.refetch()} />
      ) : !latest ? (
        <View style={styles.card}>
          <Text style={styles.muted}>{t('backups.none')}</Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <Ionicons name="shield-checkmark" size={22} color="#16a34a" />
              <Text style={styles.statusText}>
                {t('backups.statusOk', {
                  // In the reader's language, without seconds (28.09).
                  date: new Date(latest.modifiedAt).toLocaleString(i18n.language, {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </Text>
            </View>
            <Text style={styles.meta}>
              {t('backups.size', { size: formatBytes(latest.size, i18n.language) })}
            </Text>
            <Text style={styles.meta}>
              {t('backups.count', { count: query.data?.count ?? 0 })}
            </Text>
          </View>

          <Text style={styles.note}>{t('backups.encryptedNote')}</Text>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              (pressed || downloading) && styles.buttonPressed,
            ]}
            onPress={handleDownload}
            disabled={downloading}
          >
            <Ionicons name="download-outline" size={18} color="#ffffff" />
            <Text style={styles.buttonText}>
              {downloading ? t('backups.downloading') : t('backups.download')}
            </Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#0f172a', flex: 1 },
  meta: { fontSize: 13, color: '#64748b' },
  muted: { fontSize: 14, color: '#94a3b8' },
  note: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    fontStyle: 'italic',
    paddingHorizontal: 4,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0e7490',
    borderRadius: 10,
    paddingVertical: 14,
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center', marginTop: 32 },
});
