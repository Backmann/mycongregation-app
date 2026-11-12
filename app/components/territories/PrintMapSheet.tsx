import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { extractErrorMessage, territoriesApi, type TerritoryRow } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { exportHtmlAsPdf, openPrintWindow } from '../../lib/pdf';
import { snapshotTerritory } from '../../lib/map-snapshot';
import { landscapeFor, mapFrame, scaleBar, type SheetFormat } from '../../lib/territory-sheet';
import { buildTerritorySheetHtml, type SheetPage } from '../../lib/territorySheetPdf';
import { boxOf, siteOrigin } from '../../lib/territory-view';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';

const FORMATS: SheetFormat[] = ['s12', 'a5', 'a4'];

/** Neighbours worth outlining: those whose box touches this one's, widened. */
function neighboursOf(target: TerritoryRow, all: TerritoryRow[]) {
  const b = boxOf([target.geometry]);
  if (!b) return [];
  const pad = Math.max(b[1][0] - b[0][0], b[1][1] - b[0][1]) * 0.6;
  return all
    .filter((r) => r.id !== target.id)
    .filter((r) => {
      const o = boxOf([r.geometry]);
      return (
        !!o &&
        o[0][0] <= b[1][0] + pad &&
        o[1][0] >= b[0][0] - pad &&
        o[0][1] <= b[1][1] + pad &&
        o[1][1] >= b[0][1] - pad
      );
    })
    .map((r) => ({ number: r.number, geometry: r.geometry }));
}

/**
 * «Карта участка» to print (12 November 2026), one territory or many: a
 * modern S-12 with the territory outlined on the street map, the streets in
 * it, and a QR code to the live map. Each sheet carries a fresh link, so a
 * sheet printed before for the same assignment stops opening — said here
 * before printing. The keeper may add the «не беспокоить» addresses on the
 * back, for a holder without a phone. Web only: the phone app has no map.
 */
export function PrintMapSheet({
  targets,
  all,
  visible,
  onClose,
}: {
  targets: TerritoryRow[];
  all: TerritoryRow[];
  visible: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const [format, setFormat] = useState<SheetFormat>('a5');
  const [withNoCalls, setWithNoCalls] = useState(false);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accessQ = useQuery({
    queryKey: ['territories', 'access'],
    queryFn: () => territoriesApi.access(),
  });

  useEffect(() => {
    if (!visible) return;
    setWithNoCalls(false);
    setProgress(null);
    setError(null);
  }, [visible]);

  const held = targets.filter((r) => r.holder);
  const fmtDay = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(i18n.language, {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      timeZone: 'UTC',
    });

  const print = async () => {
    // The window first, inside the tap: a browser blocks one opened later.
    const win = openPrintWindow();
    setError(null);
    try {
      const links = held.length
        ? await territoriesApi.printLinks(
            held.map((r) => r.holder!.assignmentId),
            withNoCalls,
          )
        : [];
      void qc.invalidateQueries({ queryKey: ['territories'] });
      const linkOf = new Map(links.map((l) => [l.territoryId, l]));
      const pages: SheetPage[] = [];
      setProgress({ done: 0, of: targets.length });
      for (const r of targets) {
        const box = boxOf([r.geometry])!;
        const landscape = landscapeFor(box);
        const frame = mapFrame(format, landscape);
        const snap = await snapshotTerritory({
          congregationId: user!.congregationId,
          mapReady: !!accessQ.data?.mapReady,
          geometry: r.geometry,
          neighbours: neighboursOf(r, all),
          wPx: frame.wPx,
          hPx: frame.hPx,
        });
        const l = linkOf.get(r.id);
        pages.push({
          number: r.number,
          locality: r.locality,
          png: snap.png,
          streets: snap.streets,
          landscape,
          scale: scaleBar(snap.metresPerPx, frame.wPx / frame.wMm, frame.wMm),
          url: l ? `${siteOrigin()}${l.path}` : null,
          dueOn: l?.dueOn ?? r.holder?.dueOn ?? null,
          noCalls:
            withNoCalls && l && l.noCalls.length
              ? l.noCalls.map((c) => (c.surname ? `${c.address} · ${c.surname}` : c.address))
              : null,
        });
        setProgress({ done: pages.length, of: targets.length });
      }
      const html = buildTerritorySheetHtml(pages, format, t, fmtDay);
      await exportHtmlAsPdf(html, {
        fileName: t('territories.sheet.fileTitle', { list: pages.map((p) => p.number).join(', ') }),
        preopenedWindow: win,
        landscape: pages.every((p) => p.landscape),
      });
      onClose();
    } catch (e) {
      win?.close();
      setError(extractErrorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <Sheet
      visible={visible}
      title={t('territories.sheet.printTitle')}
      subtitle={targets.length === 1 ? targets[0].number : t('territories.sheet.many', { count: targets.length })}
      onClose={busy ? () => undefined : onClose}
      closeLabel={t('common.cancel')}
      variant={width >= 900 ? 'centered' : 'bottom'}
      footer={
        <View style={s.foot}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            onPress={() => void print()}
            disabled={busy || targets.length === 0}
            style={[s.go, busy && s.goOff]}
            accessibilityRole="button"
          >
            {busy ? (
              <View style={s.row}>
                <ActivityIndicator color="#fff" />
                <Text style={s.goText}>
                  {t('territories.sheet.preparing', { done: progress!.done, of: progress!.of })}
                </Text>
              </View>
            ) : (
              <Text style={s.goText}>{t('territories.sheet.print')}</Text>
            )}
          </Pressable>
        </View>
      }
    >
      <Text style={s.label}>{t('territories.sheet.format')}</Text>
      <View style={s.chips}>
        {FORMATS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setFormat(f)}
            style={[s.chip, format === f && s.chipOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: format === f }}
          >
            <Text style={[s.chipText, format === f && s.chipTextOn]}>
              {t(`territories.sheet.formats.${f}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {held.length > 0 ? (
        <>
          <Pressable
            onPress={() => setWithNoCalls((v) => !v)}
            style={s.check}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: withNoCalls }}
          >
            <Ionicons
              name={withNoCalls ? 'checkbox' : 'square-outline'}
              size={20}
              color={withNoCalls ? BRAND : '#94a3b8'}
            />
            <View style={{ flex: 1 }}>
              <Text style={s.checkTitle}>{t('territories.sheet.noCalls')}</Text>
              <Text style={s.hint}>{t('territories.sheet.noCallsHint')}</Text>
            </View>
          </Pressable>
          <View style={s.warn}>
            <Ionicons name="information-circle-outline" size={18} color="#b45309" />
            <Text style={s.warnText}>{t('territories.sheet.replaces')}</Text>
          </View>
        </>
      ) : null}
      {targets.length > held.length ? (
        <Text style={s.hint}>{t('territories.sheet.freeNoQr')}</Text>
      ) : null}
      {!accessQ.data?.mapReady ? <Text style={s.hint}>{t('territories.sheet.noStreets')}</Text> : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 8 },
  checkTitle: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: INK },
  hint: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  warn: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 10,
    marginVertical: 8,
  },
  warnText: { flex: 1, fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: '#92400e', lineHeight: 17 },
  foot: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.6 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
});
