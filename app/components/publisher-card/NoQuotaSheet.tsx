import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { monthName } from '../../lib/aux-application';
import { WIDE_FROM } from '../../lib/screen-width';
import type { PioneerHistory } from '../../lib/api';

const INK = '#0f172a';
const MUTED = '#64748b';
const BRAND = '#0e7490';

/**
 * «Служение без нормы часов» (instructions, point 9; 30 October 2026). The
 * three conditions, the two the app can see answered from the card and the
 * history, and the day of the elders' decision. Nothing here forbids: the
 * elders decide, with the circuit overseer — the app only writes it down.
 */
export function NoQuotaSheet({
  visible,
  history,
  today,
  onClose,
  onSave,
}: {
  visible: boolean;
  history: PioneerHistory;
  /** YYYY-MM-DD */
  today: string;
  onClose: () => void;
  /** Resolves to an error text, or null when saved. */
  onSave: (decidedOn: string) => Promise<string | null>;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { width } = useWindowDimensions();
  const [day, setDay] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setDay(today);
    setError(null);
    setBusy(false);
  }, [visible, today]);

  const e = history.eligibility;
  const span = (months: number) =>
    [
      Math.floor(months / 12) > 0 ? t('pioneerHistory.years', { count: Math.floor(months / 12) }) : null,
      months % 12 > 0 ? t('pioneerHistory.months', { count: months % 12 }) : null,
    ]
      .filter(Boolean)
      .join(' ') || t('pioneerHistory.months', { count: 0 });

  const condition = (ok: boolean | null, title: string, sub: string) => (
    <View style={[styles.cond, ok === true ? styles.condOk : ok === false ? styles.condNo : null]}>
      <Ionicons
        name={ok === true ? 'checkmark' : ok === false ? 'close' : 'information-circle-outline'}
        size={18}
        color={ok === true ? '#15803d' : ok === false ? '#b45309' : MUTED}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.condTitle}>{title}</Text>
        <Text style={styles.condSub}>{sub}</Text>
      </View>
    </View>
  );

  const save = async () => {
    if (!day || busy) return;
    setBusy(true);
    const err = await onSave(day);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <Sheet
      visible={visible}
      title={t('noQuota.title')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= WIDE_FROM ? 'centered' : 'bottom'}
      footer={
        <View style={{ gap: 8 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.btn, (!day || busy) && { opacity: 0.45 }]}
            disabled={!day || busy}
            onPress={() => void save()}
            accessibilityRole="button"
            testID="no-quota-save"
          >
            <Text style={styles.btnText}>{t('noQuota.mark')}</Text>
          </Pressable>
        </View>
      }
    >
      <View style={{ gap: 12 }}>
        <Text style={styles.lead}>{t('noQuota.lead')}</Text>
        {condition(
          e ? (e.age === null ? null : e.ageOk) : null,
          t('noQuota.age'),
          e?.age === null || !e ? t('noQuota.ageUnknown') : t('noQuota.ageIs', { age: t('pioneerReview.age', { count: e.age }) }),
        )}
        {condition(
          e ? e.yearsOk : null,
          t('noQuota.years'),
          e
            ? t('noQuota.yearsIs', {
                span: span(e.servedMonths),
                month: e.knownFrom ? monthName(e.knownFrom, lang) : '—',
              })
            : '',
        )}
        {condition(null, t('noQuota.wish'), t('noQuota.wishSub'))}
        <DateField label={t('noQuota.decidedOn')} value={day} onChange={setDay} />
        <Text style={styles.note}>{t('noQuota.note')}</Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 13.5, lineHeight: 20, color: '#334155' },
  cond: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#f8fafc', borderRadius: 14, padding: 10 },
  condOk: { backgroundColor: '#f0fdf4' },
  condNo: { backgroundColor: '#fffbeb' },
  condTitle: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: INK },
  condSub: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: '#475569', marginTop: 1, lineHeight: 17 },
  note: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, lineHeight: 18, color: MUTED },
  error: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: '#b91c1c' },
  btn: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontFamily: 'Manrope_800ExtraBold', fontSize: 15.5, color: '#fff' },
});
