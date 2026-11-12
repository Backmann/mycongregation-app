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
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { confirm } from '../ConfirmHost';
import { extractErrorMessage, territoriesApi, type TerritoryDetail } from '../../lib/api';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

type Kind = 'city' | 'suburb' | 'village';
const KINDS: Kind[] = ['city', 'suburb', 'village'];

/**
 * «Карточка участка» (12 November 2026, mockup «Карточка»): what the
 * territory servant corrects by hand — the number, the place, the kind of
 * area as the S-12 asks it, a note only the section sees (sealed on the
 * server). A new number shows on every line of the S-13 at once; the old one
 * stays in the journal. At the bottom: out of use, only while nobody holds
 * it. The outline has an editor of its own.
 */
export function TerritoryCardSheet({
  territory,
  held,
  visible,
  onClose,
}: {
  territory: TerritoryDetail;
  /** Somebody holds it now: it cannot go out of use. */
  held: boolean;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const [number, setNumber] = useState('');
  const [locality, setLocality] = useState('');
  const [kind, setKind] = useState<Kind | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setNumber(territory.number);
    setLocality(territory.locality ?? '');
    setKind(territory.kind);
    setNote(territory.note ?? '');
    setError(null);
  }, [visible, territory]);

  const ready = !!number.trim() && !busy;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await territoriesApi.editCard(territory.id, {
        number: number.trim(),
        locality: locality.trim() || null,
        kind,
        note: note.trim() || null,
      });
      await qc.invalidateQueries({ queryKey: ['territories'] });
      onClose();
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    const ok = await confirm({
      title: t('territories.card.archiveTitle', { number: territory.number }),
      body: t('territories.card.archiveBody'),
      confirmLabel: t('territories.card.archive'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await territoriesApi.archive(territory.id);
      await qc.invalidateQueries({ queryKey: ['territories'] });
      onClose();
      router.replace('/cart/territories' as never);
    } catch (e) {
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={t('territories.card.title')}
      subtitle={territory.number}
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
          {held ? (
            <Text style={s.hint}>{t('territories.card.archiveHeld')}</Text>
          ) : (
            <Pressable onPress={() => void archive()} disabled={busy} style={s.del} accessibilityRole="button">
              <Text style={s.delText}>{t('territories.card.archive')}</Text>
            </Pressable>
          )}
        </View>
      }
    >
      <Text style={s.label}>{t('territories.card.number')}</Text>
      <TextInput
        value={number}
        onChangeText={setNumber}
        accessibilityLabel={t('territories.card.number')}
        autoCorrect={false}
        autoCapitalize="none"
        maxLength={40}
        style={s.input}
      />
      <Text style={s.hint}>{t('territories.card.numberHint')}</Text>

      <Text style={s.label}>{t('territories.card.locality')}</Text>
      <TextInput
        value={locality}
        onChangeText={setLocality}
        accessibilityLabel={t('territories.card.locality')}
        maxLength={120}
        style={s.input}
      />

      <Text style={s.label}>{t('territories.card.kind')}</Text>
      <View style={s.chips} accessibilityRole="radiogroup">
        {KINDS.map((k) => (
          <Pressable
            key={k}
            onPress={() => setKind(kind === k ? null : k)}
            style={[s.chip, kind === k && s.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === k }}
          >
            <Text style={[s.chipText, kind === k && s.chipTextOn]}>{t(`territories.card.kinds.${k}`)}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={s.label}>{t('territories.card.note')}</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        accessibilityLabel={t('territories.card.note')}
        multiline
        maxLength={2000}
        style={[s.input, s.note]}
      />
      <View style={s.sealed}>
        <Ionicons name="lock-closed-outline" size={13} color={MUTED} />
        <Text style={s.hintInline}>{t('territories.card.noteHint')}</Text>
      </View>
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
  note: { minHeight: 80, textAlignVertical: 'top' },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 5, lineHeight: 16 },
  hintInline: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, lineHeight: 16 },
  sealed: { flexDirection: 'row', gap: 5, alignItems: 'center', marginTop: 5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: LINE, backgroundColor: '#fff' },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13.5, color: INK },
  chipTextOn: { color: '#fff' },
  foot: { gap: 8 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
  del: { paddingVertical: 10, alignItems: 'center' },
  delText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#b91c1c' },
});
