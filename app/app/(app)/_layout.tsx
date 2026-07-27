import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { usePushNotifications } from '../../lib/push-notifications';
import { ContactsCheckPrompt } from '../../components/ContactsCheckPrompt';
export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  usePushNotifications();
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }
  // The publishers directory carries personal data; only admins and elders
  // browse it. Everyone else finds people through Groups, so the tab is
  // hidden for them (the route still redacts server-side if reached directly).
  const canSeeDirectory =
    user.role === 'admin' ||
    user.role === 'elder' ||
    user.canViewPrivateData === true;
  return (
    <>
      <ContactsCheckPrompt />
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#0ea5e9',
        tabBarInactiveTintColor: '#64748b',
        // An iPhone reserves a strip at the bottom for the home indicator, and
        // the bar sat under it, shaving the labels. The inset is asked for
        // rather than guessed — it differs between an iPhone with a notch, one
        // with a button, and an iPad.
        //
        // Where there is NO inset the style is left alone entirely. The first
        // attempt set a height in every case, and a desktop browser — which
        // has no inset and was never the problem — lost room for its labels
        // instead. Don't restyle what already worked: touch only the case
        // that is broken.
        ...(insets.bottom > 0
          ? {
              // The bar has to clear the home indicator, and that strip is the
              // device's, not ours — it cannot be reclaimed. What CAN be
              // trimmed is the part above it, and the first attempt was
              // needlessly generous: on a phone every millimetre of the list
              // is the thing people came for. 50 leaves the icon and its
              // label their room and nothing besides.
              tabBarStyle: {
                height: 50 + insets.bottom,
                paddingTop: 4,
                paddingBottom: insets.bottom,
              },
              // The tails of «р» and «у» in «Расписание» and «Служение» were
              // shaved off: the default line box is tight enough that a
              // Cyrillic descender falls outside it. Naming the line height
              // gives them the room the letters actually take.
              tabBarLabelStyle: { fontSize: 11, lineHeight: 14 },
            }
          : {}),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="publishers"
        options={{
          title: t('tabs.publishers'),
          href: canSeeDirectory ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="service-groups"
        options={{
          title: t('tabs.groups'),
          href: null, // moved to the Publishers header
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: t('tabs.cart'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="navigate" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="service-reports" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen name="special-events" options={{ href: null }} />
      <Tabs.Screen name="absences" options={{ href: null }} />
      <Tabs.Screen name="local-needs" options={{ href: null }} />
      <Tabs.Screen name="talk-coordinator" options={{ href: null }} />
      <Tabs.Screen name="cleaning" options={{ href: null }} />
    </Tabs>
    </>
  );
}
