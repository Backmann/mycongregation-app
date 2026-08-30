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
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { memorialApi, MemorialItem, MemorialSheet } from '../../../lib/api';
import { usePermissions } from '../../../lib/permissions';
import { PublisherSelector } from '../../../components/PublisherSelector';
import { SongPicker } from '../../../components/SongPicker';
import { useAllPublishers } from '../../../lib/useAllPublishers';
import { BackButton } from '../../../components/BackButton';

/**
 * The Memorial programme.
 *
 * READ BY EVERYONE. The sheet says who is doing what on the evening the whole
 * congregation attends, and a publisher looking for his own line should not
 * have to ask an elder for it.
 *
 * EDITED BY THE BODY. Elders and admins — no separate responsibility, because
 * the programme is settled by the body together rather than by one appointed
 * brother.
 *
 * The parts that carry a person are for BAPTIZED BROTHERS. Not by baptism
 * DATE: of twenty-seven brothers in this congregation three have one recorded,
 * so filtering on it would leave three men in the picker. The appointment says
 * it properly — «unbaptized_publisher» and «student» are the two that are not,
 * and everyone carries an appointment. The same test the auxiliary-pioneer
 * screen already uses.
 */

const NOT_BAPTIZED = ['student', 'unbaptized_publisher'] as const;

const SONG_PARTS = new Set(['song_opening', 'song_closing']);

