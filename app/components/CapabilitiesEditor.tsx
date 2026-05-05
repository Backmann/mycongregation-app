import { useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Capabilities,
  Gender,
} from '../lib/api';
import {
  CAPABILITY_CATEGORIES,
  CapabilityCategory,
  countActiveInCategory,
} from '../lib/capabilities';

interface Props {
  value: Capabilities;
  onChange: (value: Capabilities) => void;
  gender: Gender;
}

export function CapabilitiesEditor({ value, onChange, gender }: Props) {
  return (
    <View>
      {CAPABILITY_CATEGORIES.map((category) => (
        <CategorySection
          key={category.key}
          category={category}
          value={value}
          onChange={onChange}
          gender={gender}
        />
      ))}
    </View>
  );
}

function CategorySection({
  category,
  value,
  onChange,
  gender,
}: {
  category: CapabilityCategory;
  value: Capabilities;
  onChange: (v: Capabilities) => void;
  gender: Gender;
}) {
  const [open, setOpen] = useState(false);
  const active = countActiveInCategory(value, category);
  const total = category.capabilities.length;

  return (
    <View style={styles.section}>
      <Pressable
        style={({ pressed }) => [
          styles.header,
          pressed && styles.headerPressed,
        ]}
        onPress={() => setOpen((v) => !v)}
      >
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={18}
          color="#64748b"
        />
        <Text style={styles.headerLabel}>{category.label}</Text>
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {active}/{total}
          </Text>
        </View>
      </Pressable>

      {open && (
        <View style={styles.body}>
          {category.capabilities.map((cap) => {
            const isBrotherOnlyConflict = cap.brotherOnly && gender === 'sister';
            const isOn = !!value?.[cap.key];

            return (
              <View key={cap.key} style={styles.capRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.capLabel,
                      isBrotherOnlyConflict && styles.capLabelDisabled,
                    ]}
                  >
                    {cap.label}
                  </Text>
                  {(cap.brotherOnly || cap.elderOnly || cap.baptizedOnly) && (
                    <View style={styles.hintRow}>
                      {cap.brotherOnly && (
                        <Text
                          style={[
                            styles.hint,
                            isBrotherOnlyConflict && styles.hintWarn,
                          ]}
                        >
                          Brother
                        </Text>
                      )}
                      {cap.elderOnly && (
                        <Text style={styles.hint}>Elder</Text>
                      )}
                      {cap.baptizedOnly && (
                        <Text style={styles.hint}>Baptized</Text>
                      )}
                    </View>
                  )}
                </View>
                <Switch
                  value={isOn}
                  onValueChange={(checked) =>
                    onChange({ ...value, [cap.key]: checked })
                  }
                  disabled={isBrotherOnlyConflict}
                  trackColor={{ false: '#e2e8f0', true: '#7dd3fc' }}
                  thumbColor={isOn ? '#0ea5e9' : '#f8fafc'}
                />
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
    minHeight: 44,
  },
  headerPressed: { backgroundColor: '#f8fafc' },
  headerLabel: { flex: 1, fontSize: 15, color: '#0f172a', fontWeight: '500' },
  counter: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  counterText: { color: '#0369a1', fontSize: 12, fontWeight: '600' },

  body: {
    backgroundColor: '#f8fafc',
    paddingVertical: 4,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 36,
    paddingRight: 20,
    minHeight: 44,
  },
  capLabel: { fontSize: 14, color: '#0f172a' },
  capLabelDisabled: { color: '#cbd5e1' },
  hintRow: { flexDirection: 'row', gap: 4, marginTop: 2 },
  hint: {
    fontSize: 10,
    color: '#94a3b8',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    fontWeight: '500',
  },
  hintWarn: { color: '#dc2626', backgroundColor: '#fef2f2' },
});
