import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { FormField } from '../../../components/FormField';
import { FormSection } from '../../../components/FormSection';
import { extractErrorMessage, meApi } from '../../../lib/api';

/**
 * "My contacts": the one part of their card a publisher keeps up to date
 * themselves. The name is missing on purpose — it identifies them across
 * schedules, reports and printed sheets, so it stays with the administrators.
 * Saving also counts as confirming the yearly check; when nothing has changed,
 * the confirm button alone is enough.
 */
export default function MyContactsScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['me-publisher'],
    queryFn: () => meApi.publisher(),
  });
  const me = query.data?.publisher ?? null;

  const [form, setForm] = useState({ mobilePhone: '', email: '', address: '' });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!me || dirty) return;
    setForm({
      mobilePhone: me.mobilePhone ?? '',
      email: me.email ?? '',
      address: me.address ?? '',
    });
  }, [me, dirty]);

  const done = () => {
    // The card, the publishers list and "my" view all read the same row, so
    // refresh them together — an elder editing their own contacts would
    // otherwise still see the old value in the list they opened earlier.
    queryClient.invalidateQueries({ queryKey: ['me-publisher'] });
    queryClient.invalidateQueries({ queryKey: ['publishers'] });
    if (me?.id) {
      queryClient.invalidateQueries({ queryKey: ['publisher', me.id] });
    }
    setDirty(false);
    setSavedAt(Date.now());
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      meApi.updateContacts({
        mobilePhone: form.mobilePhone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
      }),
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const confirmMutation = useMutation({
    mutationFn: () => meApi.confirmContacts(),
    onSuccess: done,
    onError: (e) => setError(extractErrorMessage(e)),
  });
  const busy = saveMutation.isPending || confirmMutation.isPending;

  if (query.isLoading) {
    return <ActivityIndicator size="large" style={{ marginTop: 32 }} />;
  }
  if (!me) {
    return (
      <View style={styles.screen}>
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>{t('myContacts.noCard')}</Text>
        </View>
      </View>
    );
  }

  const confirmedAt = me.contactsConfirmedAt
    ? new Date(me.contactsConfirmedAt)
    : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.introText}>{t('myContacts.intro')}</Text>
      </View>

      <FormSection title={t('publishers.sections.contact')}>
        <FormField
          label={t('publishers.fields.mobilePhone')}
          value={form.mobilePhone}
          onChangeText={(v) => {
            setDirty(true);
            setForm((p) => ({ ...p, mobilePhone: v }));
          }}
          keyboardType="phone-pad"
        />
        <FormField
          label={t('publishers.fields.email')}
          value={form.email}
          onChangeText={(v) => {
            setDirty(true);
            setForm((p) => ({ ...p, email: v }));
          }}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField
          label={t('publishers.fields.address')}
          value={form.address}
          onChangeText={(v) => {
            setDirty(true);
            setForm((p) => ({ ...p, address: v }));
          }}
          multiline
        />
      </FormSection>

      <View style={styles.stampRow}>
        <Ionicons
          name={confirmedAt ? 'shield-checkmark-outline' : 'alert-circle-outline'}
          size={14}
          color={confirmedAt ? '#16a34a' : '#b45309'}
        />
        <Text style={styles.stampText}>
          {confirmedAt
            ? t('myContacts.confirmedAt', {
                date: confirmedAt.toLocaleDateString(i18n.language, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              })
            : t('myContacts.neverConfirmed')}
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
      {savedAt ? (
        <View style={styles.okBox}>
          <Ionicons name="checkmark-circle" size={16} color="#166534" />
          <Text style={styles.okText}>{t('myContacts.saved')}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {dirty ? (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.primary,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
            onPress={() => {
              setError(null);
              saveMutation.mutate();
            }}
            disabled={busy}
          >
            <Text style={styles.primaryText}>{t('common.save')}</Text>
          </Pressable>
        ) : (
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.primary,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
            onPress={() => {
              setError(null);
              confirmMutation.mutate();
            }}
            disabled={busy}
          >
            <Text style={styles.primaryText}>{t('myContacts.confirm')}</Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.secondary,
            pressed && styles.pressed,
          ]}
          onPress={() => router.back()}
        >
          <Text style={styles.secondaryText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: {
    paddingBottom: 32,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  intro: { paddingHorizontal: 18, paddingTop: 16 },
  introText: { fontSize: 13.5, color: '#475569', lineHeight: 20 },
  stampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 12,
    marginTop: 10,
  },
  stampText: { flex: 1, fontSize: 12.5, color: '#64748b' },
  noticeBox: {
    margin: 16,
    padding: 14,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
  },
  noticeText: { color: '#475569', fontSize: 13.5, lineHeight: 20 },
  errorBox: {
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
  },
  errorText: { color: '#991b1b', fontSize: 13 },
  okBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 12,
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
    borderWidth: 1,
    borderRadius: 12,
  },
  okText: { color: '#166534', fontSize: 13, fontWeight: '600' },
  actions: { paddingHorizontal: 12, paddingVertical: 18, gap: 10 },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  primary: { backgroundColor: '#0ea5e9' },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0' },
  secondaryText: { color: '#334155', fontSize: 15, fontWeight: '600' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
