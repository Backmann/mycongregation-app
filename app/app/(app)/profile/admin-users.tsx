import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../lib/auth';
import { PresenceDot } from '../../../components/PresenceDot';
import {
  PublicUser,
  UserRole,
  extractErrorMessage,
  usersApi,
} from '../../../lib/api';

// Login accounts are created and managed per-person on the Братья screen
// (role derived from appointment). This screen is a read-only audit list.

const ROLE_COLORS: Record<UserRole, { bg: string; fg: string }> = {
  admin: { bg: '#fee2e2', fg: '#991b1b' },
  elder: { bg: '#dbeafe', fg: '#1e40af' },
  ministerial_servant: { bg: '#e0e7ff', fg: '#3730a3' },
  publisher: { bg: '#dcfce7', fg: '#166534' },
};

// Appointments that all map to the 'publisher' login role but should read
// as their real status on this audit list (e.g. a Student is not a Publisher).
const APPOINTMENT_OVERRIDE: Record<
  'unbaptized_publisher' | 'student' | 'none',
  { bg: string; fg: string }
> = {
  unbaptized_publisher: { bg: '#ccfbf1', fg: '#115e59' },
  student: { bg: '#fef3c7', fg: '#92400e' },
  none: { bg: '#f1f5f9', fg: '#475569' },
};

const QK_USERS = ['users'] as const;

function formatRelativeTime(
  iso: string | null,
  t: (k: string, opts?: any) => string,
): string {
  if (!iso) return t('admin.users.neverLoggedIn');
  const now = Date.now();
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((now - then) / 1000));
  if (sec < 60) return t('common.time.justNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return t('common.time.minutesAgo', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('common.time.hoursAgo', { count: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t('common.time.daysAgo', { count: day });
  if (day < 365) {
    const month = Math.max(1, Math.floor(day / 30));
    return t('common.time.monthsAgo', { count: month });
  }
  const year = Math.floor(day / 365);
  return t('common.time.yearsAgo', { count: year });
}

export default function AdminUsersScreen() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();

  const usersQuery = useQuery({
    queryKey: QK_USERS,
    queryFn: () => usersApi.list(),
    refetchInterval: 30_000,
  });

  const users = usersQuery.data ?? [];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={usersQuery.isRefetching}
            onRefresh={() => usersQuery.refetch()}
          />
        }
      >
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>{t('admin.users.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {t('admin.users.countSummary', { count: users.length })}
          </Text>
        </View>

        <View style={styles.noteCard}>
          <Ionicons
            name="information-circle-outline"
            size={18}
            color="#0369a1"
          />
          <Text style={styles.noteText}>
            Список входов — только для просмотра. Выдать или изменить вход можно
            в разделе «Братья»: там логин привязывается к человеку, а роль
            ставится по его назначению.
          </Text>
        </View>

        {usersQuery.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(usersQuery.error)}
            </Text>
          </View>
        )}

        {usersQuery.isLoading ? (
          <ActivityIndicator size="large" style={{ marginTop: 32 }} />
        ) : users.length === 0 ? (
          <Text style={styles.empty}>{t('admin.users.noUsers')}</Text>
        ) : (
          users.map((u) => (
            <UserCard key={u.id} user={u} isSelf={u.id === currentUser?.id} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function UserCard({ user, isSelf }: { user: PublicUser; isSelf: boolean }) {
  const { t } = useTranslation();
  // The login role collapses unbaptized publishers, students and "none" all
  // into 'publisher'. On this list, show the real appointment for those so a
  // Student doesn't read as a Publisher. Admin (an explicit elevation) and the
  // elder/MS/publisher appointments keep their role badge.
  const override =
    user.role !== 'admin' &&
    (user.appointment === 'unbaptized_publisher' ||
      user.appointment === 'student' ||
      user.appointment === 'none')
      ? user.appointment
      : null;
  const roleColor = override
    ? APPOINTMENT_OVERRIDE[override]
    : ROLE_COLORS[user.role];
  const roleLabel = override
    ? t(`publishers.appointment.${override}`)
    : t(`admin.users.roles.${user.role}`);

  return (
    <View style={[styles.userCard, !user.isActive && styles.userCardInactive]}>
      <View style={styles.userCardHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.emailRow}>
            <Text
              style={styles.userEmail}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {user.email}
            </Text>
            {isSelf && (
              <View style={styles.selfBadge}>
                <Text style={styles.selfBadgeText}>{t('admin.users.you')}</Text>
              </View>
            )}
          </View>
          {user.online ? (
            <View style={styles.presenceRow}>
              <PresenceDot />
              <Text style={styles.onlineText}>{t('admin.users.online')}</Text>
            </View>
          ) : (
            <Text style={styles.lastLogin}>
              {formatRelativeTime(user.lastSeenAt ?? user.lastLoginAt, t)}
            </Text>
          )}
        </View>
        <View style={[styles.roleChip, { backgroundColor: roleColor.bg }]}>
          <Text style={[styles.roleChipText, { color: roleColor.fg }]}>
            {roleLabel}
          </Text>
        </View>
      </View>

      {!user.isActive && (
        <View style={styles.inactiveBanner}>
          <Ionicons name="ban" size={14} color="#991b1b" />
          <Text style={styles.inactiveText}>
            {t('admin.users.status.inactive')}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  headerBar: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#0f172a' },
  headerSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  noteCard: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    backgroundColor: '#e0f2fe',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 10,
  },
  noteText: { flex: 1, fontSize: 13, color: '#075985', lineHeight: 19 },
  errorBox: {
    backgroundColor: '#fef2f2',
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
  },
  errorText: { color: '#991b1b', fontSize: 14 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 32, fontSize: 14 },
  userCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  userCardInactive: { opacity: 0.6 },
  userCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userEmail: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
    flexShrink: 1,
  },
  selfBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selfBadgeText: { fontSize: 10, color: '#0369a1', fontWeight: '700' },
  lastLogin: { fontSize: 12, color: '#64748b', marginTop: 3 },
  presenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  onlineText: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  roleChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  roleChipText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  inactiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  inactiveText: { fontSize: 12, color: '#991b1b', fontWeight: '500' },
});
