import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RetirementPreview, extractErrorMessage, publicTalksApi } from '../../../lib/api';
import { DateField } from '../../../components/DateField';
import i18n from '../../../lib/i18n';
import { usePermissions } from '../../../lib/permissions';
import { confirm } from '../../../components/ConfirmHost';

/**
 * «Планы речей, которые больше не используются.»
 *
 * The instruction arrives as a paragraph — thirty-odd numbers and a date from
 * which they are not to be given. Retyping thirty numbers is thirty chances to
 * be one out, and being one out means a brother prepares a talk he must not
 * give. So the paragraph is pasted whole and the numbers are read out of it.
 *
 * TWO PRESSES, NEVER ONE. The first shows what would happen: every number with
 * its title, so the eye can check them, and — the part that earns its keep —
 * the weeks where one of these talks is still promised to a speaker. That is a
 * telephone call, not a database row, and the app must not pretend otherwise.
 * Only the second press retires anything.
 */
export default function RetireTalksScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { canCoordinatePublicTalks } = usePermissions();

  /**
   * Which of the two the coordinator is doing.
   *
   * Both come the same way — a letter naming numbers and giving grounds — so
   * they belong on one screen, not two. What differs is the direction and the
   * dates, and a talk lifted needs no dates at all.
   */
  const [mode, setMode] = useState<'retire' | 'lift'>('retire');
  /** How many decisions are on screen; the rest are a press away. */
  const [historyShown, setHistoryShown] = useState(12);
  const [text, setText] = useState('');
  const [from, setFrom] = useState('');
  /**
   * Empty means «for good» — the ordinary instruction. Filled means the talk
   * comes back by itself the day after, and nobody has to remember it.
   */
  const [until, setUntil] = useState('');
  /** «Объявления и напоминания, май 2026» — the grounds, kept with the fact. */
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<RetirementPreview | null>(null);

  /**
   * What was done last time, and on what grounds.
   *
   * Setting talks aside happens once or twice a year. Coming back to a blank
   * form, with no sign that anything ever happened, is how somebody does it
   * twice — or decides it never worked and stops trusting the screen.
   */
  /**
   * Every decision, newest first — not merely the last one.
   *
   * «В прошлый раз» is not the question a coordinator asks. He asks «на
   * основании чего речь 92 снята», and only a list, each line naming its own
   * letter, answers that.
   */
  const historyQuery = useQuery({
    queryKey: ['public-talks', 'history'],
    queryFn: () => publicTalksApi.history(),
  });
  const history = historyQuery.data ?? [];

  const previewMutation = useMutation({
    mutationFn: () =>
      publicTalksApi.retirementPreview({
        text,
        // A lifting has no date of its own; the preview only needs one to
        // decide which promises are still ahead, so today serves.
        from: mode === 'lift' ? new Date().toISOString().slice(0, 10) : from,
      }),
    onSuccess: (data) => setPreview(data),
  });

  const retireMutation = useMutation({
    mutationFn: (numbers: number[]) =>
      mode === 'lift'
        ? publicTalksApi
            .liftRestriction({ numbers, reason: reason.trim() || undefined })
            .then((r) => ({ retired: r.lifted }))
        : publicTalksApi.retireMissing({
            numbers,
            from,
            until: until.trim() || undefined,
            reason: reason.trim() || undefined,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-talks'] });
    },
  });

  /**
   * Ask before applying — for both acts.
   *
   * Setting talks aside is recoverable by bringing them back; LIFTING is not
   * so obviously so, because it removes a restriction a brother may not know
   * about. Neither had a question at all: the list was shown, and the next
   * press did it. One question, naming the number and the date, costs a second
   * and saves the wrong list going through.
   */
  const askThenApply = async () => {
    if (!preview) return;
    const numbers = preview.talks.map((tk) => tk.number);
    const ok = await confirm({
      title:
        mode === 'lift'
          ? t('publicTalks.retire.askLiftTitle', { count: numbers.length })
          : t('publicTalks.retire.askTitle', {
              count: numbers.length,
              date: from ? fmtDate(from) : '',
            }),
      body:
        mode === 'lift'
          ? t('publicTalks.retire.askLiftBody')
          : t('publicTalks.retire.askBody'),
      confirmLabel:
        mode === 'lift'
          ? t('publicTalks.retire.confirmLift')
          : t('publicTalks.retire.confirmShort'),
      cancelLabel: t('common.cancel'),
      danger: mode !== 'lift',
    });
    if (ok) retireMutation.mutate(numbers);
  };

  const fmtDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  if (!canCoordinatePublicTalks) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={28} color="#94a3b8" />
        <Text style={styles.noRights}>{t('publicTalks.retire.noRights')}</Text>
      </View>
    );
  }

  const ready =
    text.trim() !== '' && (mode === 'lift' || from.trim() !== '');
  const scheduledCount = preview?.scheduled.length ?? 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons name="close-circle-outline" size={26} color="#b45309" />
        </View>
        <Text style={styles.title}>{t('publicTalks.retire.title')}</Text>
        <Text style={styles.subtitle}>{t('publicTalks.retire.subtitle')}</Text>
      </View>

      {/* Which of the two acts. Both arrive as a letter naming numbers and
          giving grounds, so they share a screen; only the dates differ. */}
      <View style={styles.modeRow}>
        {(['retire', 'lift'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.modeChip, mode === m && styles.modeChipOn]}
            onPress={() => {
              setMode(m);
              setPreview(null);
            }}
          >
            <Text
              style={[styles.modeText, mode === m && styles.modeTextOn]}
            >
              {t(`publicTalks.retire.mode.${m}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        {/* A lifted talk needs no dates: it simply returns. */}
        {mode === 'retire' ? (
          <>
            <Text style={styles.label}>
              {t('publicTalks.retire.fromLabel')}
            </Text>
            <DateField value={from} onChange={setFrom} />

            <Text style={[styles.label, { marginTop: 16 }]}>
              {t('publicTalks.retire.untilLabel')}
            </Text>
            <DateField value={until} onChange={setUntil} />
            <Text style={styles.fieldHint}>
              {t('publicTalks.retire.untilHint')}
            </Text>
          </>
        ) : null}

        <Text style={[styles.label, { marginTop: 16 }]}>
          {t('publicTalks.retire.reasonLabel')}
        </Text>
        <TextInput
          style={styles.reasonInput}
          value={reason}
          onChangeText={setReason}
          placeholder={t('publicTalks.retire.reasonPlaceholder')}
          placeholderTextColor="#94a3b8"
        />

        <Text style={[styles.label, { marginTop: 16 }]}>
          {t('publicTalks.retire.textLabel')}
        </Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={(v) => {
            setText(v);
            setPreview(null);
          }}
          placeholder={t('publicTalks.retire.placeholder')}
          placeholderTextColor="#94a3b8"
          multiline
          textAlignVertical="top"
        />

        <Pressable
          style={[styles.primaryBtn, !ready && styles.primaryBtnOff]}
          disabled={!ready || previewMutation.isPending}
          onPress={() => previewMutation.mutate()}
        >
          {previewMutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {t('publicTalks.retire.check')}
            </Text>
          )}
        </Pressable>

        {previewMutation.isError ? (
          <Text style={styles.error}>
            {extractErrorMessage(previewMutation.error)}
          </Text>
        ) : null}
      </View>

      {preview ? (
        <>
          {/* The weeks that need a telephone call, first — they are the only
              part of this that cannot wait. */}
          {scheduledCount > 0 ? (
            <View style={styles.alertBox}>
              <Text style={styles.alertTitle}>
                {t('publicTalks.retire.scheduledTitle', {
                  count: scheduledCount,
                })}
              </Text>
              <Text style={styles.alertHint}>
                {t('publicTalks.retire.scheduledHint')}
              </Text>
              {preview.talks
                .filter((tk) => tk.scheduled.length > 0)
                .map((tk) =>
                  tk.scheduled.map((use) => (
                    <Pressable
                      key={`${tk.number}-${use.weekStartDate}`}
                      style={styles.scheduledRow}
                      onPress={() =>
                        router.push(
                          `/schedule?week=${use.weekStartDate}` as never,
                        )
                      }
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.scheduledTalk} numberOfLines={1}>
                          №{tk.number}. {tk.title}
                        </Text>
                        {/* The date of the meeting itself. A week is filed
                            under its Monday, and «26 октября» for a talk given
                            on the 1st of November matches nothing the
                            coordinator knows. */}
                        <Text style={styles.scheduledWhen}>
                          {fmtDate(use.meetingDate)}
                          {use.speakerName ? ` · ${use.speakerName}` : ''}
                          {use.speakerCongregation
                            ? `, ${use.speakerCongregation}`
                            : ''}
                        </Text>
                        <Text style={styles.scheduledSource}>
                          {t(`publicTalks.retire.source.${use.source}`)}
                        </Text>
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color="#b45309"
                      />
                    </Pressable>
                  )),
                )}
            </View>
          ) : null}

          {preview.unknownNumbers.length > 0 ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnText}>
                {t('publicTalks.retire.unknown', {
                  numbers: preview.unknownNumbers.join(', '),
                })}
              </Text>
            </View>
          ) : null}

          <Text style={styles.listHeader}>
            {mode === 'lift'
              ? t('publicTalks.retire.willLift', {
                  count: preview.talks.length,
                })
              : t('publicTalks.retire.willRetire', {
                  count: preview.talks.filter((tk) => !tk.alreadyRetired)
                    .length,
                })}
          </Text>
          <View style={styles.card}>
            {preview.talks.map((tk) => (
              <View key={tk.number} style={styles.talkRow}>
                <View
                  style={[
                    styles.numberBadge,
                    tk.alreadyRetired && styles.numberBadgeDone,
                  ]}
                >
                  <Text
                    style={[
                      styles.numberText,
                      tk.alreadyRetired && styles.numberTextDone,
                    ]}
                  >
                    {tk.number}
                  </Text>
                </View>
                <Text style={styles.talkTitle} numberOfLines={2}>
                  {tk.title}
                </Text>
                {tk.alreadyRetired ? (
                  <Text style={styles.alreadyText}>
                    {t('publicTalks.retire.already')}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>

          <Pressable
            style={[
              styles.retireBtn,
              retireMutation.isSuccess && styles.retireBtnDone,
            ]}
            disabled={retireMutation.isPending || retireMutation.isSuccess}
            onPress={() => void askThenApply()}
          >
            <Text style={styles.retireBtnText}>
              {retireMutation.isSuccess
                ? t(
                    mode === 'lift'
                      ? 'publicTalks.retire.liftDone'
                      : 'publicTalks.retire.done',
                    { count: retireMutation.data?.retired ?? 0 },
                  )
                : mode === 'lift'
                  ? t('publicTalks.retire.confirmLift')
                  : t('publicTalks.retire.confirm', {
                      date: from ? fmtDate(from) : '',
                    })}
            </Text>
          </Pressable>

          {retireMutation.isSuccess ? (
            <Pressable
              style={styles.backBtn}
              onPress={() => router.replace('/profile/public-talks' as never)}
            >
              <Text style={styles.backBtnText}>
                {t('publicTalks.retire.backToCatalogue')}
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {/* Every decision, each line naming its own letter. This is what answers
          «на основании чего речь 92 снята» a year later — and what tells the
          coordinator that a previous instruction was in fact carried out. */}
      {history.length > 0 ? (
        <>
          {/* A rule and real air above it: the history is a different subject
              from the button that precedes it, and pressed against it the two
              read as one block. */}
          <View style={styles.historyDivider} />
          <Text style={[styles.listHeader, styles.historyHeader]}>
            {t('publicTalks.retire.historyTitle')}
          </Text>
          <View style={styles.card}>
            {history.slice(0, historyShown).map((e, i) => (
              <View
                key={`${e.at}-${i}`}
                style={[styles.historyRow, i === 0 && { borderTopWidth: 0 }]}
              >
                <Text style={styles.historyHead}>
                  {t(`publicTalks.retire.history.${e.kind}`, {
                    count: e.count,
                  })}
                  {e.from
                    ? ` · ${t('publicTalks.retire.historyFrom', {
                        date: fmtDate(e.from),
                      })}`
                    : ''}
                  {e.until ? ` — ${fmtDate(e.until)}` : ''}
                </Text>
                <Text style={styles.historyMeta}>
                  {fmtDate(e.at.slice(0, 10))}
                  {e.actorName ? ` · ${e.actorName}` : ''}
                </Text>
                {/* All of them. Twelve numbers of thirty answered «сколько»
                    and not «какие», which is the question actually asked. */}
                {e.numbers.length > 0 ? (
                  <Text style={styles.historyNumbers}>
                    {e.numbers.join(', ')}
                  </Text>
                ) : null}
                <Text style={styles.historyMetaTail}>
                </Text>
                {e.reason ? (
                  <Text style={styles.historyReason}>
                    {t('publicTalks.retire.lastReason', { reason: e.reason })}
                  </Text>
                ) : null}
              </View>
            ))}
            {history.length > historyShown ? (
              <Pressable
                style={styles.historyMore}
                onPress={() => setHistoryShown((n) => n + 12)}
              >
                <Text style={styles.historyMoreText}>
                  {t('publicTalks.retire.historyMore', {
                    count: history.length - historyShown,
                  })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  body: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 32,
    backgroundColor: '#f1f5f9',
  },
  noRights: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  intro: { alignItems: 'center', paddingVertical: 8, marginBottom: 10 },
  introIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    color: '#0f172a',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 6,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e8edf3',
    padding: 14,
    marginBottom: 14,
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 8,
  },
  fieldHint: { fontSize: 12, color: '#94a3b8', marginTop: 5, lineHeight: 17 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  modeChipOn: { backgroundColor: '#0ea5e9', borderColor: '#0ea5e9' },
  modeText: {
    fontSize: 13.5,
    color: '#475569',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  modeTextOn: { color: '#fff' },
  historyDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 28,
    marginBottom: 18,
  },
  historyHeader: { marginBottom: 10 },
  historyRow: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eef2f6',
  },
  historyHead: {
    fontSize: 13.5,
    color: '#0f172a',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  historyMeta: { fontSize: 12, color: '#94a3b8', marginTop: 2, lineHeight: 17 },
  historyMetaTail: { fontSize: 12, color: '#94a3b8', lineHeight: 17 },
  historyNumbers: {
    fontSize: 12.5,
    color: '#475569',
    lineHeight: 18,
    marginTop: 3,
  },
  historyMore: { alignSelf: 'flex-start', paddingVertical: 10 },
  historyMoreText: {
    fontSize: 13,
    color: '#0369a1',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  historyReason: { fontSize: 12.5, color: '#0369a1', marginTop: 3 },
  lastBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 11,
    marginBottom: 14,
  },
  lastText: { fontSize: 12.5, color: '#075985', lineHeight: 18 },
  lastReason: { fontSize: 12, color: '#0369a1', lineHeight: 17, marginTop: 3 },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    minHeight: 130,
    fontSize: 14,
    color: '#0f172a',
    lineHeight: 20,
    backgroundColor: '#f8fafc',
  },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnOff: { backgroundColor: '#bae6fd' },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  error: { fontSize: 13, color: '#dc2626', marginTop: 10 },
  alertBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fcd34d',
    borderRadius: 14,
    padding: 13,
    marginBottom: 14,
  },
  alertTitle: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  alertHint: { fontSize: 12.5, color: '#a16207', lineHeight: 18, marginTop: 4 },
  scheduledRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#fde68a',
    marginTop: 8,
  },
  scheduledTalk: {
    fontSize: 13.5,
    color: '#92400e',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  scheduledWhen: { fontSize: 12, color: '#a16207', marginTop: 2 },
  /* Where it came from: the programme, or the coordinator's log — a talk one
     of our brothers is taking away needs a different telephone call. */
  scheduledSource: { fontSize: 11.5, color: '#b45309', marginTop: 2 },
  warnBox: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  warnText: { fontSize: 12.5, color: '#9a3412', lineHeight: 18 },
  listHeader: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: '#94a3b8',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 8,
    marginLeft: 2,
  },
  talkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  numberBadge: {
    minWidth: 34,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
  },
  numberBadgeDone: { backgroundColor: '#f1f5f9' },
  numberText: {
    fontSize: 13,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  numberTextDone: { color: '#94a3b8' },
  talkTitle: { flex: 1, fontSize: 14, color: '#0f172a', lineHeight: 19 },
  alreadyText: { fontSize: 11.5, color: '#94a3b8' },
  retireBtn: {
    backgroundColor: '#b45309',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
    // Room beneath it, so nothing crowds the one irreversible button here.
    marginBottom: 4,
    shadowColor: '#b45309',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  retireBtnDone: { backgroundColor: '#15803d' },
  retireBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  backBtn: { alignItems: 'center', paddingVertical: 14 },
  backBtnText: {
    fontSize: 14,
    color: '#0369a1',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
});
