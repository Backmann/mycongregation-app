import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

export type ChipVariant = 'main' | 'assistant' | 'group' | 'empty';

const ICON: Record<ChipVariant, keyof typeof Ionicons.glyphMap> = {
  main: 'person-outline',
  assistant: 'people-outline',
  group: 'people-circle-outline',
  empty: 'person-add-outline',
};

const ICON_COLOR: Record<ChipVariant, string> = {
  main: '#0c4a6e',
  assistant: '#475569',
  group: '#3730a3',
  empty: '#94a3b8',
};

/**
 * A name "chip" used to display an assigned person (or service group) across
 * the schedule program, duties, field service and cleaning sections.
 *
 * Variants mirror the program chips: blue = main, gray = assistant/secondary,
 * indigo = service group, dashed = unassigned.
 *
 * `muted` is for a row that is FROZEN — a meeting already past, which nobody
 * may edit. There the chip loses its colour and goes pale, so a glance tells
 * a brother whether he is looking at what is still to come or at a record of
 * what already happened. Colour is left to the live rows precisely so that
 * this contrast means something.
 */
export function PersonChip({
  label,
  variant = 'main',
  icon,
  muted = false,
}: {
  label: string;
  variant?: ChipVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Frozen row: the past is shown, not offered — so it wears no colour. */
  muted?: boolean;
}) {
  const bg =
    variant === 'main'
      ? styles.main
      : variant === 'assistant'
        ? styles.assistant
        : variant === 'group'
          ? styles.group
          : styles.empty;
  const txt =
    variant === 'main'
      ? styles.mainText
      : variant === 'assistant'
        ? styles.assistantText
        : variant === 'group'
          ? styles.groupText
          : styles.emptyText;
  return (
    <View style={[styles.chip, bg, muted && styles.mutedChip]}>
      <Ionicons
        name={icon ?? ICON[variant]}
        size={13}
        color={muted ? '#94a3b8' : ICON_COLOR[variant]}
      />
      {/* One line, shortened with an ellipsis: a surname split across lines
          reads worse than a surname cut short, and letting the chip wrap was
          what squeezed the duty label into breaking mid-word. */}
      <Text style={[styles.text, txt, muted && styles.mutedText]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Wrapping row that lays out one or more chips (and an optional MyDot). */
export function ChipRow({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Manrope_500Medium',
    flexShrink: 1,
  },
  main: { backgroundColor: '#e0f2fe' },
  mainText: { color: '#0c4a6e' },
  mutedChip: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e8edf3',
    paddingVertical: 3,
  },
  mutedText: { color: '#64748b' },
  assistant: { backgroundColor: '#f1f5f9' },
  assistantText: { color: '#475569' },
  group: { backgroundColor: '#e0e7ff' },
  groupText: { color: '#3730a3' },
  empty: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
    paddingVertical: 3,
  },
  emptyText: { color: '#94a3b8', fontStyle: 'italic', fontWeight: '400', fontFamily: 'Manrope_400Regular',},
});
