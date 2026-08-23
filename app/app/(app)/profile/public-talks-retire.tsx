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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RetirementPreview, extractErrorMessage, publicTalksApi } from '../../../lib/api';
import { DateField } from '../../../components/DateField';
import i18n from '../../../lib/i18n';
import { usePermissions } from '../../../lib/permissions';

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

  const [text, setText] = useState('');
  const [from, setFrom] = useState('');
  const [preview, setPreview] = useState<RetirementPreview | null>(null);

  const previewMutation = useMutation({
    mutationFn: () => publicTalksApi.retirementPreview({ text, from }),
    onSuccess: (data) => setPreview(data),
  });

  const retireMutation = useMutation({
    mutationFn: (numbers: number[]) =>
      publicTalksApi.retireMissing(numbers, from),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-talks'] });
    },
  });

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

  const ready = from.trim() !== '' && text.trim() !== '';
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

      <View style={styles.card}>
        <Text style={styles.label}>{t('publicTalks.retire.fromLabel')}</Text>
        <DateField value={from} onChange={setFrom} />

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
                        <Text style={styles.scheduledWhen}>
                          {fmtDate(use.weekStartDate)}
                          {use.speakerName ? ` · ${use.speakerName}` : ''}
                          {use.speakerCongregation
                            ? `, ${use.speakerCongregation}`
                            : ''}
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
            {t('publicTalks.retire.willRetire', {
              count: preview.talks.filter((tk) => !tk.alreadyRetired).length,
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
            onPress={() =>
              retireMutation.mutate(preview.talks.map((tk) => tk.number))
            }
          >
            <Text style={styles.retireBtnText}>
              {retireMutation.isSuccess
                ? t('publicTalks.retire.done', {
                    count: retireMutation.data?.retired ?? 0,
                  })
                : t('publicTalks.retire.confirm', { date: from ? fmtDate(from) : '' })}
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
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
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
