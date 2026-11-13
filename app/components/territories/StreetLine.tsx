import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { pieceWords, rangeText, sideWord, type StreetLike } from '../../lib/division';
import { INK, MUTED } from '../reports/ReportBits';

/**
 * A street of a division as it is read on the spot (13 November 2026): its
 * name with its house numbers — «Heessener Straße 2–84» is on the doors —
 * the side of a main road («чётная», or «северная» without numbers), and for
 * a piece without numbers where it starts and ends by the streets that cross
 * it. `across`: the pair walking the other side of the same road.
 */
export function StreetLine({
  street,
  across,
  pending,
}: {
  street: StreetLike & { doors?: number };
  across?: number | null;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  const range = rangeText(street);
  const side = sideWord(street);
  const w = pieceWords(street);
  // With numbers the piece needs no other words; without, the crossing streets say it.
  const piece =
    range || w.key === 'whole'
      ? null
      : w.key === 'between'
        ? t('territories.division.piece.between', { from: w.from, to: w.to })
        : w.key === 'upTo'
          ? t('territories.division.piece.upTo', { to: w.to })
          : w.key === 'from'
            ? t('territories.division.piece.from', { from: w.from })
            : t('territories.division.piece.nth', { piece: w.piece, pieces: w.pieces });
  const sub = [
    side ? null : street.side === undefined ? null : t('territories.division.side.both'),
    piece,
    across ? t('territories.division.across', { n: across }) : null,
    t('territories.division.houses', { count: street.houses }),
    pending ? t('territories.division.pending') : null,
  ].filter(Boolean);
  return (
    <View>
      <Text style={[s.name, street.walkedAt && s.walked]}>
        {street.name}
        {range ? <Text style={s.range}> {range}</Text> : null}
        {side ? (
          <Text style={s.side}>
            {'  '}
            {t(`territories.division.side.${side}`)}
          </Text>
        ) : null}
      </Text>
      <Text style={s.sub}>{sub.join(' · ')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  name: { fontFamily: 'Manrope_700Bold', fontSize: 14.5, color: INK },
  range: { fontFamily: 'Manrope_800ExtraBold' },
  side: { fontFamily: 'Manrope_800ExtraBold', fontSize: 12, color: '#7c3aed' },
  walked: { color: MUTED },
  sub: { fontFamily: 'Manrope_500Medium', fontSize: 12, color: MUTED, marginTop: 1 },
});
