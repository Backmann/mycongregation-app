import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FormField } from './FormField';
import { FormSection } from './FormSection';
import { FormChips } from './FormChips';
import { FormSwitch } from './FormSwitch';
import { CapabilitiesEditor } from './CapabilitiesEditor';
import {
  Capabilities,
  CreatePublisherInput,
  Gender,
  PioneerType,
  PublisherAppointment,
  extractErrorMessage,
} from '../lib/api';
import { useTranslation } from 'react-i18next';

interface Props {
  initial?: Partial<CreatePublisherInput>;
  onSubmit: (data: CreatePublisherInput) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
}

// Option arrays moved inside PublisherForm to use translations

export function PublisherForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel,
}: Props) {
  const { t } = useTranslation();

  const GENDER_OPTIONS: { value: Gender; label: string }[] = [
    { value: 'brother', label: t('publishers.gender.brother') },
    { value: 'sister', label: t('publishers.gender.sister') },
  ];

  const APPOINTMENT_OPTIONS: { value: PublisherAppointment; label: string }[] = [
    { value: 'publisher', label: t('publishers.appointment.publisher') },
    { value: 'unbaptized_publisher', label: t('publishers.appointment.unbaptized') },
    { value: 'student', label: t('publishers.appointment.student') },
    { value: 'ministerial_servant', label: t('publishers.appointment.ms') },
    { value: 'elder', label: t('publishers.appointment.elder') },
    { value: 'none', label: t('publishers.appointment.none') },
  ];

  const PIONEER_OPTIONS: { value: PioneerType; label: string }[] = [
    { value: 'none', label: t('publishers.pioneer.options.none') },
    { value: 'auxiliary_until_cancelled', label: t('publishers.pioneer.options.auxiliary_until_cancelled') },
    { value: 'regular', label: t('publishers.pioneer.options.regular') },
    { value: 'special', label: t('publishers.pioneer.options.special') },
    { value: 'missionary', label: t('publishers.pioneer.options.missionary') },
  ];

  const effectiveSubmitLabel = submitLabel ?? t('publishers.actions.save');
  const [form, setForm] = useState<CreatePublisherInput>({
    firstName: initial?.firstName ?? '',
    middleName: initial?.middleName ?? '',
    lastName: initial?.lastName ?? '',
    gender: initial?.gender ?? 'brother',
    birthDate: initial?.birthDate ?? '',
    mobilePhone: initial?.mobilePhone ?? '',
    email: initial?.email ?? '',
    address: initial?.address ?? '',
    appointment: initial?.appointment ?? 'publisher',
    baptismDate: initial?.baptismDate ?? '',
    ministryStartDate: initial?.ministryStartDate ?? '',
    pioneerType: initial?.pioneerType ?? 'none',
    pioneerSince: initial?.pioneerSince ?? '',
    isAnointed: initial?.isAnointed ?? false,
    hasKingdomHallKey: initial?.hasKingdomHallKey ?? false,
    isActive: initial?.isActive ?? true,
    isRegular: initial?.isRegular ?? true,
    printedWatchtower: initial?.printedWatchtower ?? false,
    printedWorkbook: initial?.printedWorkbook ?? false,
    sendsReportDirectly: initial?.sendsReportDirectly ?? false,
    spiritualNotes: initial?.spiritualNotes ?? '',
    notes: initial?.notes ?? '',
    capabilities:
      initial?.capabilities ??
      (initial?.gender === 'sister' ? { hospitality: true } : {}),
  });

  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CreatePublisherInput>(
    key: K,
    value: CreatePublisherInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateCapabilities = (caps: Capabilities) => {
    setForm((prev) => ({ ...prev, capabilities: caps }));
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.firstName?.trim()) {
      setError(t('publishers.validation.firstNameRequired'));
      return;
    }
    if (!form.lastName?.trim()) {
      setError(t('publishers.validation.lastNameRequired'));
      return;
    }
    try {
      await onSubmit(form);
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <FormSection title={t('publishers.sections.personal')}>
        <FormField
          label={t('publishers.fields.firstName')}
          value={form.firstName}
          onChangeText={(v) => update('firstName', v)}
          required
          placeholder={t('publishers.placeholders.firstName')}
        />
        <FormField
          label={t('publishers.fields.middleName')}
          value={form.middleName}
          onChangeText={(v) => update('middleName', v)}
          placeholder={t('publishers.placeholders.middleName')}
        />
        <FormField
          label={t('publishers.fields.lastName')}
          value={form.lastName}
          onChangeText={(v) => update('lastName', v)}
          required
          placeholder={t('publishers.placeholders.lastName')}
        />
        <FormChips
          label={t('publishers.fields.gender')}
          value={form.gender}
          options={GENDER_OPTIONS}
          onChange={(v) =>
            setForm((prev) => ({
              ...prev,
              gender: v,
              capabilities:
                v === 'sister' && prev.capabilities?.hospitality === undefined
                  ? { ...prev.capabilities, hospitality: true }
                  : prev.capabilities,
            }))
          }
        />
        <FormField
          label={t('publishers.fields.birthDate')}
          value={form.birthDate}
          onChangeText={(v) => update('birthDate', v)}
          placeholder={t('publishers.placeholders.date')}
          autoCapitalize="none"
        />
      </FormSection>

      <FormSection title={t('publishers.sections.contact')}>
        <FormField
          label={t('publishers.fields.mobilePhone')}
          value={form.mobilePhone}
          onChangeText={(v) => update('mobilePhone', v)}
          placeholder={t('publishers.placeholders.phone')}
          keyboardType="phone-pad"
        />
        <FormField
          label={t('publishers.fields.email')}
          value={form.email}
          onChangeText={(v) => update('email', v)}
          placeholder={t('publishers.placeholders.email')}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField
          label={t('publishers.fields.address')}
          value={form.address}
          onChangeText={(v) => update('address', v)}
          multiline
        />
      </FormSection>

      <FormSection title={t('publishers.sections.spirituality')}>
        <FormChips
          label={t('publishers.fields.appointment')}
          value={form.appointment}
          options={APPOINTMENT_OPTIONS}
          onChange={(v) => update('appointment', v)}
        />
        <FormField
          label={t('publishers.fields.baptismDate')}
          value={form.baptismDate}
          onChangeText={(v) => update('baptismDate', v)}
          placeholder={t('publishers.placeholders.date')}
          autoCapitalize="none"
        />
        <FormField
          label={t('publishers.fields.ministryStart')}
          value={form.ministryStartDate}
          onChangeText={(v) => update('ministryStartDate', v)}
          placeholder={t('publishers.placeholders.date')}
          autoCapitalize="none"
        />
        <FormChips
          label={t('publishers.fields.pioneerType')}
          value={form.pioneerType}
          options={PIONEER_OPTIONS}
          onChange={(v) => update('pioneerType', v)}
        />
        <FormField
          label={t('publishers.fields.pioneerSince')}
          value={form.pioneerSince}
          onChangeText={(v) => update('pioneerSince', v)}
          placeholder={t('publishers.placeholders.date')}
          autoCapitalize="none"
        />
      </FormSection>

      <FormSection title={t('publishers.sections.capabilities')}>
        <CapabilitiesEditor
          value={form.capabilities ?? {}}
          onChange={updateCapabilities}
          gender={form.gender}
        />
      </FormSection>

      <FormSection title={t('publishers.sections.status')}>
        <FormSwitch
          label={t('publishers.fields.active')}
          value={form.isActive}
          onValueChange={(v) => update('isActive', v)}
        />
        <FormSwitch
          label={t('publishers.fields.regular')}
          value={form.isRegular}
          onValueChange={(v) => update('isRegular', v)}
        />
      </FormSection>

      <FormSection title={t('publishers.sections.notes')}>
        <FormField
          label={t('publishers.fields.generalNotes')}
          value={form.notes}
          onChangeText={(v) => update('notes', v)}
          multiline
        />
      </FormSection>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[
            styles.button,
            styles.buttonPrimary,
            isSubmitting && styles.buttonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonPrimaryText}>{effectiveSubmitLabel}</Text>
          )}
        </Pressable>
        {onCancel && (
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonSecondaryText}>{t('common.cancel')}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
  actions: { padding: 20, gap: 8 },
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: '#0ea5e9' },
  buttonDisabled: { opacity: 0.6 },
  buttonPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  buttonSecondaryText: { color: '#475569', fontSize: 16, fontWeight: '500' },
});
