import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { extractErrorMessage, meApi } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Dialog } from './Dialog';

/**
 * The yearly contact check. From 1 September the publisher's own card comes to
 * them: their contacts are shown with a straight question — are these still
 * right? "Позже" closes it for this session and it returns on the next launch,
 * so nobody is trapped mid-task but nobody quietly skips the year either.
 */
function checkDueSince(now: Date): Date {
  // The check runs once a calendar year, from 1 January — so "confirmed this
  // year" means exactly that, and the first round after the feature shipped
  // carries everyone through to the new year.
  return new Date(now.getFullYear(), 0, 1);
}

export function ContactsCheckPrompt() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [deferred, setDeferred] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['me-publisher'],
    queryFn: () => meApi.publisher(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
  const me = data?.publisher ?? null;

  const confirmMutation = useMutation({
    // Shown in place by this form — keep it out of the error strip.
    meta: { inlineError: true },
    mutationFn: () => meApi.confirmContacts(),
    // Close on success rather than waiting for the refetch, and say so out loud
    // when it fails — a card that silently stays put looks broken.
    onSuccess: () => {
      setDeferred(true);
      queryClient.invalidateQueries({ queryKey: ['me-publisher'] });
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  if (!me || deferred) return null;
  const since = checkDueSince(new Date());
  const confirmed = me.contactsConfirmedAt
    ? new Date(me.contactsConfirmedAt)
    : null;
  if (confirmed && confirmed >= since) return null;

  const line = (icon: 'call-outline' | 'mail-outline' | 'home-outline', value: string | null) => (
    <View style={styles.line}>
      <Ionicons name={icon} size={15} color="#64748b" />
      <Text style={[styles.lineText, !value && styles.lineEmpty]}>
        {value || t('myContacts.empty')}
      </Text>
    </View>
  );

  return (
    <Dialog
      visible
      title={t('myContacts.checkTitle')}
      icon="shield-checkmark-outline"
      cancelLabel={t('myContacts.later')}
      confirmLabel={t('myContacts.allCorrect')}
      pending={confirmMutation.isPending}
      onConfirm={() => confirmMutation.mutate()}
      onCancel={() => setDeferred(true)}
    >
      <Text style={styles.subtitle}>
        {confirmed
          ? t('myContacts.checkSubtitle', {
              date: since.toLocaleDateString(i18n.language, {
                day: 'numeric',
                month: 'long',
              }),
            })
          : t('myContacts.checkSubtitleFirst')}
      </Text>

      <View style={styles.values}>
        {line('call-outline', me.mobilePhone)}
        {line('mail-outline', me.email)}
        {line('home-outline', me.address)}
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Pressable
        style={({ pressed }) => [
          styles.editBtn,
          pressed && styles.pressed,
        ]}
        onPress={() => {
          setDeferred(true);
          router.push('/profile/contacts' as never);
        }}
      >
        <Text style={styles.editText}>{t('myContacts.edit')}</Text>
      </Pressable>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 19,
    marginTop: 8,
  },
  values: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e8edf3',
    borderRadius: 12,
    padding: 12,
    gap: 9,
    marginTop: 14,
    marginBottom: 16,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  lineText: { flex: 1, fontSize: 13.5, color: '#0f172a' },
  lineEmpty: { color: '#94a3b8', fontStyle: 'italic' },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  errorText: { color: '#991b1b', fontSize: 12.5 },
  editBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  editText: { color: '#334155', fontSize: 14.5, fontWeight: '600' },
  primary: { backgroundColor: '#0ea5e9' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  secondaryText: { color: '#334155', fontSize: 15, fontWeight: '600' },
  laterBtn: { alignItems: 'center', paddingVertical: 6 },
  laterText: { fontSize: 13.5, color: '#64748b', fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
