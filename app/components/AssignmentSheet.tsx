import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from "react-native";
import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";
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
  const { width } = useWindowDimensions();
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
    <Sheet
      visible={open}
      onClose={onClose}
      // Its own Modal, backdrop, wrappers, header and card styles are gone:
      // this was the THIRD hand-rolled shell in the app, and being third is
      // exactly why fixes made to the other two never reached it. Now there is
      // one place where a window is a window.
      variant={centered ? "centered" : "bottom"}
      fills
      title={active ? active.partTitle || t("schedule.sheet.title") : ""}
      closeLabel={t("common.close")}
      action={
        onNext ? (
          <Pressable onPress={onNext} hitSlop={8} style={styles.nextBtn}>
            <Text style={styles.nextText}>{t("schedule.sheet.next")}</Text>
          </Pressable>
        ) : null
      }
    >
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
    </Sheet>
  );
}

const styles = StyleSheet.create({
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
