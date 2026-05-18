import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../lib/auth';
import {
  CreateUserInput,
  PublicUser,
  UserRole,
  extractErrorMessage,
  usersApi,
} from '../../../lib/api';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_ORDER: UserRole[] = [
  'admin',
  'elder',
  'ministerial_servant',
  'publisher',
];

const ROLE_COLORS: Record<UserRole, { bg: string; fg: string }> = {
  admin: { bg: '#fee2e2', fg: '#991b1b' },
  elder: { bg: '#dbeafe', fg: '#1e40af' },
  ministerial_servant: { bg: '#e0e7ff', fg: '#3730a3' },
  publisher: { bg: '#dcfce7', fg: '#166534' },
};

const QK_USERS = ['users'] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidEmail(s: string): boolean {
  // Permissive client-side check; server is the source of truth.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

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
  return t('common.time.daysAgo', { count: day });
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function AdminUsersScreen() {
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [changeRoleFor, setChangeRoleFor] = useState<PublicUser | null>(null);
  const [resetPwFor, setResetPwFor] = useState<PublicUser | null>(null);

  const usersQuery = useQuery({
    queryKey: QK_USERS,
    queryFn: () => usersApi.list(),
  });

  const setActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? usersApi.activate(id) : usersApi.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_USERS }),
    onError: (err: unknown) =>
      Alert.alert(t('common.error'), extractErrorMessage(err)),
  });

  const confirmDeactivate = (u: PublicUser) =>
    Alert.alert(
      t('admin.users.deactivate.confirmTitle'),
      t('admin.users.deactivate.confirmBody', { email: u.email }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.users.deactivate.confirmAction'),
          style: 'destructive',
          onPress: () =>
            setActiveMutation.mutate({ id: u.id, isActive: false }),
        },
      ],
    );

  const confirmActivate = (u: PublicUser) =>
    Alert.alert(
      t('admin.users.activate.confirmTitle'),
      t('admin.users.activate.confirmBody', { email: u.email }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('admin.users.activate.confirmAction'),
          onPress: () =>
            setActiveMutation.mutate({ id: u.id, isActive: true }),
        },
      ],
    );

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

        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => setCreateOpen(true)}
        >
          <Ionicons name="person-add" size={18} color="#fff" />
          <Text style={styles.addButtonText}>{t('admin.users.addUser')}</Text>
        </Pressable>

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
            <UserCard
              key={u.id}
              user={u}
              isSelf={u.id === currentUser?.id}
              onChangeRole={() => setChangeRoleFor(u)}
              onResetPassword={() => setResetPwFor(u)}
              onToggleActive={() =>
                u.isActive ? confirmDeactivate(u) : confirmActivate(u)
              }
              actionsDisabled={setActiveMutation.isPending}
            />
          ))
        )}
      </ScrollView>

      <CreateUserModal
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: QK_USERS });
        }}
      />
      <ChangeRoleModal
        user={changeRoleFor}
        onClose={() => setChangeRoleFor(null)}
        onSuccess={() => {
          setChangeRoleFor(null);
          qc.invalidateQueries({ queryKey: QK_USERS });
        }}
      />
      <ResetPasswordModal
        user={resetPwFor}
        onClose={() => setResetPwFor(null)}
        onSuccess={() => setResetPwFor(null)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// User card
// ---------------------------------------------------------------------------

interface UserCardProps {
  user: PublicUser;
  isSelf: boolean;
  onChangeRole: () => void;
  onResetPassword: () => void;
  onToggleActive: () => void;
  actionsDisabled: boolean;
}

function UserCard({
  user,
  isSelf,
  onChangeRole,
  onResetPassword,
  onToggleActive,
  actionsDisabled,
}: UserCardProps) {
  const { t } = useTranslation();
  const roleColor = ROLE_COLORS[user.role];

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
          <Text style={styles.lastLogin}>
            {formatRelativeTime(user.lastLoginAt, t)}
          </Text>
        </View>
        <View style={[styles.roleChip, { backgroundColor: roleColor.bg }]}>
          <Text style={[styles.roleChipText, { color: roleColor.fg }]}>
            {t(`admin.users.roles.${user.role}`)}
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

      <View style={styles.actionsRow}>
        <ActionButton
          icon="shield-half-outline"
          label={t('admin.users.actions.changeRole')}
          onPress={onChangeRole}
          disabled={actionsDisabled || isSelf}
        />
        <ActionButton
          icon="key-outline"
          label={t('admin.users.actions.resetPassword')}
          onPress={onResetPassword}
          disabled={actionsDisabled}
        />
        <ActionButton
          icon={user.isActive ? 'eye-off-outline' : 'eye-outline'}
          label={
            user.isActive
              ? t('admin.users.actions.deactivate')
              : t('admin.users.actions.activate')
          }
          onPress={onToggleActive}
          disabled={actionsDisabled || isSelf}
          destructive={user.isActive}
        />
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  destructive,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const color = disabled ? '#cbd5e1' : destructive ? '#dc2626' : '#0ea5e9';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionBtn,
        pressed && !disabled && { backgroundColor: '#f1f5f9' },
      ]}
    >
      <Ionicons name={icon} size={16} color={color} />
      <Text
        style={[
          styles.actionBtnText,
          { color },
          disabled && { color: '#cbd5e1' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Create user modal
// ---------------------------------------------------------------------------

function CreateUserModal({
  visible,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('publisher');

  React.useEffect(() => {
    if (visible) {
      setEmail('');
      setPassword('');
      setRole('publisher');
    }
  }, [visible]);

  const createMutation = useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess,
    onError: (err: unknown) =>
      Alert.alert(t('common.error'), extractErrorMessage(err)),
  });

  const emailOk = isValidEmail(email);
  const passwordOk = password.length >= 8;
  const canSubmit = emailOk && passwordOk && !createMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    createMutation.mutate({
      email: email.trim().toLowerCase(),
      password,
      role,
    });
  };

  return (
    <ModalShell
      visible={visible}
      title={t('admin.users.create.title')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('admin.users.create.submit')}
      submitDisabled={!canSubmit}
      submitting={createMutation.isPending}
    >
      <FieldLabel>{t('admin.users.create.email')}</FieldLabel>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="name@example.org"
        placeholderTextColor="#94a3b8"
      />

      <FieldLabel>{t('admin.users.create.password')}</FieldLabel>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#94a3b8"
      />
      <Text style={styles.fieldHint}>
        {t('admin.users.create.passwordHint')}
      </Text>

      <FieldLabel>{t('admin.users.create.role')}</FieldLabel>
      <View style={styles.rolePickerCard}>
        {ROLE_ORDER.map((r, i) => (
          <Pressable
            key={r}
            onPress={() => setRole(r)}
            style={({ pressed }) => [
              styles.rolePickerRow,
              i > 0 && styles.rolePickerRowBorder,
              pressed && { backgroundColor: '#f1f5f9' },
            ]}
          >
            <View
              style={[
                styles.roleChip,
                { backgroundColor: ROLE_COLORS[r].bg, marginRight: 12 },
              ]}
            >
              <Text
                style={[styles.roleChipText, { color: ROLE_COLORS[r].fg }]}
              >
                {t(`admin.users.roles.${r}`)}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {role === r && (
              <Ionicons name="checkmark" size={20} color="#0ea5e9" />
            )}
          </Pressable>
        ))}
      </View>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Change role modal
// ---------------------------------------------------------------------------

function ChangeRoleModal({
  user,
  onClose,
  onSuccess,
}: {
  user: PublicUser | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [role, setRole] = useState<UserRole>('publisher');

  React.useEffect(() => {
    if (user) setRole(user.role);
  }, [user]);

  const mutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) =>
      usersApi.updateRole(id, role),
    onSuccess,
    onError: (err: unknown) =>
      Alert.alert(t('common.error'), extractErrorMessage(err)),
  });

  if (!user) return null;

  const changed = role !== user.role;
  const canSubmit = changed && !mutation.isPending;

  const performMutation = () => {
    mutation.mutate({ id: user.id, role });
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    // Extra warning when demoting an admin to a non-admin role.
    if (user.role === 'admin' && role !== 'admin') {
      Alert.alert(
        t('admin.users.changeRole.confirmDemoteAdmin'),
        t('admin.users.changeRole.confirmDemoteAdminBody', {
          email: user.email,
        }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('admin.users.changeRole.submit'),
            style: 'destructive',
            onPress: performMutation,
          },
        ],
      );
      return;
    }
    performMutation();
  };

  return (
    <ModalShell
      visible={!!user}
      title={t('admin.users.changeRole.title')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('admin.users.changeRole.submit')}
      submitDisabled={!canSubmit}
      submitting={mutation.isPending}
    >
      <Text style={styles.modalSubtitle}>
        {t('admin.users.changeRole.subtitle', {
          email: user.email,
          current: t(`admin.users.roles.${user.role}`),
        })}
      </Text>

      <View style={[styles.rolePickerCard, { marginTop: 16 }]}>
        {ROLE_ORDER.map((r, i) => (
          <Pressable
            key={r}
            onPress={() => setRole(r)}
            style={({ pressed }) => [
              styles.rolePickerRow,
              i > 0 && styles.rolePickerRowBorder,
              pressed && { backgroundColor: '#f1f5f9' },
            ]}
          >
            <View
              style={[
                styles.roleChip,
                { backgroundColor: ROLE_COLORS[r].bg, marginRight: 12 },
              ]}
            >
              <Text
                style={[styles.roleChipText, { color: ROLE_COLORS[r].fg }]}
              >
                {t(`admin.users.roles.${r}`)}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {role === r && (
              <Ionicons name="checkmark" size={20} color="#0ea5e9" />
            )}
          </Pressable>
        ))}
      </View>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Reset password modal
// ---------------------------------------------------------------------------

function ResetPasswordModal({
  user,
  onClose,
  onSuccess,
}: {
  user: PublicUser | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');

  React.useEffect(() => {
    if (user) setPassword('');
  }, [user]);

  const mutation = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      usersApi.resetPassword(id, password),
    onSuccess: () => {
      if (user) {
        Alert.alert(
          t('common.done'),
          t('admin.users.resetPassword.successMessage', { email: user.email }),
        );
      }
      onSuccess();
    },
    onError: (err: unknown) =>
      Alert.alert(t('common.error'), extractErrorMessage(err)),
  });

  if (!user) return null;

  const passwordOk = password.length >= 8;
  const canSubmit = passwordOk && !mutation.isPending;

  return (
    <ModalShell
      visible={!!user}
      title={t('admin.users.resetPassword.title')}
      onClose={onClose}
      onSubmit={() => {
        if (!canSubmit) return;
        mutation.mutate({ id: user.id, password });
      }}
      submitLabel={t('admin.users.resetPassword.submit')}
      submitDisabled={!canSubmit}
      submitting={mutation.isPending}
    >
      <Text style={styles.modalSubtitle}>
        {t('admin.users.resetPassword.subtitle', { email: user.email })}
      </Text>

      <FieldLabel style={{ marginTop: 16 }}>
        {t('admin.users.resetPassword.password')}
      </FieldLabel>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="#94a3b8"
      />
      <Text style={styles.fieldHint}>
        {t('admin.users.resetPassword.passwordHint')}
      </Text>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Generic modal shell
// ---------------------------------------------------------------------------

function ModalShell({
  visible,
  title,
  onClose,
  onSubmit,
  submitLabel,
  submitDisabled,
  submitting,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitDisabled: boolean;
  submitting: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f1f5f9' }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.modalHeaderCancel}>{t('common.cancel')}</Text>
            </Pressable>
            <Text style={styles.modalHeaderTitle} numberOfLines={1}>
              {title}
            </Text>
            <Pressable
              onPress={onSubmit}
              disabled={submitDisabled || submitting}
              hitSlop={10}
            >
              {submitting ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text
                  style={[
                    styles.modalHeaderSubmit,
                    submitDisabled && { color: '#cbd5e1' },
                  ]}
                >
                  {submitLabel}
                </Text>
              )}
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function FieldLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: any;
}) {
  return <Text style={[styles.fieldLabel, style]}>{children}</Text>;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  // Header
  headerBar: { paddingHorizontal: 20, paddingTop: 16 },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },

  // Add button
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 10,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Errors / empty
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
    marginTop: 14,
  },
  errorText: { color: '#991b1b', fontSize: 13 },
  empty: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 40,
    fontSize: 14,
  },

  // User card
  userCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  userCardInactive: { opacity: 0.65 },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userEmail: {
    fontSize: 15,
    fontWeight: '500',
    color: '#0f172a',
    flexShrink: 1,
  },
  lastLogin: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  selfBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selfBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  roleChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  roleChipText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  inactiveBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  inactiveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#991b1b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Actions row
  actionsRow: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '500',
  },

  // Modal
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    flex: 1,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  modalHeaderCancel: {
    fontSize: 15,
    color: '#64748b',
    minWidth: 60,
  },
  modalHeaderSubmit: {
    fontSize: 15,
    color: '#0ea5e9',
    fontWeight: '600',
    minWidth: 60,
    textAlign: 'right',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },

  // Fields
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 14,
  },
  fieldHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },

  // Role picker card
  rolePickerCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
  },
  rolePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rolePickerRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
});
