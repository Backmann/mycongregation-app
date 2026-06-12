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
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { authApi, extractErrorMessage } from '../../lib/api';

const TOKEN_RE = /^[0-9a-f]{64}$/;

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';
  const tokenValid = TOKEN_RE.test(token);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm !== '' && confirm !== password;
  const canSubmit =
    tokenValid &&
    password.length >= 8 &&
    password === confirm &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const toLogin = () => router.replace('/(auth)/login' as never);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('auth.reset.title')}</Text>

          {!tokenValid ? (
            <>
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={16} color="#b91c1c" />
                <Text style={styles.errorText}>
                  {t('auth.reset.invalidLink')}
                </Text>
              </View>
              <Pressable
                style={styles.button}
                onPress={() =>
                  router.replace('/(auth)/forgot-password' as never)
                }
              >
                <Text style={styles.buttonText}>
                  {t('auth.reset.requestNew')}
                </Text>
              </Pressable>
            </>
          ) : done ? (
            <>
              <View style={styles.sentRow}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={20}
                  color="#15803d"
                />
                <Text style={styles.sentText}>{t('auth.reset.success')}</Text>
              </View>
              <Pressable style={styles.button} onPress={toLogin}>
                <Text style={styles.buttonText}>
                  {t('auth.reset.goToLogin')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
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
              <Text style={styles.hint}>{t('auth.reset.minLength')}</Text>

              <Text style={styles.label}>
                {t('auth.reset.confirmPassword')}
              </Text>
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
              {mismatch && (
                <Text style={styles.mismatch}>{t('auth.reset.mismatch')}</Text>
              )}
              {error && (
                <View style={styles.errorBox}>
                  <Ionicons name="alert-circle" size={16} color="#b91c1c" />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              <Pressable
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                onPress={() => void submit()}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {t('auth.reset.submit')}
                  </Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f1f5f9' },
  container: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 2 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
  },
  inputFull: {
    flex: undefined,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
  },
  eyeBtn: { paddingHorizontal: 10 },
  hint: { fontSize: 12, color: '#94a3b8' },
  mismatch: { fontSize: 13, color: '#b91c1c' },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
  },
  errorText: { flex: 1, fontSize: 13, color: '#b91c1c' },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sentText: { flex: 1, fontSize: 14, color: '#0f172a', lineHeight: 20 },
  button: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
