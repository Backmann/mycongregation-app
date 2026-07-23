import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { FormField } from './FormField';
import { DateField } from './DateField';
import { FormSection } from './FormSection';
import { FormChips } from './FormChips';
import { CapabilitiesEditor } from './CapabilitiesEditor';
import {
  Capabilities,
  CreatePublisherInput,
  Gender,
  PioneerType,
  PublisherAppointment,
  SpiritualStatus,
  extractErrorMessage,
} from '../lib/api';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../lib/auth';

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
  const { user } = useAuth();
  // The same door the server uses: pastoral facts are for admins and elders.
  const canSeePastoral = user?.role === 'admin' || user?.role === 'elder';

  const GENDER_OPTIONS: { value: Gender; label: string }[] = [
    { value: 'brother', label: t('publishers.gender.brother') },
    { value: 'sister', label: t('publishers.gender.sister') },
  ];
  const SPIRITUAL_STATUS_OPTIONS: {
    value: SpiritualStatus;
    label: string;
  }[] = [
    { value: 'other_sheep', label: t('publishers.spiritualStatus.otherSheep') },
    { value: 'anointed', label: t('publishers.spiritualStatus.anointed') },
    { value: 'unknown', label: t('publishers.spiritualStatus.unknown') },
  ];

  const APPOINTMENT_OPTIONS: { value: PublisherAppointment; label: string }[] = [
    { value: 'publisher', label: t('publishers.appointment.publisher') },
    { value: 'unbaptized_publisher', label: t('publishers.appointment.unbaptized') },
    { value: 'student', label: t('publishers.appointment.student') },
    {
      value: 'ministerial_servant',
      label: t('publishers.appointment.ministerial_servant'),
    },
    { value: 'elder', label: t('publishers.appointment.elder') },
  ];

  const PIONEER_OPTIONS: { value: PioneerType; label: string }[] = [
    { value: 'none', label: t('publishers.pioneer.options.none') },
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
    spiritualStatus: initial?.spiritualStatus ?? 'unknown',
    ministryStartDate: initial?.ministryStartDate ?? '',
    pioneerType: initial?.pioneerType ?? 'none',
    pioneerSince: initial?.pioneerSince ?? '',
    isActive: initial?.isActive ?? true,
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
    if (
      form.appointment === 'unbaptized_publisher' &&
      !form.ministryStartDate?.trim()
    ) {
      setError(t('publishers.validation.ministryStartRequired'));
      return;
    }
    if (form.pioneerType !== 'none' && !form.pioneerSince?.trim()) {
      setError(t('publishers.validation.pioneerSinceRequired'));
      return;
    }
    try {
      await onSubmit(form);
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  // Field visibility by appointment (three distinct stages):
  // - student: only the appointment chips (no dates, status, or pioneer).
  // - unbaptized publisher: ministry-start date + spiritual status + pioneer;
  //   no baptism date yet.
  // - baptized (publisher / MS / elder): baptism date + spiritual status +
  //   pioneer; no ministry-start date.
  const isUnbaptized = form.appointment === 'unbaptized_publisher';
  const isBaptized =
    form.appointment === 'publisher' ||
    form.appointment === 'ministerial_servant' ||
    form.appointment === 'elder';
  const showBaptismDate = isBaptized;
  const showMinistryStart = isUnbaptized;
  const showSpiritualStatus = isUnbaptized || isBaptized;
  // Only baptized publishers may be pioneers; unbaptized publishers can only
  // report field service (the "served" checkbox).
  const showPioneer = isBaptized;

  return (
    <ScrollView
      style={styles.container}
      // On a wide browser window the fields would otherwise run the full width
      // of the screen, which is tiring to read and scan; the form keeps to a
      // comfortable column and centres itself.
      contentContainerStyle={styles.content}
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
              appointment:
                v === 'sister' &&
                (prev.appointment === 'elder' ||
                  prev.appointment === 'ministerial_servant')
                  ? 'publisher'
                  : prev.appointment,
              capabilities:
                v === 'sister' && prev.capabilities?.hospitality === undefined
                  ? { ...prev.capabilities, hospitality: true }
                  : prev.capabilities,
            }))
          }
        />
        <DateField
          label={t('publishers.fields.birthDate')}
          value={form.birthDate}
          onChange={(v) => update('birthDate', v)}
          placeholder={t('publishers.placeholders.date')}
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
          options={APPOINTMENT_OPTIONS.filter(
            (o) =>
              form.gender !== 'sister' ||
              (o.value !== 'ministerial_servant' && o.value !== 'elder'),
          )}
          onChange={(v) =>
            setForm((prev) => {
              const next = { ...prev, appointment: v };
              // Clear fields that don't apply to the new stage, so stale data
              // (e.g. a baptism date on someone moved back to student) is not
              // carried over.
              if (v === 'student') {
                next.baptismDate = '';
                next.ministryStartDate = '';
                next.spiritualStatus = 'unknown';
                next.pioneerType = 'none';
                next.pioneerSince = '';
              } else if (v === 'unbaptized_publisher') {
                // Unbaptized publishers can't be pioneers.
                next.baptismDate = '';
                next.pioneerType = 'none';
                next.pioneerSince = '';
              } else {
                // Baptized: no ministry-start date.
                next.ministryStartDate = '';
              }
              return next;
            })
          }
        />
        {showBaptismDate && (
          <DateField
            label={t('publishers.fields.baptismDate')}
            value={form.baptismDate}
            onChange={(v) => update('baptismDate', v)}
            placeholder={t('publishers.placeholders.date')}
          />
        )}
        {showSpiritualStatus && (
          <FormChips
            label={t('publishers.fields.spiritualStatus')}
            value={form.spiritualStatus ?? 'unknown'}
            options={SPIRITUAL_STATUS_OPTIONS}
            onChange={(v) => update('spiritualStatus', v)}
          />
        )}
        {showMinistryStart && (
          <DateField
            label={t('publishers.fields.ministryStart')}
            value={form.ministryStartDate}
            onChange={(v) => update('ministryStartDate', v)}
            placeholder={t('publishers.placeholders.date')}
          />
        )}
        {showPioneer && (
          <>
            <FormChips
              label={t('publishers.fields.pioneerType')}
              value={form.pioneerType}
              options={PIONEER_OPTIONS}
              onChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  pioneerType: v,
                  pioneerSince: v === 'none' ? '' : prev.pioneerSince,
                }))
              }
            />
            {form.pioneerType !== 'none' && (
              <DateField
                label={t('publishers.fields.pioneerSince')}
                value={form.pioneerSince}
                onChange={(v) => update('pioneerSince', v)}
                placeholder={t('publishers.placeholders.date')}
              />
            )}
          </>
        )}
      </FormSection>

      <FormSection title={t('publishers.sections.capabilities')}>
        <CapabilitiesEditor
          value={form.capabilities ?? {}}
          onChange={updateCapabilities}
          gender={form.gender}
        />
      </FormSection>

      {/* What the annual congregation report asks about. Kept behind the same
          door as the service status: these are pastoral facts, and the server
          does not even send them to anyone else. Recorded here rather than
          counted by hand each September, so the yearly figures come out right
          on their own. */}
      {canSeePastoral ? (
        <FormSection title={t('publishers.sections.circumstances')}>
          {(
            [
              ['isDeaf', 'publishers.fields.isDeaf'],
              ['isBlind', 'publishers.fields.isBlind'],
              ['isImprisoned', 'publishers.fields.isImprisoned'],
            ] as const
          ).map(([key, label]) => (
            <View key={key} style={styles.circumstanceRow}>
              <Text style={styles.circumstanceLabel}>{t(label)}</Text>
              <Switch
                value={form[key] === true}
                onValueChange={(v) => update(key, v)}
                trackColor={{ false: '#e2e8f0', true: '#7dd3fc' }}
                thumbColor={form[key] === true ? '#0ea5e9' : '#f8fafc'}
              />
            </View>
          ))}
        </FormSection>
      ) : null}

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
  circumstanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  circumstanceLabel: { flex: 1, fontSize: 14.5, color: '#0f172a' },
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: {
    paddingBottom: 32,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },
  actions: { paddingHorizontal: 12, paddingVertical: 20, gap: 10 },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: '#0ea5e9' },
  buttonDisabled: { opacity: 0.6 },
  buttonPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  buttonSecondaryText: { color: '#475569', fontSize: 16, fontWeight: '500', fontFamily: 'Manrope_500Medium',},
});
