import { ReactNode, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Enable LayoutAnimation on Android (no-op on iOS/web where it's on by default).
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DEFAULT_ACCENT = '#1e6b8c';

/**
 * Top-level collapsible section for the week view (meetings, duties, cleaning,
 * field-service). The header shows an accent stripe + tinted icon, the title,
 * an optional meta line and an optional assigned/total progress badge. Opening
 * and closing is animated and screen-local (not persisted).
 */
export function CollapsibleMeetingBlock({
  title,
  meta,
  assigned,
  total,
  actionLabel,
  onAction,
  actionBusy,
  initiallyOpen = false,
  showBadge = true,
  accent = DEFAULT_ACCENT,
  icon = 'calendar-outline',
  children,
}: {
  title: string;
  meta?: string | null;
  assigned: number;
  total: number;
  /** Header action (e.g. Publish); rendered only when both are set. */
  actionLabel?: string;
  onAction?: () => void;
  actionBusy?: boolean;
  initiallyOpen?: boolean;
  /** Show the assigned/total progress badge (meetings only). */
  showBadge?: boolean;
  /** Section accent colour (stripe + icon tint). */
  accent?: string;
  /** Section icon shown in the tinted circle. */
  icon?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const complete = total > 0 && assigned === total;

  const toggle = () => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        220,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    setOpen((v) => !v);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={[styles.stripe, { backgroundColor: accent }]} />
        <View style={[styles.iconWrap, { backgroundColor: tint(accent) }]}>
          <Ionicons name={icon} size={20} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: accent },
              pressed && styles.actionBtnPressed,
              actionBusy && styles.actionBtnDisabled,
            ]}
            onPress={onAction}
            disabled={!!actionBusy}
          >
            <Text style={styles.actionBtnText}>
              {actionBusy ? '…' : actionLabel}
            </Text>
          </Pressable>
        ) : null}
        {showBadge ? (
          <View
            style={[styles.badge, complete ? styles.badgeDone : styles.badgeOpen]}
          >
            <Text
              style={[
                styles.badgeText,
                complete ? styles.badgeTextDone : styles.badgeTextOpen,
              ]}
            >
              {assigned}/{total}
            </Text>
          </View>
        ) : null}
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#94a3b8"
        />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

/** Light tint of an accent colour for icon backgrounds (accent + alpha). */
function tint(hex: string): string {
  // Render the accent at ~14% opacity over white by appending an alpha byte.
  return `${hex}22`;
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    // Soft elevation (web + native).
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingLeft: 18,
  },
  headerPressed: { backgroundColor: '#f8fafc' },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnPressed: { opacity: 0.8 },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: 0.2,
  },
  meta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  badgeOpen: { backgroundColor: '#fef3c7' },
  badgeDone: { backgroundColor: '#dcfce7' },
  badgeText: { fontSize: 12, fontWeight: '800' },
  badgeTextOpen: { color: '#b45309' },
  badgeTextDone: { color: '#15803d' },
});
