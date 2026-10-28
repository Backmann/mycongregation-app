import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { PublisherSelector } from '../PublisherSelector';
import { localNeedsApi, type LocalNeedsTopic } from '../../lib/api';
import { BRAND } from '../../lib/header';
import { dayLabel, normalise } from '../../lib/local-needs';

/**
 * Writing a topic down, or changing it. Deleting sits here, quietly, at the
 * foot of the window — not as a red bin on every row of the list (Lionel's
 * mockup, 28 October 2026); the strip on the screen offers it back.
 */
export function TopicForm({
  visible,
  onClose,
  editing,
  all,
  onDeleted,
}: {
  visible: boolean;
  onClose: () => void;
  /** null — a new topic. */
  editing: LocalNeedsTopic | null;
  all: LocalNeedsTopic[];
  onDeleted: (id: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const centered = Platform.OS === 'web' && width >= 700;

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [speakerId, setSpeakerId] = useState<string | null>(null);
  const [usedWeek, setUsedWeek] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(editing?.title ?? '');
    setNotes(editing?.notes ?? '');
    setSpeakerId(editing?.speakerPublisherId ?? null);
    setUsedWeek(editing?.usedWeek ?? null);
  }, [visible, editing]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['local-needs'] });
  const saveMut = useMutation({
    mutationFn: () => {
      const clean = title.trim();
      return editing
        ? localNeedsApi.update(editing.id, {
            title: clean,
            notes: notes.trim() ? notes.trim() : null,
            speakerPublisherId: speakerId ?? null,
            ...(usedWeek !== editing.usedWeek ? { usedWeek } : {}),
          })
        : localNeedsApi.create({
            title: clean,
            notes: notes.trim() || undefined,
            speakerPublisherId: speakerId ?? undefined,
          });
    },
    onSuccess: () => {
      void invalidate();
      onClose();
    },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => localNeedsApi.remove(id),
    onSuccess: (_r, id) => {
      void invalidate();
      onDeleted(id);
      onClose();
    },
  });

  /** Has this subject come up before, in any state? Asked while typing. */
  const similar = useMemo(() => {
    const needle = normalise(title);
    if (needle.length < 4) return [];
    return all
      .filter((r) => r.id !== editing?.id)
      .filter((r) => {
        const other = normalise(r.title);
        return other.includes(needle) || needle.includes(other);
      })
      .slice(0, 3);
  }, [title, all, editing]);

  const ok = !!title.trim() && !saveMut.isPending;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      variant={centered ? 'centered' : 'bottom'}
      title={editing ? t('localNeeds.editTitle') : t('localNeeds.newTitle')}
      closeLabel={t('common.cancel')}
      footer={
        <View style={styles.footer}>
          {editing ? (
            <Pressable
              onPress={() => removeMut.mutate(editing.id)}
              hitSlop={8}
              style={styles.delete}
              accessibilityRole="button"
            >
              <Text style={styles.deleteText}>{t('localNeeds.delete')}</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.save, !ok && styles.disabled]}
            disabled={!ok}
            onPress={() => saveMut.mutate()}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>{saveMut.isPending ? t('common.saving') : t('common.save')}</Text>
          </Pressable>
        </View>
      }
    >
      <Text style={styles.label}>{t('localNeeds.fields.title')}</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('localNeeds.placeholders.title')}
        placeholderTextColor="#94a3b8"
        autoFocus={!editing && Platform.OS === 'web'}
      />
      {similar.length > 0 ? (
        <View style={styles.similar}>
          <Text style={styles.similarHead}>{t('localNeeds.similarWarning')}</Text>
          {similar.map((r) => (
            <Text key={r.id} style={styles.similarItem}>
              • {r.title}
              {r.usedWeek ? ` — ${dayLabel(r.usedWeek, i18n.language)}` : ''}
              {r.deletedAt ? ` (${t('localNeeds.archived')})` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={styles.label}>{t('localNeeds.fields.notes')}</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={notes}
        onChangeText={setNotes}
        placeholder={t('localNeeds.placeholders.notes')}
        placeholderTextColor="#94a3b8"
        multiline
      />

      <PublisherSelector
        label={t('localNeeds.fields.speaker')}
        value={speakerId}
        onChange={setSpeakerId}
        preferAppointment="elder"
      />

      {/* A topic given weeks ago, recorded after the fact. */}
      {editing ? (
        <DateField
          label={t('localNeeds.fields.week')}
          value={usedWeek ?? ''}
          onChange={(v) => setUsedWeek(v || null)}
          placeholder={t('localNeeds.placeholders.week')}
        />
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
    color: '#334155',
    marginTop: 10,
    marginBottom: 4,
  },
  input: {
    fontFamily: 'Manrope_400Regular',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  similar: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  similarHead: { fontSize: 12.5, color: '#92400e', fontFamily: 'Manrope_600SemiBold' },
  similarItem: { fontFamily: 'Manrope_400Regular', fontSize: 12.5, color: '#92400e', marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  delete: { paddingVertical: 10, paddingHorizontal: 4 },
  deleteText: { fontFamily: 'Manrope_600SemiBold', fontSize: 14, color: '#94a3b8' },
  save: { flex: 1, backgroundColor: BRAND, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  saveText: { color: '#fff', fontFamily: 'Manrope_700Bold', fontSize: 15 },
  disabled: { opacity: 0.45 },
});
