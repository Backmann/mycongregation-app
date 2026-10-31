import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { Sheet } from "../../../components/Sheet";
import { UndoBar } from "../../../components/UndoBar";
import { LoadFailure } from "../../../components/LoadFailure";
import {
  PublicUser,
  PublisherAppointment,
  Responsibility,
  ResponsibilityType,
  extractErrorMessage,
  responsibilitiesApi,
  usersApi,
} from "../../../lib/api";
import { notify } from "../../../lib/error-bus";
import i18n from "../../../lib/i18n";
import { confirm } from "../../../components/ConfirmHost";
import {
  ELDER_USUALLY,
  ELDERS_ONLY,
  MULTI_HOLDER,
  RESPONSIBILITY_GROUPS,
  pairedWith,
} from "../../../lib/responsibility-groups";
import { useAllPublishers } from "../../../lib/useAllPublishers";
import { failsScreen } from "../../../lib/screen-failure";
import { WIDE_FROM } from "../../../lib/screen-width";
import { FONT } from "../../../lib/typography";

/**
 * «Ответственные» for the administrator — who carries which duty, and the
 * place to change it. Rebuilt 27 October 2026 from the mockup Lionel
 * approved, after a walk found:
 *
 *  - one tap on a name REPLACED the holder at once — a slip of the finger and
 *    the secretary had changed. Now a tap only chooses; «Заменить» changes,
 *    and «Отменить» stands below for ten seconds after;
 *  - the picker offered the duty's own assistant, whom the server then
 *    refused, and the current holder as an ordinary row. Both are marked now,
 *    before the tap;
 *  - nothing said who is an elder. The picker is grouped by appointment, and a
 *    duty an elder usually carries WARNS when someone else is chosen — a
 *    warning, not a rule («лучше предупреждать»);
 *  - brothers with no login were simply absent. They are listed, greyed, with
 *    the way to give them one: a duty is held by an ACCOUNT (it opens screens),
 *    so the card has to get a login first (Lionel's choice of the two ways);
 *  - a wide screen showed a 760 column of seventeen tall cards and slid the
 *    picker up across the whole window, side menu included. Now a table with
 *    a summary on top, and the picker beside it.
 */

const QK_RESPONSIBILITIES = ["responsibilities"] as const;
const QK_USERS = ["users"] as const;
/** The picker stands beside the table from here; below, it opens as a sheet. */
const PANEL_FROM = 1200;

/** Who a candidate is, for grouping and for the elder warning. */
type Candidate = {
  key: string;
  name: string;
  appointment: PublisherAppointment;
  /** Null for a brother whose card has no login yet. */
  userId: string | null;
  publisherId: string | null;
};

const APPOINTMENT_ORDER: PublisherAppointment[] = [
  "elder",
  "ministerial_servant",
  "publisher",
];

