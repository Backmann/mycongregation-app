import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../lib/auth';
import { usePushNotifications } from '../../lib/push-notifications';
import { ContactsCheckPrompt } from '../../components/ContactsCheckPrompt';
export default function AppLayout() {
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
        // Derived from three measurements, not chosen: at lineHeight 18 the
        // word showed 10 pixels of glyph, at 14 it showed 14, and with nothing
        // set at all it shows more still. The relationship is plain — the
        // smaller the line box, the less is cut — which means the letters sit
        // against a fixed edge BELOW them, and a shorter line lifts them clear
        // of it. The earlier attempts raised the number, which is the wrong
        // direction, and made it worse.
        //
        // 8 against a font size of 10 reads oddly, and it is deliberate: it
        // buys roughly the five pixels of lift the descenders need.
        tabBarLabelStyle: { lineHeight: 8 },
        // No height, no padding, no line height set here — on purpose.
        //
        // The tab bar ALREADY adds the device's bottom inset itself; the
        // library does it inside BottomTabBar. The only reason iOS looked
        // wrong was that the inset read as ZERO until viewport-fit=cover was
        // added to the page. Once that landed, nothing else was needed.
        //
        // Every pixel measured here was therefore fighting the library's own
        // correct sizing, and it showed: a height that suited an iPhone
        // clipped the labels on an iPad, and one that suited both wasted half
        // a centimetre. Four rounds of tuning were undone by deleting the
        // tuning.
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="home"
              color={focused ? color : '#185FA5'}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: t('tabs.schedule'),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="calendar"
              color={focused ? color : '#BA7517'}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="publishers"
        options={{
          title: t('tabs.publishers'),
          href: canSeeDirectory ? undefined : null,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="people"
              color={focused ? color : '#7F77DD'}
              size={size}
            />
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
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="navigate"
              color={focused ? color : '#1D9E75'}
              size={size}
            />
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
