import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { confirm } from '../../../components/ConfirmHost';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../../lib/auth';
import {
  extractErrorMessage,
  meApi,
  serviceReportsApi,
  auxiliaryPioneersApi,
} from '../../../lib/api';
import { useTranslation } from 'react-i18next';
import { LoadFailure } from '../../../components/LoadFailure';
import { formatMonthLabel } from '../../../lib/i18n';
import { notify } from '../../../lib/error-bus';

// formatMonth replaced by formatMonthLabel from lib/i18n.ts

function getRecentMonths(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  // Start from last month: the current month has not finished yet, so a report
  // for it cannot be submitted (in July you report for June).
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    months.push({
      value: `${yyyy}-${mm}`,
      label: formatMonthLabel(`${yyyy}-${mm}`),
    });
  }
  return months;
}

/**
 * The server refusing a month it already holds.
 *
 * It answers 409 with a sentence written for a developer, in English — and
 * that sentence was going straight onto the screen of a publisher filing a
 * report. The status is the part worth reading; the wording belongs to us.
 */
function isAlreadySubmitted(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    (error as { response?: { status?: number } }).response?.status === 409
  );
}

/** YYYY-MM-DD or YYYY-MM-01 → YYYY-MM */
function toYearMonth(s: string): string {
  return s.slice(0, 7);
}

