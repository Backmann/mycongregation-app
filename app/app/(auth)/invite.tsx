import { useState } from 'react';
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
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi, extractErrorMessage } from '../../lib/api';
import type { LoginResponse } from '../../lib/api';
import { useAuth } from '../../lib/auth';
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

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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

  const bareCode = code.replace(/-/g, '');
  const problem = password ? passwordProblem(password) : null;
  const mismatch = confirm !== '' && confirm !== password;
  const canSubmit =
    bareCode.length === 8 &&
    !problem &&
    password === confirm &&
    !submitting;

  const why = bareCode.length !== 8
      ? t('auth.invite.needCode')
      : mismatch
        ? t('auth.reset.mismatch')
        : problem
          ? t(`auth.reset.problem.${problem}`)
          : null;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await authApi.redeemInvite(bareCode, password);
      // The name first, the app second: adopting the session immediately would
      // sweep them into the home screen with their own name unread.
      setLoginName(session.user.loginName ?? null);
      setSession(session);
    } catch (e) {
      const refusal = inviteRefusal(e);
      const weak = weakPasswordProblem(e);
      if (refusal?.kind === 'invalid') {
        // One message for four causes, on purpose — see the server.
        setError(t('auth.invite.invalid'));
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

            <Pressable
              style={styles.button}
              onPress={() => {
                void adoptSession(
                  session.accessToken,
                  session.refreshToken,
                  session.user,
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
          <Text style={styles.title}>{t('auth.invite.title')}</Text>
          <Text style={styles.intro}>{t('auth.invite.intro')}</Text>

          <Text style={styles.label}>{t('auth.invite.code')}</Text>
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
          <Text style={styles.hint}>{t('auth.invite.noCodeAsk')}</Text>
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
              const made = suggestPassword();
              setPassword(made);
              setConfirm(made);
              setShow(true);
            }}
            hitSlop={6}
          >
            <Text style={styles.suggest}>{t('password.suggest')}</Text>
          </Pressable>

          <Text style={styles.label}>{t('auth.reset.confirmPassword')}</Text>
          <TextInput
            style={[styles.input, styles.inputFull]}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            placeholder="••••••••"
            placeholderTextColor="#cbd5e1"
            editable={!submitting}
            onSubmitEditing={() => void submit()}
          />

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
