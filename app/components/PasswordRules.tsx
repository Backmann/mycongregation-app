import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { passwordChecks, PASSWORD_MIN_LENGTH } from '../lib/password';

/**
 * What is being asked, and how much of it is already done.
 *
 * Placed under the password field itself — the invitation screen used to put
 * its complaint under the SECOND field, which on a phone means behind the
 * keyboard, and that is most of the reason people concluded the form was
 * broken rather than that their password was short.
 *
 * The intro line matters as much as the list: people assume a capital, a digit
 * and a symbol are required. They are not, on purpose — such rules produce
 * Password1! and a note under the keyboard — but until it is said out loud,
 * the reader is solving a problem nobody set.
 */
export function PasswordRules({ password }: { password: string }) {
  const { t } = useTranslation();
  const checks = passwordChecks(password);

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        {t('password.intro', { count: PASSWORD_MIN_LENGTH })}
      </Text>
      {checks.map((c) => (
        <View key={c.id} style={styles.row}>
          <Ionicons
            name={c.ok ? 'checkmark-circle' : 'ellipse-outline'}
            size={15}
            color={c.ok ? '#16a34a' : '#cbd5e1'}
          />
          <Text style={[styles.label, c.ok && styles.labelOk]}>
            {t(`password.checks.${c.id}`, { count: PASSWORD_MIN_LENGTH })}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4, gap: 4 },
  intro: { fontSize: 12, color: '#64748b', lineHeight: 17, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 12, color: '#94a3b8' },
  labelOk: { color: '#16a34a' },
});
