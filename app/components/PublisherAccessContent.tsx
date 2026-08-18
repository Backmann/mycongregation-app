import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Share,
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
import { passwordProblem, PASSWORD_MIN_LENGTH } from '../lib/password';
import {
  loginNameProblem,
  loginNameRefusal,
  LOGIN_NAME_MAX,
  LOGIN_NAME_MIN,
} from '../lib/login-name';
import { PasswordRules } from './PasswordRules';
import { Dialog } from './Dialog';
import type { AccessSummary, GrantAccessInput, Publisher } from '../lib/api';
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
  const [loginNameOpen, setLoginNameOpen] = useState(false);
  /**
   * The code lives here and nowhere else: the server stores only its hash, so
   * once this is cleared it cannot be shown again — a new one has to be issued,
   * which kills this one. The dialog says so.
   */
  const [issued, setIssued] = useState<AccessSummary | null>(null);

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
    onSuccess: (summary) => {
      setGrantOpen(false);
      setIssued(summary);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    // Shown in place by this form — keep it out of the error strip.
    meta: { inlineError: true },
    mutationFn: (input: {
      email?: string;
      loginName?: string;
      password?: string;
      isAdmin?: boolean;
      isActive?: boolean;
      canViewPrivateData?: boolean;
    }) => publishersApi.updateAccess(publisher.id, input),
    onSuccess: () => {
      setResetOpen(false);
      setEmailOpen(false);
      setLoginNameOpen(false);
      setDisableConfirm(false);
      invalidate();
    },
  });

  const resendMutation = useMutation({
    // Shown in place by this form — keep it out of the error strip.
    meta: { inlineError: true },
    mutationFn: () => publishersApi.resendInvite(publisher.id),
    onSuccess: (summary) => {
      setIssued(summary);
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
          suggestedLoginName={access?.suggestedLoginName ?? ''}
          pending={grantMutation.isPending}
          error={
            grantMutation.isError
              ? (loginNameRefusal(grantMutation.error, t) ??
                extractErrorMessage(grantMutation.error))
              : null
          }
          onCancel={() => {
            grantMutation.reset();
            setGrantOpen(false);
          }}
          onSubmit={(input) =>
            grantMutation.mutate({ ...input, sendInvite: true })
          }
        />
        <InviteResultDialog
          visible={issued !== null}
          name={publisher.displayName}
          code={issued?.inviteCode ?? null}
          sentTo={issued?.inviteSentTo ?? null}
          expiresAt={issued?.inviteExpiresAt ?? null}
          onClose={() => setIssued(null)}
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
        <Text style={styles.rowLabel}>
          {t('publisherAccess.loginNameRow')}
        </Text>
        <Pressable
          style={emailStyles.rowBtn}
          onPress={() => setLoginNameOpen(true)}
          hitSlop={6}
        >
          <Text style={styles.rowValue} selectable>
            {access.loginName ?? '—'}
          </Text>
          <Text style={emailStyles.pencil}>✎</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Text style={styles.rowLabel}>{t('publisherAccess.emailLabel')}</Text>
        <Pressable
          style={emailStyles.rowBtn}
          onPress={() => setEmailOpen(true)}
          hitSlop={6}
        >
          <Text style={styles.rowValue}>
            {access.email ?? t('publisherAccess.noEmail')}
          </Text>
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
            {t('publisherAccess.newCode')}
          </Text>
        )}
      </Pressable>
      <Text style={styles.hint}>{t('publisherAccess.newCodeHint')}</Text>

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

      <LoginNameModal
        visible={loginNameOpen}
        current={access.loginName}
        suggestion={access.suggestedLoginName}
        pending={updateMutation.isPending}
        error={
          updateMutation.isError
            ? (loginNameRefusal(updateMutation.error, t) ??
              extractErrorMessage(updateMutation.error))
            : null
        }
        onCancel={() => {
          updateMutation.reset();
          setLoginNameOpen(false);
        }}
        onSubmit={(loginName) => updateMutation.mutate({ loginName })}
      />
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

      <InviteResultDialog
        visible={issued !== null}
        name={publisher.displayName}
        code={issued?.inviteCode ?? null}
        sentTo={issued?.inviteSentTo ?? null}
        expiresAt={issued?.inviteExpiresAt ?? null}
        onClose={() => setIssued(null)}
      />

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

/**
 * Handing somebody the way in.
 *
 * Rebuilt around what the invitation actually is now: a code. An address is
 * one way to deliver that code and no longer the thing that identifies the
 * person, so the form asks two separate questions instead of one confused one
 * — what shall this person be called, and where (if anywhere) shall the code
 * be sent.
 *
 * The «set a password yourself» path is gone from here on purpose. It existed
 * because invitations did not work, and it is what led to one man's own
 * password being handed round the congregation. Setting a password by hand is
 * still possible afterwards, on the card, where it reads as the repair it is.
 */
type Delivery = 'own' | 'other' | 'inPerson';

function GrantModal({
  visible,
  defaultEmail,
  suggestedLoginName,
  pending,
  error,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  defaultEmail: string;
  suggestedLoginName: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: {
    email?: string;
    loginName: string;
    isAdmin: boolean;
  }) => void;
}) {
  const { t } = useTranslation();
  const hasOwnAddress = defaultEmail.trim() !== '';
  const [delivery, setDelivery] = useState<Delivery>(
    hasOwnAddress ? 'own' : 'inPerson',
  );
  const [email, setEmail] = useState('');
  const [loginName, setLoginName] = useState(suggestedLoginName);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (visible) {
      setDelivery(hasOwnAddress ? 'own' : 'inPerson');
      setEmail('');
      setLoginName(suggestedLoginName);
      setIsAdmin(false);
    }
  }, [visible, hasOwnAddress, suggestedLoginName]);

  const address =
    delivery === 'own'
      ? defaultEmail.trim()
      : delivery === 'other'
        ? email.trim()
        : '';
  const addressOk =
    delivery === 'inPerson' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
  const nameProblem = loginNameProblem(loginName);
  const canSubmit = !pending && addressOk && !nameProblem;

  const options: { key: Delivery; title: string; hint: string }[] = [
    {
      key: 'own',
      title: hasOwnAddress
        ? t('publisherAccess.deliveryOwn', { email: defaultEmail.trim() })
        : t('publisherAccess.deliveryOwnMissing'),
      hint: t('publisherAccess.deliveryOwnHint'),
    },
    {
      key: 'other',
      title: t('publisherAccess.deliveryOther'),
      hint: t('publisherAccess.deliveryOtherHint'),
    },
    {
      key: 'inPerson',
      title: t('publisherAccess.deliveryInPerson'),
      hint: t('publisherAccess.deliveryInPersonHint'),
    },
  ];

  return (
    <Dialog
      visible={visible}
      title={t('publisherAccess.grant')}
      icon="key-outline"
      cancelLabel={t('publisherAccess.cancel')}
      confirmLabel={t('publisherAccess.invite')}
      confirmDisabled={!canSubmit}
      pending={pending}
      onConfirm={() =>
        onSubmit({
          email: address === '' ? undefined : address,
          loginName: loginName.trim().toLowerCase(),
          isAdmin,
        })
      }
      onCancel={onCancel}
      scroll
    >
      <Text style={grantStyles.label}>
        {t('publisherAccess.loginNameLabel')}
      </Text>
      <TextInput
        style={[grantStyles.input, !!nameProblem && grantStyles.inputBad]}
        value={loginName}
        onChangeText={setLoginName}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={suggestedLoginName}
        placeholderTextColor="#94a3b8"
      />
      {nameProblem ? (
        <Text style={grantStyles.fieldHint}>
          {t(`loginName.problem.${nameProblem}`, {
            min: LOGIN_NAME_MIN,
            max: LOGIN_NAME_MAX,
          })}
        </Text>
      ) : (
        <Text style={grantStyles.optionHint}>
          {t('publisherAccess.loginNameHint')}
        </Text>
      )}

      <Text style={[grantStyles.label, grantStyles.sectionLabel]}>
        {t('publisherAccess.deliveryLabel')}
      </Text>
      {options.map((o) => {
        const chosen = delivery === o.key;
        const unavailable = o.key === 'own' && !hasOwnAddress;
        return (
          <Pressable
            key={o.key}
            style={[
              grantStyles.choiceRow,
              chosen && grantStyles.choiceRowOn,
              unavailable && grantStyles.choiceRowOff,
            ]}
            disabled={unavailable}
            onPress={() => setDelivery(o.key)}
          >
            <Ionicons
              name={chosen ? 'radio-button-on' : 'radio-button-off'}
              size={18}
              color={chosen ? '#2563eb' : '#94a3b8'}
            />
            <View style={{ flex: 1 }}>
              <Text style={grantStyles.optionTitle}>{o.title}</Text>
              <Text style={grantStyles.optionHint}>{o.hint}</Text>
            </View>
          </Pressable>
        );
      })}

      {delivery === 'other' ? (
        <TextInput
          style={[
            grantStyles.input,
            grantStyles.otherInput,
            email.length > 0 && !addressOk && grantStyles.inputBad,
          ]}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="name@example.org"
          placeholderTextColor="#94a3b8"
        />
      ) : null}

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

/**
 * The code, at the one moment it can be shown.
 *
 * Only a hash of it is stored, so this dialog is not a view of something that
 * can be looked at again — it is the single sight of it. Which is why the way
 * onward is «send it now», through the sheet the phone already has, rather
 * than «copy» and hope it is still on the clipboard later.
 */
function InviteResultDialog({
  visible,
  name,
  code,
  sentTo,
  expiresAt,
  onClose,
}: {
  visible: boolean;
  name: string;
  code: string | null;
  sentTo: string | null;
  expiresAt: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  if (!code) return null;

  const until = expiresAt
    ? new Date(expiresAt).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'long',
      })
    : null;

  const message = t('publisherAccess.inviteMessage', {
    name,
    code,
    until: until ?? '',
    url: 'mycongregation.org/app/',
  });

  return (
    <Dialog
      visible={visible}
      title={t('publisherAccess.inviteReadyTitle')}
      icon="key-outline"
      iconTint="#0369a1"
      iconBg="#e0f2fe"
      confirmLabel={t('common.done')}
      onConfirm={onClose}
      onCancel={onClose}
      scroll
    >
      <Text style={dialogText.body}>
        {sentTo
          ? t('publisherAccess.inviteSentTo', { email: sentTo })
          : t('publisherAccess.inviteNotSent')}
      </Text>

      <View style={codeStyles.codeBox}>
        <Text style={codeStyles.code} selectable>
          {code}
        </Text>
      </View>
      {until ? (
        <Text style={codeStyles.until}>
          {t('publisherAccess.inviteUntil', { until })}
        </Text>
      ) : null}

      <Pressable
        style={codeStyles.shareBtn}
        onPress={() => {
          void Share.share({ message });
        }}
      >
        <Ionicons name="paper-plane-outline" size={16} color="#fff" />
        <Text style={codeStyles.shareText}>
          {t('publisherAccess.inviteShare')}
        </Text>
      </Pressable>

      <Text style={codeStyles.warning}>
        {t('publisherAccess.inviteOnlyOnce')}
      </Text>
    </Dialog>
  );
}

