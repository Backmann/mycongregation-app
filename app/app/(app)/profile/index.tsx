import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../lib/auth';
import { useMyPublisher } from '../../../lib/useMyPublisher';
import { LanguagePickerModal } from '../../../components/LanguagePicker';
import { getCurrentLanguage } from '../../../lib/i18n';
import { extractErrorMessage, meApi } from '../../../lib/api';
import {
  getWebPushStatus,
  isIosWithoutStandalone,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  WebPushStatus,
} from '../../../lib/web-push';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { myPublisher } = useMyPublisher();
  const { t } = useTranslation();
  const [langModalVisible, setLangModalVisible] = useState(false);
  const currentLang = getCurrentLanguage();
  const [webPushStatus, setWebPushStatus] = useState<WebPushStatus | null>(null);
  const [webPushBusy, setWebPushBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await meApi.exportData();
      const json = JSON.stringify(data, null, 2);
      const filename = `mycongregation-data-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      if (Platform.OS === 'web') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        await Share.share({ message: json });
      }
    } catch (err) {
      Alert.alert(t('common.error'), extractErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }, [exporting, t]);
  const showIosHint = isIosWithoutStandalone();

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    getWebPushStatus().then(setWebPushStatus);
  }, []);

  const handleWebPushToggle = useCallback(async () => {
    if (webPushBusy) return;
    setWebPushBusy(true);
    try {
      if (webPushStatus === 'subscribed') {
        await unsubscribeFromWebPush();
      } else if (webPushStatus === 'granted' || webPushStatus === 'default') {
        await subscribeToWebPush();
      } else if (webPushStatus === 'denied') {
        Alert.alert(
          t('profile.webPush.deniedTitle'),
          t('profile.webPush.deniedBody'),
        );
      }
      const fresh = await getWebPushStatus();
      setWebPushStatus(fresh);
    } finally {
      setWebPushBusy(false);
    }
  }, [webPushStatus, webPushBusy, t]);

  const webPushSubtitleKey = showIosHint
    ? 'profile.webPush.iosHint'
    : webPushStatus === 'subscribed'
      ? 'profile.webPush.enabled'
      : webPushStatus === 'denied'
        ? 'profile.webPush.denied'
        : webPushStatus === 'unsupported'
          ? 'profile.webPush.unsupported'
          : webPushStatus === 'unconfigured'
            ? 'profile.webPush.unconfigured'
            : 'profile.webPush.disabled';

  const webPushDisabled =
    webPushBusy ||
    webPushStatus === 'unsupported' ||
    webPushStatus === 'unconfigured' ||
    showIosHint;

  if (!user) return null;

  const isAdmin = user.role === 'admin' || user.role === 'elder';
  const isFullAdmin = user.role === 'admin';
  const initials =
    (myPublisher
      ? `${myPublisher.firstName?.[0] ?? ''}${myPublisher.lastName?.[0] ?? ''}`
      : (user.email[0] ?? '')
    ).toUpperCase() || '?';

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('profile.signedInAs')}</Text>
        <View style={styles.card}>
          <View style={styles.identityRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.identityCol}>
              {myPublisher?.displayName ? (
                <Text style={styles.identityName}>
                  {myPublisher.displayName}
                </Text>
              ) : null}
              <Text style={styles.identityEmail}>{user.email}</Text>
              <View style={styles.identityBadge}>
                <Text style={styles.identityBadgeText}>
                  {t(`profile.roles.${user.role}`, { defaultValue: user.role })}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('profile.settings')}</Text>
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && styles.rowPressed,
            ]}
            onPress={() => setLangModalVisible(true)}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="language-outline" size={20} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t('profile.language')}</Text>
              <Text style={styles.rowSubtitle}>{t(`language.${currentLang === 'en' ? 'english' : currentLang === 'ru' ? 'russian' : 'german'}`)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.row,
              pressed && styles.rowPressed,
            ]}
            onPress={() => router.push('/profile/change-password' as any)}
          >
            <View style={styles.rowIcon}>
              <Ionicons name="key-outline" size={20} color="#0ea5e9" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{t('profile.changePassword.rowTitle')}</Text>
              <Text style={styles.rowSubtitle}>{t('profile.changePassword.rowSubtitle')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
          </Pressable>
        </View>
      </View>

      {Platform.OS === 'web' && webPushStatus !== null && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('profile.notifications')}</Text>
          <View style={styles.card}>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                pressed && !webPushDisabled && styles.rowPressed,
                webPushDisabled && { opacity: 0.6 },
              ]}
              onPress={handleWebPushToggle}
              disabled={webPushDisabled}
            >
              <View style={styles.rowIcon}>
                <Ionicons
                  name={webPushStatus === 'subscribed' ? 'notifications' : 'notifications-outline'}
                  size={20}
                  color="#0ea5e9"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t('profile.webPush.title')}</Text>
                <Text style={styles.rowSubtitle}>{t(webPushSubtitleKey)}</Text>
              </View>
              {webPushStatus === 'subscribed' && (
                <Ionicons name="checkmark-circle" size={20} color="#10b981" />
              )}
            </Pressable>
          </View>
        </View>
      )}

      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('profile.adminTools')}</Text>
          <View style={styles.card}>
            {isFullAdmin && (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => router.push('/profile/admin-users' as any)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="people-outline" size={20} color="#0ea5e9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t('profile.userManagement')}</Text>
                  <Text style={styles.rowSubtitle}>{t('profile.userManagementDescription')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </Pressable>
            )}
            {isFullAdmin && (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => router.push('/profile/responsibilities' as any)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="ribbon-outline" size={20} color="#0ea5e9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t('profile.responsibilities')}</Text>
                  <Text style={styles.rowSubtitle}>{t('profile.responsibilitiesDescription')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </Pressable>
            )}
            {isFullAdmin && (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => router.push('/profile/brothers' as any)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="people-circle-outline" size={20} color="#0ea5e9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Братья</Text>
                  <Text style={styles.rowSubtitle}>Доступ и обязанности</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </Pressable>
            )}
            {isFullAdmin && (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => router.push('/profile/meeting-settings' as any)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="time-outline" size={20} color="#0ea5e9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t('profile.meetingSettings')}</Text>
                  <Text style={styles.rowSubtitle}>{t('profile.meetingSettingsDescription')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </Pressable>
            )}
            {isFullAdmin && (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => router.push('/profile/halls' as any)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="business-outline" size={20} color="#0ea5e9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t('profile.halls')}</Text>
                  <Text style={styles.rowSubtitle}>{t('profile.hallsDescription')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </Pressable>
            )}
            {isFullAdmin && (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  pressed && styles.rowPressed,
                ]}
                onPress={() => router.push('/profile/circuit-overseer' as any)}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name="walk-outline" size={20} color="#0ea5e9" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t('profile.circuitOverseer')}</Text>
                  <Text style={styles.rowSubtitle}>{t('profile.circuitOverseerDescription')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
              </Pressable>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
              onPress={() => router.push('/profile/public-talks' as any)}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="megaphone-outline" size={20} color="#0ea5e9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{t('profile.publicTalks')}</Text>
                <Text style={styles.rowSubtitle}>{t('profile.publicTalksDescription')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.row,
                pressed && styles.rowPressed,
              ]}
              onPress={() => router.push('/profile/songs-import' as any)}
            >
              <View style={styles.rowIcon}>
                <Ionicons name="musical-notes-outline" size={20} color="#0ea5e9" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Песни</Text>
                <Text style={styles.rowSubtitle}>Импорт песенника собрания</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>
          {t('dataRights.sectionLabel')}
        </Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={handleExport}
          disabled={exporting}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="download-outline" size={20} color="#0ea5e9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('dataRights.export')}</Text>
            <Text style={styles.rowSubtitle}>
              {t('dataRights.exportHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/profile/delete-account' as any)}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="trash-outline" size={20} color="#dc2626" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('dataRights.delete')}</Text>
            <Text style={styles.rowSubtitle}>
              {t('dataRights.deleteHint')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{t('legal.sectionLabel')}</Text>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push('/legal' as any)}
        >
          <View style={styles.rowIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#0ea5e9" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{t('legal.title')}</Text>
            <Text style={styles.rowSubtitle}>{t('legal.subtitle')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable
          style={({ pressed }) => [
            styles.logoutButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={signOut}
        >
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutText}>{t('profile.signOut')}</Text>
        </Pressable>
      </View>
    </ScrollView>
    <LanguagePickerModal visible={langModalVisible} onClose={() => setLangModalVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0ea5e9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  identityCol: { flex: 1, gap: 2 },
  identityName: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  identityEmail: { fontSize: 13, color: '#64748b' },
  identityBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  identityBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    letterSpacing: 0.3,
  },
  email: {
    fontSize: 15,
    color: '#0f172a',
    paddingHorizontal: 20,
    paddingTop: 14,
    fontWeight: '500',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 20,
    marginVertical: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: '#e0f2fe',
  },
  roleText: {
    fontSize: 11,
    color: '#0369a1',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  rowPressed: { backgroundColor: '#f8fafc' },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowTitle: { fontSize: 15, color: '#0f172a', fontWeight: '500' },
  rowSubtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginHorizontal: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
  },
  logoutText: { color: '#dc2626', fontSize: 16, fontWeight: '500' },
});
