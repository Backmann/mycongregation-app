import { goBack } from '../../../components/NavHistory';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  extractErrorMessage,
  publishersApi,
  RemovalImpact,
  RemovalReason,
  serviceReportsApi,
  UpdatePublisherInput,
} from '../../../lib/api';
import { useTranslation } from 'react-i18next';
import i18n from '../../../lib/i18n';
import { PublisherForm } from '../../../components/PublisherForm';
import { PublisherAccessContent } from '../../../components/PublisherAccessContent';
import { PublisherCardView } from '../../../components/publisher-card/PublisherCardView';
import { useAuth } from '../../../lib/auth';
import { usePermissions } from '../../../lib/permissions';
import { Dialog } from '../../../components/Dialog';
import { reportError, notify } from '../../../lib/error-bus';
import { buildS21Html, availableServiceYears } from '../../../lib/s21';
import { exportHtmlAsPdf, openPrintWindow } from '../../../lib/pdf';
import { confirm } from '../../../components/ConfirmHost';
import { failsScreen } from '../../../lib/screen-failure';
import { Toast } from '../../../components/ErrorToast';
import { NoAccess } from '../../../components/NoAccess';

function removalLabel(reason: RemovalReason): string {
  return i18n.t(`publishers.removal.${reason}`);
}

/**
 * Turns the server's «publisher_has_history: service_reports=4, duties=1» into
 * «отчёты о служении (4), обязанности (1)», or '' when there is no detail —
 * an older server, or a refusal that carried no list.
 *
 * A table we have no word for is shown by its own name rather than dropped:
 * the server asks the schema, so a table added later is refused correctly long
 * before anyone here has a translation for it, and «cart_shifts (2)» is a far
 * better answer than silence about what is in the way.
 */
function describePurgeHolders(
  raw: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const detail = raw.split('publisher_has_history:')[1];
  if (!detail) return '';
  const parts: string[] = [];
  for (const chunk of detail.split(',')) {
    const [table, count] = chunk.trim().split('=');
    if (!table) continue;
    const key = `publishers.purge.holders.${table.trim()}`;
    const label = t(key);
    const name = label === key ? table.trim() : label;
    const n = Number(count);
    parts.push(Number.isFinite(n) && n > 0 ? `${name} (${n})` : name);
  }
  return parts.join(', ');
}

export default function PublisherDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PublisherDetail id={id} />;
}

/**
 * The card itself — on its own screen, and beside the list on a wide screen
 * (app/(app)/publishers/list.tsx, 22 October 2026, mockup «Ширина экранов»).
 */
