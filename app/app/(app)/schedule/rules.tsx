import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { meetingSettingsApi } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

export default function CongregationRulesScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const { data: overview, isLoading } = useQuery({
    queryKey: ['meeting-settings'],
    queryFn: () => meetingSettingsApi.getOverview(),
  });

  const toggleM = useMutation({
    mutationFn: (v: boolean) =>
      meetingSettingsApi.updateCongregation({ assignmentAutomationEnabled: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['meeting-settings'] });
      qc.invalidateQueries({ queryKey: ['meeting-settings-overview'] });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#0ea5e9" />
      </View>
    );
  }

  const enabled = overview?.congregation.assignmentAutomationEnabled ?? false;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 40 }}
    >
      <Text style={styles.intro}>{t('rules.intro')}</Text>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Ionicons name="flash-outline" size={20} color="#0369a1" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{t('rules.autoAssign.title')}</Text>
            <Text style={styles.cardState}>
              {enabled ? t('rules.on') : t('rules.off')}
            </Text>
          </View>
          <Switch
            value={enabled}
            disabled={!isAdmin || toggleM.isPending}
            onValueChange={(v) => toggleM.mutate(v)}
            trackColor={{ true: '#0ea5e9', false: '#cbd5e1' }}
          />
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionHead}>{t('rules.autoAssign.whatTitle')}</Text>

        <RuleLine
          icon="moon-outline"
          title={t('rules.autoAssign.midweekTitle')}
          body={t('rules.autoAssign.midweekBody')}
        />
        <RuleLine
          icon="sunny-outline"
          title={t('rules.autoAssign.weekendTitle')}
          body={t('rules.autoAssign.weekendBody')}
        />
        <RuleLine
          icon="mic-outline"
          title={t('rules.autoAssign.micTitle')}
          body={t('rules.autoAssign.micBody')}
        />

        <Text style={styles.sectionHead}>{t('rules.autoAssign.notesTitle')}</Text>
        <Bullet text={t('rules.autoAssign.noteCapability')} />
        <Bullet text={t('rules.autoAssign.noteManual')} />
        <Bullet text={t('rules.autoAssign.noteExisting')} />
        <Bullet text={t('rules.autoAssign.notePublished')} />
      </View>

      {!isAdmin ? (
        <Text style={styles.adminNote}>{t('rules.adminOnly')}</Text>
      ) : null}
    </ScrollView>
  );
}

function RuleLine({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.ruleLine}>
      <Ionicons
        name={icon}
        size={16}
        color="#475569"
        style={{ marginTop: 2 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.ruleTitle}>{title}</Text>
        <Text style={styles.ruleBody}>{body}</Text>
      </View>
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet}>
      <View style={styles.dot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  intro: {
    fontSize: 13,
    color: '#64748b',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 4,
    lineHeight: 19,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cardState: { fontSize: 13, color: '#94a3b8', marginTop: 1 },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 14 },
  sectionHead: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  ruleLine: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  ruleTitle: { fontSize: 14, fontWeight: '600', color: '#0f172a' },
  ruleBody: { fontSize: 13, color: '#475569', marginTop: 2, lineHeight: 18 },
  bullet: { flexDirection: 'row', gap: 8, marginBottom: 7, alignItems: 'flex-start' },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#94a3b8',
    marginTop: 6,
  },
  bulletText: { flex: 1, fontSize: 13, color: '#475569', lineHeight: 18 },
  adminNote: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 24,
  },
});
