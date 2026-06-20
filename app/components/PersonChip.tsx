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
 * Variants mirror the program chips: blue = main, gray = assistant/secondary,
 * indigo = service group, dashed = unassigned.
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
      <Text style={[styles.text, txt]}>{label}</Text>
    </View>
  );
}

/** Wrapping row that lays out one or more chips (and an optional MyBulb). */
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
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  text: { fontSize: 13, fontWeight: '500' },
  main: { backgroundColor: '#e0f2fe' },
  mainText: { color: '#0c4a6e' },
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
  emptyText: { color: '#94a3b8', fontStyle: 'italic', fontWeight: '400' },
});
