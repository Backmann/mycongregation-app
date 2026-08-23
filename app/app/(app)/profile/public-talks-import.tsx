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
import {
  TalkImportResult,
  extractErrorMessage,
  publicTalksApi,
} from '../../../lib/api';

export default function PublicTalksImportScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  /** Striking talks out is a second, deliberate press — never part of the import. */
  const retireMutation = useMutation({
    mutationFn: (numbers: number[]) => publicTalksApi.retireMissing({ numbers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-talks'] });
    },
  });

  const importMutation = useMutation<TalkImportResult, unknown, string>({
    mutationFn: (txt) => publicTalksApi.bulkImport(txt),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-talks'] });
    },
  });

  const result = importMutation.data;
  const isReady = text.trim().length >= 10;
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim()).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f1f5f9' }}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.intro}>
        <Ionicons name="cloud-upload-outline" size={40} color="#0ea5e9" />
        <Text style={styles.title}>{t('publicTalks.import.title')}</Text>
        <Text style={styles.subtitle}>
          {t('publicTalks.import.pasteHint')}
          {'\n'}
          <Text style={styles.code}>{t('publicTalks.import.sample')}</Text>
          {'\n'}
          {t('publicTalks.import.updateNote')}
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.textareaContainer}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder={t('publicTalks.import.placeholder')}
            placeholderTextColor="#cbd5e1"
            style={styles.textarea}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {lineCount > 0 && (
            <View style={styles.lineCounter}>
              <Text style={styles.lineCounterText}>
                {t('publicTalks.import.lines', { count: lineCount })}
              </Text>
            </View>
          )}
        </View>

        {!result && (
          <Pressable
            style={[
              styles.importButton,
              (!isReady || importMutation.isPending) && { opacity: 0.5 },
            ]}
            onPress={() => importMutation.mutate(text)}
            disabled={!isReady || importMutation.isPending}
          >
            {importMutation.isPending ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.importButtonText}>
                  {t('publicTalks.import.importing')}
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.importButtonText}>
                  {t('publicTalks.import.submitButton')}
                </Text>
              </>
            )}
          </Pressable>
        )}

        {!!importMutation.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(importMutation.error)}
            </Text>
          </View>
        )}
      </View>

      {result && (
        <ResultSummary
          result={result}
          onRetire={(numbers) => retireMutation.mutate(numbers)}
          retiring={retireMutation.isPending}
          retiredCount={
            retireMutation.isSuccess ? (retireMutation.data?.retired ?? 0) : null
          }
        />
      )}
    </ScrollView>
  );
}

