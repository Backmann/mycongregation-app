import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { HINTED, QUESTIONS, optionsOf, type CoFolder, type FolderAnswer } from '../../lib/co-folder';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

/**
 * Page 2 of S-61: the fifteen questions in full, the options the form gives
 * each one (1, 2, 10 and 12 only ДА / НЕТ), and under the questions the app
 * has data for, what it knows since the previous visit — a hint, never the
 * answer (decision of 17 November 2026).
 */
export function Page2({
  folder,
  onAnswer,
  busy,
}: {
  folder: CoFolder;
  onAnswer: (q: number, a: FolderAnswer | null) => void;
  busy: boolean;
}) {
  const { t, i18n } = useTranslation();
  const p = folder.page2!;
  const h = p.hints;
  const date = (iso: string) => dayjs(iso).locale(i18n.language).format('D MMMM YYYY');
  const names = (list: string[]) => (list.length ? ` (${list.join(', ')})` : '');
  const hint = (q: number): string | null => {
    switch (q) {
      case 4:
        return t('coFolder.page2.hint4', {
          ended: `${h[4].pioneerEnded.length}${names(h[4].pioneerEnded)}`,
          moved: `${h[4].pioneerMoved.length}${names(h[4].pioneerMoved)}`,
        });
      case 5:
        return t('coFolder.page2.hint5', { count: h[5].disfellowshipped.length }) + names(h[5].disfellowshipped);
      case 6:
        return t('coFolder.page2.hint6', { count: h[6].died.length }) + names(h[6].died);
      case 9:
        return t('coFolder.page2.hint9', { count: h[9].moved.length }) + names(h[9].moved);
      case 12:
        return t('coFolder.page2.hint12', {
          year: `${h[12].serviceYear - 1}/${String(h[12].serviceYear).slice(2)}`,
          confirmed: h[12].confirmed,
          total: h[12].total,
        });
      default:
        return null;
    }
  };
  const since = h.sinceVisit
    ? t('coFolder.page2.since', { date: date(h.since) })
    : t('coFolder.page2.sinceStart', { date: date(h.since) });

  return (
    <View>
      {QUESTIONS.map((q) => {
        const given = p.answers[String(q)];
        const text = HINTED.includes(q) ? hint(q) : null;
        return (
          <View key={q} style={s.q}>
            <Text style={s.text}>
              <Text style={s.n}>{q}. </Text>
              {t(`coFolder.q.${q}`)}
            </Text>
            {text ? (
              <View style={s.hint}>
                <Text style={s.hintText}>
                  <Text style={s.hintLead}>{t('coFolder.page2.fromApp')} </Text>
                  {text} · {since}
                </Text>
              </View>
            ) : null}
            <View style={s.answerRow}>
              <View style={s.seg} accessibilityRole="radiogroup">
                {optionsOf(q).map((o, i) => {
                  const on = given?.answer === o;
                  return (
                    <Pressable
                      key={o}
                      onPress={() => onAnswer(q, on ? null : o)}
                      disabled={busy || !!p.erasedAt}
                      style={[s.segBtn, i > 0 && s.segLine, on && s.segOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <Text style={[s.segText, on && s.segTextOn]}>{t(`coFolder.answer.${o}`)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {given?.by ? (
                <Text style={s.by}>
                  {t('coFolder.page2.by', { name: given.by, date: dayjs(given.at).locale(i18n.language).format('D MMM') })}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  q: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#eef0f3', gap: 10 },
  text: { fontFamily: 'Manrope_700Bold', fontSize: 13.5, color: INK, lineHeight: 20 },
  n: { color: MUTED },
  hint: { backgroundColor: '#f3f6f8', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  hintText: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#334155', lineHeight: 18 },
  hintLead: { fontFamily: 'Manrope_800ExtraBold', color: BRAND },
  answerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  seg: { flexDirection: 'row', borderWidth: 1.5, borderColor: LINE, borderRadius: 12, overflow: 'hidden' },
  segBtn: { paddingHorizontal: 18, paddingVertical: 9, backgroundColor: '#fff' },
  segLine: { borderLeftWidth: 1.5, borderLeftColor: LINE },
  segOn: { backgroundColor: BRAND },
  segText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13, color: '#334155' },
  segTextOn: { color: '#fff' },
  by: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED },
});
