import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '../Sheet';
import { DateField } from '../DateField';
import { extractErrorMessage, territoriesApi, type TerritoryAssignmentRow } from '../../lib/api';
import { formatDateISO } from '../../lib/dates';
import { addDaysISO, formatDayShort, TERM_DAYS } from '../../lib/territory-view';
import { transferDue } from '../../lib/territory-record';
import { BRAND, INK, LINE, MUTED } from '../reports/ReportBits';
import { HandOver } from './HandOver';
import { PersonPicker, type Candidate } from './PersonPicker';

/**
 * «Передать участок» (17 November 2026; mockup board 4). Through the
 * territory servant only: who takes it on, from which day, and the day it is
 * due — kept, or four months anew. Before the button the sheet says what the
 * S-13 will read and who is told; after it, how the new holder gets the map
 * (the same step as after giving out).
 */
export function TransferSheet({
  territoryId,
  number,
  current,
  noCalls,
  onClose,
  onPrint,
}: {
  territoryId: string;
  number: string;
  current: TerritoryAssignmentRow | null;
  noCalls: number;
  onClose: () => void;
  onPrint?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const today = formatDateISO(new Date());
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [on, setOn] = useState(today);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handing, setHanding] = useState<{ assignmentId: string; dueOn: string | null } | null>(null);

  const q = useQuery({
    queryKey: ['territories', 'candidates', territoryId],
    queryFn: () => territoriesApi.candidates(territoryId),
    enabled: !!current,
  });
  // No reset on a new `current`: once handed on, the territory's record is
  // fetched again and `current` becomes the new line — the sheet must stay on
  // «Как он получит карту?» (found on the stand, 17 November 2026). It is
  // mounted afresh each time it opens.

  const due = transferDue(current?.dueOn ?? null, on, fresh, addDaysISO, TERM_DAYS);
  const go = useMutation({
    mutationFn: () =>
      territoriesApi.transfer(current!.id, {
        toPublisherId: chosen!.publisherId,
        on,
        ...(due.send ? { dueOn: due.send } : {}),
      }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ['territories'] });
      setHanding({ assignmentId: r.id, dueOn: r.dueOn });
    },
    onError: (e) => setError(extractErrorMessage(e)),
  });

  if (!current) return null;

  if (handing && chosen) {
    return (
      <Sheet
        visible
        title={t('territories.handover.title')}
        onClose={onClose}
        hideClose
        variant={width >= 900 ? 'centered' : 'bottom'}
      >
        <HandOver
          assignmentId={handing.assignmentId}
          number={number}
          holderName={chosen.name}
          dueOn={handing.dueOn}
          hasApp={!!chosen.hasApp}
          noCalls={noCalls}
          onDone={onClose}
          onPrintNow={
            onPrint && Platform.OS === 'web'
              ? () => {
                  onClose();
                  onPrint();
                }
              : undefined
          }
        />
      </Sheet>
    );
  }

  const day = (iso: string) => formatDayShort(iso, lang);
  const from = current.holderName;
  const keepDue = due.keep;
  const dueOn = due.dueOn;
  const ready = !!chosen && on <= today && on >= current.assignedOn && !go.isPending;
  const oldHasApp =
    !!current.publisherId &&
    !!q.data?.people.find((p) => p.publisherId === current.publisherId)?.hasApp;
  const tell = chosen
    ? chosen.hasApp && oldHasApp
      ? t('territories.transfer.tellBoth', { to: chosen.name, from, number })
      : chosen.hasApp
        ? t('territories.transfer.tellNew', { to: chosen.name, number })
        : oldHasApp
          ? t('territories.transfer.tellOld', { from, number })
          : null
    : null;

  return (
    <Sheet
      visible
      title={t('territories.transfer.title')}
      subtitle={number}
      onClose={onClose}
      closeLabel={t('common.cancel')}
      variant={width >= 900 ? 'centered' : 'bottom'}
      footer={
        <View style={s.foot}>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Pressable
            onPress={() => go.mutate()}
            disabled={!ready}
            style={[s.go, !ready && s.goOff]}
            accessibilityRole="button"
          >
            {go.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.goText}>
                {chosen ? t('territories.transfer.go', { name: chosen.name }) : t('territories.transfer.choose')}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View style={s.now}>
        <Text style={s.kicker}>{t('territories.transfer.now')}</Text>
        <Text style={s.nowName}>
          {current.forGroupName ? `${current.forGroupName} · ` : ''}
          {from}
        </Text>
        <Text style={s.meta}>
          {t('territories.detail.since', { date: day(current.assignedOn) })}
          {current.dueOn ? ` · ${t('territories.detail.due', { date: day(current.dueOn) })}` : ''}
        </Text>
      </View>

      <Text style={s.label}>{t('territories.transfer.whom')}</Text>
      <PersonPicker
        data={q.data}
        loading={q.isLoading}
        error={q.error}
        chosen={chosen?.publisherId ?? null}
        onChoose={setChosen}
        except={current.publisherId}
      />

      <View style={s.block}>
        <DateField label={t('territories.transfer.on')} value={on} onChange={setOn} />
      </View>

      {keepDue ? (
        <View style={s.block}>
          <Text style={s.label}>{t('territories.transfer.due')}</Text>
          <View style={s.chips}>
            {[false, true].map((f) => (
              <Pressable
                key={String(f)}
                onPress={() => setFresh(f)}
                style={[s.chip, fresh === f && s.chipOn]}
                accessibilityRole="radio"
                accessibilityState={{ selected: fresh === f }}
              >
                <Text style={[s.chipText, fresh === f && s.chipTextOn]}>
                  {f ? t('territories.transfer.fresh') : t('territories.transfer.keep', { date: day(keepDue) })}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {chosen ? (
        <View style={s.preview}>
          <Text style={s.previewText}>
            {t('territories.transfer.preview', {
              from,
              start: day(current.assignedOn),
              on: day(on),
              to: chosen.name,
            })}{' '}
            {t('territories.detail.due', { date: day(dueOn) })}.
          </Text>
          {tell ? <Text style={s.previewText}>{tell}</Text> : null}
          {!chosen.hasApp ? (
            <Text style={s.previewText}>{t('territories.transfer.noAppNew', { to: chosen.name })}</Text>
          ) : null}
          <Text style={s.previewMuted}>{t('territories.transfer.marks')}</Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const s = StyleSheet.create({
  now: { borderWidth: 1, borderColor: LINE, borderRadius: 14, padding: 12, backgroundColor: '#f8fafc' },
  kicker: { fontFamily: 'Manrope_800ExtraBold', fontSize: 11, letterSpacing: 0.6, color: MUTED, textTransform: 'uppercase' },
  nowName: { fontFamily: 'Manrope_700Bold', fontSize: 15.5, color: INK, marginTop: 4 },
  meta: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, marginTop: 2 },
  label: { fontFamily: 'Manrope_700Bold', fontSize: 13, color: INK, marginTop: 16, marginBottom: 2 },
  block: { marginTop: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: LINE },
  chipOn: { backgroundColor: BRAND, borderColor: BRAND },
  chipText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK },
  chipTextOn: { color: '#fff' },
  preview: { marginTop: 16, gap: 6, backgroundColor: '#ecfeff', borderRadius: 14, padding: 12 },
  previewText: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: INK, lineHeight: 19 },
  previewMuted: { fontFamily: 'Manrope_500Medium', fontSize: 12.5, color: MUTED, lineHeight: 18 },
  foot: { gap: 8 },
  error: { fontFamily: 'Manrope_600SemiBold', fontSize: 13, color: '#b91c1c' },
  go: { backgroundColor: BRAND, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  goOff: { opacity: 0.45 },
  goText: { fontFamily: 'Manrope_700Bold', fontSize: 15, color: '#fff' },
});
