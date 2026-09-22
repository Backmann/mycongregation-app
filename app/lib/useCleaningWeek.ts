import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cleaningApi } from "./api";

/**
 * The cleaning of one week: the query, assigning and clearing a slot, and the
 * slot just cleared, kept whole so «undo» can put it back.
 *
 * Moved here unchanged from the programme screen, so the cleaning screen and
 * the programme screen share ONE copy of these rules.
 */
export function useCleaningWeek(weekStartISO: string) {
  const queryClient = useQueryClient();
  const cleaningQuery = useQuery({
    queryKey: ["cleaning", weekStartISO],
    queryFn: () => cleaningApi.getWeek(weekStartISO),
  });
  const cleaningWeek = cleaningQuery.data ?? {
    assignments: [],
    suggestedAfterMeetingGroupId: null,
  };
  const invalidateCleaning = () =>
    queryClient.invalidateQueries({ queryKey: ["cleaning", weekStartISO] });
  const setCleaningSlotMutation = useMutation({
    mutationFn: (vars: {
      slotType: Parameters<typeof cleaningApi.setSlot>[0]["slotType"];
      serviceGroupId: string | null;
      windows?: number[] | null;
    }) =>
      cleaningApi.setSlot({
        weekStartDate: weekStartISO,
        slotType: vars.slotType,
        serviceGroupId: vars.serviceGroupId,
        windows: vars.windows,
      }),
    onSuccess: () => invalidateCleaning(),
  });
  /**
   * The cleaning slot just cleared, kept whole so it can be put back.
   *
   * Nothing to «restore» here: clearing deletes the row outright, and the
   * server keeps only a journal note of who was cleaning. But the week, the
   * slot and the group describe it completely — so undo is simply the same
   * assignment made again, which is why the group and the windows are read
   * BEFORE the row goes.
   */
  const [clearedSlot, setClearedSlot] = useState<{
    slotType: Parameters<typeof cleaningApi.setSlot>[0]["slotType"];
    serviceGroupId: string | null;
    windows: number[] | null;
  } | null>(null);
  const clearCleaningSlotMutation = useMutation({
    mutationFn: (slotType: Parameters<typeof cleaningApi.clearSlot>[1]) => {
      const was = cleaningWeek.assignments.find((a) => a.slotType === slotType);
      setClearedSlot(
        was
          ? {
              slotType,
              serviceGroupId: was.serviceGroupId,
              windows: was.windows,
            }
          : null,
      );
      return cleaningApi.clearSlot(weekStartISO, slotType);
    },
    onSuccess: () => invalidateCleaning(),
  });

  /** Undo the last clear: the same assignment made again. */
  const undoClearedSlot = async () => {
    if (!clearedSlot) return;
    await cleaningApi.setSlot({
      weekStartDate: weekStartISO,
      slotType: clearedSlot.slotType,
      serviceGroupId: clearedSlot.serviceGroupId,
      windows: clearedSlot.windows,
    });
    setClearedSlot(null);
    invalidateCleaning();
  };

  return {
    cleaningQuery,
    cleaningWeek,
    invalidateCleaning,
    setCleaningSlotMutation,
    clearedSlot,
    setClearedSlot,
    clearCleaningSlotMutation,
    undoClearedSlot,
  };
}
