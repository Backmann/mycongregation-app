import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Assignment, Publisher, PublisherActivity } from '../lib/api';
import { PublisherSelector } from './PublisherSelector';
import { PersonChip } from './PersonChip';

/**
 * Weekend hospitality slot. Stored as a regular assignment with
 * partKey 'weekend_hospitality' (eventType weekend), so drafts, publishing,
 * push notifications and the smart "last done" suggestions all work for free.
 * Rendered as its own zone inside the weekend block, after the duties.
 */
export function HospitalityZone({
  hospitality,
  canEdit,
  publishersById,
  activityById,
  weekStartISO,
  onChange,
}: {
  hospitality: Assignment | null;
  canEdit: boolean;
  publishersById: Map<string, Publisher>;
  activityById?: Map<string, PublisherActivity>;
  weekStartISO: string;
  onChange: (publisherId: string | null) => void;
}) {
  const { t } = useTranslation();
  const sister = hospitality?.publisherId
    ? (publishersById.get(hospitality.publisherId) ?? null)
    : null;

  // Members only see the zone once a sister is assigned (and the server
  // already hides drafts from them); editors always see the picker.
  if (!canEdit && !sister) return null;

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Ionicons name="cafe-outline" size={15} color="#64748b" />
        <Text style={styles.headerText}>{t('hospitality.title')}</Text>
      </View>
      {canEdit ? (
        <PublisherSelector
          variant="chip"
          emptyLabel={t('hospitality.sister')}
          label={t('hospitality.sister')}
          value={hospitality?.publisherId ?? null}
          onChange={onChange}
          genderFilter="sister"
          activityById={activityById}
          currentWeekStart={weekStartISO}
          currentEventType="weekend"
          suggestionPartKeys={['weekend_hospitality']}
          suggestionRole="primary"
        />
      ) : sister ? (
        <PersonChip label={sister.displayName} variant="main" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
