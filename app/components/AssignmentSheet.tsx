import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useEffect, useState } from "react";
import { useBottomRoom } from "./Sheet";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Assignment,
  assignmentsApi,
  CreateAssignmentInput,
  UpdateAssignmentInput,
} from "../lib/api";
import { AssignmentForm, AssignmentFormCoPicker } from "./AssignmentForm";
import { SongPicker } from "./SongPicker";
import { notify } from "../lib/error-bus";
import { confirm } from "../components/ConfirmHost";

interface Props {
  /** The assignment being edited, or null when the sheet is closed. */
  assignment: Assignment | null;
  /** ISO Monday of the week currently shown — used to target the cache. */
  weekStartISO: string;
  canEdit: boolean;
  onClose: () => void;
  /** When set (planning mode), shows a "Next" button to jump to the
   * next unassigned part. */
  onNext?: (() => void) | null;
  /** Circuit overseer for the week (CO-visit week only); enables CO talk
   * titles and CO-led prayers in the form. */
  circuitOverseer?: { displayName: string; role?: string | null } | null;
  /** Forwarded to the form: manager-only visiting-overseer picker. */
  coPicker?: AssignmentFormCoPicker | null;
}

const SONG_KEYS = ["mid_song", "weekend_song", "weekend_opening_song"];

/**
 * Bottom-sheet editor for a single assignment. Opens over the schedule so the
 * week, scroll position and open block are preserved. Pickers save instantly
 * with an optimistic cache update, so the row fills in before the network
 * round-trip completes.
 */