function ResultSummary({
  result,
  onRetire,
  retiring,
  retiredCount,
}: {
  result: TalkImportResult;
  onRetire: (numbers: number[]) => void;
  retiring: boolean;
  /** Null until the talks have been struck out; then how many were. */
  retiredCount: number | null;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <View style={styles.successHeader}>
        <Ionicons name="checkmark-circle" size={32} color="#059669" />
        <Text style={styles.successTitle}>
          {t('publicTalks.import.successTitle')}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Stat
          label={t('publicTalks.import.statParsed')}
          value={result.parsed}
          color="#0369a1"
        />
        <Stat
          label={t('publicTalks.import.statCreated')}
          value={result.created}
          color="#059669"
        />
        <Stat
          label={t('publicTalks.import.statUpdated')}
          value={result.updated}
          color="#d97706"
        />
        <Stat
          label={t('publicTalks.import.statUnchanged')}
          value={result.unchanged}
          color="#64748b"
        />
      </View>

      {result.invalid > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            {'\u26a0 '}
            {t('publicTalks.import.invalid', { count: result.invalid })}
          </Text>
        </View>
      )}

      {/* The lines themselves, so a refusal can be acted on. */}
      {result.invalidLines?.length > 0 && (
        <View style={styles.warningBox}>
          {result.invalidLines.slice(0, 5).map((line, i) => (
            <Text key={i} style={styles.badLine} numberOfLines={1}>
              {line}
            </Text>
          ))}
        </View>
      )}

      {result.renamed?.length > 0 && (
        <>
          <Text style={styles.examplesHeader}>
            {t('publicTalks.import.renamed')}
          </Text>
          <View style={styles.examplesList}>
            {result.renamed.slice(0, 8).map((r) => (
              <View key={r.number} style={styles.exampleRow}>
                <View style={styles.numberBadge}>
                  <Text style={styles.numberText}>{r.number}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.renamedFrom} numberOfLines={1}>
                    {r.from}
                  </Text>
                  <Text style={styles.exampleTitle} numberOfLines={1}>
                    {r.to}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {/* The answer to «какие речи больше не говорим». Nothing was retired for
          you: a partial paste would otherwise strike out the whole catalogue,
          and that is not a thing to do by accident. */}
      {result.missing?.length > 0 && (
        <View style={styles.missingBox}>
          <Text style={styles.missingTitle}>
            {t('publicTalks.import.missingTitle', {
              count: result.missing.length,
            })}
          </Text>
          {result.missing.slice(0, 10).map((m) => (
            <Text key={m.number} style={styles.missingRow} numberOfLines={1}>
              {m.number}. {m.title}
            </Text>
          ))}
          {result.missing.length > 10 ? (
            <Text style={styles.missingRow}>
              {t('publicTalks.import.andMore', {
                count: result.missing.length - 10,
              })}
            </Text>
          ) : null}
          <Text style={styles.missingHint}>
            {t('publicTalks.import.missingHint')}
          </Text>
          <Pressable
            style={styles.retireButton}
            onPress={() => onRetire(result.missing.map((m) => m.number))}
            disabled={retiring || retiredCount !== null}
          >
            <Text style={styles.retireButtonText}>
              {retiredCount !== null
                ? t('publicTalks.import.retired', { count: retiredCount })
                : t('publicTalks.import.retireAction')}
            </Text>
          </Pressable>
        </View>
      )}

      {result.examples.length > 0 && (
        <>
          <Text style={styles.examplesHeader}>
            {t('publicTalks.import.firstImported')}
          </Text>
          <View style={styles.examplesList}>
            {result.examples.map((ex) => (
              <View key={ex.number} style={styles.exampleRow}>
                <View style={styles.numberBadge}>
                  <Text style={styles.numberText}>{ex.number}</Text>
                </View>
                <Text style={styles.exampleTitle} numberOfLines={1}>
                  {ex.title}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Pressable
        style={styles.doneButton}
        onPress={() => router.replace('/profile/public-talks' as any)}
      >
        <Text style={styles.doneButtonText}>
          {t('publicTalks.import.viewCatalog')}
        </Text>
      </Pressable>
    </View>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /** The offending line as pasted — monospace, so stray spaces are visible. */
  badLine: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#92400e',
    marginTop: 4,
  },
  renamedFrom: {
    fontSize: 12.5,
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  missingBox: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 12,
    padding: 13,
    marginTop: 16,
  },
  missingTitle: {
    fontSize: 13.5,
    color: '#92400e',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 6,
  },
  missingRow: { fontSize: 13, color: '#92400e', lineHeight: 19 },
  missingHint: { fontSize: 12, color: '#a16207', marginTop: 8, lineHeight: 17 },
  retireButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fcd34d',
  },
  retireButtonText: {
    fontSize: 13,
    color: '#92400e',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  intro: {
    backgroundColor: '#fff',
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 19,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#0369a1',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 4,
  },

  section: { padding: 16, gap: 12 },

  textareaContainer: {
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  textarea: {
    minHeight: 200,
    padding: 14,
    fontSize: 14,
    color: '#0f172a',
    fontFamily: 'monospace',
  },
  lineCounter: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lineCounterText: { fontSize: 11, color: '#64748b' },

  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
  },
  importButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},

  errorBox: {
    padding: 12,
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: '#dc2626', fontSize: 14 },

  successHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  successTitle: { fontSize: 18, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#059669' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 16,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', fontFamily: 'Manrope_700Bold',},
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  warningBox: {
    padding: 12,
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: 8,
  },
  warningText: { color: '#92400e', fontSize: 13, lineHeight: 18 },

  examplesHeader: {
    fontSize: 12,
    fontWeight: '600', fontFamily: 'Manrope_600SemiBold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  examplesList: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  exampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  numberBadge: {
    minWidth: 32,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  numberText: { fontSize: 12, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0369a1' },
  exampleTitle: { fontSize: 13, color: '#0f172a', flex: 1 },

  doneButton: {
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    alignItems: 'center',
  },
  doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: 'Manrope_600SemiBold',},
});
