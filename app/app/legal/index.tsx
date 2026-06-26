import { useState } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  LEGAL,
  LEGAL_CHROME,
  LEGAL_UPDATED,
  type DocKey,
  type Lang,
} from '../../lib/legal-content';
import { getCurrentLanguage } from '../../lib/i18n';

const LANGS: Lang[] = ['ru', 'de', 'en'];
const DOCS: DocKey[] = ['impressum', 'privacy', 'terms', 'disclaimer'];

const LINK_RE = /(https?:\/\/[^\s]+)/;

function renderText(text: string, base: object) {
  // Make bare URLs tappable without pulling in extra deps.
  const parts = text.split(LINK_RE);
  if (parts.length === 1) return <Text style={base}>{text}</Text>;
  return (
    <Text style={base}>
      {parts.map((part, i) =>
        LINK_RE.test(part) ? (
          <Text key={i} style={styles.link} onPress={() => Linking.openURL(part)}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

export default function LegalScreen() {
  const current = getCurrentLanguage() as Lang;
  const [lang, setLang] = useState<Lang>(
    LANGS.includes(current) ? current : 'de',
  );
  const [docKey, setDocKey] = useState<DocKey>('privacy');
  const doc = LEGAL[lang][docKey];
  const chrome = LEGAL_CHROME[lang];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: chrome.screenTitle }} />
      <View style={styles.langRow}>
        {LANGS.map((l) => (
          <Pressable
            key={l}
            onPress={() => setLang(l)}
            style={[styles.langPill, lang === l && styles.langPillActive]}
          >
            <Text
              style={[
                styles.langPillText,
                lang === l && styles.langPillTextActive,
              ]}
            >
              {l.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.docRow}
      >
        {DOCS.map((d) => (
          <Pressable
            key={d}
            onPress={() => setDocKey(d)}
            style={[styles.docPill, docKey === d && styles.docPillActive]}
          >
            <Text
              style={[
                styles.docPillText,
                docKey === d && styles.docPillTextActive,
              ]}
            >
              {LEGAL[lang][d].tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text style={styles.docTitle}>{doc.title}</Text>

      {doc.blocks.map((b, i) => {
        if (b.h) {
          return (
            <Text key={i} style={styles.h}>
              {b.h}
            </Text>
          );
        }
        if (b.li) {
          return (
            <View key={i} style={styles.liWrap}>
              {b.li.map((item, j) => (
                <View key={j} style={styles.liRow}>
                  <Text style={styles.liBullet}>{'\u2022'}</Text>
                  {renderText(item, styles.liText)}
                </View>
              ))}
            </View>
          );
        }
        return <View key={i}>{renderText(b.p ?? '', styles.p)}</View>;
      })}

      <Text style={styles.note}>{chrome.prevailNote}</Text>
      <Text style={styles.note}>
        {chrome.updated.replace('{date}', LEGAL_UPDATED)}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 48 },
  langRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  langPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
  },
  langPillActive: { backgroundColor: '#0e7490' },
  langPillText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  langPillTextActive: { color: '#ffffff' },
  docRow: { gap: 8, paddingVertical: 4, marginBottom: 12 },
  docPill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  docPillActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  docPillText: { fontSize: 13, fontWeight: '500', color: '#334155' },
  docPillTextActive: { color: '#ffffff' },
  docTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  h: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    marginTop: 16,
    marginBottom: 4,
  },
  p: { fontSize: 14, lineHeight: 21, color: '#334155', marginTop: 4 },
  link: { color: '#0e7490', textDecorationLine: 'underline' },
  liWrap: { marginTop: 6, gap: 4 },
  liRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  liBullet: { fontSize: 14, lineHeight: 21, color: '#0e7490' },
  liText: { flex: 1, fontSize: 14, lineHeight: 21, color: '#334155' },
  note: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 20,
    fontStyle: 'italic',
  },
});
