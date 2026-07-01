import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { extractErrorMessage, publishersApi } from '../lib/api';
import type { GrantAccessInput, Publisher } from '../lib/api';
import i18n from '../lib/i18n';

function formatLastLogin(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function PublisherAccessContent({ publisher }: { publisher: Publisher }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [grantOpen, setGrantOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [disableConfirm, setDisableConfirm] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);

  const accessQuery = useQuery({
    queryKey: ['publisher-access', publisher.id],
    queryFn: () => publishersApi.getAccess(publisher.id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ['publisher-access', publisher.id],
    });
    queryClient.invalidateQueries({ queryKey: ['publisher', publisher.id] });
  };

  const grantMutation = useMutation({
    mutationFn: (input: GrantAccessInput) =>
      publishersApi.grantAccess(publisher.id, input),
    onSuccess: () => {
      setGrantOpen(false);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: {
      email?: string;
      password?: string;
      isAdmin?: boolean;
      sendInvite?: boolean;
      isActive?: boolean;
      canViewPrivateData?: boolean;
    }) => publishersApi.updateAccess(publisher.id, input),
    onSuccess: () => {
      setResetOpen(false);
      setEmailOpen(false);
      setDisableConfirm(false);
      invalidate();
    },
  });

  const resendMutation = useMutation({
    mutationFn: () => publishersApi.resendInvite(publisher.id),
    onSuccess: () => {
      setInviteSent(true);
      invalidate();
    },
  });

  if (accessQuery.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  const access = accessQuery.data;

  if (!access || !access.hasAccess) {
    return (
      <View>
        <Text style={styles.muted}>
          {t('publisherAccess.noAccess')}
        </Text>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => setGrantOpen(true)}
        >
          <Text style={styles.primaryBtnText}>{t('publisherAccess.grant')}</Text>
        </Pressable>
        <GrantModal
          visible={grantOpen}
          defaultEmail={publisher.email ?? ''}
          pending={grantMutation.isPending}
          error={grantMutation.isError ? extractErrorMessage(grantMutation.error) : null}
          onCancel={() => {
            grantMutation.reset();
            setGrantOpen(false);
          }}
          onSubmit={(email, password, isAdmin, sendInvite) =>
            grantMutation.mutate({
              email: email || undefined,
              password: sendInvite ? undefined : password,
              isAdmin,
              sendInvite,
            })
          }
        />
      </View>
    );
  }

  // Admins and elders may view private data by role, regardless of the flag;
  // for any other role the flag is what grants it. Show the switch on for the
  // role-granted case but lock it, so it reads accurately without implying the
  // admin can revoke a role-based right here.
  const roleGrantsPrivate = access.role === 'admin' || access.role === 'elder';
  const privateAccessGranted =
    roleGrantsPrivate || access.canViewPrivateData === true;

  return (
    <View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Email</Text>
        <Pressable
          style={emailStyles.rowBtn}
          onPress={() => setEmailOpen(true)}
          hitSlop={6}
        >
          <Text style={styles.rowValue}>{access.email}</Text>
          <Text style={emailStyles.pencil}>✎</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('publisherAccess.lastLogin')}</Text>
        <Text style={styles.rowValue}>
          {formatLastLogin(access.lastLoginAt) ?? t('publisherAccess.neverLoggedIn')}
        </Text>
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.rowLabel}>{t('publisherAccess.admin')}</Text>
        <Switch
          value={access.role === 'admin'}
          onValueChange={(v) => updateMutation.mutate({ isAdmin: v })}
          disabled={updateMutation.isPending}
        />
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.rowLabel}>{t('publisherAccess.privateData')}</Text>
        <Switch
          value={privateAccessGranted}
          onValueChange={(v) =>
            updateMutation.mutate({ canViewPrivateData: v })
          }
          disabled={updateMutation.isPending || roleGrantsPrivate}
        />
      </View>
      {roleGrantsPrivate ? (
        <Text style={styles.disabledNote}>
          {t('publisherAccess.privateDataByRole')}
        </Text>
      ) : (
        <Text style={styles.hint}>
          {t('publisherAccess.privateDataDesc')}
        </Text>
      )}

      {!access.isActive && (
        <Text style={styles.disabledNote}>{t('publisherAccess.disabled')}</Text>
      )}

      {updateMutation.isError && (
        <Text style={styles.error}>{extractErrorMessage(updateMutation.error)}</Text>
      )}

      <Pressable
        style={styles.secondaryBtn}
        onPress={() => setResetOpen(true)}
      >
        <Text style={styles.secondaryBtnText}>{t('publisherAccess.resetPassword')}</Text>
      </Pressable>

      <Pressable
        style={styles.secondaryBtn}
        onPress={() => resendMutation.mutate()}
        disabled={resendMutation.isPending}
      >
        {resendMutation.isPending ? (
          <View style={styles.btnRow}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.secondaryBtnText}>
              {t('publisherAccess.resendInviteSending')}
            </Text>
          </View>
        ) : (
          <Text style={styles.secondaryBtnText}>
            {t('publisherAccess.resendInvite')}
          </Text>
        )}
      </Pressable>

      <Pressable
        style={styles.secondaryBtn}
        onPress={() =>
          access.isActive
            ? setDisableConfirm(true)
            : updateMutation.mutate({ isActive: true })
        }
        disabled={updateMutation.isPending}
      >
        <Text
          style={[
            styles.secondaryBtnText,
            access.isActive && styles.dangerText,
          ]}
        >
          {access.isActive ? t('publisherAccess.disableAccess') : t('publisherAccess.enableAccess')}
        </Text>
      </Pressable>

      <EmailModal
        visible={emailOpen}
        current={access.email}
        suggestion={publisher.email}
        pending={updateMutation.isPending}
        error={
          updateMutation.isError
            ? extractErrorMessage(updateMutation.error)
            : null
        }
        onCancel={() => {
          updateMutation.reset();
          setEmailOpen(false);
        }}
        onSubmit={(email) => updateMutation.mutate({ email })}
      />
      <ResetModal
        visible={resetOpen}
        pending={updateMutation.isPending}
        error={updateMutation.isError ? extractErrorMessage(updateMutation.error) : null}
        onCancel={() => {
          updateMutation.reset();
          setResetOpen(false);
        }}
        onSubmit={(password) => updateMutation.mutate({ password })}
      />

      <Modal
        visible={inviteSent}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteSent(false)}
      >
        <View style={sentStyles.overlay}>
          <View style={sentStyles.card}>
            <View style={sentStyles.iconCircle}>
              <Ionicons name="checkmark" size={34} color="#fff" />
            </View>
            <Text style={sentStyles.title}>
              {t('publisherAccess.resendInviteTitle')}
            </Text>
            <Text style={sentStyles.body}>
              {t('publisherAccess.resendInviteBody', { email: access.email })}
            </Text>
            <Pressable
              style={sentStyles.btn}
              onPress={() => setInviteSent(false)}
            >
              <Text style={sentStyles.btnText}>{t('common.done')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={disableConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setDisableConfirm(false)}
      >
        <View style={sentStyles.overlay}>
          <View style={sentStyles.card}>
            <View style={confirmStyles.iconCircle}>
              <Ionicons name="lock-closed" size={30} color="#dc2626" />
            </View>
            <Text style={sentStyles.title}>
              {t('publisherAccess.disableConfirmTitle')}
            </Text>
            <Text style={sentStyles.body}>
              {t('publisherAccess.disableConfirmBody', {
                name: publisher.displayName,
              })}
            </Text>
            <View style={confirmStyles.row}>
              <Pressable
                style={confirmStyles.cancel}
                onPress={() => setDisableConfirm(false)}
              >
                <Text style={confirmStyles.cancelText}>
                  {t('publisherAccess.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={confirmStyles.danger}
                onPress={() => updateMutation.mutate({ isActive: false })}
                disabled={updateMutation.isPending}
              >
                <Text style={confirmStyles.dangerText}>
                  {t('publisherAccess.disableAccess')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const confirmStyles = StyleSheet.create({
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  row: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  cancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#475569' },
  danger: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    alignItems: 'center',
  },
  dangerText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

const sentStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 26,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  btn: {
    alignSelf: 'stretch',
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

function EmailModal({
  visible,
  current,
  suggestion,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  current: string | null;
  suggestion?: string | null;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (email: string) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(current ?? '');

  useEffect(() => {
    if (visible) setEmail(current ?? '');
  }, [visible, current]);

  const trimmed = email.trim();
  const canSave =
    /.+@.+\..+/.test(trimmed) &&
    trimmed.toLowerCase() !== (current ?? '').toLowerCase();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={emailStyles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
        />
        <View style={emailStyles.card}>
          <Text style={emailStyles.title}>{t('publisherAccess.changeEmail')}</Text>
          <Text style={emailStyles.hint}>
            {t('publisherAccess.changeEmailDesc')}
          </Text>
          <TextInput
            style={emailStyles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="email@example.com"
            placeholderTextColor="#94a3b8"
          />
          {suggestion &&
            suggestion.trim() !== '' &&
            suggestion.trim().toLowerCase() !==
              (current ?? '').toLowerCase() && (
              <Pressable
                style={emailStyles.suggestBtn}
                onPress={() => setEmail(suggestion.trim())}
              >
                <Text style={emailStyles.suggestText}>
                  {t('publisherAccess.fromCard', { value: suggestion.trim() })}
                </Text>
              </Pressable>
            )}
          {error && <Text style={emailStyles.error}>{error}</Text>}
          <View style={emailStyles.actions}>
            <Pressable
              style={emailStyles.cancel}
              onPress={onCancel}
              disabled={pending}
            >
              <Text style={emailStyles.cancelText}>{t('publisherAccess.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[
                emailStyles.confirm,
                (!canSave || pending) && emailStyles.disabled,
              ]}
              onPress={() => onSubmit(trimmed)}
              disabled={!canSave || pending}
            >
              <Text style={emailStyles.confirmText}>{t('publisherAccess.save')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const emailStyles = StyleSheet.create({
  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pencil: { fontSize: 14, color: '#0369a1' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    gap: 10,
  },
  title: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  hint: { fontSize: 13, color: '#64748b', lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  error: { fontSize: 13, color: '#dc2626' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 4,
  },
  cancel: { paddingVertical: 10, paddingHorizontal: 14 },
  cancelText: { fontSize: 15, color: '#64748b', fontWeight: '600' },
  confirm: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#0ea5e9',
  },
  confirmText: { fontSize: 15, color: '#fff', fontWeight: '600' },
  disabled: { opacity: 0.5 },
  suggestBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestText: { fontSize: 13, color: '#0369a1', fontWeight: '600' },
});

function GrantModal({
  visible,
  defaultEmail,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  defaultEmail: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (
    email: string,
    password: string,
    isAdmin: boolean,
    sendInvite: boolean,
  ) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [sendInvite, setSendInvite] = useState(false);

  useEffect(() => {
    if (visible) {
      setEmail(defaultEmail);
      setPassword('');
      setIsAdmin(false);
      setSendInvite(false);
    }
  }, [visible, defaultEmail]);

  const canSubmit =
    !pending &&
    (sendInvite ? email.trim().includes('@') : password.length >= 8);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
        />
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{t('publisherAccess.grant')}</Text>

          <Text style={styles.modalLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="name@example.org"
          />

          <View style={styles.switchRow}>
            <Text style={styles.rowLabel}>{t('publisherAccess.sendInvite')}</Text>
            <Switch value={sendInvite} onValueChange={setSendInvite} />
          </View>
          {sendInvite ? null : (
            <>
              <Text style={styles.modalLabel}>{t('publisherAccess.password')}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder={t('publisherAccess.min8')}
              />
            </>
          )}

          <View style={styles.switchRow}>
            <Text style={styles.rowLabel}>{t('publisherAccess.makeAdmin')}</Text>
            <Switch value={isAdmin} onValueChange={setIsAdmin} />
          </View>

          <Text style={styles.hint}>
            {sendInvite
              ? t('publisherAccess.inviteHint')
              : t('publisherAccess.manualHint')}
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.modalBtns}>
            <Pressable style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>{t('publisherAccess.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalOk, !canSubmit && styles.modalOkDisabled]}
              disabled={!canSubmit}
              onPress={() => onSubmit(email.trim(), password, isAdmin, sendInvite)}
            >
              <Text style={styles.modalOkText}>
                {pending ? '…' : sendInvite ? t('publisherAccess.invite') : t('publisherAccess.create')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ResetModal({
  visible,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (visible) setPassword('');
  }, [visible]);

  const canSubmit = password.length >= 8 && !pending;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
        />
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>{t('publisherAccess.resetPassword')}</Text>

          <Text style={styles.modalLabel}>{t('publisherAccess.newPassword')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={t('publisherAccess.min8')}
          />

          <Text style={styles.hint}>{t('publisherAccess.resetHint')}</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.modalBtns}>
            <Pressable style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>{t('publisherAccess.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[styles.modalOk, !canSubmit && styles.modalOkDisabled]}
              disabled={!canSubmit}
              onPress={() => onSubmit(password)}
            >
              <Text style={styles.modalOkText}>
                {pending ? '…' : t('publisherAccess.save')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 16,
    alignItems: 'flex-start',
  },
  muted: {
    fontSize: 15,
    color: '#6b7280',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  rowLabel: {
    fontSize: 15,
    color: '#374151',
    flexShrink: 1,
    paddingRight: 12,
  },
  rowValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  disabledNote: {
    fontSize: 13,
    color: '#b45309',
    marginTop: 4,
    marginBottom: 4,
  },
  primaryBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dangerText: {
    color: '#dc2626',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    marginTop: 8,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 6,
    marginTop: 8,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  hint: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 12,
  },
  modalBtns: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
    gap: 12,
  },
  modalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  modalCancelText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOk: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  modalOkDisabled: {
    backgroundColor: '#93c5fd',
  },
  modalOkText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
