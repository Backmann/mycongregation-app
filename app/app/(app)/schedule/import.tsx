import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  extractErrorMessage,
  ImportResult,
  scheduleImportApi,
} from '../../../lib/api';
import {
  ParsedWorkbook,
  collectUnclassified,
  isClientParsingSupported,
  parseMwbFile,
  toApplyPayload,
} from '../../../lib/mwb-parser';
import { parseWtFile, wtToWorkbook } from '../../../lib/wt-parser';
import { DropZone } from '../../../components/DropZone';
import { useTranslation } from 'react-i18next';

interface PickedFile {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  file?: Blob;
}

export default function ImportEpubScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ParsedWorkbook | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const applyMutation = useMutation<ImportResult, unknown, ParsedWorkbook>({
    mutationFn: (wb) => scheduleImportApi.apply(toApplyPayload(wb)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
    },
  });

  // Общий разбор: и выбор из папки, и drag-and-drop ведут сюда. Файл
  // публикации не покидает устройство — разбирается локально.
  const processBlob = async (
    blob: Blob,
    name: string,
    uri: string,
    size?: number,
    mimeType?: string,
  ) => {
    if (!name.toLowerCase().endsWith('.epub')) {
      setPickError(t('schedule.import.errors.notEpub'));
      return;
    }
    if (!isClientParsingSupported()) {
      setPickError(t('schedule.import.errors.webOnly'));
      return;
    }
    setPicked({
      uri,
      name,
      mimeType: mimeType ?? 'application/epub+zip',
      size,
      file: blob,
    });
    setParsing(true);
    try {
      const kind = detectFileType(name);
      const wb =
        kind === 'watchtower'
          ? wtToWorkbook(await parseWtFile(blob, undefined, name))
          : await parseMwbFile(blob, undefined, name);
      setParsed(wb);
    } catch (e) {
      setParseError(
        `${t('schedule.import.errors.parseFailed')}: ${extractErrorMessage(e)}`,
      );
    } finally {
      setParsing(false);
    }
  };

  // Drag-and-drop (web): dropped File is a Blob → same parser path.
  const handleDropped = (dropped: File) => {
    setPickError(null);
    setParseError(null);
    setParsed(null);
    applyMutation.reset();
    void processBlob(
      dropped,
      dropped.name,
      (dropped as any).path ?? dropped.name,
      dropped.size,
      dropped.type || undefined,
    );
  };

  const handlePick = async () => {
    setPickError(null);
    setParseError(null);
    setParsed(null);
    applyMutation.reset();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/epub+zip', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) {
        setPickError(t('schedule.import.errors.noFileSelected'));
        return;
      }
      if (!asset.name.toLowerCase().endsWith('.epub')) {
        setPickError(t('schedule.import.errors.notEpub'));
        return;
      }
      const blob = (asset as any).file as Blob | undefined;
      if (!blob) {
        setPickError(t('schedule.import.errors.webOnly'));
        return;
      }
      await processBlob(
        blob,
        asset.name,
        asset.uri,
        asset.size,
        asset.mimeType ?? undefined,
      );
    } catch (e) {
      setPickError(extractErrorMessage(e));
      setParsing(false);
    }
  };

  const result = applyMutation.data;
  const detectedType = picked ? detectFileType(picked.name) : null;
  const unclassified = parsed ? collectUnclassified(parsed) : [];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <View style={styles.intro}>
        <Ionicons name="document-text-outline" size={48} color="#0ea5e9" />
        <Text style={styles.title}>{t('schedule.import.title')}</Text>
        <Text style={styles.subtitle}>{t('schedule.import.subtitle')}</Text>
        <View style={styles.privacyRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#059669" />
          <Text style={styles.privacyText}>
            {t('schedule.import.privacyNote')}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <DropZone onFile={handleDropped} disabled={parsing}>
          <Pressable
            style={({ pressed }) => [
              styles.pickButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={handlePick}
          >
            <Ionicons
              name="document-attach-outline"
              size={20}
              color="#0ea5e9"
            />
            <Text style={styles.pickButtonText}>
              {picked
                ? t('schedule.import.chooseDifferent')
                : t('schedule.import.choosePrompt')}
            </Text>
          </Pressable>
        </DropZone>

        {pickError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{pickError}</Text>
          </View>
        )}

        {picked && (
          <View style={styles.fileCard}>
            <Ionicons name="document-text-outline" size={20} color="#64748b" />
            <View style={{ flex: 1 }}>
              <Text style={styles.fileName} numberOfLines={1}>
                {picked.name}
              </Text>
              <View style={styles.fileMetaRow}>
                {picked.size && (
                  <Text style={styles.fileMeta}>
                    {(picked.size / 1024 / 1024).toFixed(2)} MB
                  </Text>
                )}
                {detectedType && (
                  <View
                    style={[
                      styles.typeBadge,
                      detectedType === 'mwb'
                        ? styles.typeBadgeMidweek
                        : detectedType === 'watchtower'
                        ? styles.typeBadgeWeekend
                        : styles.typeBadgeUnknown,
                    ]}
                  >
                    <Text style={styles.typeBadgeText}>
                      {detectedType === 'mwb'
                        ? t('schedule.import.typeBadge.midweek')
                        : detectedType === 'watchtower'
                        ? t('schedule.import.typeBadge.weekend')
                        : t('schedule.import.typeBadge.unknown')}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {picked && detectedType === 'unknown' && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              {t('schedule.import.unknownTypeWarning')}
            </Text>
          </View>
        )}

        {parsing && (
          <View style={styles.parsingRow}>
            <ActivityIndicator color="#0ea5e9" />
            <Text style={styles.parsingText}>
              {t('schedule.import.parsing')}
            </Text>
          </View>
        )}

        {parseError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{parseError}</Text>
          </View>
        )}

        {parsed && parsed.weeks.length === 0 && !parsing && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              {t('schedule.import.errors.noWeeks')}
            </Text>
          </View>
        )}

        {parsed && parsed.weeks.length > 0 && !result && (
          <>
            <Text style={styles.weeksHeader}>
              {t('schedule.import.preview.title')}
            </Text>
            <View style={styles.weeksList}>
              {parsed.weeks.map((w) => (
                <View key={w.weekStartDate} style={styles.weekRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.weekDate}>{w.weekRangeText}</Text>
                    <Text style={styles.weekBible} numberOfLines={1}>
                      {w.biblePassage}
                    </Text>
                  </View>
                  <Text style={styles.weekPartsCount}>
                    {t('schedule.import.preview.partsShort', {
                      count: w.parts.filter((p) => p.partKey !== 'unknown')
                        .length,
                    })}
                  </Text>
                </View>
              ))}
            </View>

            {unclassified.length > 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>
                  {t('schedule.import.preview.unclassifiedTitle', {
                    count: unclassified.length,
                  })}
                </Text>
                {unclassified.slice(0, 5).map((u, i) => (
                  <Text key={i} style={styles.warningText}>
                    • {u.weekStartDate}: {u.rawTitle}
                  </Text>
                ))}
              </View>
            )}

            <Pressable
              style={[
                styles.uploadButton,
                applyMutation.isPending && { opacity: 0.6 },
              ]}
              onPress={() => parsed && applyMutation.mutate(parsed)}
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? (
                <>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.uploadButtonText}>
                    {t('schedule.import.applying')}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.uploadButtonText}>
                    {t('schedule.import.applyButton', {
                      count: parsed.weeks.length,
                    })}
                  </Text>
                </>
              )}
            </Pressable>
          </>
        )}

        {!!applyMutation.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(applyMutation.error)}
            </Text>
          </View>
        )}
      </View>

      {result && <ResultSummary result={result} />}
    </ScrollView>
  );
}