export function PublisherDetail({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const confirmContactsMutation = useMutation({
    mutationFn: () => publishersApi.confirmContacts(id as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publisher', id] });
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      queryClient.invalidateQueries({ queryKey: ['me-publisher'] });
    },
  });
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState<RemovalReason | null>(null);
  const [removeDate, setRemoveDate] = useState('');
  const [removeNote, setRemoveNote] = useState('');
  /**
   * Close the sign-in too — ticked by default (23 October 2026, Lionel's
   * decision). A departed elder used to keep his role and his reports.
   */
  const [closeAccount, setCloseAccount] = useState(true);
  const impactQuery = useQuery({
    queryKey: ['publisher', id, 'removal-impact'],
    queryFn: () => publishersApi.removalImpact(id!),
    enabled: !!id && removeOpen,
  });

  const {
    data: publisher,
    isLoading,
    error,
  } = useQuery({
    throwOnError: failsScreen,
    queryKey: ['publisher', id],
    queryFn: () => publishersApi.getById(id!),
    enabled: !!id,
  });

  // Service history for the S-21 record card (web print). Loaded lazily —
  // S-21 record card (web print) via the dedicated, elder-guarded endpoint.
  const [s21Open, setS21Open] = useState(false);
  const [s21Loading, setS21Loading] = useState(false);
  const s21Years = useMemo(() => availableServiceYears(), []);
  const generateS21 = async (serviceYear: number) => {
    if (!id) return;
    // On web, open the print window synchronously (inside the click) so it
    // isn't blocked as a popup; fill it once data arrives.
    const preopened = openPrintWindow();
    setS21Loading(true);
    try {
      const pkg = await serviceReportsApi.getS21Data(id, serviceYear);
      const html = buildS21Html(pkg, i18n.language);
      await exportHtmlAsPdf(html, {
        fileName: 'S-21',
        preopenedWindow: preopened,
      });
    } catch (e) {
      // Used to fail in silence: the dialog closed and no report appeared.
      if (preopened) preopened.close();
      reportError(extractErrorMessage(e));
    } finally {
      setS21Loading(false);
      setS21Open(false);
    }
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
    mutationFn: (vars: {
      reason: RemovalReason;
      date?: string;
      note?: string;
      closeAccount?: boolean;
    }) => publishersApi.remove(id!, vars),
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
    setCloseAccount(true);
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
      closeAccount:
        !!impactQuery.data?.account?.closable && closeAccount,
    });
  };

  const isAdmin = user?.role === 'admin';
  // The computed status (active/irregular/inactive) is pastoral information for
  // elders — it must be visible ONLY to admins and elders, never to the
  // publisher themselves or anyone else, since seeing "inactive" on one's own
  // card could be hurtful. It exists to help elders support publishers.
  const canSeeStatus = user?.role === 'admin' || user?.role === 'elder';
  const { canEditPublishers, canGenerateS21 } = usePermissions();
  const purgeMutation = useMutation({
    mutationFn: () => publishersApi.purge(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['publishers'] });
      goBack('/publishers');
    },
    onError: (e: unknown) => {
      const raw = extractErrorMessage(e);
      const holders = describePurgeHolders(raw, t);
      // Known by its code (PUBLISHER_HAS_HISTORY) and, for an older server,
      // by the words it begins with; the list of what holds the card stays
      // in the server's sentence, which this screen reads for itself.
      const code = (e as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
      const body = code === 'PUBLISHER_HAS_HISTORY' || raw.includes('publisher_has_history')
        ? holders
          ? t('publishers.purge.hasHistoryNamed', { holders })
          : t('publishers.purge.hasHistory')
        : raw;
      if (Platform.OS === 'web') {
        window.alert(body);
      } else {
        notify(t('publishers.purge.title'), body);
      }
    },
  });
  const handlePurge = async () => {
    if (
      await confirm({
        title: t('publishers.purge.title'),
        body: t('publishers.purge.confirm', { name: publisher?.displayName ?? '' }),
        confirmLabel: t('publishers.purge.action'),
        danger: true,
      })
    ) {
      purgeMutation.mutate();
    }
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
    // Refused the way every screen is refused (audit, 22 October 2026): the
    // red «доступны только … назначенным братьям» told a ministerial
    // servant — an appointed brother — that he was one of them.
    if (status === 403) {
      return (
        <View style={styles.center}>
          <NoAccess />
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ? extractErrorMessage(error) : t('publishers.notFound')}</Text>
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
          // Missing since the field came (13 July 2026): the form started at
          // «Не указано», and saving the card for any reason wiped what was
          // set — the mark the S-21 prints. Found 30 October 2026.
          spiritualStatus: publisher.spiritualStatus ?? undefined,
          ministryStartDate: publisher.ministryStartDate ?? undefined,
          pioneerType: publisher.pioneerType,
          pioneerSince: publisher.pioneerSince ?? undefined,
          // Without it the form starts at 100, and saving anything on the
          // card would quietly take a 90 back to 100.
          pioneerMonthGoal: publisher.pioneerMonthGoal ?? null,
          isActive: publisher.isActive,
          notes: publisher.notes ?? undefined,
          capabilities: publisher.capabilities ?? {},
        }}
        onSubmit={updateMutation.mutateAsync}
        publisherId={id}
        onCorrectPioneerKind={async (kind) => {
          await publishersApi.correctPioneerKind(id!, kind);
          await queryClient.invalidateQueries({ queryKey: ['publisher', id] });
        }}
        isSubmitting={updateMutation.isPending}
        submitLabel={t('publishers.actions.save')}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      // Same comfortable column as the edit form, so switching between viewing
      // and editing doesn't shift the layout under the reader.
      contentContainerStyle={styles.content}
    >
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

      <PublisherCardView
        publisher={publisher}
        pastoral={canSeeStatus}
        isAdmin={isAdmin}
        actions={{
          canEdit: canEditPublishers,
          canS21: canGenerateS21 && publisher.appointment !== 'student',
          onEdit: () => setEditing(true),
          onS21: () => setS21Open(true),
          onConfirmContacts: () => confirmContactsMutation.mutate(),
          confirmingContacts: confirmContactsMutation.isPending,
        }}
        access={
          <View style={styles.accessWrap}>
            <PublisherAccessContent publisher={publisher} />
          </View>
        }
        footer={
          // Who touched the card last, and the two actions nobody should
          // reach for by accident — at the foot, small, apart from the rest.
          <View style={styles.foot}>
            {publisher.lastEditedByName ? (
              <Text style={styles.footText}>
                {t('publishers.lastEdited', {
                  name: publisher.lastEditedByName,
                  when: new Date(publisher.updatedAt).toLocaleString(i18n.language, {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  }),
                })}
              </Text>
            ) : null}
            {!publisher.deletedAt && canEditPublishers ? (
              <View style={styles.footRow}>
                <Pressable onPress={handleRemove} disabled={removeMutation.isPending} hitSlop={6} testID="card-remove">
                  <Text style={styles.footDanger}>
                    {removeMutation.isPending
                      ? t('publishers.actions.removing')
                      : t('publishers.actions.remove')}
                  </Text>
                </Pressable>
                <Text style={styles.footText}>{t('publishers.removal.hint')}</Text>
              </View>
            ) : null}
            {isAdmin ? (
              <Pressable onPress={handlePurge} disabled={purgeMutation.isPending} hitSlop={6}>
                <Text style={styles.footPurge}>
                  {purgeMutation.isPending
                    ? t('publishers.purge.deleting')
                    : t('publishers.purge.button')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
      />
      <Dialog
        visible={s21Open}
        title={t('publishers.s21.title')}
        icon="document-text-outline"
        cancelLabel={t('common.cancel')}
        onCancel={() => setS21Open(false)}
        scroll
      >
        <Text style={styles.s21Section}>{t('publishers.s21.year')}</Text>
        {s21Loading ? (
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
      </Dialog>

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
        impact={impactQuery.data ?? null}
        closeAccount={closeAccount}
        onCloseAccount={setCloseAccount}
        onCancel={() => setRemoveOpen(false)}
        onSubmit={submitRemove}
      />
    </ScrollView>
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
  impact,
  closeAccount,
  onCloseAccount,
  onCancel,
  onSubmit,
}: {
  impact: RemovalImpact | null;
  closeAccount: boolean;
  onCloseAccount: (v: boolean) => void;
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
              {/* The day decides which reports keep him — said where it is
                  typed, since «moved on the 1st» and «moved on the 31st» put
                  him in different annual reports. */}
              <Text style={styles.modalDateHint}>
                {t('publishers.removal.dateHint')}
              </Text>
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
          {impact && (impact.account?.active || impact.responsibilities.length > 0) ? (
            <View style={styles.leaveBox}>
              {impact.account?.active ? (
                <>
                  <View style={styles.leaveHead}>
                    <Ionicons name="lock-closed-outline" size={18} color="#b45309" />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.leaveTitle}>
                        {t('publishers.removal.hasAccount')}
                      </Text>
                      <Text style={styles.leaveSub}>
                        {t('publishers.removal.accountRole', {
                          role: t(`admin.users.roles.${impact.account.role}`),
                        })}
                      </Text>
                    </View>
                  </View>
                  {impact.account.closable ? (
                    <Pressable
                      style={styles.leaveCheck}
                      onPress={() => onCloseAccount(!closeAccount)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: closeAccount }}
                    >
                      <Ionicons
                        name={closeAccount ? 'checkbox' : 'square-outline'}
                        size={22}
                        color="#0e7490"
                      />
                      <Text style={styles.leaveCheckText}>
                        {t('publishers.removal.closeAccount')}
                      </Text>
                      <Text style={styles.leaveCheckHint}>
                        {t('publishers.removal.recommended')}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.leaveSub}>
                      {t(`serverError.codes.${impact.account.refusal ?? 'ACCOUNT_NOT_CLOSABLE'}`, {
                        defaultValue: t('publishers.removal.accountKept'),
                      })}
                    </Text>
                  )}
                </>
              ) : null}
              {impact.responsibilities.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={styles.leaveTitleSmall}>
                    {t('publishers.removal.responsibilitiesGo')}
                  </Text>
                  <View style={styles.leaveChips}>
                    {impact.responsibilities.map((r) => (
                      <Text key={r} style={styles.leaveChip}>
                        {t(`responsibilities.types.${r}`)}
                      </Text>
                    ))}
                  </View>
                  <Text style={styles.leaveSub}>
                    {t('publishers.removal.assignOther')}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
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
      {/* Its own strip: the root one is drawn under this window. */}
      <Toast layer />
    </Modal>
  );
}

const styles = StyleSheet.create({
  leaveBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
    borderRadius: 14,
    padding: 12,
    gap: 10,
  },
  leaveHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  leaveTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#78350f' },
  leaveTitleSmall: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#78350f' },
  leaveSub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#92400e' },
  leaveCheck: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
  },
  leaveCheckText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#0f172a', flex: 1 },
  leaveCheckHint: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#64748b' },
  leaveChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  leaveChip: {
    fontFamily: 'Manrope_600SemiBold',
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: {
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 32,
    width: '100%',
    maxWidth: 1120,
    alignSelf: 'center',
  },
  foot: { alignItems: 'center', gap: 8, paddingVertical: 10 },
  footRow: { alignItems: 'center', gap: 2 },
  footText: { fontFamily: 'Manrope_400Regular', fontSize: 12, color: '#94a3b8', textAlign: 'center' },
  footDanger: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: '#b91c1c' },
  footPurge: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#94a3b8', textDecorationLine: 'underline' },
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
    fontFamily: 'Manrope_700Bold',
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
  reasonChipText: { color: '#334155', fontSize: 14, fontFamily: 'Manrope_600SemiBold',},
  reasonChipTextActive: { color: '#fff' },
  modalDateHint: {
    fontFamily: 'Manrope_400Regular',
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
    marginTop: 4,
  },
  modalFieldLabel: {
    fontSize: 13,
    color: '#64748b',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 4,
  },
  modalInput: {
    fontFamily: 'Manrope_400Regular',
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
  modalBtnCancelText: { color: '#334155', fontFamily: 'Manrope_600SemiBold',},
  modalBtnConfirm: { backgroundColor: '#dc2626' },
  modalBtnConfirmText: { color: '#fff', fontFamily: 'Manrope_700Bold',},
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { fontFamily: 'Manrope_400Regular', color: '#dc2626', fontSize: 16, textAlign: 'center' },


  removedBanner: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
    borderWidth: 1,
    marginHorizontal: 12,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
  },
  removedText: { color: '#92400e', fontFamily: 'Manrope_600SemiBold',},
  removedNote: { fontFamily: 'Manrope_400Regular', color: '#78350f', marginTop: 4, fontSize: 13 },

  accessWrap: { paddingHorizontal: 14, paddingVertical: 4 },
  // Labels read like the form's: same size and weight, so a value looks the
  // same whether you are reading it or about to change it.


  s21Section: {
    fontFamily: 'Manrope_400Regular',
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
  s21YearLabel: { fontSize: 15, fontFamily: 'Manrope_600SemiBold', color: '#0f172a' },
});