export function AssignmentSheet({
  assignment,
  weekStartISO,
  canEdit,
  onClose,
  onNext,
  circuitOverseer,
  coPicker,
}: Props) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  // The same rule the other two shells use: room for the navigation bar, or
  // for the keyboard while it is up. Android only — see useBottomRoom.
  const bottomRoom = useBottomRoom();
  // Wide screens (desktop web) get a centered dialog; narrow stays a bottom sheet.
  const centered = Platform.OS === "web" && width >= 700;
  const queryClient = useQueryClient();
  const open = !!assignment;
  // Keep the last assignment mounted through the close animation so the
  // sheet doesn't briefly collapse to an empty header before fading out.
  const [active, setActive] = useState<Assignment | null>(assignment);
  useEffect(() => {
    if (assignment) {
      setActive(assignment);
      return;
    }
    const timer = setTimeout(() => setActive(null), 240);
    return () => clearTimeout(timer);
  }, [assignment]);
  const queryKey = ["assignments", weekStartISO];

  const updateMutation = useMutation({
    mutationFn: (input: UpdateAssignmentInput) =>
      assignmentsApi.update(assignment!.id, input),
    // Optimistic: patch the cached week immediately.
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<{ data: Assignment[] }>(queryKey);
      if (prev) {
        queryClient.setQueryData(queryKey, {
          ...prev,
          data: prev.data.map((row) =>
            row.id === assignment!.id ? { ...row, ...input } : row,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _input, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKey, ctx.prev);
    },
    onSuccess: (result) => {
      const warnings = (result as Assignment).ruleWarnings;
      if (warnings && warnings.length) {
        const msg = warnings
          .map((w) =>
            w.code === "mic_taken"
              ? t("rules.warn.micTaken")
              : w.code === "mic_capability_off"
                ? t("rules.warn.micCapability", { name: w.publisherName })
                : w.code === "treasures_capability_missing"
                  ? t("rules.warn.treasuresCapability", {
                      name: w.publisherName,
                    })
                  : t("rules.warn.prayerCapability", {
                      name: w.publisherName,
                    }),
          )
          .join("\n");
        if (Platform.OS === "web") {
          window.alert(msg);
        } else {
          notify(t("rules.warn.title"), msg);
        }
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      if (assignment) {
        queryClient.invalidateQueries({
          queryKey: ["assignment", assignment.id],
        });
      }
      // Treasures-talk speaker mirrors onto a microphone duty — refresh duties.
      if (assignment?.partKey === "treasures_talk") {
        queryClient.invalidateQueries({ queryKey: ["duties"] });
      }
    },
  });

  const unassignMutation = useMutation({
    mutationFn: () =>
      assignmentsApi.update(assignment!.id, {
        publisherId: null,
        assistantPublisherId: null,
        speakerName: null,
        speakerCongregation: null,
        publicTalkId: null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      if (assignment?.partKey === "treasures_talk") {
        queryClient.invalidateQueries({ queryKey: ["duties"] });
      }
      onClose();
    },
  });

  const confirmUnassign = () => {
    if (Platform.OS === "web") {
      if (window.confirm(t("schedule.unassign.confirmWebMessage"))) {
        unassignMutation.mutate();
      }
      return;
    }
    unassignMutation.mutate();
  };

  // Manually added Christian-Life parts can be removed entirely (imported
  // workbook parts cannot — they have no delete affordance).
  const isExtraPart = !!active && active.partKey === "living_christians_extra";
  const removeMutation = useMutation({
    mutationFn: () => assignmentsApi.remove(assignment!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assignments"] });
      onClose();
    },
  });

  const confirmDelete = async () => {
    if (
      await confirm({
        title: t("schedule.deletePart.title"),
        body: t("schedule.deletePart.confirm"),
        confirmLabel: t("schedule.deletePart.button"),
        danger: true,
      })
    ) {
      removeMutation.mutate();
    }
  };

  const isSong = !!active && SONG_KEYS.includes(active.partKey);

  return (
    <Modal
      visible={open}
      transparent
      animationType={centered ? "fade" : "slide"}
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          centered ? styles.centerWrap : styles.bottomWrap,
          // Height and width in PIXELS, not flex and not percentages.
          //
          // Read out of react-native's own Modal source: its inner container
          // is positioned absolutely with only `top` and `left` set, plus
          // flex: 1 — no bottom, no height. It therefore inherits its size
          // from the native modal host, and on Android running edge-to-edge
          // that host reports none. Everything below it then has no height to
          // share: flex: 1 stretched inside something of zero height, and
          // maxHeight: '90%' had nothing to be ninety percent OF. That is why
          // the sheet collapsed to a strip of header and button, and why two
          // earlier fixes — paddings, then flex: 1 — could not reach it.
          //
          // Asking the window for its size sidesteps the whole chain: a number
          // cannot fail to resolve.
          { width, height },
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.sheet,
            { marginBottom: bottomRoom },
            // A REAL height for the card, not one it works out from its own
            // content — this is what finally breaks the deadlock.
            //
            // Inside the card sits AssignmentForm, whose root is a ScrollView
            // styled flex: 1. The card had only maxHeight: '90%', so it sized
            // itself to its content. Content and container were therefore each
            // waiting for the other: the scroller wanted a height to fill, the
            // card wanted content to measure. Nobody gave, the scrollable area
            // collapsed to nothing, and all that remained was the header and
            // the button — exactly what the screen showed.
            //
            // On the web flex: 1 resolves differently and the form simply
            // expands, which is why Chrome on the SAME phone was fine while
            // the app was not, and why three earlier fixes — paddings, then
            // flex: 1, then pixel sizes on the wrapper — all missed: every one
            // of them added height OUTSIDE the card, while the deadlock sits
            // one level in.
            //
            // Height, not maxHeight: a maximum is still a ceiling to grow up
            // to, and there is nothing to grow from.
            centered
              ? { height: Math.round(height * 0.85) }
              : { height: Math.round(height * 0.9) },
            centered ? styles.sheetCentered : styles.sheetBottom,
          ]}
        >
          {centered ? null : <View style={styles.handleBar} />}
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {active ? active.partTitle || t("schedule.sheet.title") : ""}
            </Text>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              {onNext ? (
                <Pressable onPress={onNext} hitSlop={8} style={styles.nextBtn}>
                  <Text style={styles.nextText}>
                    {t("schedule.sheet.next")}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn}>
                <Text style={styles.closeText}>{t("common.close")}</Text>
              </Pressable>
            </View>
          </View>

          {active ? (
            isSong ? (
              <SongPicker
                key={active.id}
                currentTitle={active.partTitle}
                readOnly={!canEdit}
                isSaving={updateMutation.isPending}
                onSave={(pt) =>
                  updateMutation
                    .mutateAsync({ partTitle: pt ?? "" })
                    .then(() => onClose())
                }
              />
            ) : (
              <>
                <AssignmentForm
                  key={active.id}
                  initial={{
                    weekStartDate: active.weekStartDate,
                    eventType: active.eventType,
                    partKey: active.partKey,
                    partOrder: active.partOrder,
                    partTitle: active.partTitle ?? undefined,
                    partDurationMin: active.partDurationMin ?? undefined,
                    publisherId: active.publisherId,
                    assistantPublisherId: active.assistantPublisherId,
                    publicTalkId: active.publicTalkId ?? null,
                    speakerName: active.speakerName ?? null,
                    speakerCongregation: active.speakerCongregation ?? null,
                    status: active.status,
                    notes: active.notes ?? undefined,
                  }}
                  onSubmit={(data: CreateAssignmentInput) =>
                    updateMutation.mutateAsync(data).then(() => onClose())
                  }
                  onInstantSave={
                    canEdit
                      ? (patch) => updateMutation.mutateAsync(patch)
                      : undefined
                  }
                  onCancel={onClose}
                  isSubmitting={updateMutation.isPending}
                  lockIdentity
                  circuitOverseer={circuitOverseer}
                  coPicker={coPicker}
                  readOnly={!canEdit}
                />
                {canEdit && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.unassignLink,
                      pressed && styles.unassignLinkPressed,
                      (unassignMutation.isPending || !active.publisherId) &&
                        styles.unassignLinkDisabled,
                    ]}
                    onPress={confirmUnassign}
                    disabled={unassignMutation.isPending || !active.publisherId}
                  >
                    <Text style={styles.unassignLinkText}>
                      {unassignMutation.isPending
                        ? t("schedule.unassign.unassigning")
                        : t("schedule.unassign.button")}
                    </Text>
                  </Pressable>
                )}
                {canEdit && isExtraPart && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.deletePartLink,
                      pressed && styles.deletePartLinkPressed,
                      removeMutation.isPending && styles.unassignLinkDisabled,
                    ]}
                    onPress={confirmDelete}
                    disabled={removeMutation.isPending}
                  >
                    <Text style={styles.deletePartLinkText}>
                      {removeMutation.isPending
                        ? t("schedule.deletePart.deleting")
                        : t("schedule.deletePart.button")}
                    </Text>
                  </Pressable>
                )}
              </>
            )
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15,23,42,0.45)",
  },
  // flex: 1, НЕ absoluteFillObject.
  //
  // Растянутый слой получает размеры от родителя, а на Android приложение
  // работает «во весь экран», и внутри Modal такому слою растягиваться не от
  // чего: он схлопывался до высоты содержимого, и окно превращалось в полоску
  // из шапки и кнопки, прижатую книзу. На вебе и на iOS размеры приходили, и
  // потому там всё выглядело правильно — включая Chrome на том же телефоне.
  //
  // Обычный блок на всю высоту решает и вторую половину: maxHeight 90% теперь
  // есть от чего считать.
  bottomWrap: { flex: 1, justifyContent: "flex-end" },
  centerWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  sheet: { backgroundColor: "#f1f5f9", overflow: "hidden" },
  sheetBottom: {
    width: "100%",
    maxHeight: "90%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 8,
    ...(Platform.OS === "web"
      ? { maxWidth: 680, alignSelf: "center" as never }
      : null),
  },
  sheetCentered: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "85%",
    borderRadius: 16,
    paddingBottom: 8,
    shadowColor: "#0f172a",
    shadowOpacity: 0.3,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 16 },
    elevation: 16,
  },
  handleBar: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  closeText: {
    color: "#0ea5e9",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  nextBtn: {
    backgroundColor: "#0ea5e9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nextText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
  unassignLink: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  unassignLinkPressed: { opacity: 0.6 },
  unassignLinkDisabled: { opacity: 0.35 },
  unassignLinkText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  deletePartLink: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  deletePartLinkPressed: { opacity: 0.6 },
  deletePartLinkText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
});