function detectFileType(filename: string): 'mwb' | 'watchtower' | 'unknown' {
  const lower = filename.toLowerCase();
  if (lower.startsWith('mwb_') || lower.startsWith('mwb-')) return 'mwb';
  if (lower.startsWith('w_') || lower.startsWith('wp_')) return 'watchtower';
  return 'unknown';
}

function ResultSummary({ result }: { result: ImportResult }) {
  const { t } = useTranslation();
  return (
    <View style={styles.section}>
      <View style={styles.successHeader}>
        <Ionicons name="checkmark-circle" size={32} color="#059669" />
        <Text style={styles.successTitle}>
          {t('schedule.import.result.complete')}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <Stat
          label={t('schedule.import.result.stats.weeks')}
          value={result.weeksImported}
          color="#0369a1"
        />
        <Stat
          label={t('schedule.import.result.stats.created')}
          value={result.partsCreated}
          color="#059669"
        />
        <Stat
          label={t('schedule.import.result.stats.updated')}
          value={result.partsUpdated}
          color="#d97706"
        />
        <Stat
          label={t('schedule.import.result.stats.skipped')}
          value={result.partsSkipped}
          color="#64748b"
        />
      </View>

      {result.unclassifiedParts > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            {t('schedule.import.result.unclassified', {
              count: result.unclassifiedParts,
            })}
          </Text>
        </View>
      )}

      {result.warnings.length > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>
            {t('schedule.import.result.warningsTitle')}
          </Text>
          {result.warnings.slice(0, 5).map((w, i) => (
            <Text key={i} style={styles.warningText}>
              • {w}
            </Text>
          ))}
          {result.warnings.length > 5 && (
            <Text style={styles.warningText}>
              {t('schedule.import.result.moreWarnings', {
                count: result.warnings.length - 5,
              })}
            </Text>
          )}
        </View>
      )}

      <Text style={styles.weeksHeader}>
        {t('schedule.import.result.importedWeeks')}
      </Text>
      <View style={styles.weeksList}>
        {result.weeks.map((w) => (
          <View key={w.weekStartDate} style={styles.weekRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.weekDate}>
                {w.weekStartDate} → {w.weekEndDate}
              </Text>
              <Text style={styles.weekBible} numberOfLines={1}>
                {w.biblePassage}
              </Text>
            </View>
            <View style={styles.weekStats}>
              {w.created > 0 && (
                <Text style={[styles.weekStat, { color: '#059669' }]}>
                  +{w.created}
                </Text>
              )}
              {w.updated > 0 && (
                <Text style={[styles.weekStat, { color: '#d97706' }]}>
                  ~{w.updated}
                </Text>
              )}
              {w.skipped > 0 && (
                <Text style={[styles.weekStat, { color: '#64748b' }]}>
                  ={w.skipped}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>

      <Pressable
        style={styles.doneButton}
        onPress={() => router.replace('/schedule' as any)}
      >
        <Text style={styles.doneButtonText}>
          {t('schedule.import.openSchedule')}
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
  container: { flex: 1, backgroundColor: '#f1f5f9' },
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
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ecfdf5',
    borderRadius: 8,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    color: '#047857',
    lineHeight: 16,
  },
  section: { padding: 16, gap: 12 },

  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0ea5e9',
    borderStyle: 'dashed',
  },
  pickButtonText: { color: '#0ea5e9', fontSize: 15, fontWeight: '500' },

  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  fileName: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  fileMeta: { fontSize: 12, color: '#64748b' },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  typeBadgeMidweek: { backgroundColor: '#dbeafe' },
  typeBadgeWeekend: { backgroundColor: '#fef3c7' },
  typeBadgeUnknown: { backgroundColor: '#f1f5f9' },
  typeBadgeText: { fontSize: 10, fontWeight: '600', color: '#0f172a' },

  parsingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  parsingText: { color: '#0ea5e9', fontSize: 14, fontWeight: '500' },

  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
  },
  uploadButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

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
  successTitle: { fontSize: 18, fontWeight: '700', color: '#059669' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 16,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700' },
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
  warningTitle: {
    color: '#78350f',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  warningText: { color: '#92400e', fontSize: 13, lineHeight: 18 },

  weeksHeader: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
  },
  weeksList: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  weekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  weekDate: { fontSize: 13, color: '#0f172a', fontWeight: '500' },
  weekBible: { fontSize: 12, color: '#64748b', marginTop: 2 },
  weekPartsCount: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  weekStats: { flexDirection: 'row', gap: 8 },
  weekStat: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 28,
    textAlign: 'right',
  },

  doneButton: {
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    alignItems: 'center',
  },
  doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
