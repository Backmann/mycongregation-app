import i18n from './i18n';
import { getPartLabel } from './parts';
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
  // Program part: prefer the real MWB name from the title prefix.
  if (item.partTitle) {
    const idx = item.partTitle.indexOf(': ');
    if (idx > 0) return item.partTitle.slice(0, idx);
  }
  return getPartLabel(item.partKey ?? '');
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
  const thisMeeting: string[] = [];
  const recentItems: ActivityHistoryItem[] = [];
  for (const item of activity.items) {
    const isThisMeeting =
      currentWeekStart != null &&
      item.weekStartDate === currentWeekStart &&
      (currentEventType == null || item.eventType === currentEventType);
    if (isThisMeeting) {
      thisMeeting.push(activityItemLabel(item));
    } else {
      recentItems.push({
        weekStartDate: item.weekStartDate,
        eventType: item.eventType,
        label: activityItemLabel(item),
      });
    }
  }
  recentItems.sort((a, b) =>
    a.weekStartDate < b.weekStartDate
      ? 1
      : a.weekStartDate > b.weekStartDate
        ? -1
        : 0,
  );
  return { thisMeeting, recentCount: recentItems.length, recentItems };
}
