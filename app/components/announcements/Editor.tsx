import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { confirm } from '../ConfirmHost';
import {
  announcementsApi,
  type Announcement,
  type AnnouncementKind,
  type AnnouncementMeeting,
} from '../../lib/api';
import { reportSuccess } from '../../lib/error-bus';
import { BRAND } from '../../lib/header';
import { ANN } from './ReadList';
import { afterFirstLine, firstLine } from '../../lib/announcements';

/** Which meeting a new announcement goes to: one of the week's, or both. */
type Target = AnnouncementKind | 'both';

/**
 * WRITING ONE ANNOUNCEMENT (R-01): the meeting, the words as they will be read
 * aloud, and whether it is a letter to be read whole. Opened empty for a new
 * one, or with an announcement to change or delete it.
 */
export function Editor({
  visible,
  onClose,
  week,
  meetings,
  initialKind,
  editing,
  dayLabel,
}: {
  visible: boolean;
  onClose: () => void;
  week: string;
  /** The meetings this week holds — what may be chosen. */
  meetings: AnnouncementMeeting[];
  initialKind: AnnouncementKind | null;
  editing: (Announcement & { kind: AnnouncementKind }) | null;
  /** «Ср, 2 дек.» for a meeting. */
  dayLabel: (m: AnnouncementMeeting) => string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [letter, setLetter] = useState(false);
  /** A letter's title, kept apart while editing; saved as its first line. */
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState<Target>('midweek');

  useEffect(() => {
    if (!visible) return;
    const isLetter = editing?.isLetter ?? false;
    setLetter(isLetter);
    setTitle(isLetter && editing ? firstLine(editing.text) : '');
    setText(isLetter && editing ? afterFirstLine(editing.text) : (editing?.text ?? ''));
    setTarget(editing?.kind ?? initialKind ?? meetings[0]?.kind ?? 'midweek');
  }, [visible, editing, initialKind, meetings]);

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['announcements'] });
    onClose();
  };

  const save = useMutation({
    mutationFn: async () => {
      // A letter is stored as its title on the first line, then the letter.
      const words = letter ? `${title.trim()}\n${text.trim()}`.trim() : text.trim();
      if (editing) {
        await announcementsApi.update(editing.id, { text: words, isLetter: letter });
        return;
      }
      const kinds: AnnouncementKind[] = target === 'both' ? meetings.map((m) => m.kind) : [target];
      for (const k of kinds) {
        await announcementsApi.create({ weekStartDate: week, eventType: k, text: words, isLetter: letter });
      }
    },
    onSuccess: () => {
      reportSuccess(editing ? t('announcements.edit.saved') : t('announcements.edit.added'));
      done();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => announcementsApi.remove(id),
    onSuccess: () => {
      reportSuccess(t('announcements.edit.deleted'));
      done();
    },
  });
  const askRemove = async () => {
    if (!editing) return;
    const ok = await confirm({
      title: t('announcements.edit.deleteTitle'),
      body: t('announcements.edit.deleteBody'),
      confirmLabel: t('announcements.edit.delete'),
      danger: true,
    });
    if (ok) remove.mutate(editing.id);
  };

  const canSave = (letter ? title.trim().length > 0 && text.trim().length > 0 : text.trim().length > 0) && !save.isPending;
  /** Switching the letter off keeps every word: the title goes back on top. */
  const switchLetter = (on: boolean) => {
    if (!on && title.trim()) {
      setText((x) => `${title.trim()}\n${x}`.trim());
      setTitle('');
    }
    if (on && !title && text.includes('\n')) {
      setTitle(firstLine(text));
      setText(afterFirstLine(text));
    }
    setLetter(on);
  };
  const choices: { key: Target; label: string }[] = [
    ...meetings.map((m) => ({ key: m.kind as Target, label: dayLabel(m) })),
    ...(meetings.length > 1 && !editing ? [{ key: 'both' as Target, label: t('announcements.edit.both') }] : []),
  ];

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? t('announcements.edit.titleEdit') : t('announcements.edit.titleNew')}
      variant="bottom"
      closeLabel={t('common.cancel')}
      footer={
        <View style={s.footer}>
          {editing ? (
            <Pressable
              style={s.deleteBtn}
              onPress={() => void askRemove()}
              accessibilityRole="button"
              accessibilityLabel={t('announcements.edit.delete')}
            >
              <Ionicons name="trash-outline" size={20} color="#b91c1c" />
            </Pressable>
          ) : null}
          <Pressable
            style={[s.saveBtn, !canSave && s.saveOff]}
            disabled={!canSave}
            onPress={() => save.mutate()}
            accessibilityRole="button"
          >
            <Text style={s.saveText}>{t('announcements.edit.save')}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={s.body}>
        {!editing && choices.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={s.label}>{t('announcements.edit.meeting')}</Text>
            <View style={s.segment}>
              {choices.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setTarget(c.key)}
                  style={[s.segBtn, target === c.key && s.segOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: target === c.key }}
                >
                  <Text style={[s.segText, target === c.key && s.segTextOn]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
            {target === 'both' ? <Text style={s.hintLine}>{t('announcements.edit.bothHint')}</Text> : null}
          </View>
        ) : null}

        <View style={[s.letterRow, letter && s.letterRowOn]}>
          <Ionicons name="mail-open-outline" size={22} color={letter ? ANN.fg : '#64748b'} />
          <View style={{ flex: 1 }}>
            <Text style={s.letterTitle}>{t('announcements.edit.letter')}</Text>
            <Text style={s.letterSub}>{t('announcements.edit.letterSub')}</Text>
          </View>
          <Switch
            value={letter}
            onValueChange={switchLetter}
            trackColor={{ true: BRAND, false: '#cbd5e1' }}
            accessibilityLabel={t('announcements.edit.letter')}
          />
        </View>

        {letter ? (
          <View style={{ gap: 8 }}>
            <Text style={s.label} nativeID="ann-title-label">
              {t('announcements.edit.letterTitle')}
            </Text>
            <TextInput
              accessibilityLabelledBy="ann-title-label"
              style={[s.input, s.titleInput]}
              value={title}
              onChangeText={(x) => setTitle(x.replace(/\n/g, ' '))}
              placeholder={t('announcements.edit.letterTitlePlaceholder')}
              placeholderTextColor="#64748b"
              maxLength={200}
            />
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text style={s.label} nativeID="ann-text-label">
            {letter ? t('announcements.edit.letterText') : t('announcements.edit.text')}
          </Text>
          <TextInput
            accessibilityLabelledBy="ann-text-label"
            style={[s.input, letter && s.letterInput]}
            value={text}
            onChangeText={setText}
            multiline
            textAlignVertical="top"
            placeholder={letter ? t('announcements.edit.letterPlaceholder') : t('announcements.edit.placeholder')}
            placeholderTextColor="#64748b"
            maxLength={19800}
          />
        </View>

        <View style={s.preview}>
          <Text style={s.previewLbl}>{t('announcements.edit.preview')}</Text>
          <Text style={s.previewText}>
            {letter ? t('announcements.edit.previewLetter') : t('announcements.edit.previewPlain')}
          </Text>
        </View>

        <View style={s.note}>
          <Ionicons name="lock-closed-outline" size={18} color="#475569" />
          <Text style={s.noteText}>{t('announcements.edit.privacy')}</Text>
        </View>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  body: { gap: 18, paddingBottom: 8 },
  label: {
    fontFamily: 'Manrope_800ExtraBold',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#475569',
  },
  segment: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, padding: 4, borderRadius: 14, backgroundColor: '#f1f4f8' },
  segBtn: { flexGrow: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  segOn: { backgroundColor: '#fff', shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#475569' },
  segTextOn: { fontFamily: 'Manrope_800ExtraBold', color: '#0f172a' },
  input: {
    minHeight: 170,
    borderWidth: 1.5,
    borderColor: BRAND,
    borderRadius: 16,
    padding: 14,
    fontFamily: 'Manrope_500Medium',
    fontSize: 17,
    lineHeight: 25,
    color: '#0f172a',
  },
  letterRowOn: { backgroundColor: ANN.bg },
  titleInput: { minHeight: 52, fontFamily: 'Manrope_700Bold' },
  letterInput: { minHeight: 240 },
  hintLine: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#475569' },
  preview: { gap: 4, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0' },
  previewLbl: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#475569' },
  previewText: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#334155' },
  letterRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#f6f8fb' },
  letterTitle: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#0f172a' },
  letterSub: { fontFamily: 'Manrope_400Regular', fontSize: 13, color: '#475569' },
  note: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noteText: { flex: 1, fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#475569' },
  footer: { flexDirection: 'row', gap: 10 },
  deleteBtn: { width: 52, minHeight: 52, borderRadius: 14, backgroundColor: '#fef2f2', alignItems: 'center', justifyContent: 'center' },
  saveBtn: { flex: 1, minHeight: 52, borderRadius: 14, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  saveOff: { opacity: 0.5 },
  saveText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
});

export { ANN };
