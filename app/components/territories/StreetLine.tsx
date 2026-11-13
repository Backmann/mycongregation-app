import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { pieceWords, type StreetLike } from '../../lib/division';
import { INK, MUTED } from '../reports/ReportBits';

/**
 * A street of a division as it is read on the spot (13 November 2026): its
 * name, and for a piece of a long one where it starts and ends by the
 * streets that cross it — «от Ostring до конца» is on a sign, «(2/3)» is not.
 */
export function StreetLine({ street }: { street: StreetLike }) {
  const { t } = useTranslation();
  const w = pieceWords(street);
  const piece =
    w.key === 'whole'
      ? null
      : w.key === 'between'
        ? t('territories.division.piece.between', { from: w.from, to: w.to })
        : w.key === 'upTo'
          ? t('territories.division.piece.upTo', { to: w.to })
          : w.key === 'from'
            ? t('territories.division.piece.from', { from: w.from })
            : t('territories.division.piece.nth', { piece: w.piece, pieces: w.pieces });
  return (
    <View>
      <Text style={[s.name, street.walkedAt && s.walked]}>{street.name}</Text>
      <Text style={s.sub}>
        {[piece, t('territories.division.houses', { count: street.houses })].filter(Boolean).join(' · ')}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  walked: { color: MUTED },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 1 },
});