export default function MemorialScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { isAdmin, isElder } = usePermissions();
  const mayEdit = isAdmin || isElder;

  const { data, isLoading } = useQuery({
    queryKey: ['memorial', id],
    queryFn: () => memorialApi.sheet(id!),
    enabled: !!id,
  });
  // Only for showing names to a reader who gets no picker; the shared hook, so
  // this screen adds no second answer to «who is in the congregation».
  const { data: publishers } = useAllPublishers();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['memorial', id] });
  };

  const prepareM = useMutation({
    mutationFn: () => memorialApi.prepare(id!),
    onSuccess: invalidate,
  });
  const updateM = useMutation({
    mutationFn: (v: {
      lineId: string;
      input: Parameters<typeof memorialApi.updateLine>[1];
    }) => memorialApi.updateLine(v.lineId, v.input),
    onSuccess: invalidate,
  });
  const themeM = useMutation({
    mutationFn: (v: { theme: string | null; url: string | null }) =>
      memorialApi.setTheme(id!, v.theme, v.url),
    onSuccess: invalidate,
  });
  const publishM = useMutation({
    mutationFn: () => memorialApi.publish(id!),
    onSuccess: invalidate,
  });

  if (isLoading || !data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const canWrite = mayEdit && data.editable;
  const nameOf = (line: MemorialItem): string | null =>
    line.personText ??
    (line.publisherId
      ? (publishers?.data.find((p) => p.id === line.publisherId)?.displayName ??
        null)
      : null);
  const programme = data.items.filter((i) => i.section === 'programme');
  const published = !!data.event.publishedAt;

  return (
    <>
      <Stack.Screen
        options={{
          title: t('memorial.title'),
          headerLeft: () => <BackButton fallback="/special-events" />,
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Header sheet={data} />

        {/* Draft or ready — said once, at the top, because it decides whether
            anybody has been told about any of this yet. */}
        {data.editable ? (
          <View style={published ? styles.statePublished : styles.stateDraft}>
            <Ionicons
              name={published ? 'checkmark-circle' : 'create-outline'}
              size={15}
              color={published ? '#15803d' : '#b45309'}
            />
            <Text
              style={published ? styles.statePubText : styles.stateDraftText}
            >
              {t(published ? 'memorial.published' : 'memorial.draft')}
            </Text>
            {canWrite && !published ? (
              <Pressable
                style={styles.publishBtn}
                disabled={publishM.isPending}
                onPress={() => publishM.mutate()}
              >
                <Text style={styles.publishBtnText}>
                  {t('memorial.publish')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <View style={styles.pastNote}>
            <Ionicons name="lock-closed-outline" size={13} color="#64748b" />
            <Text style={styles.pastNoteText}>{t('memorial.pastReadOnly')}</Text>
          </View>
        )}

        <ThemeCard
          sheet={data}
          canWrite={canWrite}
          saving={themeM.isPending}
          onSave={(theme, url) => themeM.mutate({ theme, url })}
        />

        {programme.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>{t('memorial.empty')}</Text>
            {canWrite ? (
              <Pressable
                style={styles.prepareBtn}
                disabled={prepareM.isPending}
                onPress={() => prepareM.mutate()}
              >
                {prepareM.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.prepareBtnText}>
                    {t('memorial.prepare')}
                  </Text>
                )}
              </Pressable>
            ) : null}
            {canWrite ? (
              <Text style={styles.prepareHint}>
                {t('memorial.prepareHint')}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>
              {t('memorial.sections.programme')}
            </Text>
            {programme.map((line) => (
              <Line
                key={line.id}
                line={line}
                canWrite={canWrite}
                name={nameOf(line)}
                memorialDate={data.event.date}
                onChange={(input) =>
                  updateM.mutate({ lineId: line.id, input })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Header({ sheet }: { sheet: MemorialSheet }) {
  const { t, i18n } = useTranslation();
  const when = dayjs(sheet.event.date)
    .locale(i18n.language)
    .format('dddd, D MMMM YYYY');
  return (
    <View style={styles.card}>
      <Text style={styles.when}>{when}</Text>
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={14} color="#64748b" />
        <Text style={styles.meta}>{sheet.event.time || t('memorial.noTime')}</Text>
      </View>
      {sheet.event.address ? (
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={14} color="#64748b" />
          <Text style={styles.meta}>{sheet.event.address}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * The theme comes from the yearly letter and changes with it.
 *
 * Editable here rather than fixed in the code: a new title should cost one
 * typing, not a release. It is carried into next year's Memorial by itself.
 */
function ThemeCard({
  sheet,
  canWrite,
  saving,
  onSave,
}: {
  sheet: MemorialSheet;
  canWrite: boolean;
  saving: boolean;
  onSave: (theme: string | null, url: string | null) => void;
}) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(sheet.event.theme ?? '');
  const [url, setUrl] = useState(sheet.event.themeUrl ?? '');
  const dirty =
    theme !== (sheet.event.theme ?? '') || url !== (sheet.event.themeUrl ?? '');

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{t('memorial.theme')}</Text>
      {canWrite ? (
        <>
          <TextInput
            value={theme}
            onChangeText={setTheme}
            placeholder={t('memorial.themePlaceholder')}
            placeholderTextColor="#94a3b8"
            style={styles.input}
            multiline
          />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder={t('memorial.themeUrlPlaceholder')}
            placeholderTextColor="#94a3b8"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="url"
          />
          {dirty ? (
            <Pressable
              style={styles.saveBtn}
              disabled={saving}
              onPress={() => onSave(theme.trim() || null, url.trim() || null)}
            >
              <Text style={styles.saveBtnText}>{t('common.save')}</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text style={styles.themeRead}>{sheet.event.theme || '—'}</Text>
      )}
    </View>
  );
}

/** One line of the sheet. */
function Line({
  line,
  canWrite,
  name,
  memorialDate,
  onChange,
}: {
  line: MemorialItem;
  canWrite: boolean;
  /** Resolved name, for a reader who gets no picker. */
  name: string | null;
  memorialDate: string;
  onChange: (input: Parameters<typeof memorialApi.updateLine>[1]) => void;
}) {
  const { t } = useTranslation();
  const [openNote, setOpenNote] = useState(false);
  const [note, setNote] = useState(line.note ?? '');
  const isSong = !!line.partKey && SONG_PARTS.has(line.partKey);

  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{line.label}</Text>

      {isSong ? (
        <SongPicker
          currentNumber={line.songNumber}
          readOnly={!canWrite}
          onSaveNumber={(n) => onChange({ songNumber: n })}
        />
      ) : canWrite ? (
        <PublisherSelector
          boxed
          label={line.label}
          value={line.publisherId}
          onChange={(pid) => onChange({ publisherId: pid })}
          genderFilter="brother"
          excludeAppointments={[...NOT_BAPTIZED]}
          absenceDate={memorialDate}
        />
      ) : (
        // The picker has no read-only mode, and giving it one would touch
        // fourteen other screens. A past Memorial and a reader who may not
        // edit both want the same thing anyway: the NAME, not a control.
        <Text style={styles.readName}>{name || '—'}</Text>
      )}

      {line.note || canWrite ? (
        <View style={styles.noteWrap}>
          {openNote && canWrite ? (
            <>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('memorial.notePlaceholder')}
                placeholderTextColor="#94a3b8"
                style={styles.input}
                multiline
                onBlur={() => {
                  if (note !== (line.note ?? '')) {
                    onChange({ note: note.trim() || null });
                  }
                  setOpenNote(false);
                }}
              />
            </>
          ) : (
            <Pressable
              disabled={!canWrite}
              onPress={() => setOpenNote(true)}
              style={styles.noteRow}
            >
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={13}
                color="#64748b"
              />
              <Text style={styles.noteText}>
                {line.note || t('memorial.addNote')}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 12, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  when: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 14, color: '#475569' },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  stateDraft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 12,
  },
  stateDraftText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: '#b45309',
  },
  statePublished: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    padding: 12,
  },
  statePubText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: '#15803d',
  },
  publishBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  publishBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  pastNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
  },
  pastNoteText: { flex: 1, fontSize: 12, color: '#64748b' },

  emptyBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
  prepareBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  prepareBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  prepareHint: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 17,
  },

  line: {
    gap: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  lineLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#0f172a',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: '#0f172a',
  },
  themeRead: { fontSize: 15, color: '#0f172a', lineHeight: 21 },
  saveBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  noteWrap: { marginTop: 2 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteText: { flex: 1, fontSize: 12, color: '#64748b', lineHeight: 17 },
  readName: { fontSize: 15, color: '#0f172a' },
});
