import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import {
  groupNumber,
  toneOf,
  type FolderGroupLine,
  type FolderItem,
  type FolderMarkState,
  type LineTone,
} from '../../lib/co-folder';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

const AMBER = '#b45309';
const GREEN = '#047857';

/** The icon of a line: done, changed, outside the app, not applicable, open. */
export function ToneIcon({ tone, size = 22 }: { tone: LineTone; size?: number }) {
  const map: Record<LineTone, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
    done: { name: 'checkmark-circle', color: BRAND },
    changed: { name: 'alert-circle', color: '#f59e0b' },
    partial: { name: 'alert-circle-outline', color: '#f59e0b' },
    manual: { name: 'document-text-outline', color: BRAND },
    na: { name: 'remove-circle-outline', color: '#94a3b8' },
    todo: { name: 'ellipse-outline', color: '#cbd5e1' },
  };
  const m = map[tone];
  return <Ionicons name={m.name} size={size} color={m.color} />;
}

export interface LineActions {
  busyKey: string | null;
  /** Make the file of a line (or of one group of 2.1) and ask if it was saved. */
  onSave: (key: string) => void;
  onMark: (key: string, state: FolderMarkState | null) => void;
}

/**
 * One item of the folder, numbered as on the form. A tap opens what can be
 * done with it: a file to save, how it goes when the app does not make it
 * («отдельный файл», «на бумаге», «не относится»), the mark taken back.
 */
