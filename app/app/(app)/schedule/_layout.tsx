import { Stack, router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

export default function ScheduleLayout() {
  const { t } = useTranslation();
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: t('schedule.title.list'),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                onPress={() => router.push('/schedule/import' as any)}
                style={{ paddingHorizontal: 10 }}
                hitSlop={8}
                accessibilityLabel={t('schedule.a11y.importEpub')}
              >
                <Ionicons name="cloud-upload-outline" size={24} color="#0ea5e9" />
              </Pressable>
              <Pressable
                onPress={() => router.push('/schedule/new' as any)}
                style={{ paddingHorizontal: 10 }}
                hitSlop={8}
                accessibilityLabel={t('schedule.a11y.newAssignment')}
              >
                <Ionicons name="add" size={28} color="#0ea5e9" />
              </Pressable>
            </View>
          ),
        }}
      />
      <Stack.Screen name="[id]" options={{ title: t('schedule.title.detail') }} />
      <Stack.Screen name="new" options={{ title: t('schedule.title.new') }} />
      <Stack.Screen name="import" options={{ title: t('schedule.title.import') }} />
    </Stack>
  );
}
