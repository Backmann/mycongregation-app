import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { extractErrorMessage } from '../../lib/api';
import { setLanguage, SupportedLanguage } from '../../lib/i18n';
import { useTranslation } from 'react-i18next';
import BrandLockup from '../../components/BrandLockup';

const LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'ru', label: 'RU' },
];

export default function LoginScreen() {
  const { t, i18n } = useTranslation();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = (i18n.language?.split('-')[0] ?? 'en') as SupportedLanguage;
  const canSubmit = email.trim() !== '' && password !== '' && !submitting;

  const handleSubmit = async () => {
    if (email.trim() === '' || password === '') return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      router.replace('/(app)/home' as any);
    } catch (e) {
      // 401 is «no» and nothing more — deliberately, so this page cannot be
      // used to find out whose address exists. But «Invalid credentials» is a
      // sentence written for a developer, in English, and it was landing on a
      // German screen. The status is ours to read; the words are ours to write.
      const status = (e as { response?: { status?: number } })?.response?.status;
      setError(
        status === 401
          ? t('auth.wrongEmailOrPassword')
          : extractErrorMessage(e),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      // 'padding' on BOTH platforms, not iOS only.
      //
      // Read out of KeyboardAvoidingView's own source: the shift it applies is
      // computed the same way everywhere — it listens for the keyboard and
      // works out the overlap itself; the one platform-specific branch inside
      // concerns iOS. Leaving Android without a behavior therefore disabled it
      // for no reason. That was a habit from when Android's window resized
      // itself around the keyboard; this app runs edge-to-edge, where it does
      // not — which is why the e-mail field was comfortable and the password
      // below it sat under the keyboard.
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.langRow}>
            {LANGUAGES.map((lng) => {
              const active = current === lng.code;
              return (
                <Pressable
                  key={lng.code}
                  onPress={() => {
                    void setLanguage(lng.code);
                  }}
                  style={[styles.langPill, active && styles.langPillActive]}
                  accessibilityLabel={lng.label}
                >
                  <Text
                    style={[
                      styles.langPillText,
                      active && styles.langPillTextActive,
                    ]}
                  >
                    {lng.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.brand}>
            <BrandLockup mark={58} word={26} layout="stacked" />
            <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
          </View>

          <Pressable
            onPress={() => router.push('/(auth)/invite' as never)}
            style={styles.inviteCard}
          >
            <Ionicons name="mail-open-outline" size={20} color="#0e7490" />
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteCardTitle}>
                {t('auth.invite.entryTitle')}
              </Text>
              <Text style={styles.inviteCardHint}>
                {t('auth.invite.entryHint')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </Pressable>

          <Text style={styles.label}>{t('auth.email')}</Text>
          <View style={styles.inputWrap}>
            <Ionicons
              name="mail-outline"
              size={18}
              color="#94a3b8"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              editable={!submitting}
            />
          </View>

          <Text style={styles.label}>{t('auth.password')}</Text>
          <View style={styles.inputWrap}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color="#94a3b8"
              style={styles.inputIcon}
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="password"
              placeholder="••••••••"
              placeholderTextColor="#cbd5e1"
              editable={!submitting}
              onSubmitEditing={handleSubmit}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
              style={styles.eyeBtn}
              accessibilityLabel={
                showPassword ? t('auth.hidePassword') : t('auth.showPassword')
              }
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color="#94a3b8"
              />
            </Pressable>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={16} color="#b91c1c" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('auth.signIn')}</Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <View style={styles.hintRow}>
              <Ionicons
                name="information-circle-outline"
                size={16}
                color="#94a3b8"
                style={styles.hintIcon}
              />
              <Text style={styles.hintText}>{t('auth.noAccountHint')}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/(auth)/forgot-password' as never)}
              hitSlop={6}
            >
              <Text
                style={[
                  styles.forgotText,
                  { color: '#0369a1', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
                ]}
              >
                {t('auth.forgotPassword')}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.push('/legal' as never)}
            hitSlop={6}
            style={styles.legalLinkWrap}
          >
            <Text style={styles.legalLink}>{t('legal.linkShort')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
  },
  inviteCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0e7490',
    marginBottom: 2,
  },
  inviteCardHint: { fontSize: 12.5, color: '#0891b2', lineHeight: 17 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  langRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 22,
  },
  langPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  langPillActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  langPillText: {
    fontSize: 13,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  langPillTextActive: {
    color: '#0284c7',
  },
  brand: {
    alignItems: 'center',
    marginBottom: 26,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 26,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 15,
    color: '#64748b',
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
    color: '#475569',
    marginBottom: 6,
    marginTop: 14,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    color: '#b91c1c',
    fontSize: 14,
  },
  button: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
  },
  footer: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 16,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  hintIcon: {
    marginRight: 8,
    marginTop: 1,
  },
  hintText: {
    flex: 1,
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  forgotText: {
    color: '#64748b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  legalLinkWrap: {
    marginTop: 16,
    alignItems: 'center',
  },
  legalLink: {
    fontSize: 13,
    color: '#64748b',
    textDecorationLine: 'underline',
  },
});
