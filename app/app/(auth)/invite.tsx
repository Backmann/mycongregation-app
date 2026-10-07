import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi, extractErrorMessage } from '../../lib/api';
import type { LoginResponse } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { adoptLanguage } from '../../lib/i18n';
import { LanguagePills } from '../../components/LanguagePills';
import {
  passwordProblem,
  suggestPassword,
  weakPasswordProblem,
  inviteRefusal,
} from '../../lib/password';
import { PasswordRules } from '../../components/PasswordRules';

/**
 * The code as the reader will type it: any case, hyphen or not, spaces from
 * whatever the mail client did to it. The server forgives all of that too —
 * this is only so the field looks tidy while being typed.
 */
function tidy(input: string): string {
  const bare = input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return bare.length > 4 ? `${bare.slice(0, 4)}-${bare.slice(4)}` : bare;
}

export default function InviteScreen() {
  const { t } = useTranslation();
  const { adoptSession } = useAuth();

  /**
   * `code` — typed in for the reader by the button in the letter. The button
   * signs nobody in (7 October 2026): it only opens this screen, here, with
   * the code filled. If it opened in the wrong place — the mail client's
   * browser on an iPhone, not the icon on the Home Screen — nothing is lost:
   * the code is still good and can be typed where the app really is.
   *
   * `mode=reset` — the same screen for a forgotten password: other words,
   * the same act.
   */
  const params = useLocalSearchParams<{
    code?: string;
    mode?: string;
    lang?: string;
  }>();
  const reset = params.mode === 'reset';
  // `lang` — the language of the letter whose button was pressed. Taken only
  // where nobody has chosen one on this device; the three letters at the top
  // are for whoever wants another.
  const letterLanguage = typeof params.lang === 'string' ? params.lang : '';
  useEffect(() => {
    if (letterLanguage) void adoptLanguage(letterLanguage);
  }, [letterLanguage]);
  const [code, setCode] = useState(() =>
    typeof params.code === 'string' ? tidy(params.code) : '',
  );
  const [password, setPassword] = useState('');
  // Seen by default, and therefore asked ONCE: a second field exists to catch
  // a slip that cannot be seen, and this one can.
  const [show, setShow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The name this person will sign in with from now on, learned from the
   * session the code just bought. Shown before anything else — it is the one
   * thing they cannot look up anywhere and will need the day they sign out.
   */
  const [loginName, setLoginName] = useState<string | null>(null);
  const [session, setSession] = useState<LoginResponse | null>(null);
  /**
   * Asking for a new code, without an elder.
   *
   * A code lives thirty days and then it is gone, and until now the only way
   * to get another was to reach the person who issued it. The letter prints
   * the login name in a box and says to keep it — so that is what is asked
   * for here, with the address accepted too for anybody who has one.
   */
  const [asking, setAsking] = useState(false);
  const [who, setWho] = useState('');
  const [asked, setAsked] = useState(false);
  const [askPending, setAskPending] = useState(false);

  const bareCode = code.replace(/-/g, '');
  const problem = password ? passwordProblem(password) : null;
  const canSubmit =
    bareCode.length === 8 && password !== '' && !problem && !submitting;

  const why =
    bareCode.length !== 8
      ? t('auth.invite.needCode')
      : problem
        ? t(`auth.reset.problem.${problem}`)
        : null;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await authApi.redeemInvite(bareCode, password.trim());
      // The name first, the app second: adopting the session immediately would
      // sweep them into the home screen with their own name unread.
      setLoginName(session.user.loginName ?? null);
      setSession(session);
    } catch (e) {
      const refusal = inviteRefusal(e);
      const weak = weakPasswordProblem(e);
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      if (status === 429) {
        // Somebody has been typing codes from this address — often the elder
        // helping the person before this one. Saying «the code did not fit»
        // here would send them looking for a new code they do not need.
        setError(t('auth.tooMany'));
      } else if (refusal?.kind === 'invalid') {
        // One message for four causes, on purpose — see the server.
        setError(t(reset ? 'auth.invite.resetInvalid' : 'auth.invite.invalid'));
      } else if (weak) {
        setError(t(`auth.reset.problem.${weak}`));
      } else {
        setError(extractErrorMessage(e));
      }
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * One step between the code and the app, and it exists for one sentence:
   * this is your name for signing in.
   *
   * Nothing else in the app ever said it. Someone who signs out, or picks up a
   * new phone, would otherwise stand at the sign-in screen knowing a password
   * and nothing to put above it.
   */
  if (session) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.container}>
          <View style={styles.card}>
            <Text style={styles.title}>{t('auth.invite.welcomeTitle')}</Text>
            <Text style={styles.intro}>{t('auth.invite.welcomeIntro')}</Text>

            {loginName ? (
              <>
                <Text style={styles.label}>
                  {t('auth.invite.yourLoginName')}
                </Text>
                <View style={styles.nameBox}>
                  <Text style={styles.nameText} selectable>
                    {loginName}
                  </Text>
                </View>
                <Text style={styles.hint}>
                  {t('auth.invite.yourLoginNameHint')}
                </Text>
              </>
            ) : null}
            {/* A session here is not a session on the other device — said
                once, at the moment it is true for the first time. */}
            <Text style={styles.hint}>{t('auth.invite.eachDevice')}</Text>

            <Pressable
              style={styles.button}
              onPress={() => {
                void adoptSession(
                  session.accessToken,
                  session.refreshToken,
                  session.user,
                  { firstSignIn: session.firstSignIn },
                ).then(() => router.replace('/(app)/home' as never));
              }}
            >
              <Text style={styles.buttonText}>
                {t('auth.invite.welcomeGo')}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <LanguagePills />
          <Text style={styles.title}>
            {t(reset ? 'auth.invite.resetTitle' : 'auth.invite.title')}
          </Text>
          <Text style={styles.intro}>
            {t(reset ? 'auth.invite.resetIntro' : 'auth.invite.intro')}
          </Text>

          <Text style={styles.label}>{t(reset ? 'auth.invite.resetCode' : 'auth.invite.code')}</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(v) => setCode(tidy(v))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={t('auth.invite.codePlaceholder')}
            placeholderTextColor="#cbd5e1"
            editable={!submitting}
          />
          <Text style={styles.hint}>{t('auth.invite.codeHint')}</Text>
          <Text style={styles.hint}>{t('auth.invite.newestLetter')}</Text>
          {reset ? (
            // Somebody who has a password is not «waiting for an invitation»,
            // and the box below would take their name and send nothing. The
            // door that does send is the one they came through.
            <Pressable
              onPress={() => router.replace('/(auth)/forgot-password')}
              hitSlop={6}
            >
              <Text style={styles.askLink}>{t('auth.invite.resetAskAgain')}</Text>
            </Pressable>
          ) : asking ? (
            <View style={styles.askBox}>
              {asked ? (
                <>
                  <Text style={styles.askDone}>{t('auth.invite.askSent')}</Text>
                  {/* Said plainly, because for most of this congregation it is
                      the true answer: there is no address on their account and
                      no letter is coming. */}
                  <Text style={styles.hint}>{t('auth.invite.askNoEmail')}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.askLead}>{t('auth.invite.askLead')}</Text>
                  <TextInput
                    style={styles.input}
                    value={who}
                    onChangeText={setWho}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    placeholder={t('auth.loginPlaceholder')}
                    placeholderTextColor="#cbd5e1"
                    editable={!askPending}
                  />
                  <Pressable
                    style={[
                      styles.askBtn,
                      (askPending || who.trim().length < 3) &&
                        styles.buttonDisabled,
                    ]}
                    disabled={askPending || who.trim().length < 3}
                    onPress={() => {
                      setAskPending(true);
                      void authApi
                        .resendInvite(who.trim())
                        // The same ending either way — the server will not say
                        // whether that name exists, and neither may this.
                        .catch(() => undefined)
                        .finally(() => {
                          setAsked(true);
                          setAskPending(false);
                        });
                    }}
                  >
                    {askPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.askBtnText}>
                        {t('auth.invite.askSubmit')}
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          ) : (
            <Pressable onPress={() => setAsking(true)} hitSlop={6}>
              <Text style={styles.askLink}>{t('auth.invite.noCodeAsk')}</Text>
            </Pressable>
          )}
          <Text style={styles.label}>{t('auth.reset.newPassword')}</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              placeholder="••••••••"
              placeholderTextColor="#cbd5e1"
              editable={!submitting}
              onSubmitEditing={() => void submit()}
            />
            <Pressable
              onPress={() => setShow((v) => !v)}
              hitSlop={8}
              style={styles.eyeBtn}
            >
              <Ionicons
                name={show ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color="#94a3b8"
              />
            </Pressable>
          </View>
          <PasswordRules password={password} />
          <Pressable
            onPress={() => {
              setPassword(suggestPassword());
              setShow(true);
            }}
            hitSlop={6}
          >
            <Text style={styles.suggest}>{t('password.suggest')}</Text>
          </Pressable>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#b91c1c" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* A disabled button that says nothing is how the last one looked
              broken. */}
          {!canSubmit && why ? (
            <Text style={styles.why}>{why}</Text>
          ) : null}

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={() => void submit()}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('auth.invite.submit')}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => router.replace('/(auth)/login' as never)}
            hitSlop={6}
          >
            <Text style={styles.back}>{t('auth.invite.backToLogin')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#eef2f6' },
  container: { padding: 20, paddingBottom: 48 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 6,
  },
  intro: { fontSize: 14, color: '#64748b', lineHeight: 20, marginBottom: 16 },
  askLink: {
    fontSize: 13,
    color: '#0369a1',
    fontWeight: '600',
    marginTop: 6,
  },
  askBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    gap: 8,
  },
  askLead: { fontSize: 13, color: '#0c4a6e', lineHeight: 19 },
  askDone: { fontSize: 14, color: '#0c4a6e', fontWeight: '600' },
  askBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  askBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  inputFull: { flex: 0 },
  codeInput: {
    flex: 0,
    fontSize: 22,
    letterSpacing: 3,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  nameBox: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    paddingVertical: 16,
    alignItems: 'center',
  },
  nameText: {
    fontSize: 22,
    letterSpacing: 1,
    color: '#0c4a6e',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  inputWrap: { flexDirection: 'row', alignItems: 'center' },
  eyeBtn: { position: 'absolute', right: 10, padding: 4 },
  hint: { fontSize: 12, color: '#94a3b8', marginTop: 6, lineHeight: 17 },
  resent: { fontSize: 12.5, color: '#15803d', marginTop: 6, lineHeight: 17 },
  suggest: { fontSize: 13, color: '#2563eb', marginTop: 6 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 10,
    marginTop: 14,
  },
  errorText: { flex: 1, fontSize: 13, color: '#b91c1c', lineHeight: 18 },
  why: {
    fontSize: 13,
    color: '#b45309',
    marginTop: 12,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#15788f',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  back: {
    fontSize: 13,
    color: '#0369a1',
    textAlign: 'center',
    marginTop: 16,
  },
});
