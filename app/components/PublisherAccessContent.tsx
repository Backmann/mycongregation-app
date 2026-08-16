import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { passwordProblem } from '../lib/password';
import { PasswordRules } from './PasswordRules';
import { Dialog } from './Dialog';
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
    // Shown in place by this form — keep it out of the error strip.
    meta: { inlineError: true },
    mutationFn: (input: GrantAccessInput) =>
      publishersApi.grantAccess(publisher.id, input),
    onSuccess: () => {
      setGrantOpen(false);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    // Shown in place by this form — keep it out of the error strip.
    meta: { inlineError: true },
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
    // Shown in place by this form — keep it out of the error strip.
    meta: { inlineError: true },
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
        <Text style={styles.rowLabel}>{t('publisherAccess.emailLabel')}</Text>
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

      <Dialog
        visible={inviteSent}
        title={t('publisherAccess.resendInviteTitle')}
        icon="checkmark-circle-outline"
        iconTint="#16a34a"
        iconBg="#dcfce7"
        confirmLabel={t('common.done')}
        onConfirm={() => setInviteSent(false)}
        onCancel={() => setInviteSent(false)}
      >
        <Text style={dialogText.body}>
          {t('publisherAccess.resendInviteBody', { email: access.email })}
        </Text>
      </Dialog>

      <Dialog
        visible={disableConfirm}
        title={t('publisherAccess.disableConfirmTitle')}
        icon="lock-closed-outline"
        iconTint="#dc2626"
        iconBg="#fee2e2"
        cancelLabel={t('publisherAccess.cancel')}
        confirmLabel={t('publisherAccess.disableConfirmYes')}
        confirmDanger
        pending={updateMutation.isPending}
        onConfirm={() => updateMutation.mutate({ isActive: false })}
        onCancel={() => setDisableConfirm(false)}
      >
        <Text style={dialogText.body}>
          {t('publisherAccess.disableConfirmBody', {
            name: publisher.displayName,
          })}
        </Text>
      </Dialog>
    </View>
  );
}



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
    <Dialog
      visible={visible}
      title={t('publisherAccess.changeEmail')}
      icon="mail-outline"
      cancelLabel={t('publisherAccess.cancel')}
      confirmLabel={t('publisherAccess.save')}
      confirmDisabled={!canSave}
      pending={pending}
      onConfirm={() => onSubmit(trimmed)}
      onCancel={onCancel}
    >
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
    </Dialog>
  );
}

