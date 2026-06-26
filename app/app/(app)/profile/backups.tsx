import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupsScreen() {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);

  const query = useQuery({
    queryKey: ['backups-status'],
    queryFn: () => backupsApi.status(),
  });

  const latest = query.data?.latest ?? null;

  const handleDownload = async () => {
    if (!latest || downloading) return;
    if (Platform.OS !== 'web') {
      Alert.alert(t('backups.title'), t('backups.webOnly'));
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
      Alert.alert(t('backups.title'), extractErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {query.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : query.isError ? (
        <Text style={styles.error}>{t('backups.error')}</Text>
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
                  date: new Date(latest.modifiedAt).toLocaleString(),
                })}
              </Text>
            </View>
            <Text style={styles.meta}>
              {t('backups.size', { size: formatBytes(latest.size) })}
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
  screen: { flex: 1, backgroundColor: '#f8fafc' },
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
  statusText: { fontSize: 15, fontWeight: '600', color: '#0f172a', flex: 1 },
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
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center', marginTop: 32 },
});
