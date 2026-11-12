import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { confirm } from '../ConfirmHost';
import { extractErrorMessage, territoriesApi, type TerritoryNoCallRow } from '../../lib/api';
import { formatDateISO } from '../../lib/dates';
import { streetIsInside, streetSuggestions } from '../../lib/no-call';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

/**
 * «Не посещать»: add an address, or correct or delete one (12 November 2026,
 * mockup «Добавить / исправить»). Only the address, the surname on the door
 * where the flat cannot be found without it, and the day it was noted — no
 * names, no reasons. The territory's streets from the map are offered while
 * typing, and a street the territory does not have is pointed out.
 */
export function NoCallSheet({
  territoryId,
  number,
  row,
  streets,
  visible,
  onClose,
}: {
  territoryId: string;
  number: string;
  /** The address to correct; null to add one. */
  row: TerritoryNoCallRow | null;
  /** The territory's streets as the map knows them; empty when unknown. */
  streets: string[];
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const today = formatDateISO(new Date());
  const [address, setAddress] = useState('');
  const [surname, setSurname] = useState('');
  const [notedOn, setNotedOn] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setAddress(row?.address ?? '');
    setSurname(row?.surname ?? '');
    setNotedOn(row?.notedOn ?? today);
    setError(null);
  }, [visible, row, today]);

  const offered = streetSuggestions(streets, address);
  const inside = address.trim() ? streetIsInside(streets, address) : null;
  const ready = !!address.trim() && notedOn <= today && !busy;

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ['territories'] });
    onClose();
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const body = { address: address.trim(), surname: surname.trim(), notedOn };
      if (row) await territoriesApi.editNoCall(row.id, body);
      else
        await territoriesApi.addNoCall(territoryId, {
          ...body,
          surname: body.surname || undefined,
        });
      await done();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!row) return;
    const ok = await confirm({
      title: t('territories.noCall.removeTitle'),
      body: t('territories.noCall.removeBody', { address: row.address }),
      confirmLabel: t('territories.noCall.remove'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await territoriesApi.removeNoCall(row.id);
      await done();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={t('territories.noCall.title')}
      subtitle={t('territories.noCall.subtitle', { number })}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= 900 ? 'centered' : 'bottom'}
      footer={
        <View style={s.foot}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            onPress={() => void save()}
            disabled={!ready}
            style={[s.go, !ready && s.goOff]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.goText}>{t('common.save')}</Text>}
          </Pressable>
          {row ? (
            <Pressable onPress={() => void remove()} disabled={busy} style={s.del} accessibilityRole="button">
              <Text style={s.delText}>{t('territories.noCall.remove')}</Text>
            </Pressable>
          ) : null}
        </View>
      }
    >
      <Text style={s.label}>{t('territories.noCall.address')}</Text>
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder={t('territories.noCall.addressPlaceholder')}
        placeholderTextColor="#94a3b8"
        accessibilityLabel={t('territories.noCall.address')}
        autoCorrect={false}
        style={s.input}
      />
      {offered.length ? (
        <View style={s.chips}>
          {offered.map((name) => (
            <Pressable
              key={name}
              onPress={() => setAddress(`${name} `)}
              style={s.chip}
              accessibilityRole="button"
            >
              <Text style={s.chipText}>{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {inside === false ? (
        <View style={s.warn}>
          <Ionicons name="alert-circle-outline" size={16} color="#b45309" />
          <Text style={s.warnText}>{t('territories.noCall.notInside', { number })}</Text>
        </View>
      ) : null}

      <Text style={s.label}>{t('territories.noCall.surname')}</Text>
      <TextInput
        value={surname}
        onChangeText={setSurname}
        accessibilityLabel={t('territories.noCall.surname')}
        autoCorrect={false}
        style={s.input}
      />
      <Text style={s.hint}>{t('territories.noCall.surnameHint')}</Text>

      <View style={{ marginTop: 14 }}>
        <DateField label={t('territories.noCall.notedOn')} value={notedOn} onChange={setNotedOn} />
      </View>
      <Text style={s.hint}>{t('territories.noCall.reviewHint')}</Text>
    </Sheet>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Manrope_500Medium',
    fontSize: 14,
    color: INK,
    backgroundColor: '#fff',
  },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: LINE, backgroundColor: '#f8fafc' },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 12.5, color: INK },
  warn: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', backgroundColor: '#fffbeb', borderRadius: 10, padding: 8, marginTop: 8 },
  warnText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12, color: '#92400e', lineHeight: 16 },
  foot: { gap: 8 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  del: { paddingVertical: 10, alignItems: 'center' },
  delText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#b91c1c' },
});
