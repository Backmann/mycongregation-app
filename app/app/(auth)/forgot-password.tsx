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
import { authApi } from '../../lib/api';

const EMAIL_RE = /.+@.+\..+/;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const canSubmit = EMAIL_RE.test(email.trim()) && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await authApi.forgotPassword(email.trim());
    } catch {
      // Same outcome either way — the server answer is intentionally generic.
    } finally {
      // Always show the same confirmation: no hint whether the email exists.
      setSent(true);
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('auth.forgot.title')}</Text>

          {sent ? (
            <>
              <View style={styles.sentRow}>
                <Ionicons
                  name="mail-unread-outline"
                  size={20}
                  color="#0369a1"
                />
                <Text style={styles.sentText}>{t('auth.forgot.sent')}</Text>
              </View>
              <Text style={styles.hint}>{t('auth.forgot.checkSpam')}</Text>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>{t('auth.forgot.subtitle')}</Text>
              <Text style={styles.label}>{t('auth.email')}</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                keyboardType="email-address"
                placeholder="email@example.com"
                placeholderTextColor="#cbd5e1"
                editable={!submitting}
                onSubmitEditing={() => void submit()}
              />
              <Pressable
                style={[styles.button, !canSubmit && styles.buttonDisabled]}
                onPress={() => void submit()}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>
                    {t('auth.forgot.submit')}
                  </Text>
                )}
              </Pressable>
            </>
          )}

          <Pressable
            style={styles.backLink}
            onPress={() => router.replace('/(auth)/login' as never)}
            hitSlop={6}
          >
            <Ionicons name="arrow-back" size={15} color="#0369a1" />
            <Text style={styles.backLinkText}>
              {t('auth.forgot.backToLogin')}
            </Text>
          </Pressable>
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
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0f172a',
  },
  button: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sentText: { flex: 1, fontSize: 14, color: '#0f172a', lineHeight: 20 },
  hint: { fontSize: 13, color: '#64748b', lineHeight: 18 },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  backLinkText: { fontSize: 14, color: '#0369a1', fontWeight: '600' },
});
