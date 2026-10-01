import { createElement } from "react";
import { Dimensions, Platform, Text } from "react-native";
import { HeaderSurface } from "../components/HeaderSurface";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";

/**
 * The one header used everywhere.
 *
 * Until now there was no header of ours at all — every section handed the
 * navigator a title and got the platform default. Three things followed from
 * that. It spoke the system font while the whole app speaks Manrope, which is
 * why it read as unfinished. It differed section by section, since each Stack
 * configured itself. And it was white, so on a phone in dark mode the system
 * painted its status-bar icons white on top of it and they disappeared.
 *
 * Teal was already the app's own colour before this: the splash screen, the
 * Android icon background and the legal screens all use #0e7490. Carrying it
 * into the header means the app opens on teal and stays on teal instead of
 * flashing from brand colour to a blank white bar. It also settles the status
 * bar for good — white icons on teal read cleanly, which is why the root
 * layout can simply ask for the light style everywhere.
 */
export const BRAND = "#0e7490";

/** The light grey under every screen — see `contentStyle` below. */
export const SCREEN_BACKGROUND = "#f1f5f9";

/**
 * Header action icons. They used to be the app's sky blue, which was right on
 * a white bar and nearly invisible on the brand colour — the icons were there
 * but you had to look for them. White is the only tone that carries at 21px
 * over #0e7490.
 */
export const HEADER_ICON = "#ffffff";

/**
 * One mark size for every section, including Home. It used to vary — 22 on a
 * narrow schedule screen, 26 elsewhere — which read as carelessness precisely
 * where the eye lands first.
 */
export const HEADER_MARK = 28;

/** The title, when a screen renders its own instead of taking `title`. */
export const headerTitleText = {
  fontFamily: "Manrope_700Bold" as const,
  fontSize: 18,
  color: "#ffffff",
};

/**
 * The title on a phone: a long one steps its size down instead of losing its
 * end (28 September, Android: «Служение в общественных мес…», «Подсобное
 * пионерское служен…»; German titles are longer still). The native bar gives
 * a title one line and cuts it; so the size is chosen from the room there is —
 * the screen minus the back arrow and the margins, about 0.67 of the font
 * size per letter of Manrope Bold — never below 14, and whatever still does
 * not fit is cut as before.
 */
function NativeTitle({ children }: { children: string }) {
  const title = String(children ?? "");
  const room = Dimensions.get("window").width - 100;
  const fontSize = Math.max(
    14,
    Math.min(18, Math.floor(room / Math.max(1, title.length * 0.67))),
  );
  return createElement(
    Text,
    {
      numberOfLines: 1,
      ellipsizeMode: "tail",
      style: { ...headerTitleText, fontSize },
    },
    title,
  );
}

export const headerOptions: NativeStackNavigationOptions = {
  headerStyle: { backgroundColor: BRAND },
  headerTintColor: "#ffffff",
  headerTitleStyle: {
    fontFamily: "Manrope_700Bold",
    fontSize: 18,
    color: "#ffffff",
  },
  /**
   * На телефоне — штатная тень, в браузере — своя (ниже).
   *
   * Настройка выглядит как одна вещь, а означает три: elevation на Android,
   * полоску толщиной в волос на iOS и вовсе не тень, а нижнюю границу цветом
   * темы в браузере, неразличимую на бирюзовом. Отсюда и разделение: там, где
   * она работает, берём её; там, где нет, рисуем сами.
   */
  headerShadowVisible: Platform.OS !== "web",
  /**
   * Своя подложка — ТОЛЬКО в браузере, и это не украшательство, а вынужденно.
   *
   * У навигатора одна строка решает всё: `translucent = headerBackground !=
   * null || headerTransparent || …`. То есть сам факт своей подложки делает
   * нативную шапку ПРОЗРАЧНОЙ, содержимое уезжает под неё, и верх списка
   * становится недостижим — что и случилось на Android: экран нельзя было
   * пролистать до начала. В браузере шапка рисуется другим кодом, и там этого
   * не происходит.
   *
   * Поэтому: телефон получает штатную тень (выше), браузер — эту подложку,
   * потому что штатной тени там нет вовсе.
   */
  headerBackground:
    Platform.OS === "web"
      ? () => createElement(HeaderSurface, { lifted: true })
      : undefined,
  headerBackTitle: "",
  headerTitle: Platform.OS === "web" ? undefined : NativeTitle,
  /**
   * One background under every screen (28 September, Lionel agreed): the
   * app's light grey. A screen that paints none of its own showed the
   * navigator's default instead — a third grey next to #f1f5f9 and #f8fafc.
   */
  contentStyle: { backgroundColor: SCREEN_BACKGROUND },
};
