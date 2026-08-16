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

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spent, setSpent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const bareCode = code.replace(/-/g, '');
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const problem = password ? passwordProblem(password) : null;
  const mismatch = confirm !== '' && confirm !== password;
  const canSubmit =
    emailOk &&
    bareCode.length === 8 &&
    !problem &&
    password === confirm &&
    !submitting &&
    !spent;

  const why = !emailOk
    ? t('auth.invite.needEmail')
    : bareCode.length !== 8
      ? t('auth.invite.needCode')
      : mismatch
        ? t('auth.reset.mismatch')
        : problem
          ? t(`auth.reset.problem.${problem}`)
          : null;

  const resend = async () => {
    if (!emailOk || resending) return;
    setResending(true);
    setError(null);
    try {
      await authApi.resendInvite(email.trim());
      // The same sentence either way: the server will not say whether
      // the address is known, and neither may this screen.
      setResent(true);
      setSpent(false);
      setCode('');
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setResending(false);
    }
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const session = await authApi.redeemInvite(
        email.trim(),
        bareCode,
        password,
      );
      await adoptSession(
        session.accessToken,
        session.refreshToken,
        session.user,
      );
      router.replace('/(app)/home' as never);
    } catch (e) {
      const refusal = inviteRefusal(e);
      const weak = weakPasswordProblem(e);
      if (refusal?.kind === 'wrongCode') {
        // Counting down out loud is the difference between a form that is
        // strict and a form that seems broken.
        if (refusal.attemptsLeft > 0) {
          setError(
            t('auth.invite.wrongCode', { count: refusal.attemptsLeft }) +
              ' ' +
              t('auth.invite.newestLetter'),
          );
        } else {
          setSpent(true);
          setError(t('auth.invite.spent'));
        }
      } else if (refusal?.kind === 'invalid') {
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

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('auth.invite.title')}</Text>
          <Text style={styles.intro}>{t('auth.invite.intro')}</Text>

          <Text style={styles.label}>{t('auth.email')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="name@example.com"
            placeholderTextColor="#cbd5e1"
            editable={!submitting}
          />

          <Text style={styles.label}>{t('auth.invite.code')}</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(v) => setCode(tidy(v))}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={t('auth.invite.codePlaceholder')}
            placeholderTextColor="#cbd5e1"
            editable={!submitting && !spent}
          />
          <Text style={styles.hint}>{t('auth.invite.codeHint')}</Text>
          <Text style={styles.hint}>
            {t('auth.invite.newestLetter')}
          </Text>
          <Pressable onPress={() => void resend()} hitSlop={6}>
            <Text style={styles.suggest}>
              {resending
                ? t('auth.invite.resending')
                : t('auth.invite.resend')}
            </Text>
          </Pressable>
          {resent ? (
            <Text style={styles.resent}>{t('auth.invite.resent')}</Text>
          ) : null}

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
          {!canSubmit && why && !spent ? (
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