export function FolderLine({
  item,
  sub,
  actions,
  canMark,
  wide,
}: {
  item: FolderItem;
  /** The line under the title: the hint and the item's own numbers. */
  sub: string;
  actions: LineActions;
  canMark: boolean;
  wide: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const isGroups = item.key === '2.1';
  const partial = isGroups && (item.groups ?? []).some((g) => g.ready) && !item.ready;
  const tone = toneOf(item, partial);
  const date = (iso: string | null) => (iso ? dayjs(iso).locale(i18n.language).format('D MMM') : '');
  const statusText = (() => {
    if (item.changed) return t('coFolder.state.changed');
    if (isGroups && item.state !== 'na') {
      return t('coFolder.state.partial', { saved: Number(item.facts.saved ?? 0), groups: Number(item.facts.groups ?? 0) });
    }
    if (item.state === 'saved') return t('coFolder.state.savedOn', { date: date(item.markedAt) });
    if (item.state) return t(`coFolder.state.${item.state}`);
    return item.source === 'pdf' ? t('coFolder.state.none') : t('coFolder.state.open');
  })();
  const statusColor = item.changed || partial ? AMBER : item.ready && item.state === 'saved' ? GREEN : item.ready ? BRAND : MUTED;
  const busy = actions.busyKey === item.key;

  const primary =
    canMark && item.source === 'pdf' && !isGroups && item.state !== 'na' ? (
      <Pressable
        onPress={() => actions.onSave(item.key)}
        disabled={!!actions.busyKey}
        style={[s.btn, item.changed && s.btnPrimary, !!actions.busyKey && s.dim]}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={item.changed ? '#fff' : BRAND} />
        ) : (
          <Text style={[s.btnText, item.changed && s.btnTextPrimary]}>
            {item.changed ? t('coFolder.action.saveAgain') : t('coFolder.action.save')}
          </Text>
        )}
      </Pressable>
    ) : null;

  return (
    <View style={s.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [s.row, !wide && s.rowNarrow, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <ToneIcon tone={tone} />
        <Text style={s.num}>{item.key}</Text>
        <View style={s.body}>
          <Text style={s.title}>{t(`coFolder.item.${item.key.replace('.', '_')}.title`)}</Text>
          <Text style={s.sub}>{sub}</Text>
          {!wide ? <Text style={[s.status, { color: statusColor }]}>{statusText}</Text> : null}
        </View>
        {wide ? <Text style={[s.status, s.statusWide, { color: statusColor }]}>{statusText}</Text> : null}
        {wide ? primary : null}
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color="#94a3b8" />
      </Pressable>
      {!wide && primary ? <View style={s.narrowAction}>{primary}</View> : null}
      {open ? (
        <View style={s.panel}>
          {item.markedBy ? (
            <Text style={s.marked}>{t('coFolder.markedBy', { name: item.markedBy, date: date(item.markedAt) })}</Text>
          ) : null}
          {isGroups && item.state !== 'na'
            ? (item.groups ?? []).map((g) => (
                <GroupRow key={g.key} item={item} g={g} actions={actions} canMark={canMark} />
              ))
            : null}
          {canMark && item.source === 'manual' ? (
            <View style={s.choices}>
              <Text style={s.choicesLabel}>{t('coFolder.action.how')}</Text>
              {(['separate', 'paper', 'na'] as const).map((st) => (
                <Pressable
                  key={st}
                  onPress={() => actions.onMark(item.key, item.state === st ? null : st)}
                  disabled={!!actions.busyKey}
                  style={[s.choice, item.state === st && s.choiceOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: item.state === st }}
                >
                  <Text style={[s.choiceTitle, item.state === st && s.choiceTitleOn]}>{t(`coFolder.how.${st}`)}</Text>
                  <Text style={s.choiceHint}>{t(`coFolder.how.${st}Hint`)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {canMark && item.source === 'pdf' ? (
            <View style={s.links}>
              {item.state === 'na' ? (
                <Pressable onPress={() => actions.onMark(item.key, null)} accessibilityRole="button">
                  <Text style={s.link}>{t('coFolder.action.clear')}</Text>
                </Pressable>
              ) : (
                <>
                  <Pressable onPress={() => actions.onMark(item.key, 'na')} accessibilityRole="button">
                    <Text style={s.link}>{t('coFolder.action.notApplicable')}</Text>
                  </Pressable>
                  {item.state === 'saved' && !isGroups ? (
                    <Pressable onPress={() => actions.onMark(item.key, null)} accessibilityRole="button">
                      <Text style={s.link}>{t('coFolder.action.clear')}</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function GroupRow({
  item,
  g,
  actions,
  canMark,
}: {
  item: FolderItem;
  g: FolderGroupLine;
  actions: LineActions;
  canMark: boolean;
}) {
  const { t, i18n } = useTranslation();
  const tone = toneOf(g);
  const busy = actions.busyKey === g.key;
  const sub = g.changed
    ? t('coFolder.state.changed')
    : g.state === 'saved'
      ? t('coFolder.state.savedOn', { date: dayjs(g.markedAt).locale(i18n.language).format('D MMM') })
      : t('coFolder.fact.people', { count: g.people });
  return (
    <View style={s.group}>
      <ToneIcon tone={tone} size={20} />
      <View style={s.body}>
        <Text style={s.groupTitle}>
          {groupNumber(item, g.key)} · {g.name ?? t('coFolder.noGroup')}
        </Text>
        <Text style={[s.sub, g.changed && { color: AMBER }]}>{sub}</Text>
      </View>
      {canMark ? (
        <Pressable
          onPress={() => actions.onSave(g.key)}
          disabled={!!actions.busyKey}
          style={[s.btn, g.changed && s.btnPrimary, !!actions.busyKey && s.dim]}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={g.changed ? '#fff' : BRAND} />
          ) : (
            <Text style={[s.btnText, g.changed && s.btnTextPrimary]}>
              {g.changed ? t('coFolder.action.saveAgain') : t('coFolder.action.save')}
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderTopWidth: 1, borderTopColor: '#eef0f3' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 4 },
  rowNarrow: { alignItems: 'flex-start' },
  pressed: { opacity: 0.7 },
  num: { width: 30, fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: MUTED },
  body: { flex: 1, minWidth: 0 },
  title: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2, lineHeight: 17 },
  status: { fontFamily: 'Manrope_700Bold', fontSize: 12.5, marginTop: 4 },
  statusWide: { marginTop: 0, maxWidth: 200, textAlign: 'right' },
  narrowAction: { paddingLeft: 76, paddingBottom: 12, flexDirection: 'row' },
  btn: {
    borderWidth: 1.5,
    borderColor: '#cfe2e6',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  btnPrimary: { backgroundColor: BRAND, borderColor: BRAND },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: BRAND },
  btnTextPrimary: { color: '#fff' },
  dim: { opacity: 0.6 },
  panel: { paddingLeft: 46, paddingRight: 4, paddingBottom: 14, gap: 8 },
  marked: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  groupTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  choices: { gap: 8 },
  choicesLabel: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11.5, letterSpacing: 0.8, color: MUTED, textTransform: 'uppercase' },
  choice: { borderWidth: 1.5, borderColor: LINE, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#fff' },
  choiceOn: { borderColor: BRAND, backgroundColor: '#e8f1f3' },
  choiceTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 14, color: INK },
  choiceTitleOn: { color: BRAND },
  choiceHint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  links: { flexDirection: 'row', gap: 18, flexWrap: 'wrap' },
  link: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: BRAND, textDecorationLine: 'underline' },
});
