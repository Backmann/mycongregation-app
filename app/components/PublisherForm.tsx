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
import i18n from '../lib/i18n';
import { formatDay } from '../lib/date-range';
import { Ionicons } from '@expo/vector-icons';
import { confirm } from './ConfirmHost';
import { PioneerEndSheet } from './publisher-card/PioneerEndSheet';
import { monthName } from '../lib/aux-application';

interface Props {
  initial?: Partial<CreatePublisherInput>;
  onSubmit: (data: CreatePublisherInput) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  /**
   * «The kind was written down wrong» — corrects the open spell for all its
   * months (23 October 2026). Only offered when editing a current pioneer.
   */
  onCorrectPioneerKind?: (kind: PioneerType) => Promise<unknown>;
  /** The card being edited — for what ending a pioneer's service would meet. */
  publisherId?: string;
}

const PERMANENT_KINDS: PioneerType[] = ['regular', 'special', 'missionary'];

/** The first day of the current month, as the date field writes it. */
function firstOfThisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// Option arrays moved inside PublisherForm to use translations

export function PublisherForm({
  initial,
  onSubmit,
  onCorrectPioneerKind,
  publisherId,
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
    memberSince: initial?.memberSince ?? '',
    pioneerType: initial?.pioneerType ?? 'none',
    pioneerSince: initial?.pioneerSince ?? '',
    pioneerMonthGoal: initial?.pioneerMonthGoal ?? 100,
    isActive: initial?.isActive ?? true,
    notes: initial?.notes ?? '',
    capabilities:
      initial?.capabilities ??
      (initial?.gender === 'sister' ? { hospitality: true } : {}),
  });

  /**
   * «Когда он пришёл в наше собрание?» — asked of a NEW card only
   * (1 November 2026). Counting for his standing and the reports begins no
   * earlier than this month; «давно» leaves the date empty, as for everyone
   * who was here before. An existing card shows the date as a plain field.
   */
  const isNew = !initial;
  const [arrival, setArrival] = useState<'now' | 'month' | 'long'>('now');
  const ARRIVAL_OPTIONS: { value: 'now' | 'month' | 'long'; label: string }[] = [
    { value: 'now', label: t('publishers.memberSince.now') },
    { value: 'month', label: t('publishers.memberSince.month') },
    { value: 'long', label: t('publishers.memberSince.long') },
  ];

  const [error, setError] = useState<string | null>(null);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  /**
   * Ending a pioneer's service is one step with one question — his last
   * month (30 October 2026). Picking «Нет» on a pioneer's card asks it; the
   * answer goes with the save.
   */
  const [endSheet, setEndSheet] = useState(false);
  const [endMonth, setEndMonth] = useState<string | null>(null);
  /**
   * A change of kind is a new appointment from a month on (23 October 2026):
   * the old date stayed in the field, the server took it as the new start,
   * and the whole past turned into the new kind. Now the field moves to this
   * month and says what stays in the history.
   */
  const initialKind = initial?.pioneerType ?? 'none';
  const wasPermanent = PERMANENT_KINDS.includes(initialKind);
  const kindChanged =
    wasPermanent &&
    PERMANENT_KINDS.includes(form.pioneerType ?? 'none') &&
    form.pioneerType !== initialKind;
  // A whole date, as the language writes it: «1 сентября 2024 г.» — a bare
  // month put «с сентябрь» into the Russian sentence.
  const monthYear = (iso?: string | null) =>
    iso ? formatDay(iso.slice(0, 10), i18n.language, { year: 'always' }) : '';
  const kindLabel = (k: PioneerType) => t(`publishers.pioneer.options.${k}`);
  const correctTo = async (kind: PioneerType) => {
    if (!onCorrectPioneerKind) return;
    const ok = await confirm({
      title: t('publishers.pioneer.correctTitle'),
      body: t('publishers.pioneer.correctBody', {
        from: kindLabel(initialKind),
        to: kindLabel(kind),
        since: monthYear(initial?.pioneerSince),
      }),
      confirmLabel: t('publishers.pioneer.correctConfirm'),
    });
    if (!ok) return;
    setCorrecting(true);
    try {
      await onCorrectPioneerKind(kind);
      setForm((prev) => ({ ...prev, pioneerType: kind }));
      setCorrectOpen(false);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setCorrecting(false);
    }
  };

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
    const sinceText = form.memberSince?.trim() ?? '';
    if (isNew && arrival === 'month' && !sinceText) {
      setError(t('publishers.memberSince.required'));
      return;
    }
    // New card: «только что» — left to the server (this month); a month —
    // that month; «давно» — no date. Existing card: the field as it stands.
    const { memberSince: _since, ...rest } = form;
    const memberSince: string | null | undefined = isNew
      ? arrival === 'now'
        ? undefined
        : arrival === 'month'
          ? sinceText
          : null
      : sinceText || null;
    const payload: CreatePublisherInput =
      memberSince === undefined ? rest : { ...rest, memberSince };
    try {
      await onSubmit(
        endMonth && wasPermanent && form.pioneerType === 'none'
          ? { ...payload, pioneerEndMonth: endMonth }
          : payload,
      );
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
  // Shown to the baptized as well: it is where their reporting began, it is
  // read by the status, and once cleared there was nowhere to put it back.
  const showMinistryStart = isUnbaptized || isBaptized;
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
              }
              // A baptized publisher KEEPS his ministry start. This used to
              // clear it, on the reasoning that the date belongs to the
              // unbaptized stage — and it does, but that stage is exactly when
              // the man began handing in reports. Wiping it told the service
              // status that his reporting life began at baptism, and a brother
              // with a year of reports behind him turned «неактивный» the
              // night his baptism date was entered.
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
        {showMinistryStart && isNew && (
          <>
            <FormChips
              label={t('publishers.memberSince.question')}
              value={arrival}
              options={ARRIVAL_OPTIONS}
              onChange={setArrival}
            />
            {arrival === 'month' && (
              <DateField
                label={t('publishers.fields.memberSince')}
                value={form.memberSince ?? ''}
                onChange={(v) => update('memberSince', v)}
                placeholder={t('publishers.placeholders.date')}
              />
            )}
            <Text style={styles.sinceHint}>
              {t(`publishers.memberSince.hint.${arrival}`)}
            </Text>
          </>
        )}
        {showMinistryStart && !isNew && (
          <>
            <DateField
              label={t('publishers.fields.memberSince')}
              value={form.memberSince ?? ''}
              onChange={(v) => update('memberSince', v)}
              placeholder={t('publishers.placeholders.date')}
            />
            <Text style={styles.sinceHint}>
              {t('publishers.memberSince.hint.edit')}
            </Text>
          </>
        )}
        {showPioneer && (
          <>
            <FormChips
              label={t('publishers.fields.pioneerType')}
              value={form.pioneerType}
              options={PIONEER_OPTIONS}
              onChange={(v) => {
                // A pioneer's service ending asks for its last month first.
                if (wasPermanent && v === 'none' && form.pioneerType !== 'none') {
                  setEndSheet(true);
                  return;
                }
                if (v !== 'none') setEndMonth(null);
                setForm((prev) => ({
                  ...prev,
                  pioneerType: v,
                  pioneerSince:
                    v === 'none'
                      ? ''
                      : wasPermanent && v === initialKind
                        ? (initial?.pioneerSince ?? '')
                        : wasPermanent && PERMANENT_KINDS.includes(v)
                          ? firstOfThisMonth()
                          : prev.pioneerSince,
                }));
              }}
            />
            {wasPermanent && form.pioneerType === 'none' && endMonth ? (
              <View style={styles.kindHint}>
                <Ionicons name="flag-outline" size={16} color="#475569" />
                <Text style={styles.kindHintText}>
                  {t('pioneerEnd.formRow', { month: monthName(endMonth, i18n.language) })}
                </Text>
                <Pressable onPress={() => setEndSheet(true)} hitSlop={6}>
                  <Text style={styles.correctLinkText}>{t('pioneerEnd.change')}</Text>
                </Pressable>
              </View>
            ) : null}
            <PioneerEndSheet
              visible={endSheet}
              publisherId={publisherId ?? null}
              kind={initialKind}
              since={initial?.pioneerSince ? initial.pioneerSince.slice(0, 7) : null}
              thisMonth={firstOfThisMonth().slice(0, 7)}
              onClose={() => setEndSheet(false)}
              onConfirm={(m) => {
                setEndMonth(m);
                setEndSheet(false);
                setForm((prev) => ({ ...prev, pioneerType: 'none', pioneerSince: '' }));
              }}
            />
            {form.pioneerType !== 'none' && (
              <DateField
                label={t('publishers.fields.pioneerSince')}
                value={form.pioneerSince}
                onChange={(v) => update('pioneerSince', v)}
                placeholder={t('publishers.placeholders.date')}
              />
            )}
            {/* Special pioneers and missionaries: 100 hours a month, or 90
                (Lionel, 30 October 2026). The server keeps it for these two
                kinds only and forgets it when the kind changes. */}
            {form.pioneerType === 'special' || form.pioneerType === 'missionary' ? (
              <FormChips
                label={t('publishers.fields.pioneerMonthGoal')}
                value={form.pioneerMonthGoal === 90 ? 90 : 100}
                options={[
                  { value: 100, label: t('publishers.pioneer.monthGoal', { n: 100 }) },
                  { value: 90, label: t('publishers.pioneer.monthGoal', { n: 90 }) },
                ]}
                onChange={(v) => setForm((prev) => ({ ...prev, pioneerMonthGoal: v }))}
              />
            ) : null}
            {kindChanged ? (
              <View style={styles.kindHint}>
                <Ionicons name="time-outline" size={16} color="#475569" />
                <Text style={styles.kindHintText}>
                  {t('publishers.pioneer.kindChangeHint', {
                    kind: kindLabel(initialKind),
                    since: monthYear(initial?.pioneerSince),
                  })}
                </Text>
              </View>
            ) : null}
            {wasPermanent &&
            onCorrectPioneerKind &&
            form.pioneerType === initialKind ? (
              correctOpen ? (
                <View style={styles.kindHint}>
                  <Text style={styles.kindHintText}>
                    {t('publishers.pioneer.correctPick')}
                  </Text>
                  <View style={styles.correctRow}>
                    {PERMANENT_KINDS.filter((k) => k !== initialKind).map((k) => (
                      <Pressable
                        key={k}
                        style={styles.correctBtn}
                        disabled={correcting}
                        onPress={() => void correctTo(k)}
                      >
                        <Text style={styles.correctBtnText}>{kindLabel(k)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <Pressable
                  style={styles.correctLink}
                  onPress={() => setCorrectOpen(true)}
                  hitSlop={6}
                >
                  <Ionicons name="create-outline" size={16} color="#0e7490" />
                  <Text style={styles.correctLinkText}>
                    {t('publishers.pioneer.correctLink')}
                  </Text>
                </Pressable>
              )
            ) : null}
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
          {/* These three switches ARE the S-10 figures, so each says what the
              form asks rather than a short version of it. «Находится в
              заключении» reads as prison alone, while the form counts a
              psychiatric hospital and a drug-treatment clinic too — an elder
              who does not know that leaves the figure short. */}
          {(
            [
              ['isDeaf', 'publishers.fields.isDeaf', 'publishers.hints.isDeaf'],
              ['isBlind', 'publishers.fields.isBlind', null],
              [
                'isImprisoned',
                'publishers.fields.isImprisoned',
                'publishers.hints.isImprisoned',
              ],
            ] as const
          ).map(([key, label, hint]) => (
            <View key={key} style={styles.circumstanceRow}>
              <View style={styles.circumstanceText}>
                <Text style={styles.circumstanceLabel}>{t(label)}</Text>
                {hint ? (
                  <Text style={styles.circumstanceHint}>{t(hint)}</Text>
                ) : null}
              </View>
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
  kindHint: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    gap: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  // Under the «в нашем собрании с» question: room before the next field.
  sinceHint: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    marginTop: -4,
    marginBottom: 16,
  },
  kindHintText: {
    flex: 1,
    minWidth: 200,
    fontFamily: 'Manrope_400Regular',
    fontSize: 13,
    lineHeight: 19,
    color: '#334155',
  },
  correctRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  correctBtn: {
    borderWidth: 1,
    borderColor: '#0e7490',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 40,
    justifyContent: 'center',
  },
  correctBtnText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#0e7490' },
  correctLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 4,
    minHeight: 44,
  },
  correctLinkText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#0e7490', flexShrink: 1 },
  circumstanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  circumstanceText: { flex: 1, paddingRight: 12 },
  circumstanceLabel: { fontFamily: 'Manrope_400Regular', fontSize: 14.5, color: '#0f172a' },
  circumstanceHint: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 16,
  },
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
  errorText: { fontFamily: 'Manrope_400Regular', color: '#dc2626', fontSize: 14 },
  actions: { paddingHorizontal: 12, paddingVertical: 20, gap: 10 },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: '#0ea5e9' },
  buttonDisabled: { opacity: 0.6 },
  buttonPrimaryText: { color: '#fff', fontSize: 16, fontFamily: 'Manrope_600SemiBold',},
  buttonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  buttonSecondaryText: { color: '#475569', fontSize: 16, fontFamily: 'Manrope_500Medium',},
});
