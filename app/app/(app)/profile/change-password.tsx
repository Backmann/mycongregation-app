import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { authApi, extractErrorMessage } from '../../../lib/api';

/**
 * Self-service password change screen — all roles.
 *
 * Calls PATCH /auth/me/password. The server verifies `currentPassword`
 * via bcrypt.compare and returns 400 BadRequest on mismatch (NOT 401, so
 * the response interceptor does not trigger a refresh/logout cycle).
 */
export default function ChangePasswordScreen() {
  const { t } = useTranslation();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => authApi.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      Alert.alert(
        t('profile.changePassword.successTitle'),
        t('profile.changePassword.successBody'),
        [{ text: t('common.ok'), onPress: () => router.back() }],
      );
    },
    onError: (err: unknown) => {
      // Server returns 400 with a textual message (e.g. "Current password is
      // incorrect"). Display verbatim — same pattern as elsewhere in the app.
      setServerError(extractErrorMessage(err));
    },
  });

  // Client-side validation flags
  const newLengthOk = newPassword.length >= 8;
  const confirmOk = confirmPassword === newPassword;
  const newDiffersFromCurrent =
    newPassword.length === 0 || newPassword !== currentPassword;

  // Show errors only after the user has typed in the relevant field
  const showLengthError = newPassword.length > 0 && !newLengthOk;
  const showSameAsCurrentError =
    currentPassword.length > 0 &&
    newPassword.length > 0 &&
    !newDiffersFromCurrent;
  const showMismatchError = confirmPassword.length > 0 && !confirmOk;

  const canSubmit =
    currentPassword.length > 0 &&
    newLengthOk &&
    confirmOk &&
    newDiffersFromCurrent &&
    !mutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setServerError(null);
    mutation.mutate();
  };

  // Clear server error when user starts typing again
  const onCurrentChange = (s: string) => {
    setCurrentPassword(s);
    if (serverError) setServerError(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>{t('profile.changePassword.intro')}</Text>

        {serverError && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#991b1b" />
            <Text style={styles.errorBoxText}>{serverError}</Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>
          {t('profile.changePassword.currentPassword')}
        </Text>
        <TextInput
          style={styles.input}
          value={currentPassword}
          onChangeText={onCurrentChange}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          placeholder="••••••••"
          placeholderTextColor="#94a3b8"
        />

        <Text style={styles.fieldLabel}>
          {t('profile.changePassword.newPassword')}
        </Text>
        <TextInput
          style={[
            styles.input,
            (showLengthError || showSameAsCurrentError) && styles.inputError,
          ]}
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          placeholder="••••••••"
          placeholderTextColor="#94a3b8"
        />
        {showLengthError ? (
          <Text style={styles.fieldError}>
            {t('profile.changePassword.errors.tooShort')}
          </Text>
        ) : showSameAsCurrentError ? (
          <Text style={styles.fieldError}>
            {t('profile.changePassword.errors.sameAsCurrent')}
          </Text>
        ) : (
          <Text style={styles.fieldHint}>
            {t('profile.changePassword.minLength')}
          </Text>
        )}

        <Text style={styles.fieldLabel}>
          {t('profile.changePassword.confirmPassword')}
        </Text>
        <TextInput
          style={[styles.input, showMismatchError && styles.inputError]}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="newPassword"
          placeholder="••••••••"
          placeholderTextColor="#94a3b8"
        />
        {showMismatchError && (
          <Text style={styles.fieldError}>
            {t('profile.changePassword.errors.mismatch')}
          </Text>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          style={({ pressed }) => [
            styles.submitButton,
            !canSubmit && { opacity: 0.5 },
            pressed && canSubmit && { opacity: 0.85 },
          ]}
        >
          {mutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="key" size={18} color="#fff" />
              <Text style={styles.submitButtonText}>
                {t('profile.changePassword.submit')}
              </Text>
            </>
          )}
        </Pressable>

        <Text style={styles.note}>{t('profile.changePassword.note')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },

  intro: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 16,
    lineHeight: 20,
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBoxText: { flex: 1, color: '#991b1b', fontSize: 13 },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 16,
  },
  fieldHint: { fontSize: 12, color: '#94a3b8', marginTop: 4 },
  fieldError: { fontSize: 12, color: '#dc2626', marginTop: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
  },
  inputError: { borderColor: '#fca5a5' },

  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0ea5e9',
    marginTop: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  submitButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  note: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
