import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../../../components/Sheet';
import { announcementsApi, type AnnouncementTemplate } from '../../../lib/api';
import { failsScreen } from '../../../lib/screen-failure';
import { reportSuccess } from '../../../lib/error-bus';
import { BRAND } from '../../../lib/header';
import { fromLocalTokens, sampleFill, toLocalTokens, type TokenName } from '../../../lib/announcement-templates';

/** How the screen groups the templates, as on the mockup. */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'events', keys: ['general_cleaning', 'co_visit.ahead', 'co_visit.next', 'memorial.ahead', 'memorial.next'] },
  { title: 'conventions', keys: ['convention.ahead', 'campaign_part', 'assembly_screens', 'convention.next'] },
  { title: 'fieldService', keys: ['field_service'] },
  { title: 'accounts', keys: ['accounts_month', 'accounts_audit'] },
];

/**
 * «Шаблоны» (announcements R-05, R-09 step 4, 26 November 2026): what the
 * app suggests, in the congregation's own words. Each template may be turned
 * off, given words of its own — with placeholders the app fills in — and,
 * for those offered weeks ahead, its own number of weeks. Nothing here puts
 * anything on a list: it only shapes what is suggested.
 */
export default function AnnouncementTemplatesScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({
    throwOnError: failsScreen,
    queryKey: ['announcements', 'templates'],
    queryFn: () => announcementsApi.templates(),
  });
  const [editing, setEditing] = useState<AnnouncementTemplate | null>(null);
  const save = useMutation({
    mutationFn: (v: { key: string; body: Parameters<typeof announcementsApi.updateTemplate>[1] }) =>
      announcementsApi.updateTemplate(v.key, v.body),
    onSettled: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
  const byKey = new Map((q.data ?? []).map((x) => [x.key, x]));

  const row = (tpl: AnnouncementTemplate) => {
    const weeks = tpl.weeksAhead ?? tpl.defaultWeeks;
    return (
      <View key={tpl.key} style={s.row}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.rowTitle}>{t(`announcements.templates.key.${tpl.key}`)}</Text>
          <Text style={s.rowSub}>{t(`announcements.templates.when.${tpl.key}`)}</Text>
          {tpl.key === 'assembly_screens' ? (
            <Text style={s.ruleTag}>{t('announcements.templates.byRule')}</Text>
          ) : null}
          <View style={s.rowActions}>
            {tpl.tokens.length ? (
              <Pressable onPress={() => setEditing(tpl)} accessibilityRole="button" hitSlop={6}>
                <Text style={s.link}>
                  {tpl.words ? t('announcements.templates.ownWords') : t('announcements.templates.words')}
                </Text>
              </Pressable>
            ) : null}
            {tpl.defaultWeeks != null && weeks != null ? (
              <View style={s.stepper}>
                <Pressable
                  style={[s.stepBtn, weeks <= 1 && s.off]}
                  disabled={weeks <= 1 || save.isPending}
                  onPress={() => save.mutate({ key: tpl.key, body: { weeksAhead: weeks - 1 } })}
                  accessibilityRole="button"
                  accessibilityLabel={t('announcements.templates.fewer')}
                >
                  <Ionicons name="remove" size={18} color="#334155" />
                </Pressable>
                <Text style={s.weeks}>{t('announcements.templates.weeks', { n: weeks })}</Text>
                <Pressable
                  style={[s.stepBtn, weeks >= 16 && s.off]}
                  disabled={weeks >= 16 || save.isPending}
                  onPress={() => save.mutate({ key: tpl.key, body: { weeksAhead: weeks + 1 } })}
                  accessibilityRole="button"
                  accessibilityLabel={t('announcements.templates.more')}
                >
                  <Ionicons name="add" size={18} color="#334155" />
                </Pressable>
              </View>
            ) : null}
          </View>
        </View>
        <Switch
          value={tpl.enabled}
          onValueChange={(v) => save.mutate({ key: tpl.key, body: { enabled: v } })}
          trackColor={{ true: BRAND, false: '#cbd5e1' }}
          accessibilityLabel={t(`announcements.templates.key.${tpl.key}`)}
        />
      </View>
    );
  };

  return (
    <View style={s.container}>
      {/* keyboard-ok: no field on the list itself; the words are typed in a Sheet, which keeps them above the keyboard */}
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.frame}>
          <View style={{ gap: 6, paddingHorizontal: 4 }}>
            <Text style={s.h1}>{t('announcements.templates.title')}</Text>
            <Text style={s.lead}>{t('announcements.templates.lead')}</Text>
          </View>
          {q.isLoading ? <ActivityIndicator size="large" style={{ marginTop: 32 }} /> : null}
          {q.data
            ? GROUPS.map((g) => (
                <View key={g.title} style={s.card}>
                  <Text style={s.lbl}>{t(`announcements.templates.group.${g.title}`)}</Text>
                  {g.keys.map((k) => byKey.get(k)).filter(Boolean).map((tpl) => row(tpl!))}
                </View>
              ))
            : null}
          <Text style={s.foot}>{t('announcements.templates.foot')}</Text>
        </View>
      </ScrollView>
      <WordsSheet template={editing} onClose={() => setEditing(null)} />
    </View>
  );
}