const emailStyles = StyleSheet.create({
  rowBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pencil: { fontSize: 14, color: '#0369a1' },
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
  suggestBtn: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  suggestText: { fontSize: 13, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
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
  // Inviting by e-mail is the better default: the person sets their own
  // password and nobody has to pass one along by hand.
  const [sendInvite, setSendInvite] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (visible) {
      setEmail(defaultEmail);
      setPassword('');
      setIsAdmin(false);
      setSendInvite(true);
      setShowPassword(false);
    }
  }, [visible, defaultEmail]);

  // The address is the login, so it is required either way — the old check
  // ignored it unless an invitation was being sent, and an empty or malformed
  // address only failed once the server answered.
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordOk = !passwordProblem(password);
  const canSubmit = !pending && emailOk && (sendInvite || passwordOk);

  return (
    <Dialog
      visible={visible}
      title={t('publisherAccess.grant')}
      icon="key-outline"
      cancelLabel={t('publisherAccess.cancel')}
      confirmLabel={
        sendInvite ? t('publisherAccess.invite') : t('publisherAccess.create')
      }
      confirmDisabled={!canSubmit}
      pending={pending}
      onConfirm={() => onSubmit(email.trim(), password, isAdmin, sendInvite)}
      onCancel={onCancel}
      scroll
    >
                <Text style={grantStyles.label}>{t('publisherAccess.emailLabel')}</Text>
          <TextInput
            style={[grantStyles.input, email.length > 0 && !emailOk && grantStyles.inputBad]}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="name@example.org"
            placeholderTextColor="#94a3b8"
          />
          {email.length > 0 && !emailOk ? (
            <Text style={grantStyles.fieldHint}>
              {t('publisherAccess.emailInvalid')}
            </Text>
          ) : null}

          <Pressable
            style={grantStyles.optionRow}
            onPress={() => setSendInvite((v) => !v)}
          >
            <View style={{ flex: 1 }}>
              <Text style={grantStyles.optionTitle}>
                {t('publisherAccess.sendInvite')}
              </Text>
              <Text style={grantStyles.optionHint}>
                {sendInvite
                  ? t('publisherAccess.inviteHint')
                  : t('publisherAccess.manualHint')}
              </Text>
            </View>
            <Switch value={sendInvite} onValueChange={setSendInvite} />
          </Pressable>

          {sendInvite ? null : (
            <>
              <Text style={grantStyles.label}>
                {t('publisherAccess.password')}
              </Text>
              <View style={grantStyles.passwordWrap}>
                <TextInput
                  style={grantStyles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  placeholder={t('publisherAccess.passwordPlaceholder')}
                  placeholderTextColor="#94a3b8"
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={8}
                  style={grantStyles.eyeBtn}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color="#64748b"
                  />
                </Pressable>
              </View>
              <PasswordRules password={password} />
            </>
          )}

          <Pressable
            style={grantStyles.optionRow}
            onPress={() => setIsAdmin((v) => !v)}
          >
            <View style={{ flex: 1 }}>
              <Text style={grantStyles.optionTitle}>
                {t('publisherAccess.makeAdmin')}
              </Text>
              <Text style={grantStyles.optionHint}>
                {t('publisherAccess.roleHint')}
              </Text>
            </View>
            <Switch value={isAdmin} onValueChange={setIsAdmin} />
          </Pressable>

          {error ? (
            <View style={grantStyles.errorBox}>
              <Ionicons name="alert-circle-outline" size={15} color="#991b1b" />
              <Text style={grantStyles.errorText}>{error}</Text>
            </View>
          ) : null}

    </Dialog>
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

  const canSubmit = !passwordProblem(password) && !pending;

  return (
    <Dialog
      visible={visible}
      title={t('publisherAccess.resetPassword')}
      icon="lock-open-outline"
      cancelLabel={t('publisherAccess.cancel')}
      confirmLabel={t('publisherAccess.save')}
      confirmDisabled={!canSubmit}
      pending={pending}
      onConfirm={() => onSubmit(password)}
      onCancel={onCancel}
    >

          <Text style={styles.modalLabel}>{t('publisherAccess.newPassword')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder={t('publisherAccess.passwordPlaceholder')}
          />
          <PasswordRules password={password} />

          <Text style={styles.hint}>{t('publisherAccess.resetHint')}</Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}

    </Dialog>
  );
}

/** The grant-access dialog: same shapes as the app's forms — bordered inputs,
 *  13px labels, options as rows that explain themselves. */
const grantStyles = StyleSheet.create({
  card: { padding: 18, borderRadius: 18, gap: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  label: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  inputBad: { borderColor: '#fca5a5' },
  fieldHint: { fontSize: 12, color: '#b45309', marginTop: 5 },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingLeft: 12,
    paddingRight: 42,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  eyeBtn: { position: 'absolute', right: 12 },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e8edf3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 14,
    marginBottom: 2,
  },
  optionTitle: {
    fontSize: 14,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  optionHint: { fontSize: 12, color: '#64748b', lineHeight: 17, marginTop: 3 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginTop: 14,
  },
  errorText: { flex: 1, fontSize: 12.5, color: '#991b1b', lineHeight: 17 },
});

/** Body text inside a dialog. */
const dialogText = StyleSheet.create({
  body: { fontSize: 14, color: '#475569', lineHeight: 20 },
});

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
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
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
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
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
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
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
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
  },
});
