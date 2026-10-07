import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { setLanguage, SupportedLanguage } from '../lib/i18n';

const LANGUAGES: { code: SupportedLanguage; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'de', label: 'DE' },
  { code: 'ru', label: 'RU' },
];

/**
 * The three letters at the top of every screen a person sees before they are
 * in.
 *
 * They stood on «Войти» alone, and a dialog asked everybody for a language at
 * the very first start. The dialog is gone (lib/i18n.ts adoptLanguage): the
 * app opens in the language of the letter or of the phone, and this is how
 * somebody who wants another one says so — on whichever of the screens they
 * happened to arrive at.
 */
export function LanguagePills() {
  const { i18n } = useTranslation();
  const current = (i18n.language?.split('-')[0] ?? 'en') as SupportedLanguage;
  return (
    <View style={styles.row}>
      {LANGUAGES.map((lng) => {
        const active = current === lng.code;
        return (
          <Pressable
            key={lng.code}
            onPress={() => {
              void setLanguage(lng.code);
            }}
            style={[styles.pill, active && styles.pillActive]}
            accessibilityLabel={lng.label}
          >
            <Text style={[styles.text, active && styles.textActive]}>
              {lng.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 22,
  },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  pillActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#94a3b8',
    letterSpacing: 0.5,
  },
  textActive: { color: '#0284c7' },
});
