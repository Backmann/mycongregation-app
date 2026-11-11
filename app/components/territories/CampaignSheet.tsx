import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { extractErrorMessage, territoriesApi, type TerritoryRow } from '../../lib/api';
import { formatDateISO } from '../../lib/dates';
import { formatDayShort } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

/**
 * «Обработаны в кампанию» (11 November 2026): the free territories worked
 * during a campaign, marked at once. Each becomes a line in the keeper's
 * name with the method «кампания»; a territory in someone's hands is not
 * offered — its holder marks it himself.
 */
export function CampaignSheet({
  rows,
  visible,
  onClose,
}: {
  rows: TerritoryRow[];
  visible: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const today = formatDateISO(new Date());
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [day, setDay] = useState(today);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setChosen(new Set());
    setDay(today);
    setError(null);
  }, [visible, today]);

  const free = useMemo(
    () =>
      rows
        .filter((r) => !r.holder)
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [rows],
  );
  const flip = (id: string) =>
    setChosen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = useMutation({
    mutationFn: () => territoriesApi.campaign([...chosen], day),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['territories'] });
      onClose();
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  return (
    <Sheet
      visible={visible}
      title={t('territories.campaign.title')}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= 900 ? 'centered' : 'bottom'}
      footer={
        <View style={s.foot}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            onPress={() => save.mutate()}
            disabled={chosen.size === 0 || save.isPending}
            style={[s.go, (chosen.size === 0 || save.isPending) && s.goOff]}
            accessibilityRole="button"
          >
            {save.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.goText}>
                {t('territories.campaign.confirm', { count: chosen.size })}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <Text style={s.lead}>{t('territories.campaign.lead')}</Text>
      <DateField label={t('territories.campaign.day')} value={day} onChange={setDay} />
      <View style={s.list}>
        {free.map((r) => {
          const on = chosen.has(r.id);
          return (
            <Pressable
              key={r.id}
              onPress={() => flip(r.id)}
              style={[s.row, on && s.rowOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Ionicons
                name={on ? 'checkbox' : 'square-outline'}
                size={20}
                color={on ? BRAND : '#94a3b8'}
              />
              <View style={{ flex: 1 }}>
                <Text style={s.number}>
                  {r.number}
                  {r.locality ? <Text style={s.locality}> · {r.locality}</Text> : null}
                </Text>
                <Text style={s.meta}>
                  {r.lastCompletedOn
                    ? t('territories.row.free', {
                        date: formatDayShort(r.lastCompletedOn, i18n.language),
                      })
                    : t('territories.row.freeNever')}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {free.length === 0 ? <Text style={s.meta}>{t('territories.campaign.noneFree')}</Text> : null}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  lead: { fontFamily: 'Manrope_500Medium', fontSize: 13, color: MUTED, lineHeight: 18, marginBottom: 10 },
  list: { marginTop: 12, gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#fff',
  },
  rowOn: { borderColor: BRAND, backgroundColor: '#ecfeff' },
  number: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  locality: { fontFamily: 'Manrope_500Medium', color: MUTED },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 1 },
  foot: { gap: 8 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
});
