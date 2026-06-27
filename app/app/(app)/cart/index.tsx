import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'expo-router';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  route: string;
};

export default function ServiceHubScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const rows: Row[] = [
    {
      icon: 'cart-outline',
      title: t('service.publicWitnessing'),
      subtitle: t('service.publicWitnessingSubtitle'),
      route: '/cart/witnessing',
    },
    {
      icon: 'location-outline',
      title: t('service.locations'),
      subtitle: t('service.locationsSubtitle'),
      route: '/cart/locations',
    },
  ];

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {rows.map((r) => (
        <Pressable
          key={r.route}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => router.push(r.route as never)}
        >
          <View style={styles.rowIcon}>
            <Ionicons name={r.icon} size={22} color="#0ea5e9" />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>{r.title}</Text>
            <Text style={styles.rowSubtitle}>{r.subtitle}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    gap: 14,
  },
  rowPressed: { opacity: 0.6 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  rowSubtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
});
