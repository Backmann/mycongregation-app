import { Platform } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { dutiesApi, EventType, publisherActivityApi, PublisherActivity } from "./api";
import { notify } from "./error-bus";

/**
 * The duties of one week: the query, the helpers' activity, and every edit the
 * duties sheet offers — assign, add and remove a duty, rename, move and remove
 * a place, generate the empty sheet.
 *
 * Moved here unchanged from the programme screen, so the duties screen and the
 * programme screen share ONE copy of these rules instead of two that drift.
 */
export function useDutiesWeek(weekStartISO: string, nextWeekISO: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const dutiesQuery = useQuery({
    queryKey: ["duties", weekStartISO],
    queryFn: () =>
      dutiesApi.list({ weekStart: weekStartISO, weekEnd: nextWeekISO }),
  });
  const duties = dutiesQuery.data ?? [];
  const renamePlaceMutation = useMutation({
    mutationFn: (v: { id: string; customLabel: string }) =>
      dutiesApi.renamePlace(v.id, v.customLabel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duties", weekStartISO] });
    },
  });
  const movePlaceMutation = useMutation({
    mutationFn: (v: { id: string; direction: "up" | "down" }) =>
      dutiesApi.movePlace(v.id, v.direction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duties", weekStartISO] });
    },
  });
  const removePlaceMutation = useMutation({
    mutationFn: (id: string) => dutiesApi.removePlace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duties", weekStartISO] });
    },
  });
  const generateDutiesMutation = useMutation({
    mutationFn: (eventType: EventType) =>
      dutiesApi.generate({ weekStartDate: weekStartISO, eventType }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duties", weekStartISO] });
    },
  });
  const activityQuery = useQuery({
    queryKey: ["publisher-activity", weekStartISO],
    queryFn: () =>
      publisherActivityApi.getActivity({ weekStart: weekStartISO, weeks: 13 }),
  });
  const activityById = new Map<string, PublisherActivity>();
  for (const a of activityQuery.data ?? []) activityById.set(a.publisherId, a);

  const invalidateDuties = () => {
    queryClient.invalidateQueries({ queryKey: ["duties", weekStartISO] });
    queryClient.invalidateQueries({
      queryKey: ["publisher-activity", weekStartISO],
    });
  };
  const showDutyWarnings = (warnings: string[]) => {
    if (warnings.length === 0) return;
    const body = warnings.map((w) => t(`duties.warnings.${w}`)).join("\n");
    if (Platform.OS === "web") {
      window.alert(`${t("duties.warningsTitle")}\n\n${body}`);
    } else {
      notify(t("duties.warningsTitle"), body);
    }
  };
  const assignDutyMutation = useMutation({
    mutationFn: (vars: { id: string; publisherId: string | null }) =>
      dutiesApi.assign(vars.id, { publisherId: vars.publisherId }),
    onSuccess: (res) => {
      invalidateDuties();
      showDutyWarnings(res.warnings);
    },
  });
  const createCustomDutyMutation = useMutation({
    mutationFn: (vars: { eventType: EventType; customLabel: string }) =>
      dutiesApi.createCustom({
        weekStartDate: weekStartISO,
        eventType: vars.eventType,
        customLabel: vars.customLabel,
      }),
    onSuccess: () => invalidateDuties(),
  });
  const removeDutyMutation = useMutation({
    mutationFn: (id: string) => dutiesApi.removeDuty(id),
    onSuccess: () => invalidateDuties(),
  });

  return {
    dutiesQuery,
    duties,
    activityQuery,
    activityById,
    renamePlaceMutation,
    movePlaceMutation,
    removePlaceMutation,
    generateDutiesMutation,
    assignDutyMutation,
    createCustomDutyMutation,
    removeDutyMutation,
  };
}
