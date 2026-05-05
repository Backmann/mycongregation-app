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
import {
  BulkImportResult,
  extractErrorMessage,
  publicTalksApi,
} from '../../../lib/api';

export default function PublicTalksImportScreen() {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const importMutation = useMutation<BulkImportResult, unknown, string>({
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
        <Text style={styles.title}>Bulk import public talks</Text>
        <Text style={styles.subtitle}>
          Paste a list with one talk per line in the format:{'\n'}
          <Text style={styles.code}>1. Хорошо ли вы знаете Бога?</Text>
          {'\n'}
          Existing talks (matched by number) will be updated; new ones
          created. Source: docs.jw.org/ru/-/pub-s-34
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.textareaContainer}>
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder={'1. Title\n2. Another title\n3. ...'}
            placeholderTextColor="#cbd5e1"
            style={styles.textarea}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {lineCount > 0 && (
            <View style={styles.lineCounter}>
              <Text style={styles.lineCounterText}>{lineCount} lines</Text>
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
                <Text style={styles.importButtonText}>Importing…</Text>
              </>
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.importButtonText}>Import</Text>
              </>
            )}
          </Pressable>
        )}

        {importMutation.error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractErrorMessage(importMutation.error)}
            </Text>
          </View>
        )}
      </View>

      {result && <ResultSummary result={result} />}
    </ScrollView>
  );
}

function ResultSummary({ result }: { result: BulkImportResult }) {
  return (
    <View style={styles.section}>
      <View style={styles.successHeader}>
        <Ionicons name="checkmark-circle" size={32} color="#059669" />
        <Text style={styles.successTitle}>Import complete</Text>
      </View>

      <View style={styles.statsRow}>
        <Stat label="Parsed" value={result.parsed} color="#0369a1" />
        <Stat label="Created" value={result.created} color="#059669" />
        <Stat label="Updated" value={result.updated} color="#d97706" />
        <Stat label="Unchanged" value={result.unchanged} color="#64748b" />
      </View>

      {result.invalid > 0 && (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            ⚠ {result.invalid} line(s) looked like talk attempts but couldn't
            be parsed. Expected format: "N. Title"
          </Text>
        </View>
      )}

      {result.examples.length > 0 && (
        <>
          <Text style={styles.examplesHeader}>First imported items</Text>
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
        <Text style={styles.doneButtonText}>View catalog</Text>
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
    fontWeight: '700',
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
  importButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

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
  warningText: { color: '#92400e', fontSize: 13, lineHeight: 18 },

  examplesHeader: {
    fontSize: 12,
    fontWeight: '600',
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
  numberText: { fontSize: 12, fontWeight: '700', color: '#0369a1' },
  exampleTitle: { fontSize: 13, color: '#0f172a', flex: 1 },

  doneButton: {
    marginTop: 12,
    paddingVertical: 14,
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    alignItems: 'center',
  },
  doneButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
