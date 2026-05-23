import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extractErrorMessage,
  Publisher,
  publishersApi,
  RemovalReason,
  UpdatePublisherInput,
} from '../../../lib/api';
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';
import { PublisherForm } from '../../../components/PublisherForm';
import {
  CAPABILITY_CATEGORIES,
  countActiveCapabilities,
} from '../../../lib/capabilities';

function removalLabel(reason: RemovalReason): string {
  return i18n.t(`publishers.removal.${reason}`);
}

export default function PublisherDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState<RemovalReason | null>(null);
  const [removeDate, setRemoveDate] = useState('');
  const [removeNote, setRemoveNote] = useState('');

  const {
    data: publisher,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['publisher', id],
    queryFn: () => publishersApi.getById(id!),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdatePublisherInput) =>
      publishersApi.update(id!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      queryClient.invalidateQueries({ queryKey: ['publisher', id] });
      setEditing(false);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (vars: { reason: RemovalReason; date?: string; note?: string }) =>
      publishersApi.remove(id!, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      queryClient.invalidateQueries({ queryKey: ['publisher', id] });
      setRemoveOpen(false);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: () => publishersApi.restore(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      queryClient.invalidateQueries({ queryKey: ['publisher', id] });
    },
  });

  const handleRemove = () => {
    setRemoveReason(null);
    setRemoveDate('');
    setRemoveNote('');
    setRemoveOpen(true);
  };

  const reasonNeedsDate = (r: RemovalReason | null) =>
    r === 'died' || r === 'disfellowshipped' || r === 'moved';
  const removeValid =
    !!removeReason &&
    (!reasonNeedsDate(removeReason) || removeDate.trim().length > 0) &&
    (removeReason !== 'moved' || removeNote.trim().length > 0);
  const submitRemove = () => {
    if (!removeReason || !removeValid) return;
    removeMutation.mutate({
      reason: removeReason,
      date: removeDate.trim() || undefined,
      note: removeNote.trim() || undefined,
    });
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !publisher) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ? extractErrorMessage(error) : t('publishers.notFound')}
        </Text>
      </View>
    );
  }

  if (editing) {
    return (
      <PublisherForm
        initial={{
          firstName: publisher.firstName,
          middleName: publisher.middleName ?? undefined,
          lastName: publisher.lastName,
          gender: publisher.gender,
          birthDate: publisher.birthDate ?? undefined,
          mobilePhone: publisher.mobilePhone ?? undefined,
          email: publisher.email ?? undefined,
          address: publisher.address ?? undefined,
          appointment: publisher.appointment,
          baptismDate: publisher.baptismDate ?? undefined,
          ministryStartDate: publisher.ministryStartDate ?? undefined,
          pioneerType: publisher.pioneerType,
          pioneerSince: publisher.pioneerSince ?? undefined,
          isAnointed: publisher.isAnointed,
          hasKingdomHallKey: publisher.hasKingdomHallKey,
          isActive: publisher.isActive,
          isRegular: publisher.isRegular,
          isFamilyHead: publisher.isFamilyHead,
          printedWatchtower: publisher.printedWatchtower,
          printedWorkbook: publisher.printedWorkbook,
          sendsReportDirectly: publisher.sendsReportDirectly,
          isElderlyOrInfirm: publisher.isElderlyOrInfirm,
          isChild: publisher.isChild,
          isDeaf: publisher.isDeaf,
          isBlind: publisher.isBlind,
          isPrisoner: publisher.isPrisoner,
          spiritualNotes: publisher.spiritualNotes ?? undefined,
          notes: publisher.notes ?? undefined,
          capabilities: publisher.capabilities ?? {},
        }}
        onSubmit={updateMutation.mutateAsync}
        isSubmitting={updateMutation.isPending}
        submitLabel={t('publishers.actions.save')}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const totalActiveCaps = countActiveCapabilities(publisher.capabilities ?? {});

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <PublisherHeader publisher={publisher} />

      {publisher.deletedAt && (
        <View style={styles.removedBanner}>
          <Text style={styles.removedText}>
            {t('publishers.removedBanner')}
            {publisher.removalReason
              ? ` — ${removalLabel(publisher.removalReason)}`
              : ''}
          </Text>
          {publisher.removedNote && (
            <Text style={styles.removedNote}>{publisher.removedNote}</Text>
          )}
        </View>
      )}

      <Section title={t('publishers.sections.contact')}>
        <Field label={t('publishers.fields.phone')} value={publisher.mobilePhone} />
        <Field label={t('publishers.fields.email')} value={publisher.email} />
        <Field label={t('publishers.fields.address')} value={publisher.address} />
      </Section>

      <Section title={t('publishers.sections.spirituality')}>
        <Field
          label={t('publishers.fields.appointment')}
          value={appointmentLabel(publisher.appointment)}
        />
        <Field label={t('publishers.fields.baptism')} value={publisher.baptismDate} />
        <Field
          label={t('publishers.fields.pioneer')}
          value={pioneerLabel(publisher.pioneerType, publisher.pioneerSince)}
        />
        <Field label={t('publishers.fields.anointed')} value={publisher.isAnointed ? t('common.yes') : t('common.no')} />
        <Field
          label={t('publishers.fields.kingdomHallKey')}
          value={publisher.hasKingdomHallKey ? t('common.yes') : t('common.no')}
        />
        {publisher.spiritualNotes && (
          <Field label={t('publishers.fields.spiritualNotes')} value={publisher.spiritualNotes} />
        )}
      </Section>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t('publishers.sections.capabilities')} {totalActiveCaps > 0 ? `(${totalActiveCaps})` : ''}
        </Text>
        <View style={styles.sectionBody}>
          {totalActiveCaps === 0 ? (
            <Text style={styles.emptyCaps}>{t('publishers.noCapabilities')}</Text>
          ) : (
            CAPABILITY_CATEGORIES.map((category) => {
              const activeCaps = category.capabilities.filter(
                (c) => publisher.capabilities?.[c.key],
              );
              if (activeCaps.length === 0) return null;
              return (
                <View key={category.key} style={styles.capCategory}>
                  <Text style={styles.capCategoryLabel}>{t(`capabilities.categories.${category.key}`)}</Text>
                  <View style={styles.capChips}>
                    {activeCaps.map((cap) => (
                      <View key={cap.key} style={styles.capChip}>
                        <Text style={styles.capChipText}>{t(`capabilities.items.${cap.key}`)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>

      <Section title={t('publishers.sections.personal')}>
        <Field label={t('publishers.fields.birthDate')} value={publisher.birthDate} />
        <Field
          label={t('publishers.fields.gender')}
          value={publisher.gender === 'brother' ? t('publishers.gender.brother') : t('publishers.gender.sister')}
        />
        <Field label={t('publishers.fields.active')} value={publisher.isActive ? t('common.yes') : t('common.no')} />
        <Field
          label={t('publishers.fields.familyHead')}
          value={publisher.isFamilyHead ? t('common.yes') : t('common.no')}
        />
      </Section>

      {hasSpecialNeeds(publisher) && (
        <Section title={t('publishers.sections.specialNeeds')}>
          {publisher.isElderlyOrInfirm && (
            <Field label={t('publishers.fields.elderlyInfirmShort')} value={t('common.yes')} />
          )}
          {publisher.isChild && <Field label={t('publishers.fields.child')} value={t('common.yes')} />}
          {publisher.isDeaf && <Field label={t('publishers.fields.deaf')} value={t('common.yes')} />}
          {publisher.isBlind && <Field label={t('publishers.fields.blind')} value={t('common.yes')} />}
          {publisher.isPrisoner && <Field label={t('publishers.fields.prisoner')} value={t('common.yes')} />}
        </Section>
      )}

      <View style={styles.actions}>
        {!publisher.deletedAt && (
          <Pressable
            style={[styles.button, styles.buttonEdit]}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.buttonEditText}>{t('publishers.actions.edit')}</Text>
          </Pressable>
        )}
        {publisher.deletedAt ? (
          <Pressable
            style={[styles.button, styles.buttonRestore]}
            onPress={() => restoreMutation.mutate()}
            disabled={restoreMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {restoreMutation.isPending ? t('publishers.actions.restoring') : t('publishers.actions.restore')}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.button, styles.buttonRemove]}
            onPress={handleRemove}
            disabled={removeMutation.isPending}
          >
            <Text style={styles.buttonText}>
              {removeMutation.isPending ? t('publishers.actions.removing') : t('publishers.actions.remove')}
            </Text>
          </Pressable>
        )}
      </View>
      <RemoveModal
        visible={removeOpen}
        reason={removeReason}
        date={removeDate}
        note={removeNote}
        pending={removeMutation.isPending}
        valid={removeValid}
        onReason={setRemoveReason}
        onDate={setRemoveDate}
        onNote={setRemoveNote}
        onCancel={() => setRemoveOpen(false)}
        onSubmit={submitRemove}
      />
    </ScrollView>
  );
}

function PublisherHeader({ publisher }: { publisher: Publisher }) {
  const initials =
    (publisher.firstName[0] ?? '') + (publisher.lastName[0] ?? '');
  return (
    <View style={styles.headerSection}>
      <View
        style={[
          styles.headerAvatar,
          {
            backgroundColor:
              publisher.gender === 'brother' ? '#0ea5e9' : '#ec4899',
          },
        ]}
      >
        <Text style={styles.headerAvatarText}>{initials}</Text>
      </View>
      <Text style={styles.headerName}>{publisher.displayName}</Text>
      <Text style={styles.headerSub}>
        {publisher.gender === 'brother' ? i18n.t('publishers.gender.brother') : i18n.t('publishers.gender.sister')}
        {publisher.appointment !== 'publisher' &&
        publisher.appointment !== 'unbaptized_publisher'
          ? ` · ${appointmentLabel(publisher.appointment)}`
          : ''}
      </Text>
    </View>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldEmpty}>—</Text>
      </View>
    );
  }
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function appointmentLabel(a: Publisher['appointment']): string {
  return i18n.t(`publishers.appointment.${a}`);
}

function pioneerLabel(
  type: Publisher['pioneerType'],
  since: string | null,
): string {
  const label = i18n.t(`publishers.pioneer.detail.${type}`);
  return type === 'none' || !since
    ? label
    : i18n.t('publishers.pioneerSinceFormat', { label, date: since });
}

function hasSpecialNeeds(p: Publisher): boolean {
  return (
    p.isElderlyOrInfirm ||
    p.isChild ||
    p.isDeaf ||
    p.isBlind ||
    p.isPrisoner
  );
}

function RemoveModal({
  visible,
  reason,
  date,
  note,
  pending,
  valid,
  onReason,
  onDate,
  onNote,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  reason: RemovalReason | null;
  date: string;
  note: string;
  pending: boolean;
  valid: boolean;
  onReason: (r: RemovalReason) => void;
  onDate: (v: string) => void;
  onNote: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  const REASONS: RemovalReason[] = [
    'died',
    'moved',
    'disfellowshipped',
    'other',
  ];
  const dateLabel =
    reason === 'died'
      ? t('publishers.removal.dateDied')
      : reason === 'moved'
        ? t('publishers.removal.dateMoved')
        : reason === 'disfellowshipped'
          ? t('publishers.removal.dateRemoved')
          : t('publishers.removal.date');
  const noteLabel =
    reason === 'moved'
      ? t('publishers.removal.movedTo')
      : t('publishers.removal.note');
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {t('publishers.removal.modalTitle')}
          </Text>
          <View style={styles.reasonChips}>
            {REASONS.map((r) => (
              <Pressable
                key={r}
                style={[
                  styles.reasonChip,
                  reason === r && styles.reasonChipActive,
                ]}
                onPress={() => onReason(r)}
              >
                <Text
                  style={[
                    styles.reasonChipText,
                    reason === r && styles.reasonChipTextActive,
                  ]}
                >
                  {t(`publishers.removal.${r}`)}
                </Text>
              </Pressable>
            ))}
          </View>
          {reason && (
            <>
              <Text style={styles.modalFieldLabel}>{dateLabel}</Text>
              <TextInput
                style={styles.modalInput}
                value={date}
                onChangeText={onDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
              />
              <Text style={styles.modalFieldLabel}>{noteLabel}</Text>
              <TextInput
                style={styles.modalInput}
                value={note}
                onChangeText={onNote}
                placeholder={
                  reason === 'moved'
                    ? t('publishers.removal.movedToPlaceholder')
                    : ''
                }
                placeholderTextColor="#94a3b8"
              />
            </>
          )}
          <View style={styles.modalButtons}>
            <Pressable
              style={[styles.modalBtn, styles.modalBtnCancel]}
              onPress={onCancel}
            >
              <Text style={styles.modalBtnCancelText}>{t('common.cancel')}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.modalBtn,
                styles.modalBtnConfirm,
                (!valid || pending) && { opacity: 0.5 },
              ]}
              onPress={onSubmit}
              disabled={!valid || pending}
            >
              <Text style={styles.modalBtnConfirmText}>
                {pending
                  ? t('publishers.actions.removing')
                  : t('publishers.removal.confirm')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    gap: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 2,
  },
  reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reasonChip: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  reasonChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  reasonChipText: { color: '#334155', fontSize: 14, fontWeight: '600' },
  reasonChipTextActive: { color: '#fff' },
  modalFieldLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 4,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#0f172a',
  },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnCancel: { backgroundColor: '#f1f5f9' },
  modalBtnCancelText: { color: '#334155', fontWeight: '600' },
  modalBtnConfirm: { backgroundColor: '#dc2626' },
  modalBtnConfirmText: { color: '#fff', fontWeight: '700' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: '#dc2626', fontSize: 16, textAlign: 'center' },

  headerSection: {
    backgroundColor: '#fff',
    paddingTop: 24,
    paddingBottom: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerAvatarText: { color: '#fff', fontWeight: '700', fontSize: 28 },
  headerName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  headerSub: { color: '#64748b', marginTop: 4, fontSize: 14 },

  removedBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderWidth: 1,
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  removedText: { color: '#92400e', fontWeight: '600' },
  removedNote: { color: '#78350f', marginTop: 4, fontSize: 13 },

  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  sectionBody: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  field: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  fieldLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 2 },
  fieldValue: { fontSize: 15, color: '#0f172a' },
  fieldEmpty: { fontSize: 15, color: '#cbd5e1' },

  emptyCaps: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
  },
  capCategory: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  capCategoryLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
    fontWeight: '500',
  },
  capChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  capChip: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  capChipText: { color: '#0369a1', fontSize: 12, fontWeight: '500' },

  actions: { padding: 20, gap: 8 },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: 'center' },
  buttonEdit: { backgroundColor: '#0ea5e9' },
  buttonEditText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  buttonRemove: { backgroundColor: '#dc2626' },
  buttonRestore: { backgroundColor: '#059669' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
