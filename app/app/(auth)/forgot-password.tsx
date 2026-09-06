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

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  // A login name or an address: the person may remember either, and after
  // this month they are two different things.
  const [login, setLogin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  /**
   * Has this person an address at all — asked FIRST, before anything else.
   *
   * Most of this congregation has none: forty-four of ninety-two when the
   * address stopped being an identity. For them the old screen took a name,
   * said «мы отправили письмо», and left them waiting for something that was
   * never coming — the truthful line sat in small print underneath, read after
   * the button had already been pressed.
   *
   * null means the question has not been answered yet.
   */
  const [hasEmail, setHasEmail] = useState<boolean | null>(null);

  const canSubmit = login.trim().length >= 3 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await authApi.forgotPassword(login.trim());
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
          ) : hasEmail === null ? (
            /* The question that decides whether this screen can help at all. */
            <>
              <Text style={styles.subtitle}>{t('auth.forgot.askEmail')}</Text>
              <Pressable
                style={styles.button}
                onPress={() => setHasEmail(true)}
              >
                <Text style={styles.buttonText}>
                  {t('auth.forgot.haveEmail')}
                </Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => setHasEmail(false)}
              >
                <Text style={styles.secondaryButtonText}>
                  {t('auth.forgot.noEmail')}
                </Text>
              </Pressable>
            </>
          ) : hasEmail === false ? (
            /* No letter is coming, and saying so is more use than a form. */
            <>
              <Text style={styles.subtitle}>{t('auth.forgot.noEmailWhat')}</Text>
              <Text style={styles.hint}>{t('auth.forgot.noEmailHint')}</Text>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>{t('auth.forgot.subtitle')}</Text>
              <Text style={styles.label}>{t('auth.loginOrEmail')}</Text>
              <TextInput
                style={styles.input}
                value={login}
                onChangeText={setLogin}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                placeholder={t('auth.loginPlaceholder')}
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
  title: { fontSize: 20, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#64748b', lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#475569' },
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
  secondaryButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  secondaryButtonText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
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
  backLinkText: { fontSize: 14, color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
});
