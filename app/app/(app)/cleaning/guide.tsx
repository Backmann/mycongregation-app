import { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  CLEANING_CATEGORIES,
  CLEANING_FREQUENCIES,
  CleaningCategory,
  CleaningFrequency,
  TECHNIK_BLOCKS,
} from '../../../lib/cleaning-guide';



const SAFETY_ITEMS = ['i1', 'i2', 'i3', 'i4', 'i5'] as const;
const PRINCIPLE_ITEMS = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7'] as const;

const DIRECTIONS: { key: string; icon: string }[] = [
  { key: 'topDown', icon: 'arrow-down-outline' },
  { key: 'outsideIn', icon: 'contract-outline' },
  { key: 'cleanToDirty', icon: 'arrow-forward-outline' },
];

function CategoryCard({
  category,
  defaultFreq,
}: {
  category: CleaningCategory;
  defaultFreq?: CleaningFrequency;
}) {
  const { t } = useTranslation();
  const available = CLEANING_FREQUENCIES.filter((f) => category.steps[f]);
  const [open, setOpen] = useState(false);
  const [freq, setFreq] = useState<CleaningFrequency>(
    defaultFreq && available.includes(defaultFreq)
      ? defaultFreq
      : available[0],
  );
  // Arriving from a cleaning row means "show me THIS cleaning": the frequency
  // is fixed, so the card can never quietly switch to another one's steps.
  const pinned = !!defaultFreq && available.includes(defaultFreq);
  const shownFreq = pinned ? defaultFreq! : freq;
  const steps = category.steps[shownFreq] ?? [];

  return (
    <View style={[styles.card, { backgroundColor: category.tint }]}>
      <Pressable
        style={styles.cardHeader}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
      >
        <View style={[styles.colorDot, { backgroundColor: category.color }]} />
        <Ionicons
          name={category.icon as never}
          size={18}
          color={category.color}
        />
        <Text style={styles.cardTitle}>
          {t(`cleaningGuide.categories.${category.id}`)}
        </Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="#94a3b8"
        />
      </Pressable>

      {open ? (
        <View style={styles.cardBody}>
          <Text style={styles.materialsLabel}>
            {t('cleaningGuide.materials')}
          </Text>
          <Image
            source={category.materials}
            style={[styles.materials, { aspectRatio: category.materialsAspect }]}
            resizeMode="contain"
          />

          {!pinned && available.length > 1 ? (
            <View style={styles.freqRow}>
              {available.map((f) => {
                const active = f === shownFreq;
                return (
                  <Pressable
                    key={f}
                    onPress={() => setFreq(f)}
                    style={[
                      styles.freqChip,
                      active && {
                        backgroundColor: category.color,
                        borderColor: category.color,
                      },
                    ]}
                  >
                    <Text
                      style={[styles.freqText, active && styles.freqTextActive]}
                    >
                      {t(`cleaningGuide.freq.${f}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : !pinned ? (
            <View style={styles.freqRow}>
              <View
                style={[
                  styles.freqChip,
                  {
                    backgroundColor: category.color,
                    borderColor: category.color,
                  },
                ]}
              >
                <Text style={[styles.freqText, styles.freqTextActive]}>
                  {t(`cleaningGuide.freq.${available[0]}`)}
                </Text>
              </View>
            </View>
          ) : null}

          {steps.map((step, i) => (
            <View key={step.key} style={styles.step}>
              <View style={styles.stepHeader}>
                <View
                  style={[styles.stepNum, { backgroundColor: category.color }]}
                >
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepCaption}>
                  {t(`cleaningGuide.steps.${category.id}.${step.key}`)}
                </Text>
              </View>
              <Image
                source={step.image}
                style={styles.stepImage}
                resizeMode="contain"
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function CleaningGuideScreen() {
  const { t } = useTranslation();
  // Deep link: /cleaning/guide?freq=zsk|weekly|yearly opens every category on
  // the instructions for that cleaning type.
  const { freq } = useLocalSearchParams<{ freq?: string }>();
  const defaultFreq = CLEANING_FREQUENCIES.includes(freq as CleaningFrequency)
    ? (freq as CleaningFrequency)
    : undefined;
  const [showAll, setShowAll] = useState(false);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <Text style={styles.introTitle}>{t('cleaningGuide.intro.title')}</Text>
        <Text style={styles.introText}>{t('cleaningGuide.intro.text')}</Text>
      </View>

      {defaultFreq ? (
        <View style={styles.freqNotice}>
          <Ionicons name="funnel-outline" size={14} color="#0369a1" />
          <Text style={styles.freqNoticeText}>
            {t('cleaningGuide.showingFor', {
              freq: t(`cleaningGuide.freq.${defaultFreq}`),
            })}
          </Text>
          <Pressable onPress={() => setShowAll((v) => !v)} hitSlop={6}>
            <Text style={styles.freqNoticeAction}>
              {showAll
                ? t('cleaningGuide.showThisOnly')
                : t('cleaningGuide.showAll')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* Coming from a cleaning row, only the parts that belong to that kind of
          cleaning are listed — a category without steps for it used to appear
          anyway and quietly show another cleaning's instructions. */}
      {CLEANING_CATEGORIES.filter(
        (c) => !defaultFreq || showAll || !!c.steps[defaultFreq],
      ).map((c) => (
        <CategoryCard
          key={c.id}
          category={c}
          defaultFreq={showAll ? undefined : defaultFreq}
        />
      ))}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>
          {t('cleaningGuide.directions.title')}
        </Text>
        {DIRECTIONS.map((d) => (
          <View key={d.key} style={styles.directionRow}>
            <View style={styles.directionIcon}>
              <Ionicons name={d.icon as never} size={16} color="#0369a1" />
            </View>
            <Text style={styles.directionText}>
              {t(`cleaningGuide.directions.${d.key}`)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>
          {t('cleaningGuide.principles.title')}
        </Text>
        {PRINCIPLE_ITEMS.map((k) => (
          <View key={k} style={styles.listRow}>
            <Ionicons name="checkmark-circle" size={15} color="#16a34a" />
            <Text style={styles.listText}>
              {t(`cleaningGuide.principles.${k}`)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.block}>
        <Text style={styles.blockTitle}>{t('cleaningGuide.safety.title')}</Text>
        {SAFETY_ITEMS.map((k) => (
          <View key={k} style={styles.listRow}>
            <Ionicons name="alert-circle" size={15} color="#d97706" />
            <Text style={styles.listText}>
              {t(`cleaningGuide.safety.${k}`)}
            </Text>
          </View>
        ))}
      </View>

      {TECHNIK_BLOCKS.map((b) => (
        <View key={b.key} style={styles.block}>
          <Text style={styles.blockTitle}>
            {t(`cleaningGuide.technik.${b.key}`)}
          </Text>
          <Image
            source={b.image}
            style={[styles.technikImage, { aspectRatio: b.aspect }]}
            resizeMode="contain"
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 12, paddingBottom: 40, gap: 10 },
  intro: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  introTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  introText: { marginTop: 6, fontSize: 13.5, lineHeight: 20, color: '#475569' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 13,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', fontFamily: 'Manrope_700Bold', color: '#0f172a' },
  cardBody: { paddingHorizontal: 12, paddingBottom: 14 },
  materialsLabel: {
    fontSize: 11,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  materials: {
    width: '100%',
    // ratio comes from the asset itself
    backgroundColor: '#fff',
    borderRadius: 10,
  },
  freqNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  freqNoticeText: {
    flex: 1,
    fontSize: 12.5,
    color: '#0c4a6e',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
  freqNoticeAction: {
    fontSize: 12.5,
    color: '#0369a1',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  freqRow: { flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  freqChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#fff',
  },
  freqText: { fontSize: 12.5, fontWeight: '600', fontFamily: 'Manrope_600SemiBold', color: '#475569' },
  freqTextActive: { color: '#fff' },
  step: { marginTop: 12 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: '#fff', fontSize: 12, fontWeight: '800', fontFamily: 'Manrope_800ExtraBold',},
  stepCaption: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 19,
    color: '#0f172a',
    fontWeight: '500', fontFamily: 'Manrope_500Medium',
  },
  stepImage: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 440,

    alignSelf: 'center',
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  block: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  blockTitle: {
    fontSize: 14.5,
    fontWeight: '700', fontFamily: 'Manrope_700Bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  directionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  directionText: { flex: 1, fontSize: 13.5, color: '#0f172a', fontWeight: '500', fontFamily: 'Manrope_500Medium',},
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3.5,
  },
  listText: { flex: 1, fontSize: 13, lineHeight: 18.5, color: '#334155' },
  technikImage: { width: '100%', borderRadius: 10, backgroundColor: '#fff' },
});
