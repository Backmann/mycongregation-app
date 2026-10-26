import { useEffect, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { FONT } from "../../lib/typography";
import { whatsappNumber } from "../../lib/talk-messages";
import { notify } from "../../lib/error-bus";

/**
 * A READY MESSAGE, shown before it goes (Lionel, 25 October 2026).
 *
 * Inside the visit's own sheet rather than a window over it: two windows on
 * top of each other are where the phone loses its taps. The text can be
 * corrected right here; WhatsApp opens with the guest's number when his card
 * has one, and otherwise the phone's own sharing (on the web: a copy). Nothing
 * is marked as sent — it is only the words.
 */
export function MessagePanel({
  title,
  text,
  phone,
  onBack,
  saved,
}: {
  title: string;
  text: string;
  /** The guest's phone from his card, when it is there. */
  phone: string | null;
  onBack: () => void;
  /**
   * Right after «Договорился» (26 October 2026): what was written stands on
   * top, and «Позже» closes — the invitation is offered, not pressed.
   */
  saved?: string;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState(text);
  // The field grows with its text: a message cut off at the fifth line reads
  // as if the rest were missing.
  // Worked out from the text and the width rather than read back from the
  // field: a field told to be taller reports itself taller, and grows on.
  const [width, setWidth] = useState(320);
  const perLine = Math.max(20, Math.floor((width - 20) / 7.4));
  const rows = body
    .split("\n")
    .reduce((n, para) => n + Math.max(1, Math.ceil(para.length / perLine)), 0);
  const height = rows * 21 + 28;
  useEffect(() => setBody(text), [text]);
  const wa = whatsappNumber(phone);

  const openWhatsApp = () => {
    const url = `https://wa.me/${wa ?? ""}?text=${encodeURIComponent(body)}`;
    if (Platform.OS === "web") {
      window.open(url, "_blank", "noopener");
      return;
    }
    void Linking.openURL(url);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      notify(t("talkCoordinator.message.copied"), undefined, "success");
    } catch {
      notify(t("talkCoordinator.message.copyFailed"));
    }
  };
  const share = async () => {
    if (Platform.OS === "web") {
      const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
      if (nav.share) {
        try {
          await nav.share({ text: body });
        } catch {
          // Closed without sharing: nothing to say.
        }
        return;
      }
      await copy();
      return;
    }
    await Share.share({ message: body });
  };
  const webShare =
    Platform.OS === "web" &&
    typeof navigator !== "undefined" &&
    !!(navigator as Navigator & { share?: unknown }).share;

  return (
    <View style={s.wrap}>
      {saved ? (
        <View style={s.saved} testID="quick-saved">
          <View style={s.savedIcon}>
            <Ionicons name="checkmark" size={26} color="#16a34a" />
          </View>
          <Text style={s.savedTitle}>{t("talkCoordinator.quick.saved")}</Text>
          <Text style={s.savedLine}>{saved}</Text>
        </View>
      ) : (
        <Pressable onPress={onBack} hitSlop={8} style={s.back} accessibilityRole="button">
          <Ionicons name="chevron-back" size={16} color="#0369a1" />
          <Text style={s.backText}>{t("talkCoordinator.message.back")}</Text>
        </Pressable>
      )}
      <Text style={s.title}>{title}</Text>
      <View style={s.bubble}>
        <TextInput
          style={[s.input, { height: Math.max(160, height) }]}
          value={body}
          onChangeText={setBody}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          scrollEnabled={false}
          multiline
          textAlignVertical="top"
          accessibilityLabel={title}
        />
      </View>
      <Text style={s.hint}>{t("talkCoordinator.message.hint")}</Text>
      {wa ? (
        <Pressable
          onPress={openWhatsApp}
          style={({ pressed }) => [s.btn, s.wa, pressed && s.pressed]}
          accessibilityRole="button"
        >
          <Ionicons name="logo-whatsapp" size={18} color="#ffffff" />
          <Text style={s.waText}>{t("talkCoordinator.message.whatsapp")}</Text>
        </Pressable>
      ) : null}
      <View style={s.two}>
        {Platform.OS === "web" ? (
          <Pressable
            onPress={() => void copy()}
            style={({ pressed }) => [s.btn, s.plain, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={16} color="#0f172a" />
            <Text style={s.plainText}>{t("talkCoordinator.message.copy")}</Text>
          </Pressable>
        ) : null}
        {Platform.OS !== "web" || webShare ? (
          <Pressable
            onPress={() => void share()}
            style={({ pressed }) => [s.btn, s.plain, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="share-outline" size={16} color="#0f172a" />
            <Text style={s.plainText}>{t("talkCoordinator.message.share")}</Text>
          </Pressable>
        ) : null}
        {!wa ? (
          <Pressable
            onPress={openWhatsApp}
            style={({ pressed }) => [s.btn, s.plain, pressed && s.pressed]}
            accessibilityRole="button"
          >
            <Ionicons name="logo-whatsapp" size={16} color="#16a34a" />
            <Text style={s.plainText}>{t("talkCoordinator.message.whatsappPick")}</Text>
          </Pressable>
        ) : null}
      </View>
      {!wa && phone === null ? (
        <Text style={s.hint}>{t("talkCoordinator.message.noPhone")}</Text>
      ) : null}
      {saved ? (
        <Pressable
          onPress={onBack}
          style={({ pressed }) => [s.btn, s.plain, pressed && s.pressed]}
          accessibilityRole="button"
          testID="quick-later"
        >
          <Text style={s.plainText}>{t("talkCoordinator.quick.later")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 10, paddingBottom: 8 },
  back: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  backText: { fontFamily: FONT.bold, fontSize: 13.5, color: "#0369a1" },
  title: { fontFamily: FONT.extrabold, fontSize: 18, color: "#0f172a" },
  bubble: {
    backgroundColor: "#e7f8ee",
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    padding: 4,
  },
  input: {
    fontFamily: FONT.regular,
    fontSize: 14.5,
    lineHeight: 21,
    color: "#0f172a",
    padding: 10,
  },
  hint: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: "#64748b" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  wa: { backgroundColor: "#16a34a" },
  waText: { fontFamily: FONT.extrabold, fontSize: 15, color: "#ffffff" },
  two: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  plain: { flex: 1, minWidth: 140, backgroundColor: "#f1f5f9" },
  plainText: { fontFamily: FONT.bold, fontSize: 14, color: "#0f172a" },
  pressed: { opacity: 0.75 },
  saved: { alignItems: "center", gap: 4, paddingTop: 4, paddingBottom: 6 },
  savedIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  savedTitle: { fontFamily: FONT.extrabold, fontSize: 18, color: "#0f172a" },
  savedLine: {
    fontFamily: FONT.medium,
    fontSize: 13.5,
    lineHeight: 19,
    color: "#475569",
    textAlign: "center",
  },
});
