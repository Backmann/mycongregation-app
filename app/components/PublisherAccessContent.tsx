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
  // An empty field removes the address, which is a real thing to ask for now
  // that an account does not need one.
  const canSave =
    (trimmed === '' || /.+@.+\..+/.test(trimmed)) &&
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
          <Text style={emailStyles.hint}>
            {t('publisherAccess.emailMayBeEmpty')}
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
    saveEmailToCard?: boolean;
  }) => void;
}) {
  const { t } = useTranslation();
  const cardEmail = defaultEmail.trim();
  const hasCardEmail = cardEmail !== '';

  /**
   * Two ways, not three.
   *
   * It used to offer «his own address», «another address» and «in person», and
   * the first two differed only in a caption — what actually matters is where
   * the letter goes and whether that address belongs on the card. Worse, the
   * first was greyed out for anybody whose card holds no address, which is
   * most of this congregation: the form then opened on «in person», quietly
   * recommending the fallback. A letter is the ordinary way, so a letter is
   * what this opens on, with the field ready to be typed into.
   */
  const [byMail, setByMail] = useState(true);
  const [email, setEmail] = useState(cardEmail);
  const [loginName, setLoginName] = useState(suggestedLoginName);
  const [isAdmin, setIsAdmin] = useState(false);
  const [saveToCard, setSaveToCard] = useState(true);

  useEffect(() => {
    if (visible) {
      setByMail(true);
      setEmail(cardEmail);
      setLoginName(suggestedLoginName);
      setIsAdmin(false);
      setSaveToCard(!hasCardEmail);
    }
  }, [visible, cardEmail, hasCardEmail, suggestedLoginName]);

  const address = email.trim();
  const addressOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
  const nameProblem = loginNameProblem(loginName);
  const canSubmit = !pending && !nameProblem && (!byMail || addressOk);
  // Only ever offered for an empty card: replacing somebody's contact address
  // behind their back is not a thing a checkbox should do quietly.
  const offerSave = byMail && !hasCardEmail && addressOk;

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
          email: byMail ? address : undefined,
          loginName: loginName.trim().toLowerCase(),
          isAdmin,
          saveEmailToCard: offerSave && saveToCard,
        })
      }
      onCancel={onCancel}
      scroll
    >
      <Text style={g.sectionLabel}>{t('publisherAccess.loginNameLabel')}</Text>
      <TextInput
        style={[g.input, !!nameProblem && g.inputBad]}
        value={loginName}
        onChangeText={setLoginName}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={suggestedLoginName}
        placeholderTextColor="#94a3b8"
      />
      {nameProblem ? (
        <View style={g.warnRow}>
          <Ionicons name="alert-circle-outline" size={14} color="#b45309" />
          <Text style={g.warnText}>
            {t(`loginName.problem.${nameProblem}`, {
              min: LOGIN_NAME_MIN,
              max: LOGIN_NAME_MAX,
            })}
          </Text>
        </View>
      ) : (
        <Text style={g.hint}>{t('publisherAccess.loginNameHint')}</Text>
      )}

      <Text style={[g.sectionLabel, g.sectionGap]}>
        {t('publisherAccess.deliveryLabel')}
      </Text>

      <Pressable
        style={[g.choice, byMail && g.choiceOn]}
        onPress={() => setByMail(true)}
      >
        <View style={g.choiceHead}>
          <Ionicons
            name={byMail ? 'radio-button-on' : 'radio-button-off'}
            size={18}
            color={byMail ? '#2563eb' : '#94a3b8'}
          />
          <View style={{ flex: 1 }}>
            <Text style={g.choiceTitle}>
              {t('publisherAccess.deliveryByMail')}
            </Text>
            <Text style={g.choiceHint}>
              {t('publisherAccess.deliveryByMailHint')}
            </Text>
          </View>
        </View>

        {byMail ? (
          <View style={g.choiceBody}>
            <TextInput
              style={[
                g.input,
                address !== '' && !addressOk && g.inputBad,
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
            {hasCardEmail ? (
              <Text style={g.hint}>{t('publisherAccess.fromCardNote')}</Text>
            ) : (
              <Text style={g.hint}>{t('publisherAccess.notOnCardNote')}</Text>
            )}

            {offerSave ? (
              <Pressable style={g.check} onPress={() => setSaveToCard((v) => !v)}>
                <Ionicons
                  name={saveToCard ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={saveToCard ? '#2563eb' : '#94a3b8'}
                />
                <View style={{ flex: 1 }}>
                  <Text style={g.checkTitle}>
                    {t('publisherAccess.saveToCard')}
                  </Text>
                  <Text style={g.choiceHint}>
                    {t('publisherAccess.saveToCardHint')}
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      <Pressable
        style={[g.choice, !byMail && g.choiceOn]}
        onPress={() => setByMail(false)}
      >
        <View style={g.choiceHead}>
          <Ionicons
            name={!byMail ? 'radio-button-on' : 'radio-button-off'}
            size={18}
            color={!byMail ? '#2563eb' : '#94a3b8'}
          />
          <View style={{ flex: 1 }}>
            <Text style={g.choiceTitle}>
              {t('publisherAccess.deliveryInPerson')}
            </Text>
            <Text style={g.choiceHint}>
              {t('publisherAccess.deliveryInPersonHint')}
            </Text>
          </View>
        </View>
      </Pressable>

      <Pressable style={g.adminRow} onPress={() => setIsAdmin((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={g.choiceTitle}>{t('publisherAccess.makeAdmin')}</Text>
          <Text style={g.choiceHint}>{t('publisherAccess.roleHint')}</Text>
        </View>
        <Switch value={isAdmin} onValueChange={setIsAdmin} />
      </Pressable>

      {error ? (
        <View style={g.errorBox}>
          <Ionicons name="alert-circle-outline" size={15} color="#991b1b" />
          <Text style={g.errorText}>{error}</Text>
        </View>
      ) : null}
    </Dialog>
  );
}

/**
 * The grant dialog's own shapes. Sections announce themselves in small caps,
 * each choice is a card that holds its own fields when chosen, and hints sit
 * under what they explain rather than at the foot of the form.
 */
const g = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 8,
  },
  sectionGap: { marginTop: 22 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  inputBad: { borderColor: '#fca5a5', backgroundColor: '#fff7f7' },
  hint: { fontSize: 12, color: '#94a3b8', lineHeight: 17, marginTop: 7 },
  warnRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 7 },
  warnText: { flex: 1, fontSize: 12, color: '#b45309', lineHeight: 17 },
  choice: {
    borderWidth: 1,
    borderColor: '#e8edf3',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    padding: 13,
    marginBottom: 10,
  },
  choiceOn: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  choiceHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  choiceTitle: {
    fontSize: 14.5,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  choiceHint: { fontSize: 12, color: '#64748b', lineHeight: 17, marginTop: 3 },
  choiceBody: { marginTop: 12, gap: 0 },
  check: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#dbeafe',
  },
  checkTitle: {
    fontSize: 13.5,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  adminRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eef2f6',
    paddingTop: 16,
    marginTop: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginTop: 16,
  },
  errorText: { flex: 1, fontSize: 12.5, color: '#991b1b', lineHeight: 17 },
});

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
        style={[g.input, !!problem && g.inputBad]}
        value={value}
        onChangeText={setValue}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={suggestion}
        placeholderTextColor="#94a3b8"
      />
      {problem ? (
        <Text style={g.warnText}>
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
