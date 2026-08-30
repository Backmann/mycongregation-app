import { Redirect, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActivityIndicator, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../lib/auth";
import { usePushNotifications } from "../../lib/push-notifications";
import { ContactsCheckPrompt } from "../../components/ContactsCheckPrompt";
import { UpdateBanner } from '../../components/UpdateBanner';
import { AppLock } from '../../components/AppLock';
export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useAuth();
  const { t } = useTranslation();
  usePushNotifications();
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
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
    user.role === "admin" ||
    user.role === "elder" ||
    user.canViewPrivateData === true;
  return (
    <AppLock>
      {/* Above everything, because after the next native build every phone has
          to install a new APK — and an app that says so itself saves telling
          each brother by hand. */}
      <UpdateBanner />
      <ContactsCheckPrompt />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#0ea5e9",
          tabBarInactiveTintColor: "#64748b",
          // Read out of the library's own source, not inferred from pictures:
          // the bar's height is the CONSTANT 49 plus the device inset, and each
          // tab adds 5 of padding top and bottom — so 39 is all the content
          // ever gets. An icon of 24 and a label line of about 14 make 38: it
          // fits by a hair, and the tails of «р» and «у» fall outside. That is
          // the fixed edge, and no line height can move it — which is exactly
          // what four rounds of measuring showed.
          //
          // The same function reads `height` from this style FIRST and returns
          // it instead of its 49. So asking for more room is the library's own
          // mechanism, not a fight with it. 56 gives the label the few pixels
          // it was short of.
          //
          // Asked for EVERYWHERE, not only where the device reports an inset.
          // Chrome on Android reports none, so the guard kept the fix away
          // from it and it went on clipping — the last place still cut after
          // the iPad came right.
          //
          // Widening this is safe in a way the earlier attempt was not: that
          // one set paddings alongside the height and so took room AWAY from
          // the desktop, which never had the problem. This sets height alone,
          // and 56 exceeds the library's 49 — every platform gets more room
          // than before, none gets less.
          tabBarStyle: { height: 56 + insets.bottom },
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
            title: t("tabs.home"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "home" : "home-outline"}
                color={focused ? color : "#185FA5"}
                size={size}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: t("tabs.schedule"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "calendar" : "calendar-outline"}
                color={focused ? color : "#BA7517"}
                size={size}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="publishers"
          options={{
            title: t("tabs.publishers"),
            href: canSeeDirectory ? undefined : null,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                color={focused ? color : "#7F77DD"}
                size={size}
              />
            ),
          }}
        />
        <Tabs.Screen
          name="service-groups"
          options={{
            title: t("tabs.groups"),
            href: null, // moved to the Publishers header
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="grid" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="cart"
          options={{
            title: t("tabs.cart"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "navigate" : "navigate-outline"}
                color={focused ? color : "#1D9E75"}
                size={size}
              />
            ),
          }}
        />
        <Tabs.Screen name="service-reports" options={{ href: null }} />
        <Tabs.Screen
          name="profile"
          options={{
            title: t("tabs.profile"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "person-circle" : "person-circle-outline"}
                color={color}
                size={size}
              />
            ),
          }}
        />
        <Tabs.Screen name="special-events" options={{ href: null }} />
        <Tabs.Screen name="absences" options={{ href: null }} />
        <Tabs.Screen name="local-needs" options={{ href: null }} />
        <Tabs.Screen name="tasks" options={{ href: null }} />
        <Tabs.Screen name="pioneer-school" options={{ href: null }} />
        <Tabs.Screen name="talk-coordinator" options={{ href: null }} />
        <Tabs.Screen name="cleaning" options={{ href: null }} />
        {/* Reached from the event that holds it, never from the tab bar.
            Without this line expo-router adds any unlisted folder as a tab of
            its own, and «memorial» duly appeared at the bottom of the screen. */}
        <Tabs.Screen name="memorial" options={{ href: null }} />
      </Tabs>
    </AppLock>
  );
}
