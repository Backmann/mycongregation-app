import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { usePermissions } from '../../../lib/permissions';

export default function TalkCoordinatorScreen() {
  const { t } = useTranslation();
  const perms = usePermissions();

  if (!perms.canCoordinatePublicTalks) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{t('talkCoordinator.noAccess')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hint}>{t('talkCoordinator.intro')}</Text>

        <Text style={styles.sectionLabel}>
          {t('talkCoordinator.directoriesLabel')}
        </Text>
        <View style={styles.card}>
          <Row
            icon="business-outline"
            color="#0369a1"
            title={t('talkCoordinator.congregations.title')}
            subtitle={t('talkCoordinator.congregations.subtitle')}
            onPress={() =>
              router.push('/talk-coordinator/congregations' as any)
            }
          />
          <Row
            icon="people-outline"
            color="#6d28d9"
            title={t('talkCoordinator.speakers.title')}
            subtitle={t('talkCoordinator.speakers.subtitle')}
            onPress={() => router.push('/talk-coordinator/speakers' as any)}
          />
        </View>

        <View style={styles.soon}>
          <Ionicons name="time-outline" size={16} color="#94a3b8" />
          <Text style={styles.soonText}>{t('talkCoordinator.logSoon')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  color,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${color}1a` }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle} numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  muted: { color: '#64748b', fontSize: 15, textAlign: 'center' },
  container: { padding: 16, paddingBottom: 40 },
  hint: { fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  rowSubtitle: { fontSize: 13, color: '#64748b', marginTop: 1 },
  soon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  soonText: { fontSize: 12, color: '#94a3b8' },
});