/** Correcting the name — the same rule and the same endpoint as the users screen. */
function LoginNameModal({
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
  suggestion: string;
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (loginName: string) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(current ?? suggestion);

  useEffect(() => {
    if (visible) setValue(current ?? suggestion);
  }, [visible, current, suggestion]);

  const problem = loginNameProblem(value);
  const canSave =
    !problem && value.trim().toLowerCase() !== (current ?? '').toLowerCase();

  return (
    <Dialog
      visible={visible}
      title={t('publisherAccess.changeLoginName')}
      icon="person-outline"
      cancelLabel={t('publisherAccess.cancel')}
      confirmLabel={t('publisherAccess.save')}
      confirmDisabled={!canSave}
      pending={pending}
      onConfirm={() => onSubmit(value.trim().toLowerCase())}
      onCancel={onCancel}
    >
      <Text style={dialogText.body}>
        {t('publisherAccess.changeLoginNameDesc')}
      </Text>
      <TextInput
        style={[grantStyles.input, !!problem && grantStyles.inputBad]}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={suggestion}
        placeholderTextColor="#94a3b8"
      />
      {problem ? (
        <Text style={grantStyles.fieldHint}>
          {t(`loginName.problem.${problem}`, {
            min: LOGIN_NAME_MIN,
            max: LOGIN_NAME_MAX,
          })}
        </Text>
      ) : null}
      {suggestion !== '' &&
      suggestion !== (current ?? '') &&
      suggestion !== value ? (
        <Pressable
          style={emailStyles.suggestBtn}
          onPress={() => setValue(suggestion)}
        >
          <Text style={emailStyles.suggestText}>
            {t('publisherAccess.fromCard', { value: suggestion })}
          </Text>
        </Pressable>
      ) : null}
      {error ? <Text style={emailStyles.error}>{error}</Text> : null}
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
            placeholder={t('publisherAccess.passwordPlaceholder', {
              count: PASSWORD_MIN_LENGTH,
            })}
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
  sectionLabel: { marginTop: 18 },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e8edf3',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
  },
  choiceRowOn: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  choiceRowOff: { opacity: 0.45 },
  otherInput: { marginTop: 2 },
});

/** The code itself: large, spaced, and impossible to mistake for body text. */
const codeStyles = StyleSheet.create({
  codeBox: {
    marginTop: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    paddingVertical: 18,
    alignItems: 'center',
  },
  code: {
    fontSize: 30,
    letterSpacing: 3,
    color: '#0c4a6e',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  until: {
    marginTop: 8,
    fontSize: 12.5,
    color: '#64748b',
    textAlign: 'center',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 12,
  },
  shareText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  warning: {
    marginTop: 12,
    fontSize: 12.5,
    color: '#b45309',
    lineHeight: 18,
  },
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
