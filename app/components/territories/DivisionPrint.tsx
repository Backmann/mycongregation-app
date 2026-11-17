import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { extractErrorMessage, territoriesApi, type DivisionPart, type TerritoryDivision } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { exportHtmlAsPdf, openPrintWindow } from '../../lib/pdf';
import { snapshotTerritory } from '../../lib/map-snapshot';
import { scaleBar } from '../../lib/territory-sheet';
import { partColor, pieceWords, rangeText, sideWord, walkingOrder } from '../../lib/division';
import { buildDivisionSheetHtml } from '../../lib/divisionSheetPdf';
import { reportError } from '../../lib/error-bus';
import { BRAND } from '../reports/ReportBits';

/** The map on the sheet: the full width of A4 within its margins. */
const MAP_MM = { w: 190, h: 118 };
const DPI = 220;
const px = (mm: number) => Math.round((mm / 25.4) * DPI);

/** A street as the sheet says it: name, numbers, side or piece. */
export function streetText(t: TFunction, x: DivisionPart['streets'][number]): { text: string; sub: string | null } {
  const range = rangeText(x);
  const side = sideWord(x);
  const w = pieceWords(x);
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
  const sub = [side ? t(`territories.division.side.${side}`) : null, piece].filter(Boolean).join(' · ');
  return { text: range ? `${x.name} ${range}` : x.name, sub: sub || null };
}

/**
 * «Печать для пар» on the division screen (17 November 2026): today's
 * division on one A4 sheet, each pair in its colour and with its number,
 * for a pair without a phone. Web only, like every printed map.
 */
export function DivisionPrint({ d, parts }: { d: TerritoryDivision; parts: DivisionPart[] }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const accessQ = useQuery({ queryKey: ['territories', 'access'], queryFn: () => territoriesApi.access() });
  if (Platform.OS !== 'web' || !d.split || !parts.length) return null;
  const split = d.split;

  const print = async () => {
    // The window first, inside the tap: a browser blocks one opened later.
    const win = openPrintWindow();
    setBusy(true);
    try {
      const marks = parts.flatMap((p) =>
        p.streets.flatMap((x) => {
          const line = x.lines[0];
          const mid = line?.[Math.floor(line.length / 2)];
          return mid ? [{ lon: mid[0], lat: mid[1], label: String(p.n), color: partColor(p.n) }] : [];
        }),
      );
      if (split.start) marks.push({ lon: split.start[0], lat: split.start[1], label: '★', color: '#0f172a' });
      let png: string | null = null;
      let scale: { mm: number; label: string } | null = null;
      try {
        const snap = await snapshotTerritory({
          congregationId: user!.congregationId,
          mapReady: !!accessQ.data?.mapReady,
          geometry: d.geometry,
          neighbours: [],
          wPx: px(MAP_MM.w),
          hPx: px(MAP_MM.h),
          overlay: {
            lines: parts.flatMap((p) =>
              p.streets.map((x) => ({ lines: x.lines, color: partColor(p.n), faded: !!x.walkedAt })),
            ),
            marks,
          },
        });
        png = snap.png;
        const bar = scaleBar(snap.metresPerPx, px(MAP_MM.w) / MAP_MM.w, MAP_MM.w);
        scale = bar ? { mm: bar.mm, label: bar.label } : null;
      } catch {
        // No map (a slow tile, an old browser): the streets still go on paper.
        png = null;
      }
      const day = new Date(`${d.day}T12:00:00Z`).toLocaleDateString(i18n.language, {
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      });
      const houses = parts.reduce((a, p) => a + p.houses, 0);
      const title = t('territories.division.sheet.title', { number: d.number, day });
      const html = buildDivisionSheetHtml({
        title,
        kicker: t('territories.division.sheet.kicker', { day }),
        number: d.number,
        subtitle: [
          d.locality,
          t('territories.division.sheet.pairs', { count: parts.length }),
          t('territories.division.sheet.houses', { count: houses }),
          split.start ? t('territories.division.sheet.commonStart') : t('territories.division.sheet.ownStart'),
        ]
          .filter(Boolean)
          .join(' · '),
        png,
        scale,
        parts: parts.map((p) => ({
          n: p.n,
          color: partColor(p.n),
          head: [
            t('territories.division.sheet.pair', { n: p.n }),
            t('territories.division.sheet.houses', { count: p.houses }),
            t('territories.division.sheet.doors', { count: p.doors }),
          ].join(' · '),
          streets: walkingOrder(p.streets).map((x) => ({ ...streetText(t, x), walked: !!x.walkedAt })),
          noCalls: p.noCalls?.length ? t('territories.division.sheet.noCalls', { count: p.noCalls.length }) : null,
        })),
        walkedWord: t('territories.division.sheet.walked'),
        foot: t('territories.division.sheet.foot'),
      });
      await exportHtmlAsPdf(html, { fileName: title, preopenedWindow: win });
    } catch (e) {
      win?.close();
      reportError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      onPress={() => void print()}
      disabled={busy}
      style={({ pressed }) => [s.btn, (pressed || busy) && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      {busy ? <ActivityIndicator color={BRAND} /> : <Ionicons name="print-outline" size={17} color={BRAND} />}
      <Text style={s.text}>{t('territories.division.sheet.print')}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#cfe2e6',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
  },
  text: { fontFamily: 'Manrope_800ExtraBold', fontSize: 13.5, color: BRAND },
});
