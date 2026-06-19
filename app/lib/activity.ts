import i18n from './i18n';
import { getPartDef, getPartLabel } from './parts';
import { ActivityItem, PublisherActivity } from './api';

/** Human label for one activity item (duty or program part). */
export function activityItemLabel(item: ActivityItem): string {
  if (item.kind === 'duty') {
    if (item.dutyType === 'custom') {
      return item.customLabel || i18n.t('duties.types.custom');
    }
    if (item.dutyType === 'microphone') {
      return `${i18n.t('duties.types.microphone')} ${(item.slotIndex ?? 0) + 1}`;
    }
    return i18n.t(`duties.types.${item.dutyType}`);
  }
  // Program part.
  const key = item.partKey ?? '';
  // Apply-yourself and Living-as-Christians carry their real name in the
  // title prefix; every other part reads cleaner as its part-type label
  // (e.g. "Вступительная молитва" instead of "Песня 5 и молитва | …").
  const themed =
    key.startsWith('apply_yourself') || key.startsWith('living_christians');
  if (themed && item.partTitle) {
    const idx = item.partTitle.indexOf(': ');
    return idx > 0 ? item.partTitle.slice(0, idx) : item.partTitle;
  }
  return getPartLabel(key);
}

/** Program order of an item (parts by catalog order; duties after, by slot). */
function meetingOrder(item: ActivityItem): number {
  if (item.kind === 'part') {
    return getPartDef(item.partKey ?? '')?.defaultOrder ?? 500;
  }
  return 1000 + (item.slotIndex ?? 0);
}

export interface ActivityHistoryItem {
  weekStartDate: string;
  eventType: string;
  label: string;
}

export interface ActivitySummary {
  /** Labels of items in the current week + meeting being edited. */
  thisMeeting: string[];
  /** Count of all other items in the window (recent load). */
  recentCount: number;
  /** Other items in the window, most recent first (for the expandable list). */
  recentItems: ActivityHistoryItem[];
}

/**
 * Split a publisher's activity into "this meeting" (current week + event type)
 * and everything else (recent load over the window, newest first).
 */
export function summarizeActivity(
  activity: PublisherActivity | undefined,
  currentWeekStart: string | undefined,
  currentEventType: string | undefined,
): ActivitySummary {
  if (!activity) return { thisMeeting: [], recentCount: 0, recentItems: [] };
  const thisMeeting: { label: string; order: number }[] = [];
  const recentItems: ActivityHistoryItem[] = [];
  for (const item of activity.items) {
    const isThisMeeting =
      currentWeekStart != null &&
      item.weekStartDate === currentWeekStart &&
      (currentEventType == null || item.eventType === currentEventType);
    if (isThisMeeting) {
      thisMeeting.push({
        label: activityItemLabel(item),
        order: meetingOrder(item),
      });
    } else {
      recentItems.push({
        weekStartDate: item.weekStartDate,
        eventType: item.eventType,
        label: activityItemLabel(item),
      });
    }
  }
  thisMeeting.sort((a, b) => a.order - b.order);
  recentItems.sort((a, b) =>
    a.weekStartDate < b.weekStartDate
      ? 1
      : a.weekStartDate > b.weekStartDate
        ? -1
        : 0,
  );
  return {
    thisMeeting: thisMeeting.map((x) => x.label),
    recentCount: recentItems.length,
    recentItems,
  };
}
