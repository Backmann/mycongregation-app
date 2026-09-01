import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { memorialApi, MemorialItem, SpecialEvent } from '../lib/api';
import { memorialKey, useMemorialSheet } from '../lib/useMemorialSheet';
import { useAllPublishers } from '../lib/useAllPublishers';
import { PublisherSelector } from './PublisherSelector';

/**
 * The duties of the Memorial evening, shown beside the ordinary ones.
 *
 * They belong in the «Обязанности» section rather than inside the Memorial
 * block — Lionel's decision, and the plain one: whoever opens that section
 * wants to see who is at the door and at the microphone, and should not have
 * to know that this week the answer lives somewhere else.
 *
 * They come from a different table: an ordinary duty is keyed by week and kind
 * of meeting, a Memorial duty by the evening itself, because the places are
 * named by the congregation for its own hall — which may be a rented room —
 * and several brothers stand at one of them.
 *
 * A place with several brothers is several LINES with the same label. The
 * lines are grouped here for reading, so «Стоянка» appears once with three
 * names under it rather than three times.
 */

const NOT_BAPTIZED = ['student', 'unbaptized_publisher'] as const;

export function MemorialDutiesCard({
  event,
  canEdit,
  /** 'duty' for the attendants, 'emblems' for the places the emblems pass. */
  section,
  title,
}: {
  event: SpecialEvent;
  canEdit: boolean;
  section: 'duty' | 'emblems';
  title: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useMemorialSheet(event.id);
  const { data: publishers } = useAllPublishers();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: memorialKey(event.id) });
  };
  const updateM = useMutation({
    mutationFn: (v: { lineId: string; publisherId: string | null }) =>
      memorialApi.updateLine(v.lineId, { publisherId: v.publisherId }),
    onSuccess: invalidate,
  });
  const prepareM = useMutation({
    mutationFn: () => memorialApi.prepareSection(event.id, section),
    onSuccess: invalidate,
  });

  const lines = (data?.items ?? []).filter((i) => i.section === section);
  const canWrite = canEdit && (data?.editable ?? false);
  const assigned = lines.filter((l) => l.publisherId || l.personText).length;

  const nameOf = (line: MemorialItem): string | null =>
    line.personText ??
    (line.publisherId
      ? (publishers?.data.find((p) => p.id === line.publisherId)?.displayName ??
        null)
      : null);

  // Several lines with one label read as one place with several names.
  const places: { label: string; lines: MemorialItem[] }[] = [];
  for (const line of lines) {
    const last = places[places.length - 1];
    if (last && last.label === line.label) last.lines.push(line);
    else places.push({ label: line.label, lines: [line] });
  }

  if (isLoading) {
    return (
      <View style={styles.card}>
        <ActivityIndicator style={{ marginVertical: 14 }} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.dot} />
        <Text style={styles.title}>{title}</Text>
        {lines.length > 0 ? (
          <Text style={styles.count}>
            {assigned}/{lines.length}
          </Text>
        ) : null}
      </View>

      {lines.length === 0 ? (
        // Asked for, never automatic: a congregation meeting in a rented room
        // may have deleted these on purpose, and putting them back unbidden is
        // the same fault as an undo that undoes a decision.
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>{t('memorial.sectionEmpty')}</Text>
          {canWrite ? (
            <Pressable
              style={styles.addBtn}
              disabled={prepareM.isPending}
              onPress={() => prepareM.mutate()}
            >
              {prepareM.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.addBtnText}>
                  {t('memorial.sectionPrepare')}
                </Text>
              )}
            </Pressable>
          ) : null}
        </View>
      ) : (
        places.map((place) => (
          <View key={place.label} style={styles.place}>
            <Text style={styles.placeLabel}>{place.label}</Text>
            {place.lines[0].note ? (
              <View style={styles.noteRow}>
                <Ionicons
                  name="information-circle-outline"
                  size={13}
                  color="#b45309"
                />
                <Text style={styles.noteText}>{place.lines[0].note}</Text>
              </View>
            ) : null}
            {place.lines.map((line) =>
              canWrite ? (
                <PublisherSelector
                  key={line.id}
                  boxed
                  label=""
                  value={line.publisherId}
                  onChange={(pid) =>
                    updateM.mutate({ lineId: line.id, publisherId: pid })
                  }
                  genderFilter={section === 'emblems' ? 'brother' : undefined}
                  excludeAppointments={
                    section === 'emblems' ? [...NOT_BAPTIZED] : undefined
                  }
                  absenceDate={event.date}
                />
              ) : (
                <Text key={line.id} style={styles.readName}>
                  {nameOf(line) || '—'}
                </Text>
              ),
            )}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7c3aed' },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
  },
  count: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    color: '#7c3aed',
    backgroundColor: '#f5f3ff',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  place: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  placeLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    color: '#334155',
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  noteText: { flex: 1, fontSize: 12, color: '#b45309' },
  readName: { fontSize: 15, color: '#0f172a' },
  emptyBox: { alignItems: 'center', gap: 10, paddingVertical: 10 },
  emptyText: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  addBtn: {
    backgroundColor: '#0ea5e9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
});