/** The words of one template, with its placeholders as chips and a preview. */
function WordsSheet({ template, onClose }: { template: AnnouncementTemplate | null; onClose: () => void }) {
  const { t } = useTranslation();
  // Stable between renders: the effect below must not wipe what is being typed.
  const lang = useCallback<TokenName>((k) => t(`announcements.templates.token.${k}`), [t]);
  const qc = useQueryClient();
  const [text, setText] = useState('');
  useEffect(() => {
    if (!template) return;
    setText(toLocalTokens(template.words ?? template.defaultWords ?? '', lang));
  }, [template, lang]);
  const save = useMutation({
    mutationFn: (words: string | null) => announcementsApi.updateTemplate(template!.key, { words }),
    onSuccess: () => {
      reportSuccess(t('announcements.templates.saved'));
      onClose();
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['announcements'] }),
  });
  const preview = useMemo(
    () => (template ? sampleFill(fromLocalTokens(text, lang), (k) => t(`announcements.templates.sample.${k}`)) : ''),
    [text, template, lang, t],
  );
  if (!template) return null;
  const canSave = text.trim().length > 0 && !save.isPending;
  return (
    <Sheet
      visible={!!template}
      onClose={onClose}
      title={t('announcements.templates.wordsLabel')}
      variant="bottom"
      closeLabel={t('common.cancel')}
      footer={
        <Pressable
          style={[s.saveBtn, !canSave && s.off]}
          disabled={!canSave}
          onPress={() => save.mutate(fromLocalTokens(text, lang))}
          accessibilityRole="button"
        >
          <Text style={s.saveText}>{t('announcements.templates.save')}</Text>
        </Pressable>
      }
    >
      <View style={{ gap: 14, paddingBottom: 8 }}>
        {/* The template's name in full here: a sheet's title is one line. */}
        <Text style={s.name} nativeID="tpl-words-label">
          {t(`announcements.templates.key.${template.key}`)}
        </Text>
        <TextInput
          accessibilityLabelledBy="tpl-words-label"
          style={s.input}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
          maxLength={2000}
        />
        <View style={s.chips}>
          {template.tokens.map((tok) => (
            <Pressable
              key={tok}
              style={s.chip}
              onPress={() => setText((x) => `${x}${x.endsWith(' ') || !x ? '' : ' '}${toLocalTokens(`{${tok}}`, lang)}`)}
              accessibilityRole="button"
              accessibilityLabel={t('announcements.templates.insert', { token: toLocalTokens(`{${tok}}`, lang) })}
            >
              <Text style={s.chipText}>{toLocalTokens(`{${tok}}`, lang)}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.hint}>{t('announcements.templates.tokensHint')}</Text>
        <View style={s.preview}>
          <Text style={s.lbl}>{t('announcements.templates.preview')}</Text>
          <Text style={s.previewText}>{preview}</Text>
        </View>
        {template.words ? (
          <Pressable onPress={() => save.mutate(null)} accessibilityRole="button" hitSlop={6}>
            <Text style={s.link}>{t('announcements.templates.reset')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}

const card = {
  backgroundColor: '#fff',
  borderRadius: 22,
  shadowColor: '#0f172a',
  shadowOpacity: 0.08,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 8 },
  elevation: 2,
} as const;

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f5f8' },
  content: { padding: 12, paddingBottom: 48 },
  frame: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 16 },
  h1: { fontFamily: 'Manrope_800ExtraBold', fontSize: 26, color: '#0f172a', letterSpacing: -0.4, paddingTop: 8 },
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 14, lineHeight: 21, color: '#475569' },
  card: { ...card, overflow: 'hidden' },
  lbl: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: '#475569', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  name: { fontFamily: 'Manrope_800ExtraBold', fontSize: 16, lineHeight: 22, color: '#0f172a' },
  row: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#eef1f5' },
  rowTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#0f172a' },
  rowSub: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#475569' },
  ruleTag: { alignSelf: 'flex-start', fontFamily: 'Manrope_700Bold', fontSize: 12, color: '#78350f', backgroundColor: '#fef3c7', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, overflow: 'hidden' },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, paddingTop: 4 },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND, minHeight: 32, textAlignVertical: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#f1f4f8', alignItems: 'center', justifyContent: 'center' },
  weeks: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#0f172a', minWidth: 92, textAlign: 'center' },
  off: { opacity: 0.4 },
  foot: { fontFamily: 'Manrope_400Regular', fontSize: 13, lineHeight: 19, color: '#475569', paddingHorizontal: 4 },
  input: { minHeight: 130, borderWidth: 1.5, borderColor: BRAND, borderRadius: 16, padding: 14, fontFamily: 'Manrope_500Medium', fontSize: 16, lineHeight: 24, color: '#0f172a' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, borderRadius: 12, backgroundColor: '#e0f2f7', paddingHorizontal: 12, justifyContent: 'center' },
  chipText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: BRAND },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 13, lineHeight: 19, color: '#475569' },
  preview: { gap: 4, borderRadius: 14, backgroundColor: '#f6f8fb', paddingBottom: 12 },
  previewText: { fontFamily: 'Manrope_500Medium', fontSize: 15, lineHeight: 22, color: '#0f172a', paddingHorizontal: 16 },
  saveBtn: { minHeight: 52, borderRadius: 14, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center' },
  saveText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15, color: '#fff' },
});
