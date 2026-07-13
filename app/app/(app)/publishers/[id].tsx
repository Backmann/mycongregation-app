import { Children, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extractErrorMessage,
  Publisher,
  publishersApi,
  RemovalReason,
  serviceReportsApi,
  UpdatePublisherInput,
} from '../../../lib/api';
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';
import { PublisherForm } from '../../../components/PublisherForm';
import { PublisherAccessContent } from '../../../components/PublisherAccessContent';
import {
  CAPABILITY_CATEGORIES,
  countActiveCapabilities,
} from '../../../lib/capabilities';
import { useAuth } from '../../../lib/auth';
import { usePermissions } from '../../../lib/permissions';
import { buildS21Html, availableServiceYears } from '../../../lib/s21';

function removalLabel(reason: RemovalReason): string {
  return i18n.t(`publishers.removal.${reason}`);
}

export default function PublisherDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
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

  // Service history for the S-21 record card (web print). Loaded lazily —
  // only when the card is opened.
  const [s21Open, setS21Open] = useState(false);
  const historyQuery = useQuery({
    queryKey: ['publisher-history', id],
    queryFn: () => serviceReportsApi.getHistoryForPublisher(id!, 120),
    enabled: !!id && s21Open,
  });
  const s21Years = useMemo(() => availableServiceYears(), []);
  const generateS21 = (serviceYear: number) => {
    setS21Open(false);
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !publisher) {
      return;
    }
    const html = buildS21Html(
      { publisher, timeline: historyQuery.data?.timeline ?? [] },
      serviceYear,
    );
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

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

  const isAdmin = user?.role === 'admin';
  // The computed status (active/irregular/inactive) is pastoral information for
  // elders — it must be visible ONLY to admins and elders, never to the
  // publisher themselves or anyone else, since seeing "inactive" on one's own
  // card could be hurtful. It exists to help elders support publishers.
  const canSeeStatus = user?.role === 'admin' || user?.role === 'elder';
  const { canEditPublishers } = usePermissions();
  const purgeMutation = useMutation({
    mutationFn: () => publishersApi.purge(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      router.back();
    },
    onError: (e: unknown) => {
      const raw = extractErrorMessage(e);
      const body = raw.includes('publisher_has_history')
        ? t('publishers.purge.hasHistory')
        : raw;
      if (Platform.OS === 'web') {
        window.alert(body);
      } else {
        Alert.alert(t('publishers.purge.title'), body);
      }
    },
  });
  const handlePurge = () => {
    const msg = t('publishers.purge.confirm', {
      name: publisher?.displayName ?? '',
    });
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) purgeMutation.mutate();
      return;
    }
    Alert.alert(t('publishers.purge.title'), msg, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('publishers.purge.action'),
        style: 'destructive',
        onPress: () => purgeMutation.mutate(),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !publisher) {
    const status = (error as { response?: { status?: number } } | null)
      ?.response?.status;
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {status === 403
            ? t('publishers.cardRestricted')
            : error
              ? extractErrorMessage(error)
              : t('publishers.notFound')}
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
          isActive: publisher.isActive,
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
        {publisher.isAuxiliaryPioneerNow ? (
          <View style={styles.auxRow}>
            <Ionicons name="infinite" size={15} color="#0F6E56" />
            <Text style={styles.auxRowText}>
              {t('auxPioneer.servesAsAux')}
            </Text>
          </View>
        ) : null}
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
        {canSeeStatus && publisher.status ? (
          <View style={styles.statusRow}>
            <Text style={styles.statusRowLabel}>
              {t('publishers.fields.status')}
            </Text>
            <View
              style={[
                styles.statusBadge,
                publisher.status === 'active' && styles.statusBadgeActive,
                publisher.status === 'irregular' && styles.statusBadgeIrregular,
                publisher.status === 'inactive' && styles.statusBadgeInactive,
              ]}
            >
              <Text style={styles.statusBadgeText}>
                {t(`publishers.status.${publisher.status}`)}
              </Text>
            </View>
          </View>
        ) : null}
      </Section>

      {isAdmin && (
        <Section title={t('publishers.sections.appAccess')}>
          <View style={styles.accessWrap}>
            <PublisherAccessContent publisher={publisher} />
          </View>
        </Section>
      )}

      {publisher.lastEditedByName ? (
        <Text
          style={{
            color: '#94a3b8',
            fontSize: 12,
            textAlign: 'center',
            marginBottom: 10,
            paddingHorizontal: 16,
          }}
        >
          Изменил: {publisher.lastEditedByName} ·{' '}
          {new Date(publisher.updatedAt).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {!publisher.deletedAt && canEditPublishers && (
          <Pressable
            style={[styles.button, styles.buttonEdit]}
            onPress={() => setEditing(true)}
          >
            <Text style={styles.buttonEditText}>{t('publishers.actions.edit')}</Text>
          </Pressable>
        )}
        {!publisher.deletedAt && Platform.OS === 'web' && canEditPublishers && (
          <Pressable
            style={[styles.button, styles.buttonS21]}
            onPress={() => setS21Open(true)}
          >
            <Ionicons
              name="document-text-outline"
              size={16}
              color="#0369a1"
              style={{ marginRight: 6 }}
            />
            <Text style={styles.buttonS21Text}>
              {t('publishers.s21.button')}
            </Text>
          </Pressable>
        )}
        {!publisher.deletedAt && canEditPublishers && (
          <>
            <Pressable
              style={[styles.button, styles.buttonRemove]}
              onPress={handleRemove}
              disabled={removeMutation.isPending}
            >
              <Text style={styles.buttonRemoveText}>
                {removeMutation.isPending
                  ? t('publishers.actions.removing')
                  : t('publishers.actions.remove')}
              </Text>
            </Pressable>
            <Text style={styles.actionHint}>
              {t('publishers.removal.hint')}
            </Text>
          </>
        )}
        {isAdmin && (
          <Pressable
            style={[styles.button, styles.buttonPurge]}
            onPress={handlePurge}
            disabled={purgeMutation.isPending}
          >
            <Text style={styles.buttonPurgeText}>
              {purgeMutation.isPending
                ? t('publishers.purge.deleting')
                : t('publishers.purge.button')}
            </Text>
          </Pressable>
        )}
      </View>
      <Modal
        visible={s21Open}
        transparent
        animationType="fade"
        onRequestClose={() => setS21Open(false)}
      >
        <Pressable style={styles.s21Overlay} onPress={() => setS21Open(false)}>
          <Pressable style={styles.s21Card} onPress={() => {}}>
            <Text style={styles.s21Title}>{t('publishers.s21.title')}</Text>
            <Text style={styles.s21Section}>{t('publishers.s21.year')}</Text>
            {historyQuery.isLoading ? (
              <ActivityIndicator style={{ marginVertical: 16 }} />
            ) : (
              s21Years.map((y) => (
                <Pressable
                  key={y}
                  style={styles.s21YearRow}
                  onPress={() => generateS21(y)}
                >
                  <Text style={styles.s21YearLabel}>
                    {y - 1}/{y}
                  </Text>
                  <Ionicons name="print-outline" size={18} color="#0369a1" />
                </Pressable>
              ))
            )}
          </Pressable>
        </Pressable>
      </Modal>

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
      <View style={styles.headerRoleChip}>
        <Text style={styles.headerRoleChipText}>
          {publisher.gender === 'brother'
            ? i18n.t('publishers.gender.brother')
            : i18n.t('publishers.gender.sister')}
          {publisher.appointment !== 'publisher' &&
          publisher.appointment !== 'unbaptized_publisher'
            ? ` · ${appointmentLabel(publisher.appointment)}`
            : ''}
        </Text>
      </View>
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
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {value ? (
        <Text style={styles.fieldValue}>{value}</Text>
      ) : (
        <Text style={styles.fieldEmpty}>—</Text>
      )}
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
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onCancel}
          accessibilityRole="button"
        />
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  statusRowLabel: { fontSize: 14, color: '#64748b' },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#94a3b8',
  },
  statusBadgeActive: { backgroundColor: '#10b981' },
  statusBadgeIrregular: { backgroundColor: '#f59e0b' },
  statusBadgeInactive: { backgroundColor: '#94a3b8' },
  statusBadgeText: { color: '#fff', fontSize: 12.5, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  auxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 12,
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#E1F5EE',
  },
  auxRowText: { fontSize: 13, fontWeight: '600', color: '#0F6E56' },
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
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
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
  reasonChipText: { color: '#334155', fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  reasonChipTextActive: { color: '#fff' },
  modalFieldLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
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
  modalBtnCancelText: { color: '#334155', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  modalBtnConfirm: { backgroundColor: '#dc2626' },
  modalBtnConfirmText: { color: '#fff', fontWeight: '700', fontFamily: 'Manrope_700Bold',},
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { color: '#dc2626', fontSize: 16, textAlign: 'center' },

  headerSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  headerAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerAvatarText: { color: '#fff', fontWeight: '700', fontFamily: 'Manrope_700Bold', fontSize: 28 },
  headerName: {
    fontSize: 22,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  headerRoleChip: {
    marginTop: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  headerRoleChipText: { color: '#475569', fontSize: 13, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},

  removedBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderWidth: 1,
    margin: 16,
    padding: 12,
    borderRadius: 8,
  },
  removedText: { color: '#92400e', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  removedNote: { color: '#78350f', marginTop: 4, fontSize: 13 },

  section: { marginHorizontal: 16, marginTop: 18 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    marginLeft: 4,
    marginBottom: 8,
    letterSpacing: 0.6,
  },
  sectionBody: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginHorizontal: 16 },
  field: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  accessWrap: { paddingHorizontal: 16, paddingVertical: 4 },
  fieldLabel: { fontSize: 12, color: '#94a3b8', marginBottom: 3 },
  fieldValue: { fontSize: 15, color: '#0f172a', fontWeight: '500', fontFamily: 'Manrope_500Medium',},
  fieldEmpty: { fontSize: 15, color: '#cbd5e1' },

  emptyCaps: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
    padding: 16,
  },
  capCategory: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  capCategoryLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 6,
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
  },
  capChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  capChip: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  capChipText: { color: '#0369a1', fontSize: 12, fontWeight: '500', fontFamily: 'Manrope_500Medium',},

  actions: { paddingHorizontal: 16, paddingTop: 22, gap: 10 },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonEdit: { backgroundColor: '#0ea5e9' },
  buttonEditText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Manrope_700Bold',},
  buttonS21: {
    backgroundColor: '#e0f2fe',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonS21Text: {
    color: '#0369a1',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  s21Overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    justifyContent: 'center',
    padding: 28,
  },
  s21Card: { backgroundColor: '#fff', borderRadius: 14, padding: 18 },
  s21Title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  s21Section: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    marginBottom: 4,
  },
  s21YearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
  },
  s21YearLabel: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  buttonRemove: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  buttonRemoveText: { color: '#dc2626', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  buttonPurge: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#fca5a5',
  },
  buttonPurgeText: { color: '#7f1d1d', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  actionHint: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -2,
    marginBottom: 4,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
});