export default function NewOrEditServiceReportScreen() {
  const { t, i18n: i18nInstance } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    id?: string;
    publisherId?: string;
    onBehalfName?: string;
    onBehalfIsPioneer?: string;
    reportMonth?: string;
  }>();
  const editId = typeof params.id === 'string' ? params.id : undefined;
  const onBehalfPublisherId =
    typeof params.publisherId === 'string' ? params.publisherId : undefined;
  const onBehalfName =
    typeof params.onBehalfName === 'string' ? params.onBehalfName : undefined;
  const onBehalfIsPioneer = params.onBehalfIsPioneer === '1';
  const preFilledMonth =
    typeof params.reportMonth === 'string' ? params.reportMonth : undefined;
  const isEditMode = !!editId;
  const isOnBehalf = !!onBehalfPublisherId && !isEditMode;

  // Resolve current user's publisher (used for SELF submissions only).
  /**
   * Who am I, as a publisher.
   *
   * This used to pull the whole roster and look for the row whose userId
   * matched the signed-in user. That row never comes back for an ordinary
   * publisher: `userId` is one of the private fields the roster strips, so
   * nobody could see who has a login and who has not. The search therefore
   * always failed, and the screen concluded «Ваш аккаунт не привязан к записи
   * возвещателя» — for every publisher in the congregation, at exactly the
   * moment reports are due.
   *
   * /me/publisher answers the question directly, and is the endpoint that
   * exists for it: the server knows which publisher the login belongs to and
   * does not have to reveal that about anybody else.
   */
  const {
    data: myPublisher,
    isLoading: isLoadingPublisher,
    error: myPublisherError,
    refetch: refetchMyPublisher,
  } = useQuery({
    queryKey: ['me', 'publisher'],
    queryFn: async () => (await meApi.publisher()).publisher,
    enabled: !!user,
  });

  // Edit mode: fetch the report being edited.
  const { data: editingReport, isLoading: isLoadingReport } = useQuery({
    queryKey: ['service-report', editId],
    queryFn: () => serviceReportsApi.getById(editId!),
    enabled: isEditMode,
  });

  // Self-create: list user's reports to detect duplicate months.
  // Not used for edit mode or on-behalf submissions (target's history is
  // not available client-side; server catches duplicates via 23505).
  const { data: myReports } = useQuery({
    queryKey: ['service-reports', 'my'],
    queryFn: () => serviceReportsApi.listMy(),
    enabled: !isEditMode && !isOnBehalf,
  });

  // formatMonthLabel reads global i18next state — re-memoize when language changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const recentMonths = useMemo(() => getRecentMonths(), [i18nInstance.language]);
  const submittedMonths = useMemo(() => {
    if (!myReports) return new Set<string>();
    return new Set(myReports.map((r) => toYearMonth(r.reportMonth)));
  }, [myReports]);

  const [reportMonth, setReportMonth] = useState(
    preFilledMonth ? toYearMonth(preFilledMonth) : recentMonths[0].value,
  );

  // Whether the current user serves as an auxiliary pioneer in the selected
  // month — if so, the report uses the hours form even without pioneerType.
  const { data: iAmAuxThisMonth } = useQuery({
    queryKey: ['aux-pioneers', 'mine', reportMonth],
    queryFn: () => auxiliaryPioneersApi.mine(reportMonth),
    enabled: !isEditMode && !isOnBehalf && !!reportMonth,
    // Эндпоинт отвечает положением целиком; форме нужен только ответ «да/нет».
    // Ключ запроса общий с главной, поэтому и форма кэша должна быть одна.
    select: (s) => s.serving,
  });

  const [servedThisMonth, setServedThisMonth] = useState<boolean | null>(null);
  const [hours, setHours] = useState('');
  /**
   * Empty, not '0'.
   *
   * The field used to open with a zero already in it, so anyone with studies
   * to report had to delete a character before typing — and on a phone, with
   * the cursor at the end, that is a fiddly little fight at the exact moment a
   * person is trying to be quick. Empty reads the same to the eye (the
   * placeholder still shows 0) and submits the same: no answer means none.
   */
  const [bibleStudies, setBibleStudies] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  /** Digits only: a numeric keyboard still offers dots, commas and minuses. */
  const onlyDigits = (v: string) => v.replace(/[^0-9]/g, '').slice(0, 4);
  const studiesCount = parseInt(bibleStudies || '0', 10) || 0;
  const stepStudies = (by: number) => {
    const next = Math.max(0, studiesCount + by);
    setBibleStudies(next === 0 ? '' : String(next));
  };

  useEffect(() => {
    if (editingReport) {
      setReportMonth(toYearMonth(editingReport.reportMonth));
      setServedThisMonth(editingReport.servedThisMonth);
      setHours(
        editingReport.hoursReported !== null
          ? String(editingReport.hoursReported)
          : '',
      );
      // Same rule going the other way: a zero on file shows as an empty field,
      // so correcting a report starts from the same clean slate as filing one.
      setBibleStudies(
        editingReport.bibleStudies ? String(editingReport.bibleStudies) : '',
      );
      setNotes(editingReport.notes ?? '');
    }
  }, [editingReport]);

  // Pioneer status comes from the TARGET publisher in on-behalf mode,
  // not the caller (a publisher submitting for a pioneer must use the
  // pioneer form variant).
  // Form variant:
  // - edit mode: derive from the existing report itself (hoursReported set ⇒
  //   hours form). This is authoritative regardless of who is editing or the
  //   author's current pioneerType, and correctly covers auxiliary pioneers.
  // - on-behalf: from the target publisher's flag passed in.
  // - self-create: own pioneerType, or auxiliary pioneer this month.
  const isPioneer = isEditMode
    ? editingReport?.hoursReported != null
    : isOnBehalf
      ? onBehalfIsPioneer
      : (myPublisher?.pioneerType != null &&
          myPublisher.pioneerType !== 'none') ||
        iAmAuxThisMonth === true;

  const submitMutation = useMutation({
    // Shown in place by this form — keep it out of the global error strip,
    // which was repeating the very same sentence a second time.
    meta: { inlineError: true },
    mutationFn: () =>
      serviceReportsApi.submit({
        reportMonth,
        publisherId: isOnBehalf ? onBehalfPublisherId : undefined,
        servedThisMonth:
          !isPioneer && servedThisMonth !== null ? servedThisMonth : undefined,
        hoursReported: isPioneer ? parseInt(hours, 10) : undefined,
        bibleStudies: parseInt(bibleStudies || '0', 10),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-reports'] });
      setSubmitted(true);
    },
    onError: (err) => {
      // 409 means the month is already filed — most often because it was filed
      // somewhere else: another device, another tab, or an elder entering it
      // for this publisher. The screen's list of months was simply older than
      // the truth, so it offered a month that is gone. Refetch, and the month
      // marks itself «сдан» instead of leaving a red line the reader cannot
      // act on.
      if (isAlreadySubmitted(err)) {
        void queryClient.invalidateQueries({ queryKey: ['service-reports'] });
      }
    },
  });

  const updateMutation = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      serviceReportsApi.update(editId!, {
        servedThisMonth:
          !isPioneer && servedThisMonth !== null ? servedThisMonth : undefined,
        hoursReported: isPioneer ? parseInt(hours, 10) : undefined,
        bibleStudies: parseInt(bibleStudies || '0', 10),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-reports'] });
      queryClient.invalidateQueries({ queryKey: ['service-report', editId] });
      setSubmitted(true);
    },
  });

  const mutation = isEditMode ? updateMutation : submitMutation;
  const isMonthLocked = isEditMode || isOnBehalf;

  function isDuplicateMonth(): boolean {
    return !isEditMode && !isOnBehalf && submittedMonths.has(reportMonth);
  }

  /**
   * Why the submit button is off, in words.
   *
   * It used to be a grey rectangle with the explanation wired to onPress — and
   * a disabled Pressable never fires onPress, so that explanation could not be
   * reached by anyone. A person was left tapping a dead button with nothing to
   * read.
   */
  function blockedReason(): string | null {
    if (isDuplicateMonth()) return t('reports.alreadySubmitted');
    if (isPioneer) {
      if (!hours.trim()) return t('reports.blocked.hoursNeeded');
      const h = parseInt(hours, 10);
      if (isNaN(h) || h < 0 || h > 744) return t('reports.blocked.hoursRange');
      return null;
    }
    if (servedThisMonth === null) return t('reports.blocked.answerNeeded');
    return null;
  }

  function canSubmit(): boolean {
    if (mutation.isPending) return false;
    if (isEditMode && !editingReport) return false;
    if (isDuplicateMonth()) return false;
    if (isPioneer) {
      const h = parseInt(hours, 10);
      return !isNaN(h) && h >= 0 && h <= 744;
    }
    return servedThisMonth !== null;
  }

  function handleSubmit() {
    if (!canSubmit()) {
      if (isDuplicateMonth()) {
        notify(
          t('reports.alerts.alreadySubmittedTitle'),
          t('reports.alerts.alreadySubmittedBody', { month: formatMonthLabel(reportMonth) }),
        );
        return;
      }
      notify(
        t('reports.alerts.validationTitle'),
        isPioneer
          ? t('reports.alerts.validationHours')
          : isOnBehalf
            ? t('reports.alerts.validationServedOnBehalf')
            : t('reports.alerts.validationServedSelf'),
      );
      return;
    }
    mutation.mutate();
  }

  if (isLoadingPublisher || (isEditMode && isLoadingReport)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // A failed request is not the same as "you have no publisher record", and
  // saying the second when the first happened sends the reader to an elder
  // over a network error.
  if (!isOnBehalf && myPublisherError) {
    return (
      <View style={styles.center}>
        <LoadFailure error={myPublisherError} onRetry={refetchMyPublisher} />
      </View>
    );
  }

  // For self submissions, caller must have a publisher record.
  // On-behalf submissions work even for admin users with no publisher.
  if (!isOnBehalf && !myPublisher) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {t('reports.errors.notLinkedToPublisher')}
        </Text>
      </View>
    );
  }

  if (isEditMode && editingReport && !editingReport.canEdit) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {t('reports.errors.selfEditWindowClosed')}
        </Text>
      </View>
    );
  }

  const screenTitle = isEditMode
    ? t('reports.title.edit')
    : isOnBehalf
      ? t('reports.title.onBehalf')
      : t('reports.title.new');

  // WHOSE report is on the screen.
  //
  // In edit mode this used to fall through to «my own card», because
  // `isOnBehalf` is deliberately false while editing. So opening Наталья's
  // month from her history put the READER's name and pioneer badge at the top
  // of her report — and it looked, convincingly, like your own. The report
  // itself now says who it belongs to.
  const personName = isEditMode
    ? (editingReport?.publisherName ?? myPublisher?.displayName ?? '')
    : isOnBehalf
      ? (onBehalfName ?? t('reports.publisher'))
      : (myPublisher?.displayName ?? '');
  /** True when this is somebody else's report — the header must say so. */
  const editingSomebodyElse =
    isEditMode &&
    !!editingReport?.publisherId &&
    !!myPublisher?.id &&
    editingReport.publisherId !== myPublisher.id;
  const monthLabel = formatMonthLabel(reportMonth);
  const reason = blockedReason();

  // Said out loud, then out of the way. A form that closes the moment you
  // press the button leaves you wondering whether it went; a screen that waits
  // for another tap is one tap too many.
  if (submitted) {
    return (
      <View style={styles.doneScreen}>
        <View style={styles.doneMark}>
          <Ionicons name="checkmark" size={40} color="#fff" />
        </View>
        <Text style={styles.doneTitle}>
          {isEditMode ? t('reports.done.updated') : t('reports.done.accepted')}
        </Text>
        <Text style={styles.doneMonth}>{monthLabel}</Text>
        <View style={styles.doneFigures}>
          {isPioneer ? (
            <Text style={styles.doneFigure}>
              {t('reports.done.hours', { count: parseInt(hours || '0', 10) })}
            </Text>
          ) : (
            <Text style={styles.doneFigure}>
              {servedThisMonth
                ? t('reports.done.shared')
                : t('reports.done.didNotShare')}
            </Text>
          )}
          {studiesCount > 0 ? (
            <Text style={styles.doneFigure}>
              {t('reports.studies', { count: studiesCount })}
            </Text>
          ) : null}
        </View>
        <Pressable style={styles.doneBtn} onPress={() => router.back()}>
          <Text style={styles.doneBtnText}>{t('common.done')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      // 'padding' is right on iOS and actively wrong on Android, where the
      // system already resizes the window: the two together push the form off
      // the top of the screen.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
    >
      <Stack.Screen options={{ title: screenTitle }} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Who and which month — the two facts a person checks before typing
            anything, together, once, at the top. */}
        <View style={[styles.headCard, isOnBehalf && styles.headCardOnBehalf]}>
          {isOnBehalf ? (
            <Text style={styles.headKicker}>
              {t('reports.submittingOnBehalfOf')}
            </Text>
          ) : isEditMode ? (
            <Text style={styles.headKicker}>
              {editingSomebodyElse
                ? t('reports.editingSomebodyElse')
                : t('reports.editingReport')}
            </Text>
          ) : null}
          <Text style={styles.headName}>{personName}</Text>
          <View style={styles.badgeRow}>
            {isPioneer ? (
              <View style={styles.badge}>
                <Ionicons name="infinite" size={13} color="#0F6E56" />
                <Text style={styles.badgeText}>
                  {/* «I am an auxiliary pioneer this month» is a fact about
                      the READER, so it has no business on somebody else's
                      report — it was labelling their month by your standing. */}
                  {iAmAuxThisMonth && !isOnBehalf && !isEditMode
                    ? t('reports.badge.auxPioneer')
                    : t('reports.badge.pioneer')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.label}>{t('reports.reportMonth')}</Text>
        {isMonthLocked ? (
          <View style={[styles.monthChip, styles.monthChipLocked]}>
            <Text style={styles.monthChipText}>{monthLabel}</Text>
          </View>
        ) : (
          <View style={styles.monthRow}>
            {recentMonths.map((m) => {
              const isSelected = reportMonth === m.value;
              const isTaken = submittedMonths.has(m.value);
              return (
                <Pressable
                  key={m.value}
                  onPress={() => !isTaken && setReportMonth(m.value)}
                  disabled={isTaken}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: isSelected,
                    disabled: isTaken,
                  }}
                  style={[
                    styles.monthChip,
                    isSelected && styles.monthChipActive,
                    isTaken && styles.monthChipTaken,
                  ]}
                >
                  <Text
                    style={[
                      styles.monthChipText,
                      isSelected && styles.monthChipTextActive,
                      isTaken && styles.monthChipTextTaken,
                    ]}
                  >
                    {m.label}
                  </Text>
                  {/* «Сдан» in words. A bare tick had to be guessed at, and it
                      is the difference between "done" and "chosen". */}
                  {isTaken ? (
                    <Text style={styles.monthChipTaken2}>
                      {t('reports.monthDone')}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        )}

        <View style={styles.card}>
          {isPioneer ? (
            <>
              <Text style={styles.fieldLabel}>{t('reports.hoursLabel')}</Text>
              {/* The one number this report is about, sized like it. */}
              <View style={styles.bigInputRow}>
                <TextInput
                  style={styles.bigInput}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={hours}
                  onChangeText={(v) => setHours(onlyDigits(v))}
                  placeholder="0"
                  placeholderTextColor="#cbd5e1"
                  maxLength={3}
                  selectTextOnFocus
                  accessibilityLabel={t('reports.hoursLabel')}
                />
                <Text style={styles.bigInputUnit}>
                  {t('common.hourUnit')}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.fieldLabel}>
                {isOnBehalf
                  ? t('reports.didTheyShare')
                  : t('reports.didYouShare')}
              </Text>
              <View style={styles.toggleRow}>
                <Pressable
                  onPress={() => setServedThisMonth(true)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: servedThisMonth === true }}
                  style={[
                    styles.toggleBtn,
                    servedThisMonth === true && styles.toggleBtnYes,
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color={servedThisMonth === true ? '#fff' : '#64748b'}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      servedThisMonth === true && styles.toggleTextActive,
                    ]}
                  >
                    {t('common.yes')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setServedThisMonth(false);
                    // Nobody conducts a study in a month they did not share in;
                    // leaving a number behind would file a report that argues
                    // with itself.
                    setBibleStudies('');
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: servedThisMonth === false }}
                  style={[
                    styles.toggleBtn,
                    servedThisMonth === false && styles.toggleBtnNo,
                  ]}
                >
                  <Ionicons
                    name="remove-circle-outline"
                    size={18}
                    color={servedThisMonth === false ? '#fff' : '#64748b'}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      servedThisMonth === false && styles.toggleTextActive,
                    ]}
                  >
                    {t('common.no')}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {isPioneer || servedThisMonth !== false ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.fieldLabel}>{t('reports.bibleStudies')}</Text>
              {/* Nearly always 0, 1 or 2 — two taps beat opening a keyboard,
                  and typing still works for the rest. */}
              <View style={styles.stepperRow}>
                <Pressable
                  onPress={() => stepStudies(-1)}
                  disabled={studiesCount === 0}
                  hitSlop={6}
                  accessibilityLabel={t('reports.studiesMinus')}
                  style={[
                    styles.stepBtn,
                    studiesCount === 0 && styles.stepBtnOff,
                  ]}
                >
                  <Ionicons
                    name="remove"
                    size={20}
                    color={studiesCount === 0 ? '#cbd5e1' : '#0f172a'}
                  />
                </Pressable>
                <TextInput
                  style={styles.stepValue}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  value={bibleStudies}
                  onChangeText={(v) => setBibleStudies(onlyDigits(v))}
                  placeholder="0"
                  placeholderTextColor="#cbd5e1"
                  maxLength={2}
                  selectTextOnFocus
                  accessibilityLabel={t('reports.bibleStudies')}
                />
                <Pressable
                  onPress={() => stepStudies(1)}
                  hitSlop={6}
                  accessibilityLabel={t('reports.studiesPlus')}
                  style={styles.stepBtn}
                >
                  <Ionicons name="add" size={20} color="#0f172a" />
                </Pressable>
              </View>
            </>
          ) : null}

          <View style={styles.divider} />
          <Text style={styles.fieldLabel}>{t('reports.notesOptional')}</Text>
          <TextInput
            style={styles.notesInput}
            multiline
            value={notes}
            onChangeText={setNotes}
            placeholder={t('reports.notesPlaceholder')}
            placeholderTextColor="#cbd5e1"
            textAlignVertical="top"
          />
        </View>

        {mutation.isError &&
          (isAlreadySubmitted(mutation.error) ? (
            <View style={styles.noticeBox}>
              <Ionicons name="information-circle" size={18} color="#0369a1" />
              <Text style={styles.noticeText}>
                {t('reports.alreadySubmittedFor', { month: monthLabel })}
              </Text>
            </View>
          ) : (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>
                {extractErrorMessage(mutation.error)}
              </Text>
            </View>
          ))}

        {isEditMode &&
          editId &&
          (user?.role === 'admin' || user?.role === 'elder') && (
            <Pressable
              onPress={() =>
                router.push(
                  `/service-reports/audit-log?id=${editId}&from=${encodeURIComponent(
                    `/service-reports/new?id=${editId}`,
                  )}` as any,
                )
              }
              style={styles.historyBtn}
              hitSlop={8}
            >
              <Ionicons name="time-outline" size={18} color="#0ea5e9" />
              <Text style={styles.historyBtnText}>
                {t('reports.viewEditHistory')}
              </Text>
            </Pressable>
          )}

        {/* Taking a report back, where it can be checked before it is done.
            An overseer ticking the wrong line used to be uncorrectable by
            anybody: the app had editing and no removing, so a mistaken row
            counted for ever — in who handed in, in the status, in the annual
            report. Soft, journalled, and reversible. */}
        {isEditMode && editingReport?.canEdit ? (
          <Pressable
            onPress={async () => {
              const ok = await confirm({
                title: t('reports.remove.title'),
                body: t('reports.remove.body', {
                  name: personName,
                  month: monthLabel,
                }),
                confirmLabel: t('reports.remove.confirm'),
              });
              if (!ok) return;
              await serviceReportsApi.remove(editingReport.id);
              queryClient.invalidateQueries({ queryKey: ['service-reports'] });
              queryClient.invalidateQueries({ queryKey: ['group-reports'] });
              queryClient.invalidateQueries({ queryKey: ['publisher-history'] });
              queryClient.invalidateQueries({ queryKey: ['my-report-standing'] });
              router.back();
            }}
            style={styles.removeBtn}
          >
            <Ionicons name="trash-outline" size={17} color="#b91c1c" />
            <Text style={styles.removeBtnText}>{t('reports.remove.action')}</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit()}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submitBtn,
            !canSubmit() && styles.submitBtnDisabled,
            pressed && canSubmit() && styles.submitBtnPressed,
          ]}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {isEditMode
                ? t('reports.updateReport')
                : t('reports.submitForMonth', { month: monthLabel })}
            </Text>
          )}
        </Pressable>
        {reason ? <Text style={styles.blockedHint}>{reason}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },

  // ---- Accepted ----
  doneScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#f1f5f9',
  },
  doneMark: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#10b981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTitle: {
    fontSize: 20,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    marginTop: 18,
    textAlign: 'center',
  },
  doneMonth: {
    fontSize: 15,
    color: '#64748b',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  doneFigures: { alignItems: 'center', marginTop: 14, gap: 2 },
  doneFigure: { fontSize: 15, color: '#0f172a' },
  doneBtn: {
    marginTop: 28,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },

  // ---- Head ----
  headCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  headCardOnBehalf: { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' },
  headKicker: {
    fontSize: 11,
    color: '#0369a1',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 4,
  },
  headName: {
    fontSize: 18,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E1F5EE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12.5,
    color: '#0F6E56',
    fontFamily: 'Manrope_600SemiBold',
  },

  // ---- Fields ----
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginTop: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: '#475569',
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 16,
    marginHorizontal: -16,
  },
  bigInputRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 8,
  },
  bigInput: {
    minWidth: 96,
    textAlign: 'center',
    fontSize: 40,
    lineHeight: 48,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    paddingVertical: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#e2e8f0',
  },
  bigInputUnit: { fontSize: 18, color: '#94a3b8' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnOff: { opacity: 0.5 },
  stepValue: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: 26,
    color: '#0f172a',
    fontFamily: 'Manrope_700Bold',
    paddingVertical: 2,
  },
  notesInput: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  blockedHint: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  submitBtnPressed: { opacity: 0.9 },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
    borderWidth: 1,
    borderRadius: 10,
  },
  noticeText: { flex: 1, color: '#0c4a6e', fontSize: 13.5, lineHeight: 19 },
  monthChipTaken2: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 1,
    textAlign: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#f1f5f9',
  },
  label: {
    fontSize: 13,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 8,
    lineHeight: 16,
  },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  monthChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthChipActive: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  monthChipTaken: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    opacity: 0.6,
  },
  monthChipLocked: {
    alignSelf: 'flex-start',
    backgroundColor: '#e0f2fe',
    borderColor: '#7dd3fc',
  },
  monthChipText: { fontSize: 14, color: '#0f172a' },
  monthChipTextActive: { color: '#fff', fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  monthChipTextTaken: { color: '#94a3b8' },
  toggleRow: { flexDirection: 'row', gap: 12 },
  toggleBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  toggleBtnYes: { backgroundColor: '#10b981', borderColor: '#10b981' },
  toggleBtnNo: { backgroundColor: '#64748b', borderColor: '#64748b' },
  toggleText: { fontSize: 16, fontWeight: '500', fontFamily: 'Manrope_500Medium', color: '#0f172a' },
  toggleTextActive: { color: '#fff', fontWeight: '700', fontFamily: 'Manrope_700Bold',},
  submitBtn: {
    backgroundColor: '#0ea5e9',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 24,
  },
  removeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 10,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  removeBtnText: {
    color: '#b91c1c',
    fontSize: 14.5,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff',
    marginTop: 16,
  },
  historyBtnText: { color: '#0ea5e9', fontSize: 14, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
  submitBtnDisabled: { backgroundColor: '#cbd5e1' },
  submitBtnText: { color: '#fff', fontWeight: '700', fontFamily: 'Manrope_700Bold', fontSize: 16 },
  errorBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
});
