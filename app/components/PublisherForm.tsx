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

interface Props {
  initial?: Partial<CreatePublisherInput>;
  onSubmit: (data: CreatePublisherInput) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'brother', label: 'Brother' },
  { value: 'sister', label: 'Sister' },
];

const APPOINTMENT_OPTIONS: { value: PublisherAppointment; label: string }[] = [
  { value: 'publisher', label: 'Publisher' },
  { value: 'unbaptized_publisher', label: 'Unbaptized' },
  { value: 'ministerial_servant', label: 'MS' },
  { value: 'elder', label: 'Elder' },
  { value: 'none', label: 'None' },
];

const PIONEER_OPTIONS: { value: PioneerType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'auxiliary_until_cancelled', label: 'Auxiliary' },
  { value: 'regular', label: 'Regular' },
  { value: 'special', label: 'Special' },
  { value: 'missionary', label: 'Missionary' },
];

export function PublisherForm({
  initial,
  onSubmit,
  onCancel,
  isSubmitting,
  submitLabel = 'Save',
}: Props) {
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
    isFamilyHead: initial?.isFamilyHead ?? false,
    printedWatchtower: initial?.printedWatchtower ?? false,
    printedWorkbook: initial?.printedWorkbook ?? false,
    sendsReportDirectly: initial?.sendsReportDirectly ?? false,
    isElderlyOrInfirm: initial?.isElderlyOrInfirm ?? false,
    isChild: initial?.isChild ?? false,
    isDeaf: initial?.isDeaf ?? false,
    isBlind: initial?.isBlind ?? false,
    isPrisoner: initial?.isPrisoner ?? false,
    spiritualNotes: initial?.spiritualNotes ?? '',
    notes: initial?.notes ?? '',
    capabilities: initial?.capabilities ?? {},
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
      setError('First name is required');
      return;
    }
    if (!form.lastName?.trim()) {
      setError('Last name is required');
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
      <FormSection title="Personal">
        <FormField
          label="First name"
          value={form.firstName}
          onChangeText={(v) => update('firstName', v)}
          required
          placeholder="Иван"
        />
        <FormField
          label="Middle name / Patronymic"
          value={form.middleName}
          onChangeText={(v) => update('middleName', v)}
          placeholder="Иванович"
        />
        <FormField
          label="Last name"
          value={form.lastName}
          onChangeText={(v) => update('lastName', v)}
          required
          placeholder="Иванов"
        />
        <FormChips
          label="Gender"
          value={form.gender}
          options={GENDER_OPTIONS}
          onChange={(v) => update('gender', v)}
        />
        <FormField
          label="Birth date"
          value={form.birthDate}
          onChangeText={(v) => update('birthDate', v)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
      </FormSection>

      <FormSection title="Contact">
        <FormField
          label="Mobile phone"
          value={form.mobilePhone}
          onChangeText={(v) => update('mobilePhone', v)}
          placeholder="+49 170 1234567"
          keyboardType="phone-pad"
        />
        <FormField
          label="Email"
          value={form.email}
          onChangeText={(v) => update('email', v)}
          placeholder="ivan@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormField
          label="Address"
          value={form.address}
          onChangeText={(v) => update('address', v)}
          multiline
        />
      </FormSection>

      <FormSection title="Spirituality">
        <FormChips
          label="Appointment"
          value={form.appointment}
          options={APPOINTMENT_OPTIONS}
          onChange={(v) => update('appointment', v)}
        />
        <FormField
          label="Baptism date"
          value={form.baptismDate}
          onChangeText={(v) => update('baptismDate', v)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <FormField
          label="Ministry start (unbaptized)"
          value={form.ministryStartDate}
          onChangeText={(v) => update('ministryStartDate', v)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <FormChips
          label="Pioneer type"
          value={form.pioneerType}
          options={PIONEER_OPTIONS}
          onChange={(v) => update('pioneerType', v)}
        />
        <FormField
          label="Pioneer since"
          value={form.pioneerSince}
          onChangeText={(v) => update('pioneerSince', v)}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <FormSwitch
          label="Anointed"
          value={form.isAnointed}
          onValueChange={(v) => update('isAnointed', v)}
        />
        <FormSwitch
          label="Kingdom Hall key"
          value={form.hasKingdomHallKey}
          onValueChange={(v) => update('hasKingdomHallKey', v)}
        />
        <FormField
          label="Spiritual notes"
          value={form.spiritualNotes}
          onChangeText={(v) => update('spiritualNotes', v)}
          multiline
        />
      </FormSection>

      <FormSection title="Capabilities">
        <CapabilitiesEditor
          value={form.capabilities ?? {}}
          onChange={updateCapabilities}
          gender={form.gender}
        />
      </FormSection>

      <FormSection title="Status">
        <FormSwitch
          label="Active"
          value={form.isActive}
          onValueChange={(v) => update('isActive', v)}
        />
        <FormSwitch
          label="Regular"
          value={form.isRegular}
          onValueChange={(v) => update('isRegular', v)}
        />
        <FormSwitch
          label="Family head"
          value={form.isFamilyHead}
          onValueChange={(v) => update('isFamilyHead', v)}
        />
        <FormSwitch
          label="Printed Watchtower"
          value={form.printedWatchtower}
          onValueChange={(v) => update('printedWatchtower', v)}
        />
        <FormSwitch
          label="Printed Workbook"
          value={form.printedWorkbook}
          onValueChange={(v) => update('printedWorkbook', v)}
        />
        <FormSwitch
          label="Sends report directly to branch"
          value={form.sendsReportDirectly}
          onValueChange={(v) => update('sendsReportDirectly', v)}
        />
      </FormSection>

      <FormSection title="Special needs">
        <FormSwitch
          label="Elderly or infirm"
          value={form.isElderlyOrInfirm}
          onValueChange={(v) => update('isElderlyOrInfirm', v)}
        />
        <FormSwitch
          label="Child"
          value={form.isChild}
          onValueChange={(v) => update('isChild', v)}
        />
        <FormSwitch
          label="Deaf"
          value={form.isDeaf}
          onValueChange={(v) => update('isDeaf', v)}
        />
        <FormSwitch
          label="Blind"
          value={form.isBlind}
          onValueChange={(v) => update('isBlind', v)}
        />
        <FormSwitch
          label="Prisoner"
          value={form.isPrisoner}
          onValueChange={(v) => update('isPrisoner', v)}
        />
      </FormSection>

      <FormSection title="Notes">
        <FormField
          label="General notes"
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
            <Text style={styles.buttonPrimaryText}>{submitLabel}</Text>
          )}
        </Pressable>
        {onCancel && (
          <Pressable
            style={[styles.button, styles.buttonSecondary]}
            onPress={onCancel}
            disabled={isSubmitting}
          >
            <Text style={styles.buttonSecondaryText}>Cancel</Text>
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
