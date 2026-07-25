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
  main: '#64748b',
  assistant: '#475569',
  group: '#3730a3',
  empty: '#94a3b8',
};

/**
 * A name "chip" used to display an assigned person (or service group) across
 * the schedule program, duties, field service and cleaning sections.
 *
 * The assigned name is deliberately QUIET: a pale surface with a hairline and
 * dark text, rather than the blue fill it used to have. A schedule is mostly
 * names, and colouring every one of them made the pages shout while saying
 * nothing — colour is reserved for what a thing IS and for the two marks that
 * carry meaning. Those two stay loud on purpose: an unassigned slot keeps its
 * dashed outline, and «this one is yours» keeps its breathing dot.
 */
export function PersonChip({
  label,
  variant = 'main',
  icon,
}: {
  label: string;
  variant?: ChipVariant;
  icon?: keyof typeof Ionicons.glyphMap;
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
    <View style={[styles.chip, bg]}>
      <Ionicons name={icon ?? ICON[variant]} size={13} color={ICON_COLOR[variant]} />
      {/* One line, shortened with an ellipsis: a surname split across lines
          reads worse than a surname cut short, and letting the chip wrap was
          what squeezed the duty label into breaking mid-word. */}
      <Text style={[styles.text, txt]} numberOfLines={1}>
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
  main: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 3,
  },
  mainText: { color: '#0f172a' },
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