export default function ResponsibilitiesScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const table = width >= WIDE_FROM;
  const panel = width >= PANEL_FROM;

  const [pickerFor, setPickerFor] = useState<ResponsibilityType | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [undo, setUndo] = useState<{
    message: string;
    revert: () => Promise<unknown>;
  } | null>(null);

  const respQuery = useQuery({
    throwOnError: failsScreen,
    queryKey: QK_RESPONSIBILITIES,
    queryFn: () => responsibilitiesApi.listWithRecord(),
  });
  const usersQuery = useQuery({
    queryKey: QK_USERS,
    queryFn: () => usersApi.list(),
  });
  const cardsQuery = useAllPublishers();

  // A login given on a brother's card (the way out of the greyed row) must
  // show here on the way back, without a reload.
  useFocusEffect(
    useCallback(() => {
      void usersQuery.refetch();
      void cardsQuery.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const byType = useMemo(() => {
    const map = new Map<ResponsibilityType, Responsibility[]>();
    for (const r of respQuery.data ?? []) {
      map.set(r.type, [...(map.get(r.type) ?? []), r]);
    }
    return map;
  }, [respQuery.data]);

  const userById = useMemo(() => {
    const map = new Map<string, PublicUser>();
    for (const u of usersQuery.data ?? []) map.set(u.id, u);
    return map;
  }, [usersQuery.data]);

  const holderName = (h: Responsibility) =>
    h.holderName ??
    userById.get(h.userId)?.publisherName ??
    userById.get(h.userId)?.loginName ??
    t("responsibilities.unknownUser");

  /**
   * Whom a duty can be given to: brothers — elders, ministerial servants and
   * baptised publishers. The filter is on the CARD. Accounts first (they can
   * hold a duty), then the cards with no login yet (they cannot — shown so
   * the administrator sees why somebody is missing and how to fix it).
   */
  const candidates = useMemo<Candidate[]>(() => {
    const out: Candidate[] = [];
    const seenCards = new Set<string>();
    for (const u of usersQuery.data ?? []) {
      if (u.gender !== "brother" || !u.appointment) continue;
      if (!APPOINTMENT_ORDER.includes(u.appointment)) continue;
      if (u.publisherId) seenCards.add(u.publisherId);
      out.push({
        key: `u:${u.id}`,
        name:
          u.publisherName ??
          (respQuery.data ?? []).find((r) => r.userId === u.id)?.holderName ??
          u.loginName ??
          t("responsibilities.unknownUser"),
        appointment: u.appointment,
        userId: u.id,
        publisherId: u.publisherId,
      });
    }
    for (const p of cardsQuery.data?.data ?? []) {
      if (p.userId || seenCards.has(p.id)) continue;
      if (p.gender !== "brother" || !APPOINTMENT_ORDER.includes(p.appointment)) continue;
      const name = [p.lastName, p.firstName].filter(Boolean).join(" ").trim();
      out.push({
        key: `p:${p.id}`,
        name: name || p.displayName || t("responsibilities.unknownUser"),
        appointment: p.appointment,
        userId: null,
        publisherId: p.id,
      });
    }
    // Those who can take a duty first; the cards still waiting for a login
    // after them, within each group.
    return out.sort(
      (a, b) =>
        Number(!a.userId) - Number(!b.userId) ||
        a.name.localeCompare(b.name, i18n.language),
    );
  }, [usersQuery.data, cardsQuery.data, respQuery.data, t]);

  const closePicker = () => {
    setPickerFor(null);
    setChosen(null);
    setSearch("");
  };

  const openPicker = (type: ResponsibilityType) => {
    setPickerFor(type);
    setChosen(null);
    setSearch("");
  };

  const assignMutation = useMutation({
    mutationFn: (input: { type: ResponsibilityType; userId: string }) =>
      responsibilitiesApi.assign(input),
    onError: (e: unknown) =>
      notify(t("responsibilities.errorTitle"), extractErrorMessage(e)),
  });

  const revokeMutation = useMutation({
    mutationFn: (vars: { type: ResponsibilityType; userId: string }) =>
      responsibilitiesApi.revoke(vars.type, vars.userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_RESPONSIBILITIES }),
    onError: (e: unknown) =>
      notify(t("responsibilities.errorTitle"), extractErrorMessage(e)),
  });

  /**
   * Give the duty to the chosen brother, and keep the way back for ten
   * seconds: the previous holder is put back (the server replaces again and
   * journals both sides), or — where nobody held it, or several may — the new
   * holder is taken off.
   */
  const commit = async (type: ResponsibilityType, userId: string, name: string) => {
    const before = byType.get(type) ?? [];
    const previous = !MULTI_HOLDER.has(type) && before.length > 0 ? before[0] : null;
    try {
      await assignMutation.mutateAsync({ type, userId });
    } catch {
      return;
    }
    await qc.invalidateQueries({ queryKey: QK_RESPONSIBILITIES });
    closePicker();
    setUndo({
      message: t("responsibilities.undoAssigned", {
        role: t(`responsibilities.types.${type}`),
        name,
      }),
      revert: async () => {
        try {
          if (previous) {
            await responsibilitiesApi.assign({ type, userId: previous.userId });
          } else {
            await responsibilitiesApi.revoke(type, userId);
          }
        } catch (e) {
          notify(t("responsibilities.errorTitle"), extractErrorMessage(e));
        }
        await qc.invalidateQueries({ queryKey: QK_RESPONSIBILITIES });
      },
    });
  };

  const confirmRevoke = async (type: ResponsibilityType, userId: string) => {
    const role = t(`responsibilities.types.${type}`);
    if (
      await confirm({
        title: t("responsibilities.revokeConfirm.title"),
        body: t("responsibilities.revokeConfirm.body", { role }),
        confirmLabel: t("responsibilities.revokeConfirm.action"),
        danger: true,
      })
    ) {
      revokeMutation.mutate({ type, userId });
    }
  };

  if (respQuery.isLoading || usersQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0e7490" />
      </View>
    );
  }

  const allTypes = RESPONSIBILITY_GROUPS.flatMap((g) => g.types);
  const emptyCount = allTypes.filter((ty) => (byType.get(ty) ?? []).length === 0).length;

  /** Day, month and year — the minute it was pressed told nobody anything. */
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  const actionLabel = (type: ResponsibilityType, holders: Responsibility[]) =>
    holders.length === 0
      ? t("responsibilities.assign")
      : MULTI_HOLDER.has(type)
        ? t("responsibilities.assignAnother")
        : t("responsibilities.replace");

  const summary = (
    <View style={styles.summary}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>
          {t("responsibilities.summaryTotal", { count: allTypes.length })}
        </Text>
      </View>
      {emptyCount > 0 ? (
        <View style={[styles.pill, styles.pillWarn]}>
          <Text style={[styles.pillText, styles.pillWarnText]}>
            {t("responsibilities.summaryEmpty", { count: emptyCount })}
          </Text>
        </View>
      ) : null}
    </View>
  );

  // With the picker beside it the table loses 420 points; the date column
  // goes (the picker shows it for the duty it opened) so the names keep a line.
  const narrowTable = panel && pickerFor !== null;

  const list = (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scroll, table && styles.scrollWide]}
    >
      <Text style={styles.intro}>{t("responsibilities.subtitle")}</Text>
      {summary}

      {RESPONSIBILITY_GROUPS.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={styles.groupLabel} accessibilityRole="header">
            {t(`responsibilities.groups.${group.key}`)}
          </Text>
          <View style={styles.card}>
            {table ? (
              <View style={styles.thead}>
                <Text style={[styles.th, styles.cDuty]}>{t("responsibilities.colDuty")}</Text>
                <Text style={[styles.th, styles.cWho]}>{t("responsibilities.colHolder")}</Text>
                {narrowTable ? null : (
                  <Text style={[styles.th, styles.cWhen]}>{t("responsibilities.colSince")}</Text>
                )}
                <View style={styles.cAct} />
              </View>
            ) : null}
            {group.types.map((type, i) => {
              const holders = byType.get(type) ?? [];
              const empty = holders.length === 0;
              const selected = pickerFor === type;
              const title = t(`responsibilities.types.${type}`);

              if (!table) {
                return (
                  <Pressable
                    key={type}
                    testID={`resp-row-${type}`}
                    onPress={() => openPicker(type)}
                    style={({ pressed }) => [
                      styles.pRow,
                      i > 0 && styles.rowBorder,
                      empty && styles.rowEmpty,
                      pressed && styles.rowPressed,
                    ]}
                    accessibilityRole="button"
                  >
                    <View style={styles.flex}>
                      <Text style={styles.pDuty}>{title}</Text>
                      <Text style={[styles.pWho, empty && styles.whoEmpty]}>
                        {empty
                          ? t("responsibilities.unassigned")
                          : holders.map(holderName).join(" · ")}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                  </Pressable>
                );
              }

              return (
                <Pressable
                  key={type}
                  testID={`resp-row-${type}`}
                  onPress={() => openPicker(type)}
                  style={({ pressed }) => [
                    styles.tRow,
                    styles.rowBorder,
                    empty && styles.rowEmpty,
                    selected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Text style={[styles.tDuty, styles.cDuty]}>{title}</Text>
                  <Text style={[styles.tWho, styles.cWho, empty && styles.whoEmpty]}>
                    {empty
                      ? t("responsibilities.unassigned")
                      : holders.map(holderName).join(" · ")}
                  </Text>
                  {narrowTable ? null : (
                    <Text style={[styles.tWhen, styles.cWhen]}>
                      {holders.length > 0 ? fmtDate(holders[holders.length - 1].assignedAt) : ""}
                    </Text>
                  )}
                  <View style={[styles.cAct, styles.actions]}>
                    <Pressable
                      onPress={() => openPicker(type)}
                      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
                    >
                      <Ionicons
                        name={empty || MULTI_HOLDER.has(type) ? "add" : "swap-horizontal"}
                        size={15}
                        color="#0369a1"
                      />
                      <Text style={styles.btnText}>{actionLabel(type, holders)}</Text>
                    </Pressable>
                    {holders.length === 1 ? (
                      <Pressable
                        onPress={() => confirmRevoke(type, holders[0].userId)}
                        hitSlop={8}
                        disabled={revokeMutation.isPending}
                        style={styles.removeBtn}
                        accessibilityLabel={t("responsibilities.revokeConfirm.action")}
                      >
                        <Ionicons name="close" size={16} color="#94a3b8" />
                      </Pressable>
                    ) : (
                      <View style={styles.removeBtn} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const pickerProps = pickerFor
    ? {
        type: pickerFor,
        holders: byType.get(pickerFor) ?? [],
        all: respQuery.data ?? [],
        candidates,
        chosen,
        setChosen,
        search,
        setSearch,
        holderName,
        fmtDate,
        usersFailed: usersQuery.error,
        retryUsers: () => void usersQuery.refetch(),
        onRevoke: (userId: string) => confirmRevoke(pickerFor, userId),
        onOpenCard: (publisherId: string) => {
          closePicker();
          router.push(`/publishers/${publisherId}` as never);
        },
      }
    : null;

  const chosenCandidate = candidates.find((c) => c.key === chosen) ?? null;
  const footer =
    pickerFor && chosenCandidate && chosenCandidate.userId ? (
      <ConfirmBar
        type={pickerFor}
        holders={byType.get(pickerFor) ?? []}
        candidate={chosenCandidate}
        holderName={holderName}
        busy={assignMutation.isPending}
        onCancel={() => setChosen(null)}
        onCommit={() => commit(pickerFor, chosenCandidate.userId!, chosenCandidate.name)}
      />
    ) : null;

  return (
    <View style={styles.container}>
      <View style={styles.split}>
        {list}
        {panel && pickerProps ? (
          <View style={styles.panel} testID="resp-panel">
            <View style={styles.panelHead}>
              <Text style={styles.panelTitle}>
                {t(`responsibilities.types.${pickerProps.type}`)}
              </Text>
              <Pressable onPress={closePicker} hitSlop={8} accessibilityLabel={t("common.cancel")}>
                <Ionicons name="close" size={22} color="#64748b" />
              </Pressable>
            </View>
            <ScrollView style={styles.flex} keyboardShouldPersistTaps="handled">
              <PickerBody {...pickerProps} />
            </ScrollView>
            {footer}
          </View>
        ) : null}
      </View>

      {!panel ? (
        <Sheet
          visible={pickerFor !== null}
          variant={table ? "centered" : "full"}
          title={pickerFor ? t(`responsibilities.types.${pickerFor}`) : ""}
          // «Закрыть» here; «Отмена» below takes back only the choice.
          closeLabel={t("common.close")}
          onClose={closePicker}
          footer={footer}
        >
          {pickerProps ? <PickerBody {...pickerProps} /> : null}
        </Sheet>
      ) : null}

      <UndoBar
        visible={undo !== null}
        icon="swap-horizontal"
        message={undo?.message ?? ""}
        onUndo={async () => {
          await undo?.revert();
        }}
        onDismiss={() => setUndo(null)}
      />
    </View>
  );
}

/**
 * The picker: who holds it now, a search, and the brothers grouped by
 * appointment — each marked with what stands in the way, if anything.
 */
function PickerBody({
  type,
  holders,
  all,
  candidates,
  chosen,
  setChosen,
  search,
  setSearch,
  holderName,
  fmtDate,
  usersFailed,
  retryUsers,
  onRevoke,
  onOpenCard,
}: {
  type: ResponsibilityType;
  holders: Responsibility[];
  all: Responsibility[];
  candidates: Candidate[];
  chosen: string | null;
  setChosen: (key: string | null) => void;
  search: string;
  setSearch: (s: string) => void;
  holderName: (h: Responsibility) => string;
  fmtDate: (iso: string) => string;
  usersFailed: unknown;
  retryUsers: () => void;
  onRevoke: (userId: string) => void;
  onOpenCard: (publisherId: string) => void;
}) {
  const { t } = useTranslation();
  const pair = pairedWith(type);
  const holderIds = new Set(holders.map((h) => h.userId));
  const q = search.trim().toLocaleLowerCase(i18n.language);
  const shown = q
    ? candidates.filter((c) => c.name.toLocaleLowerCase(i18n.language).includes(q))
    : candidates;

  const groups: { key: PublisherAppointment; label: string }[] = [
    { key: "elder", label: t("responsibilities.pgElders") },
    { key: "ministerial_servant", label: t("responsibilities.pgServants") },
    { key: "publisher", label: t("responsibilities.pgBrothers") },
  ];

  return (
    <View style={styles.pickBody}>
      {/* Who holds it now — with «Снять» here too, because on a phone this
          is the only place the duty is opened. */}
      <View style={styles.nowBox}>
        {holders.length === 0 ? (
          <Text style={styles.nowEmpty}>{t("responsibilities.nowNobody")}</Text>
        ) : (
          holders.map((h) => (
            <View key={h.userId} style={styles.nowRow}>
              <View style={styles.flex}>
                <Text style={styles.nowName}>{holderName(h)}</Text>
                <Text style={styles.nowMeta}>
                  {h.assignedByName
                    ? t("responsibilities.assignedByOn", {
                        name: h.assignedByName,
                        date: fmtDate(h.assignedAt),
                      })
                    : t("responsibilities.assignedOn", { date: fmtDate(h.assignedAt) })}
                </Text>
              </View>
              <Pressable
                onPress={() => onRevoke(h.userId)}
                hitSlop={8}
                style={({ pressed }) => [styles.revoke, pressed && styles.btnPressed]}
              >
                <Text style={styles.revokeText}>{t("responsibilities.revokeConfirm.action")}</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={t("responsibilities.search")}
        placeholderTextColor="#94a3b8"
        style={styles.search}
        testID="resp-search"
      />

      {usersFailed ? (
        <LoadFailure error={usersFailed} onRetry={retryUsers} />
      ) : shown.length === 0 ? (
        <Text style={styles.nowEmpty}>{t("responsibilities.nobodyFound")}</Text>
      ) : (
        groups.map((g) => {
          const people = shown.filter((c) => c.appointment === g.key);
          if (people.length === 0) return null;
          return (
            <View key={g.key}>
              <Text style={styles.pg}>{g.label}</Text>
              {people.map((c) => {
                const holds = c.userId
                  ? all.filter((r) => r.userId === c.userId && r.type !== type)
                  : [];
                const isHolder = !!c.userId && holderIds.has(c.userId);
                const blockedBy = pair && holds.some((r) => r.type === pair) ? pair : null;
                const notElder = ELDERS_ONLY.has(type) && c.appointment !== "elder";
                const noLogin = !c.userId;
                const off = isHolder || !!blockedBy || notElder || noLogin;
                const isChosen = chosen === c.key;
                const warnElder =
                  !off && ELDER_USUALLY.has(type) && c.appointment !== "elder";
                return (
                  <Pressable
                    key={c.key}
                    testID={`resp-pick-${c.key}`}
                    disabled={isHolder || !!blockedBy || notElder}
                    onPress={() => {
                      if (noLogin) {
                        if (c.publisherId) onOpenCard(c.publisherId);
                        return;
                      }
                      setChosen(isChosen ? null : c.key);
                    }}
                    style={({ pressed }) => [
                      styles.cand,
                      isHolder && styles.candNow,
                      isChosen && styles.candChosen,
                      pressed && !off && styles.rowPressed,
                    ]}
                  >
                    <View style={[styles.avatar, off && styles.avatarOff]}>
                      <Text style={[styles.avatarText, off && styles.avatarTextOff]}>
                        {initials(c.name)}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.candTop}>
                        <Text
                          style={[
                            styles.candName,
                            (blockedBy || notElder || noLogin) && styles.dim,
                          ]}
                        >
                          {c.name}
                        </Text>
                        {isHolder ? (
                          <View style={[styles.tag, styles.tagNow]}>
                            <Text style={[styles.tagText, styles.tagNowText]}>
                              {t("responsibilities.holdsNow")}
                            </Text>
                          </View>
                        ) : null}
                        {noLogin ? (
                          <View style={[styles.tag, styles.tagGrey]}>
                            <Text style={[styles.tagText, styles.tagGreyText]}>
                              {t("responsibilities.noLogin")}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      {notElder ? (
                        <Text style={styles.blocked}>{t("responsibilities.eldersOnly")}</Text>
                      ) : blockedBy ? (
                        <Text style={styles.blocked}>
                          {t("responsibilities.cannotPair", {
                            role: t(`responsibilities.types.${blockedBy}`),
                          })}
                        </Text>
                      ) : noLogin ? (
                        <Text style={styles.candMeta}>
                          {t("responsibilities.noLoginHint")}
                          <Text style={styles.link}> {t("responsibilities.openCard")} ›</Text>
                        </Text>
                      ) : isHolder && holds.length === 0 ? null : (
                        <Text style={styles.candMeta}>
                          {holds.length > 0
                            ? t("responsibilities.alreadyHolds", {
                                list: holds
                                  .map((r) => t(`responsibilities.types.${r.type}`))
                                  .join(", "),
                              })
                            : t("responsibilities.holdsNothing")}
                        </Text>
                      )}
                      {warnElder ? (
                        <View style={styles.warn}>
                          <Text style={styles.warnText}>{t("responsibilities.elderUsually")}</Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })
      )}
    </View>
  );
}

/** «Вебер Андреас → Фогт Маркус» and the one button that changes it. */
function ConfirmBar({
  type,
  holders,
  candidate,
  holderName,
  busy,
  onCancel,
  onCommit,
}: {
  type: ResponsibilityType;
  holders: Responsibility[];
  candidate: Candidate;
  holderName: (h: Responsibility) => string;
  busy: boolean;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const { t } = useTranslation();
  const many = MULTI_HOLDER.has(type);
  const replacing = !many && holders.length > 0;
  const line = replacing
    ? `${holderName(holders[0])} → ${candidate.name}`
    : candidate.name;
  const label = replacing
    ? t("responsibilities.replace")
    : many && holders.length > 0
      ? t("responsibilities.doAdd")
      : t("responsibilities.assign");
  return (
    <View style={styles.confirm} testID="resp-confirm">
      <Text style={styles.confirmLine}>{line}</Text>
      {ELDER_USUALLY.has(type) && candidate.appointment !== "elder" ? (
        <Text style={styles.confirmWarn}>{t("responsibilities.elderUsually")}</Text>
      ) : null}
      <View style={styles.confirmRow}>
        <Pressable
          onPress={onCommit}
          disabled={busy}
          testID="resp-commit"
          style={({ pressed }) => [styles.primary, (pressed || busy) && styles.primaryPressed]}
        >
          <Text style={styles.primaryText}>{label}</Text>
        </Pressable>
        <Pressable
          onPress={onCancel}
          style={({ pressed }) => [styles.second, pressed && styles.btnPressed]}
        >
          <Text style={styles.secondText}>{t("common.cancel")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const INK = "#0f172a";
const SOFT = "#64748b";
const FAINT = "#94a3b8";
const LINE = "#e2e8f0";
const SKY = "#0369a1";
const AMBER = "#b45309";

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f1f5f9" },
  split: { flex: 1, flexDirection: "row" },
  scroll: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 120 },
  scrollWide: { paddingHorizontal: 24 },
  intro: { fontFamily: FONT.regular, fontSize: 13, color: "#475569", lineHeight: 19, marginHorizontal: 4 },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginHorizontal: 2 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: LINE,
  },
  pillText: { fontFamily: FONT.bold, fontSize: 13, color: SOFT },
  pillWarn: { backgroundColor: "#fef3c7", borderColor: "#fde68a" },
  pillWarnText: { color: AMBER },
  group: { marginTop: 18 },
  groupLabel: {
    fontSize: 11,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    color: FAINT,
    fontFamily: FONT.bold,
    marginLeft: 4,
    marginBottom: 8,
  },
  card: { backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: LINE, overflow: "hidden" },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#f1f5f9" },
  rowEmpty: { backgroundColor: "#fffbeb" },
  rowSelected: { backgroundColor: "#f0f9ff" },
  rowPressed: { backgroundColor: "#f1f5f9" },
  whoEmpty: { color: AMBER, fontFamily: FONT.semibold },
  // phone rows
  pRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  pDuty: { fontFamily: FONT.medium, fontSize: 12.5, color: SOFT, lineHeight: 17 },
  pWho: { fontFamily: FONT.bold, fontSize: 15, color: INK, marginTop: 1 },
  // table
  thead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#f8fafc" },
  th: { fontFamily: FONT.bold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: FAINT },
  tRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, minHeight: 50 },
  cDuty: { flex: 1.3, paddingRight: 12 },
  cWho: { flex: 1, paddingRight: 12 },
  cWhen: { width: 110 },
  cAct: { width: 170 },
  tDuty: { fontFamily: FONT.semibold, fontSize: 14.5, color: INK },
  tWho: { fontFamily: FONT.bold, fontSize: 14.5, color: INK },
  tWhen: { fontFamily: FONT.medium, fontSize: 13, color: SOFT },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#e0f2fe",
  },
  btnPressed: { backgroundColor: "#bae6fd" },
  btnText: { fontFamily: FONT.bold, fontSize: 13, color: SKY },
  removeBtn: { width: 24, alignItems: "center", padding: 2 },
  // panel
  panel: { width: 420, backgroundColor: "#fff", borderLeftWidth: 1, borderLeftColor: LINE },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  panelTitle: { flex: 1, fontFamily: FONT.extrabold, fontSize: 18, color: INK, paddingRight: 10 },
  pickBody: { paddingHorizontal: 12, paddingBottom: 16, flexShrink: 1 },
  nowBox: { paddingHorizontal: 8, paddingVertical: 8, gap: 8 },
  nowEmpty: { fontFamily: FONT.medium, fontSize: 13.5, color: FAINT, paddingHorizontal: 8, paddingVertical: 6 },
  nowRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  nowName: { fontFamily: FONT.bold, fontSize: 15, color: INK },
  nowMeta: { fontFamily: FONT.regular, fontSize: 12, color: FAINT, marginTop: 1 },
  revoke: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fee2e2" },
  revokeText: { fontFamily: FONT.bold, fontSize: 13, color: "#b91c1c" },
  search: {
    fontFamily: FONT.medium,
    fontSize: 14.5,
    color: INK,
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 8,
    marginTop: 6,
    backgroundColor: "#fff",
  },
  pg: {
    fontFamily: FONT.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: FAINT,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 4,
  },
  cand: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12 },
  candNow: { backgroundColor: "#f8fafc" },
  candChosen: { backgroundColor: "#f0f9ff", borderWidth: 2, borderColor: "#7dd3fc", paddingHorizontal: 8, paddingVertical: 7 },
  candTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  candName: { fontFamily: FONT.bold, fontSize: 14.5, color: INK },
  dim: { color: FAINT },
  candMeta: { fontFamily: FONT.regular, fontSize: 12.5, color: SOFT, marginTop: 2, lineHeight: 17 },
  link: { fontFamily: FONT.bold, color: SKY },
  blocked: { fontFamily: FONT.medium, fontSize: 12.5, color: "#b91c1c", marginTop: 2 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#e0f2fe", alignItems: "center", justifyContent: "center" },
  avatarOff: { backgroundColor: "#f1f5f9" },
  avatarText: { fontFamily: FONT.extrabold, fontSize: 11.5, color: SKY },
  avatarTextOff: { color: FAINT },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  tagText: { fontFamily: FONT.bold, fontSize: 11 },
  tagNow: { backgroundColor: "#d1fae5" },
  tagNowText: { color: "#047857" },
  tagGrey: { backgroundColor: "#f1f5f9" },
  tagGreyText: { color: SOFT },
  warn: { alignSelf: "flex-start", backgroundColor: "#fef3c7", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 5 },
  warnText: { fontFamily: FONT.semibold, fontSize: 12.5, color: AMBER },
  // confirm
  confirm: { borderTopWidth: 1, borderTopColor: LINE, padding: 16, backgroundColor: "#f8fafc", gap: 8 },
  confirmLine: { fontFamily: FONT.bold, fontSize: 15, color: INK },
  confirmWarn: { fontFamily: FONT.semibold, fontSize: 12.5, color: AMBER },
  confirmRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  primary: { flex: 1, backgroundColor: "#0e7490", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  primaryPressed: { opacity: 0.8 },
  primaryText: { fontFamily: FONT.extrabold, fontSize: 14.5, color: "#fff" },
  second: { borderWidth: 1, borderColor: LINE, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 18, backgroundColor: "#fff" },
  secondText: { fontFamily: FONT.bold, fontSize: 14.5, color: SOFT },
});
