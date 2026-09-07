import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { FormField } from "./FormField";
import { FormSection } from "./FormSection";
import { CollapsibleSection } from "./CollapsibleSection";
import { FormChips } from "./FormChips";
import { PublisherSelector } from "./PublisherSelector";
import { PublicTalkSelector } from "./PublicTalkSelector";
import { EventOnDateNotice } from "./EventOnDateNotice";
import {
  AssignmentStatus,
  CircuitOverseer,
  CreateAssignmentInput,
  EventType,
  extractErrorMessage,
  localNeedsApi,
  LocalNeedsTopic,
  PublicTalk,
  PublisherActivity,
  publisherActivityApi,
  talkExchangeApi,
  visitingSpeakersApi,
} from "../lib/api";
import {
  getPartDef,
  PARTS_BY_EVENT,
  skillCapabilityFromTitle,
} from "../lib/parts";
import { usePermissions } from "../lib/permissions";
import { useTranslation } from "react-i18next";

interface Props {
  initial?: Partial<CreateAssignmentInput>;
  /**
   * The id of the assignment being edited, when there is one.
   *
   * Passing it is what lets a local-needs topic remember WHICH part it became,
   * so the app can release it by itself if the part is later changed to
   * something else. On the "new" screen there is no id yet, and the topic is
   * simply marked for the week.
   */
  assignmentId?: string;
  onSubmit: (data: CreateAssignmentInput) => Promise<unknown>;
  /** When set, edits save instantly (pickers) or debounced (text). */
  onInstantSave?: (patch: Partial<CreateAssignmentInput>) => Promise<unknown>;
  onCancel?: () => void;
  isSubmitting: boolean;
  submitLabel?: string;
  /** When true, weekStartDate / eventType / partKey become read-only. */
  lockIdentity?: boolean;
  /** When true the whole form is non-interactive and the actions are hidden. */
  readOnly?: boolean;
  /**
   * Circuit overseer for this week (when it is a CO-visit week), used to offer
   * the overseer as a prayer participant and to label his talks. Null otherwise.
   */
  circuitOverseer?: { displayName: string; role?: string | null } | null;
  /** Manager-only picker to switch the visiting overseer for the whole week
   * (updates the CO-visit event snapshot, so both meetings reflect it). */
  coPicker?: AssignmentFormCoPicker | null;
}

export interface AssignmentFormCoPicker {
  overseers: CircuitOverseer[];
  current: { firstName: string; lastName: string };
  pending: boolean;
  onPick: (c: CircuitOverseer) => void;
}

// EVENT_TYPE_OPTIONS, STATUS_OPTIONS, SPEAKER_TYPE_OPTIONS moved inside component (i18n)

export function AssignmentForm({
  initial,
  assignmentId,
  onSubmit,
  onInstantSave,
  onCancel,
  isSubmitting,
  submitLabel,
  lockIdentity,
  readOnly,
  circuitOverseer,
  coPicker,
}: Props) {
  const { t, i18n } = useTranslation();
  const autosave = !!onInstantSave;
  const [instantSaving, setInstantSaving] = useState(false);
  const [instantSavedAt, setInstantSavedAt] = useState<number | null>(null);
  const [instantError, setInstantError] = useState<string | null>(null);
  // useState initializer: a stable box that survives re-renders (no useRef
  // needed, keeps the import surface untouched).
  const debounceBox = useState(() => ({
    timer: null as ReturnType<typeof setTimeout> | null,
    pending: null as Partial<CreateAssignmentInput> | null,
  }))[0];
  const instant = async (patch: Partial<CreateAssignmentInput>) => {
    if (!onInstantSave) return;
    setInstantSaving(true);
    setInstantError(null);
    try {
      await onInstantSave(patch);
      setInstantSavedAt(Date.now());
    } catch (e) {
      setInstantError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstantSaving(false);
    }
  };
  const queueInstant = (patch: Partial<CreateAssignmentInput>) => {
    if (!onInstantSave) return;
    debounceBox.pending = { ...(debounceBox.pending ?? {}), ...patch };
    if (debounceBox.timer) clearTimeout(debounceBox.timer);
    debounceBox.timer = setTimeout(() => {
      const p = debounceBox.pending;
      debounceBox.pending = null;
      debounceBox.timer = null;
      if (p) void instant(p);
    }, 1200);
  };
  // Save any pending edit immediately when a field loses focus, so a quick
  // edit-then-close (e.g. clearing the manual theme) is never lost to the
  // debounce window. Runs while the sheet is still open (assignment present).
  const flushInstant = () => {
    if (debounceBox.timer) {
      clearTimeout(debounceBox.timer);
      debounceBox.timer = null;
    }
    const p = debounceBox.pending;
    debounceBox.pending = null;
    if (p && onInstantSave) void onInstantSave(p);
  };
  const effectiveSubmitLabel = submitLabel ?? t("common.save");
  const EVENT_TYPE_OPTIONS: { value: EventType; label: string }[] = [
    { value: "midweek", label: t("assignments.eventTypeShort.midweek") },
    { value: "weekend", label: t("assignments.eventTypeShort.weekend") },
    { value: "cleaning", label: t("assignments.eventTypeShort.cleaning") },
    { value: "av_duty", label: t("assignments.eventTypeShort.av_duty") },
    {
      value: "public_witnessing",
      label: t("assignments.eventTypeShort.public_witnessing"),
    },
  ];
  const STATUS_OPTIONS: { value: AssignmentStatus; label: string }[] = [
    { value: "draft", label: t("assignments.status.draft") },
    { value: "published", label: t("assignments.status.published") },
    { value: "cancelled", label: t("assignments.status.cancelled") },
  ];
  const SPEAKER_TYPE_OPTIONS: { value: "local" | "invited"; label: string }[] =
    [
      { value: "local", label: t("assignments.speakerType.local") },
      { value: "invited", label: t("assignments.speakerType.invited") },
    ];
  const [form, setForm] = useState<CreateAssignmentInput>({
    weekStartDate: initial?.weekStartDate ?? "",
    eventType: initial?.eventType ?? "midweek",
    partKey: initial?.partKey ?? "",
    partOrder: initial?.partOrder ?? 0,
    partTitle: initial?.partTitle ?? "",
    partDurationMin: initial?.partDurationMin,
    publisherId: initial?.publisherId ?? null,
    assistantPublisherId: initial?.assistantPublisherId ?? null,
    status: initial?.status ?? "draft",
    notes: initial?.notes ?? "",
    publicTalkId: initial?.publicTalkId ?? null,
    speakerName: initial?.speakerName ?? null,
    speakerCongregation: initial?.speakerCongregation ?? null,
  });

  // For public_talk_speaker only: 'local' = use publisherId, 'invited' = use speakerName
  const [speakerType, setSpeakerType] = useState<"local" | "invited">(
    initial?.speakerName ? "invited" : "local",
  );

  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof CreateAssignmentInput>(
    key: K,
    value: CreateAssignmentInput[K],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ---- Local Needs: insert a planned topic into a "Living as Christians" part ----
  const qc = useQueryClient();

  /**
   * «Приехал другой» — действие дня встречи, а не правка записи.
   *
   * Переписать имя в поле было бы быстрее всего, и именно так делали до сих
   * пор: тогда брат, которого ждали, исчезал бесследно, а по этому следу
   * решают, звать ли снова. Здесь замена — два факта сразу, и делает их
   * сервер: прежний визит закрывается как несостоявшийся и остаётся в истории,
   * новый занимает слот немедленно, потому что со сцены читают программу.
   */
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceName, setReplaceName] = useState("");
  const [replaceCong, setReplaceCong] = useState("");
  const [replaceReason, setReplaceReason] = useState("");
  const [replaceSpeakerId, setReplaceSpeakerId] = useState<string | null>(null);
  const [replaceSearch, setReplaceSearch] = useState("");
  /**
   * Речь заменяющего.
   *
   * Приезжает другой брат — как правило, со СВОЕЙ речью, и до сих пор об этом
   * никто не спрашивал: слот сохранял прежний номер, а новому записывалось то,
   * чего он не произносил. Пусто — значит остаётся прежняя, и это законный
   * случай: тот же доклад читает другой.
   */
  const [replaceTalkId, setReplaceTalkId] = useState<string | null>(null);
  /** Заменить может и свой брат — так бывает чаще, чем приезд второго гостя. */
  const [replaceLocalId, setReplaceLocalId] = useState<string | null>(null);

  const speakersQuery = useQuery({
    queryKey: ["visiting-speakers"],
    queryFn: () => visitingSpeakersApi.list(),
    // Нужен и для замены, и для подсказок при наборе имени.
    enabled: replaceOpen || form.partKey === "public_talk_speaker",
  });

  /**
   * Кого предлагать в замену — по набранному, а не «первые шесть».
   *
   * В справочнике тридцать карточек и будет больше; шесть первых — это шесть
   * случайных. Пока не набрано двух букв, показываем тех, кто ездил недавно:
   * их и зовут чаще всего.
   */
  const replaceCandidates = (() => {
    const all = (speakersQuery.data ?? []).map((sp) => ({
      id: sp.id,
      name: [sp.firstName, sp.lastName].filter(Boolean).join(" "),
      cong: sp.externalCongregation?.name ?? null,
    }));
    // Тот, кто уже стоит в неделе, в списке не нужен: заменять им же самим
    // нечего, и сервер такую замену отвергает.
    const others = all.filter(
      (x) => x.name !== (form.speakerName ?? "").trim(),
    );
    const typed = replaceSearch.trim().toLowerCase();
    if (typed.length < 2) return others.slice(0, 5);
    return others
      .filter(
        (x) =>
          x.name.toLowerCase().includes(typed) ||
          (x.cong ?? "").toLowerCase().includes(typed),
      )
      .slice(0, 6);
  })();

  /** Замена готова, когда названо, КТО говорит. Речь необязательна. */
  const replaceReady =
    !!replaceSpeakerId || !!replaceLocalId || replaceName.trim().length >= 2;

  const replaceMutation = useMutation({
    meta: { inlineError: true },
    mutationFn: () =>
      talkExchangeApi.replaceSpeaker({
        weekStartDate: form.weekStartDate,
        ...(replaceLocalId
          ? { publisherId: replaceLocalId }
          : replaceSpeakerId
            ? { visitingSpeakerId: replaceSpeakerId }
            : {
                speakerName: replaceName.trim(),
                speakerCongregation: replaceCong.trim() || undefined,
              }),
        ...(replaceTalkId ? { publicTalkId: replaceTalkId } : {}),
        reason: replaceReason.trim() || undefined,
      }),
    onSuccess: () => {
      setReplaceOpen(false);
      setReplaceSpeakerId(null);
      setReplaceLocalId(null);
      setReplaceTalkId(null);
      setReplaceSearch("");
      setReplaceName("");
      setReplaceCong("");
      setReplaceReason("");
      void qc.invalidateQueries({ queryKey: ["assignments"] });
      void qc.invalidateQueries({ queryKey: ["talk-exchange"] });
      onCancel?.();
    },
  });

  const { canManageLocalNeeds } = usePermissions();
  const [lnPickerOpen, setLnPickerOpen] = useState(false);
  const isLivingChristians = (form.partKey ?? "").startsWith(
    "living_christians",
  );
  const [lnSearch, setLnSearch] = useState("");
  const lnQuery = useQuery({
    // Everything, not only the planned ones. The question a person has while
    // choosing is «а не было ли уже такого» — and the answer used to be
    // unavailable at exactly the moment it was needed.
    queryKey: ["local-needs", "picker"],
    queryFn: () => localNeedsApi.list(),
    enabled: lnPickerOpen,
  });
  const markUsedMut = useMutation({
    mutationFn: (id: string) =>
      localNeedsApi.markUsed(id, {
        week: form.weekStartDate || undefined,
        assignmentId,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["local-needs"] }),
  });
  const applyLocalNeed = (topic: LocalNeedsTopic) => {
    update("partTitle", topic.title);
    void instant({ partTitle: topic.title });
    if (topic.speakerPublisherId) {
      update("publisherId", topic.speakerPublisherId);
      void instant({ publisherId: topic.speakerPublisherId });
    }
    if (form.weekStartDate) markUsedMut.mutate(topic.id);
    setLnPickerOpen(false);
  };

  const activityQuery = useQuery({
    queryKey: ["publisher-activity", form.weekStartDate],
    queryFn: () =>
      publisherActivityApi.getActivity({
        weekStart: form.weekStartDate,
        weeks: 13,
      }),
    enabled: !!form.weekStartDate,
  });
  const activityById = new Map<string, PublisherActivity>();
  for (const a of activityQuery.data ?? []) activityById.set(a.publisherId, a);

  const partDef = getPartDef(form.partKey);
  const isPublicTalkSpeaker = form.partKey === "public_talk_speaker";

  /**
   * Подсказки из справочника, пока имя набирают.
   *
   * Связь визита с братом сервер выводит по ТОЧНОМУ совпадению имени и
   * собрания. Значит написание решает: «Walter Getko» и «Вальтер Гетко» —
   * два разных человека, и история одного делится надвое. Подсказка не
   * добавляет новой возможности, она убирает разночтение: выбранная строка
   * подставляет имя и собрание ровно так, как они записаны в карточке.
   *
   * Ввод от руки остаётся: гостя, которого незачем заводить, по-прежнему
   * можно просто напечатать — карточку заведёт сервер.
   */
  const speakerHints = (() => {
    if (!isPublicTalkSpeaker || speakerType !== "invited") return [];
    const typed = (form.speakerName ?? "").trim().toLowerCase();
    const all = speakersQuery.data ?? [];
    const named = all.map((sp) => ({
      id: sp.id,
      name: [sp.firstName, sp.lastName].filter(Boolean).join(" "),
      cong: sp.externalCongregation?.name ?? null,
    }));
    // Пустое поле — не повод показывать весь справочник: подсказки нужны
    // тому, кто уже начал печатать.
    if (typed.length < 2) return [];
    const hits = named.filter(
      (n) =>
        n.name.toLowerCase().includes(typed) ||
        (n.cong ?? "").toLowerCase().includes(typed),
    );
    // Точное совпадение значит, что выбирать уже нечего.
    if (hits.length === 1 && hits[0].name.toLowerCase() === typed) return [];
    return hits.slice(0, 5);
  })();

  // Apply-Yourself "Talk" (Речь) is delivered solo — no householder/assistant,
  // unlike the ministry demonstrations. Detect it from the title-derived skill.
  // We check the title on ANY ministry part that would otherwise show an
  // assistant, because the positional key (apply_yourself_1..4) varies and a
  // talk can land on any of those slots.
  const titleSkill = skillCapabilityFromTitle(form.partTitle);
  const isStudentTalk = !!partDef?.hasAssistant && titleSkill === "fs_talk";
  const showAssistant = !!partDef?.hasAssistant && !isStudentTalk;
  // A student TALK has one participant: if the workbook title marks this
  // part as a talk, any previously stored assistant is cleared on open.
  useEffect(() => {
    if (isStudentTalk && form.assistantPublisherId) {
      update("assistantPublisherId", null);
      void instant({ assistantPublisherId: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudentTalk]);

  // ---- Circuit-overseer visit week: CO talks + CO-led prayers ----
  const PRAYER_KEYS = [
    "midweek_opening_prayer",
    "midweek_closing_prayer",
    "weekend_opening_prayer",
    "weekend_closing_prayer",
  ];
  const isPrayer = PRAYER_KEYS.includes(form.partKey ?? "");
  const isCoTalk =
    form.partKey === "co_service_talk" || form.partKey === "co_concluding_talk";
  const isCoWeek = !!circuitOverseer;
  const coName = circuitOverseer?.displayName?.trim() || null;
  const coRole =
    circuitOverseer?.role === "substitute" ? "substitute" : "overseer";
  const coRoleWord = t(`assignments.form.coRole.${coRole}`);
  const coRoleShort = t(`assignments.form.coRoleShort.${coRole}`);
  const coNoteBlock = (
    <View style={styles.coSpeakerNote}>
      <Ionicons name="person" size={16} color="#6d28d9" />
      <Text style={styles.coSpeakerText}>
        {coName
          ? t("assignments.form.coSpeaker", { role: coRoleWord, name: coName })
          : t("assignments.form.coSpeakerNoName", { role: coRoleWord })}
      </Text>
    </View>
  );
  const coPickerBlock =
    coPicker && coPicker.overseers.length > 0 ? (
      <View style={styles.coPickerWrap}>
        <Text style={styles.coPickerLabel}>
          {t("circuitOverseer.pickLabel")}
        </Text>
        <View style={styles.coChips}>
          {coPicker.overseers.map((c) => {
            const active =
              c.firstName === coPicker.current.firstName &&
              c.lastName === coPicker.current.lastName;
            return (
              <Pressable
                key={c.id}
                disabled={coPicker.pending}
                onPress={() => coPicker.onPick(c)}
                style={[styles.coChip, active && styles.coChipActive]}
              >
                <Text
                  style={[styles.coChipText, active && styles.coChipTextActive]}
                >
                  {c.firstName} {c.lastName}
                  {c.role === "substitute"
                    ? ` · ${t("circuitOverseer.roleSubstitute")}`
                    : ""}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    ) : null;
  // 'co' = the prayer is said by the circuit overseer (stored in speakerName).
  const [prayerBy, setPrayerBy] = useState<"local" | "co">(
    initial?.speakerName ? "co" : "local",
  );
  const PRAYER_BY_OPTIONS: { value: "local" | "co"; label: string }[] = [
    { value: "local", label: t("assignments.form.prayerBy.local") },
    {
      value: "co",
      label: coName
        ? t("assignments.form.prayerBy.co", {
            role: coRoleShort,
            name: coName,
          })
        : t("assignments.form.prayerBy.coShort", { role: coRoleShort }),
    },
  ];
  const handlePrayerByChange = (v: "local" | "co") => {
    setPrayerBy(v);
    if (v === "co") {
      update("speakerName", coName);
      update("publisherId", null);
      void instant({ speakerName: coName, publisherId: null });
    } else {
      update("speakerName", null);
      void instant({ speakerName: null });
    }
  };
  // Apply-Yourself parts are numbered positionally, but the real skill is in
  // the title — prefer that so the picker filters by the correct capability.
  const titleCap = (form.partKey ?? "").startsWith("apply_yourself")
    ? titleSkill
    : null;
  // Every "Living as Christians" part — the numbered ones and any manually
  // added extra — is gated by the dedicated christian_life capability, so the
  // conductor picker shows only brothers marked for it in the publisher card.
  const christianLifeCap = (form.partKey ?? "").startsWith("living_christians")
    ? "christian_life"
    : null;
  const requiredCap =
    titleCap ?? christianLifeCap ?? partDef?.requiredCapability;
  const requiredAssistantCap =
    titleCap ??
    partDef?.requiredAssistantCapability ??
    partDef?.requiredCapability;
  const requiredSkillLabel = requiredCap
    ? t(`capabilities.items.${requiredCap}`)
    : null;

  // Equivalent keys for "last did this part" suggestions: the whole
  // apply-yourself family counts as one part; everything else is exact.
  const suggestionPartKeys = useMemo(() => {
    const key = form.partKey?.trim();
    if (!key) return [];
    if (key.startsWith("apply_yourself")) {
      const family = (PARTS_BY_EVENT.midweek ?? [])
        .map((p) => p.key)
        .filter((k) => k.startsWith("apply_yourself"));
      return family.length > 0 ? family : [key];
    }
    return [key];
  }, [form.partKey]);

  const handleTalkSelect = (talk: PublicTalk | null) => {
    // Picking derives the title from the talk; clearing wipes both the talk
    // and its derived title so the program shows the slot as empty.
    const nextTitle = talk ? `№${talk.number}. ${talk.title}` : null;
    setForm((prev) => ({
      ...prev,
      publicTalkId: talk?.id ?? null,
      partTitle: nextTitle ?? "",
    }));
    // instant-save the talk pick (publicTalkId + derived title) like the
    // publisher pickers do — otherwise the choice never leaves the form.
    void instant({
      publicTalkId: talk?.id ?? null,
      partTitle: nextTitle ?? "",
    });
  };

  const handleSpeakerTypeChange = (type: "local" | "invited") => {
    setSpeakerType(type);
    if (type === "local") {
      // Clear invited fields
      setForm((prev) => ({
        ...prev,
        speakerName: null,
        speakerCongregation: null,
      }));
      if (onInstantSave) {
        void instant({ speakerName: null, speakerCongregation: null });
      }
    } else {
      // Clear local publisher
      setForm((prev) => ({ ...prev, publisherId: null }));
      if (onInstantSave) {
        void instant({ publisherId: null });
      }
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.weekStartDate?.trim()) {
      setError(t("assignments.form.validation.weekStartRequired"));
      return;
    }
    if (!form.partKey?.trim()) {
      setError(t("assignments.form.validation.partKeyRequired"));
      return;
    }
    try {
      await onSubmit(form);
    } catch (e) {
      setError(extractErrorMessage(e));
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <View
        pointerEvents={readOnly ? "none" : "auto"}
        style={readOnly ? { opacity: 0.55 } : undefined}
      >
        {(form.eventType === "midweek" || form.eventType === "weekend") &&
        !!form.weekStartDate ? (
          <EventOnDateNotice
            weekStartDate={form.weekStartDate}
            eventType={form.eventType}
          />
        ) : null}
        {lockIdentity ? (
          <View style={styles.contextCard}>
            <Text style={styles.contextMeta}>
              {form.weekStartDate}
              {" \u00b7 "}
              {t(`assignments.eventTypeShort.${form.eventType}`, {
                defaultValue: form.eventType,
              })}
            </Text>
            {autosave && (instantSaving || instantSavedAt || instantError) ? (
              <Text
                style={[
                  styles.instantStatus,
                  instantError ? styles.instantStatusError : null,
                ]}
                numberOfLines={2}
              >
                {instantError
                  ? instantError
                  : instantSaving
                    ? t("assignments.form.saving")
                    : t("assignments.form.saved")}
              </Text>
            ) : null}
            {form.partDurationMin || requiredSkillLabel ? (
              <View style={styles.contextChips}>
                {form.partDurationMin ? (
                  <View style={styles.contextChip}>
                    <Text style={styles.contextChipText}>
                      {t("assignments.form.minutesShort", {
                        count: form.partDurationMin,
                      })}
                    </Text>
                  </View>
                ) : null}
                {requiredSkillLabel ? (
                  <View style={styles.contextChip}>
                    <Text style={styles.contextChipText}>
                      {requiredSkillLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : (
          <FormSection title={t("assignments.form.section.identity")}>
            <>
              <FormField
                label={t("assignments.form.field.weekStartFull")}
                value={form.weekStartDate}
                onChangeText={(v) => update("weekStartDate", v)}
                placeholder={t("assignments.form.placeholder.weekStart")}
                required
                autoCapitalize="none"
              />
              <FormChips
                label={t("assignments.form.field.eventType")}
                value={form.eventType}
                options={EVENT_TYPE_OPTIONS}
                onChange={(v) => update("eventType", v)}
              />
              <FormField
                label={t("assignments.form.field.partKey")}
                value={form.partKey}
                onChangeText={(v) => update("partKey", v)}
                placeholder={t("assignments.form.placeholder.partKey")}
                required
                autoCapitalize="none"
              />
              <FormField
                label={t("assignments.form.field.partOrder")}
                value={form.partOrder?.toString() ?? "0"}
                onChangeText={(v) => update("partOrder", parseInt(v, 10) || 0)}
                keyboardType="numeric"
              />
            </>
          </FormSection>
        )}

        {isLivingChristians && canManageLocalNeeds && !readOnly ? (
          <Pressable
            style={styles.lnInsertBtn}
            onPress={() => setLnPickerOpen(true)}
          >
            <Ionicons name="bulb-outline" size={18} color="#0ea5e9" />
            <Text style={styles.lnInsertText}>{t("localNeeds.insertCta")}</Text>
          </Pressable>
        ) : null}

        <Modal
          visible={lnPickerOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setLnPickerOpen(false)}
        >
          <View style={styles.lnBackdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setLnPickerOpen(false)}
              accessibilityRole="button"
            />
            <View style={styles.lnCard}>
              <View style={styles.lnHeader}>
                <Text style={styles.lnTitle}>
                  {t("localNeeds.insertTitle")}
                </Text>
                <Pressable onPress={() => setLnPickerOpen(false)} hitSlop={8}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </Pressable>
              </View>
              <View style={styles.lnSearchBox}>
                <Ionicons name="search-outline" size={16} color="#94a3b8" />
                <TextInput
                  style={styles.lnSearchInput}
                  value={lnSearch}
                  onChangeText={setLnSearch}
                  placeholder={t("localNeeds.insertSearch")}
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                />
              </View>
              {lnQuery.isLoading ? (
                <ActivityIndicator style={{ marginVertical: 24 }} />
              ) : (
                (() => {
                  const needle = lnSearch.trim().toLowerCase();
                  const rows = (lnQuery.data ?? []).filter(
                    (r) =>
                      !needle ||
                      `${r.title} ${r.notes ?? ""}`
                        .toLowerCase()
                        .includes(needle),
                  );
                  const plannedRows = rows.filter((r) => !r.usedWeek);
                  // Shown, not offered: a subject already covered is exactly
                  // what the person is trying to remember, and hiding it was
                  // how the same topic came round twice.
                  const usedRows = rows
                    .filter((r) => !!r.usedWeek)
                    .sort((a, b) =>
                      (b.usedWeek as string).localeCompare(
                        a.usedWeek as string,
                      ),
                    )
                    .slice(0, 20);
                  if (rows.length === 0) {
                    return (
                      <Text style={styles.lnEmpty}>
                        {t("localNeeds.insertEmpty")}
                      </Text>
                    );
                  }
                  const row = (topic: LocalNeedsTopic, used: boolean) => (
                    <Pressable
                      key={topic.id}
                      style={[styles.lnRow, used && { opacity: 0.7 }]}
                      onPress={() => applyLocalNeed(topic)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lnRowTitle}>{topic.title}</Text>
                        {topic.notes ? (
                          <Text style={styles.lnRowNotes} numberOfLines={2}>
                            {topic.notes}
                          </Text>
                        ) : null}
                        {used ? (
                          <Text style={styles.lnRowUsed}>
                            {t("localNeeds.wasUsedOn", {
                              week: new Date(
                                `${topic.usedWeek}T00:00:00`,
                              ).toLocaleDateString(i18n.language, {
                                day: "numeric",
                                month: "long",
                                year: "numeric",
                              }),
                            })}
                          </Text>
                        ) : topic.speaker ? (
                          <Text style={styles.lnRowSpeaker}>
                            {topic.speaker.displayName}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name="add-circle-outline"
                        size={22}
                        color="#0ea5e9"
                      />
                    </Pressable>
                  );
                  return (
                    <ScrollView style={{ maxHeight: 360 }}>
                      {plannedRows.length > 0 ? (
                        <>
                          <Text style={styles.lnGroup}>
                            {t("localNeeds.insertPlannedGroup")}
                          </Text>
                          {plannedRows.map((r) => row(r, false))}
                        </>
                      ) : null}
                      {usedRows.length > 0 ? (
                        <>
                          <Text style={styles.lnGroup}>
                            {t("localNeeds.insertPastGroup")}
                          </Text>
                          {usedRows.map((r) => row(r, true))}
                        </>
                      ) : null}
                    </ScrollView>
                  );
                })()
              )}
            </View>
          </View>
        </Modal>

        {isCoTalk && (
          <FormSection title={t("assignments.form.section.coTalk")}>
            <PublicTalkSelector
              label={t("assignments.form.field.talk")}
              value={form.publicTalkId}
              onChange={handleTalkSelect}
            />
            <FormField
              label={t("assignments.form.field.talkThemeManual")}
              value={form.partTitle ?? ""}
              onChangeText={(v) => {
                update("partTitle", v);
                queueInstant({ partTitle: v });
              }}
              onBlur={flushInstant}
              placeholder={t("assignments.form.placeholder.talkThemeManual")}
              multiline
            />
            {coNoteBlock}
            {coPickerBlock}
          </FormSection>
        )}

        {isPublicTalkSpeaker && (
          <FormSection title={t("assignments.form.section.publicTalk")}>
            <PublicTalkSelector
              label={t("assignments.form.field.talk")}
              value={form.publicTalkId}
              onChange={handleTalkSelect}
            />
            {/*
              Тема вручную — на ЛЮБОЙ неделе, а не только при визите районного.

              Условие стояло с тех пор, когда «речь не из каталога» считалась
              случаем районного. На деле их больше: специальная речь, доклад
              приезжего, которого нет в каталоге, тема, объявленная иначе. У
              собрания такая речь уже стоит в программе — а вписать её через
              приложение было нельзя: поле показывалось только на неделе
              визита, и человек упирался в выбор из каталога, где нужного нет.
            */}
            <FormField
              label={t("assignments.form.field.talkThemeManual")}
              value={form.partTitle ?? ""}
              onChangeText={(v) => {
                update("partTitle", v);
                queueInstant({ partTitle: v });
              }}
              onBlur={flushInstant}
              placeholder={t("assignments.form.placeholder.talkThemeManual")}
              multiline
            />
            <Text style={rp.note}>
              {t("assignments.form.hint.talkThemeManual")}
            </Text>
            {isCoWeek ? coNoteBlock : null}
            {isCoWeek ? coPickerBlock : null}
          </FormSection>
        )}

        {!isCoTalk && !(isPublicTalkSpeaker && isCoWeek) && (
          <FormSection
            title={
              isPublicTalkSpeaker
                ? t("assignments.form.section.speaker")
                : isPrayer && isCoWeek
                  ? t("assignments.form.section.prayer")
                  : t("assignments.form.section.assignment")
            }
          >
            {isPublicTalkSpeaker ? (
              <>
                <FormChips
                  label={t("assignments.form.field.speakerTypeLabel")}
                  value={speakerType}
                  options={SPEAKER_TYPE_OPTIONS}
                  onChange={handleSpeakerTypeChange}
                />
                {speakerType === "local" ? (
                  <PublisherSelector
                    label={t("assignments.form.field.publisher")}
                    value={form.publisherId}
                    onChange={(id) => {
                      update("publisherId", id);
                      void instant({ publisherId: id });
                    }}
                    requiredCapability={requiredCap}
                    activityById={activityById}
                    currentWeekStart={form.weekStartDate}
                    currentEventType={form.eventType}
                  />
                ) : (
                  <>
                    <FormField
                      label={t("assignments.form.field.speakerName")}
                      value={form.speakerName ?? ""}
                      onChangeText={(v) => {
                        update("speakerName", v || null);
                        // instant-save invited speaker
                        queueInstant({ speakerName: v || null });
                      }}
                      onBlur={flushInstant}
                      placeholder={t(
                        "assignments.form.placeholder.speakerName",
                      )}
                    />
                    {speakerHints.length > 0 ? (
                      <View style={hint.box}>
                        <Text style={hint.lead}>
                          {t("assignments.speakerHints.lead")}
                        </Text>
                        {speakerHints.map((h) => (
                          <Pressable
                            key={h.id}
                            style={hint.row}
                            onPress={() => {
                              update("speakerName", h.name);
                              update("speakerCongregation", h.cong);
                              void instant({
                                speakerName: h.name,
                                speakerCongregation: h.cong,
                              });
                            }}
                          >
                            <Ionicons
                              name="person-circle-outline"
                              size={16}
                              color="#0369a1"
                            />
                            <View style={{ flex: 1 }}>
                              <Text style={hint.name}>{h.name}</Text>
                              {h.cong ? (
                                <Text style={hint.cong}>{h.cong}</Text>
                              ) : null}
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    ) : null}
                    <FormField
                      label={t("assignments.form.field.fromCongregation")}
                      value={form.speakerCongregation ?? ""}
                      onChangeText={(v) => {
                        update("speakerCongregation", v || null);
                        queueInstant({ speakerCongregation: v || null });
                      }}
                      onBlur={flushInstant}
                      placeholder={t(
                        "assignments.form.placeholder.fromCongregation",
                      )}
                    />
                  </>
                )}
                {/* Виден только когда докладчик уже назначен: заменять некого,
                пока никто не назначен. */}
                {(form.publisherId || form.speakerName) && !replaceOpen ? (
                  <Pressable
                    style={rp.link}
                    onPress={() => setReplaceOpen(true)}
                    hitSlop={6}
                  >
                    <Ionicons
                      name="swap-horizontal"
                      size={15}
                      color="#0369a1"
                    />
                    <Text style={rp.linkText}>
                      {t("assignments.replaceSpeaker.action")}
                    </Text>
                  </Pressable>
                ) : null}
                {replaceOpen ? (
                  <View style={rp.box}>
                    <View style={rp.head}>
                      <Ionicons
                        name="swap-horizontal"
                        size={16}
                        color="#0369a1"
                      />
                      <Text style={rp.title}>
                        {t("assignments.replaceSpeaker.title")}
                      </Text>
                    </View>
                    <Text style={rp.lead}>
                      {t("assignments.replaceSpeaker.lead")}
                    </Text>

                    {/* Шаг первый: кто. Поиск, а не первые шесть карточек:
                        справочник вырос, и «первые шесть» — это случайные
                        шесть. */}
                    <Text style={rp.step}>
                      {t("assignments.replaceSpeaker.stepWho")}
                    </Text>
                    <TextInput
                      style={rp.search}
                      value={replaceSearch}
                      onChangeText={setReplaceSearch}
                      placeholder={t("assignments.replaceSpeaker.searchHint")}
                      placeholderTextColor="#94a3b8"
                    />
                    {replaceCandidates.map((sp) => {
                      const on = replaceSpeakerId === sp.id;
                      return (
                        <Pressable
                          key={sp.id}
                          style={[rp.row, on ? rp.rowOn : null]}
                          onPress={() => {
                            setReplaceSpeakerId(on ? null : sp.id);
                            setReplaceLocalId(null);
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={rp.rowName}>{sp.name}</Text>
                            {sp.cong ? (
                              <Text style={rp.rowCong}>{sp.cong}</Text>
                            ) : null}
                          </View>
                          {on ? (
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color="#0284c7"
                            />
                          ) : null}
                        </Pressable>
                      );
                    })}
                    {replaceSearch.trim().length >= 2 &&
                    replaceCandidates.length === 0 ? (
                      <Text style={rp.none}>
                        {t("assignments.replaceSpeaker.noMatches")}
                      </Text>
                    ) : null}

                    {/* Свой брат — случай не реже приезда второго гостя. */}
                    {replaceSpeakerId ? null : (
                      <>
                        <Text style={rp.step}>
                          {t("assignments.replaceSpeaker.stepLocal")}
                        </Text>
                        <PublisherSelector
                          label=""
                          value={replaceLocalId}
                          onChange={(id) => {
                            setReplaceLocalId(id);
                            if (id) setReplaceSpeakerId(null);
                          }}
                          requiredCapability={requiredCap}
                          currentWeekStart={form.weekStartDate}
                          currentEventType={form.eventType}
                        />
                      </>
                    )}

                    {/* Или просто имя — для гостя, которого незачем заводить. */}
                    {replaceSpeakerId || replaceLocalId ? null : (
                      <>
                        <Text style={rp.step}>
                          {t("assignments.replaceSpeaker.stepByName")}
                        </Text>
                        <FormField
                          label={t("assignments.form.field.speakerName")}
                          value={replaceName}
                          onChangeText={setReplaceName}
                          placeholder={t(
                            "assignments.form.placeholder.speakerName",
                          )}
                        />
                        <FormField
                          label={t("assignments.form.field.fromCongregation")}
                          value={replaceCong}
                          onChangeText={setReplaceCong}
                          placeholder={t(
                            "assignments.form.placeholder.fromCongregation",
                          )}
                        />
                      </>
                    )}

                    {/* Шаг второй: что он говорит. Раньше об этом не
                        спрашивали, и новому доставалась чужая речь. */}
                    <Text style={rp.step}>
                      {t("assignments.replaceSpeaker.stepTalk")}
                    </Text>
                    <PublicTalkSelector
                      label=""
                      value={replaceTalkId}
                      onChange={(talk) => setReplaceTalkId(talk?.id ?? null)}
                    />
                    <Text style={rp.note}>
                      {t("assignments.replaceSpeaker.talkKeepHint")}
                    </Text>

                    <FormField
                      label={t("assignments.replaceSpeaker.reason")}
                      value={replaceReason}
                      onChangeText={setReplaceReason}
                      placeholder={t("assignments.replaceSpeaker.reasonHint")}
                    />
                    <Text style={rp.note}>
                      {t("assignments.replaceSpeaker.note")}
                    </Text>
                    <Pressable
                      style={[rp.confirm, !replaceReady ? rp.confirmOff : null]}
                      disabled={replaceMutation.isPending || !replaceReady}
                      onPress={() => replaceMutation.mutate()}
                    >
                      {replaceMutation.isPending ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={rp.confirmText}>
                          {t("assignments.replaceSpeaker.confirm")}
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => setReplaceOpen(false)}
                      hitSlop={6}
                    >
                      <Text style={rp.cancel}>{t("common.cancel")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            ) : isPrayer && isCoWeek ? (
              <>
                <FormChips
                  label=""
                  value={prayerBy}
                  options={PRAYER_BY_OPTIONS}
                  onChange={handlePrayerByChange}
                />
                {prayerBy === "local" ? (
                  <PublisherSelector
                    label={t("assignments.form.field.publisher")}
                    value={form.publisherId}
                    onChange={(id) => {
                      update("publisherId", id);
                      void instant({ publisherId: id });
                    }}
                    requiredCapability={requiredCap}
                    activityById={activityById}
                    currentWeekStart={form.weekStartDate}
                    currentEventType={form.eventType}
                  />
                ) : null}
              </>
            ) : (
              <>
                <PublisherSelector
                  label={t("assignments.form.field.publisher")}
                  value={form.publisherId}
                  onChange={(id) => {
                    update("publisherId", id);
                    void instant({ publisherId: id });
                  }}
                  excludeIds={
                    form.assistantPublisherId ? [form.assistantPublisherId] : []
                  }
                  requiredCapability={requiredCap}
                  suggestionPartKeys={suggestionPartKeys}
                  activityById={activityById}
                  currentWeekStart={form.weekStartDate}
                  currentEventType={form.eventType}
                />
                {showAssistant && (
                  <PublisherSelector
                    label={t("assignments.form.field.assistant")}
                    value={form.assistantPublisherId}
                    onChange={(id) => {
                      update("assistantPublisherId", id);
                      void instant({ assistantPublisherId: id });
                    }}
                    excludeIds={form.publisherId ? [form.publisherId] : []}
                    requiredCapability={requiredAssistantCap}
                    suggestionPartKeys={suggestionPartKeys}
                    suggestionRole="assistant"
                    partnerOfPublisherId={form.publisherId ?? null}
                    matchGenderOfPublisherId={form.publisherId ?? null}
                    activityById={activityById}
                    currentWeekStart={form.weekStartDate}
                    currentEventType={form.eventType}
                  />
                )}
              </>
            )}
          </FormSection>
        )}

        <CollapsibleSection
          title={t("assignments.form.section.details")}
          initiallyOpen={false}
        >
          <FormField
            label={t("assignments.form.field.partTitleOverride")}
            value={form.partTitle ?? ""}
            onChangeText={(v) => {
              update("partTitle", v);
              queueInstant({ partTitle: v });
            }}
            onBlur={flushInstant}
            placeholder={t("assignments.form.placeholder.partTitleOverride")}
            multiline
          />
          <FormField
            label={t("assignments.form.field.durationMinutes")}
            value={form.partDurationMin?.toString() ?? ""}
            onChangeText={(v) => {
              update("partDurationMin", v ? parseInt(v, 10) : undefined);
              queueInstant({
                partDurationMin: v ? parseInt(v, 10) : undefined,
              });
            }}
            onBlur={flushInstant}
            keyboardType="numeric"
            placeholder={t("assignments.form.placeholder.duration")}
          />
          {requiredSkillLabel && (
            <View
              style={{
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderTopWidth: 1,
                borderTopColor: "#f1f5f9",
              }}
            >
              <Text style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4 }}>
                {t("assignments.form.field.requiredSkill")}
              </Text>
              <Text style={{ fontSize: 15, color: "#0f172a" }}>
                {requiredSkillLabel}
              </Text>
            </View>
          )}
          <FormField
            label={t("common.notes")}
            value={form.notes ?? ""}
            onChangeText={(v) => {
              update("notes", v);
              queueInstant({ notes: v });
            }}
            onBlur={flushInstant}
            multiline
          />
        </CollapsibleSection>

        <FormSection title={t("assignments.form.section.status")}>
          {!autosave && (
            <FormChips
              label={t("assignments.form.field.statusLabel")}
              value={form.status ?? "draft"}
              options={STATUS_OPTIONS}
              onChange={(v) => update("status", v)}
            />
          )}
          {autosave ? (
            <Pressable
              style={({ pressed }) => [
                styles.cancelPartLink,
                pressed && styles.cancelPartLinkPressed,
              ]}
              onPress={() => {
                const next =
                  form.status === "cancelled" ? "draft" : "cancelled";
                update("status", next);
                void instant({ status: next });
              }}
            >
              <Text
                style={[
                  styles.cancelPartText,
                  form.status === "cancelled" && styles.restorePartText,
                ]}
              >
                {form.status === "cancelled"
                  ? t("assignments.form.restorePart")
                  : t("assignments.form.cancelPart")}
              </Text>
            </Pressable>
          ) : null}
        </FormSection>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!readOnly && !autosave && (
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.button,
                styles.buttonPrimary,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonPrimaryText}>
                  {effectiveSubmitLabel}
                </Text>
              )}
            </Pressable>
            {onCancel && (
              <Pressable
                style={[styles.button, styles.buttonSecondary]}
                onPress={onCancel}
                disabled={isSubmitting}
              >
                <Text style={styles.buttonSecondaryText}>
                  {t("common.cancel")}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  instantStatus: {
    fontSize: 12,
    color: "#16a34a",
    marginTop: 2,
  },
  instantStatusError: { color: "#dc2626" },
  cancelPartLink: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelPartLinkPressed: { opacity: 0.6 },
  cancelPartText: {
    color: "#dc2626",
    fontSize: 14,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  restorePartText: { color: "#0369a1" },
  contextCard: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginTop: 16,
    gap: 4,
  },
  contextMeta: {
    fontSize: 12,
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  contextChips: { flexDirection: "row", gap: 6, marginTop: 4 },
  contextChip: {
    backgroundColor: "#f1f5f9",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  contextChipText: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  container: { flex: 1, backgroundColor: "#f1f5f9" },
  readonly: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  readonlyLabel: {
    fontSize: 12,
    color: "#94a3b8",
    marginBottom: 2,
  },
  readonlyValue: { fontSize: 15, color: "#0f172a" },
  errorBox: {
    margin: 16,
    padding: 12,
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: 8,
  },
  errorText: { color: "#dc2626", fontSize: 14 },
  actions: { padding: 20, gap: 8 },
  button: { paddingVertical: 14, borderRadius: 8, alignItems: "center" },
  buttonPrimary: { backgroundColor: "#0ea5e9" },
  buttonDisabled: { opacity: 0.6 },
  buttonPrimaryText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  buttonSecondary: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  buttonSecondaryText: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "500",
    fontFamily: "Manrope_500Medium",
  },
  lnInsertBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
  },
  lnInsertText: {
    color: "#0369a1",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
  },
  coSpeakerNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  coSpeakerText: {
    flex: 1,
    fontSize: 14,
    color: "#6d28d9",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  coPickerWrap: { paddingHorizontal: 20, paddingBottom: 14 },
  coPickerLabel: {
    fontSize: 12,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  coChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  coChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    backgroundColor: "#fff",
  },
  coChipActive: { backgroundColor: "#6d28d9", borderColor: "#6d28d9" },
  coChipText: {
    fontSize: 13,
    color: "#6d28d9",
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
  },
  coChipTextActive: { color: "#fff" },
  lnBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 16,
  },
  lnCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    maxHeight: "80%",
  },
  lnHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  lnTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: "Manrope_700Bold",
    color: "#0f172a",
  },
  lnEmpty: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    marginVertical: 24,
    lineHeight: 20,
  },
  lnRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  lnRowTitle: {
    fontSize: 15,
    fontWeight: "600",
    fontFamily: "Manrope_600SemiBold",
    color: "#0f172a",
  },
  lnRowNotes: { fontSize: 13, color: "#64748b", marginTop: 2 },
  lnSearchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  lnSearchInput: { flex: 1, fontSize: 14, color: "#0f172a" },
  lnGroup: {
    fontSize: 11,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
    fontFamily: "Manrope_600SemiBold",
  },
  lnRowUsed: { fontSize: 12, color: "#047857", marginTop: 2 },
  lnRowSpeaker: {
    fontSize: 12,
    color: "#0369a1",
    fontWeight: "500",
    fontFamily: "Manrope_500Medium",
    marginTop: 3,
  },
});

/**
 * Замена докладчика: отдельный лист стилей рядом с самим действием, чтобы его
 * было видно целиком, не листая файл на тысячу строк.
 */
const rp = StyleSheet.create({
  /** Шапка окна: значок и название, чтобы панель читалась как отдельное дело. */
  head: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 },
  title: { fontSize: 14.5, fontWeight: "700", color: "#0c4a6e" },
  /** Подпись ступени: «кто», «что говорит». */
  step: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#0369a1",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginTop: 6,
  },
  search: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#0f172a",
  },
  none: { fontSize: 12.5, color: "#64748b", paddingVertical: 2 },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  linkText: { color: "#0369a1", fontSize: 13, fontWeight: "600" },
  box: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bae6fd",
    backgroundColor: "#f0f9ff",
    gap: 8,
  },
  lead: { fontSize: 13, color: "#0c4a6e", lineHeight: 19 },
  row: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
  },
  rowOn: { borderColor: "#0ea5e9", backgroundColor: "#e0f2fe" },
  rowName: { fontSize: 14, color: "#0f172a", fontWeight: "600" },
  rowCong: { fontSize: 12, color: "#64748b", marginTop: 2 },
  note: { fontSize: 12, color: "#64748b", lineHeight: 17 },
  confirm: {
    backgroundColor: "#0ea5e9",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  confirmOff: { opacity: 0.5 },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  cancel: {
    textAlign: "center",
    color: "#64748b",
    fontSize: 13,
    paddingTop: 4,
  },
});

/** Подсказки из справочника: тише формы, но читаемо. */
const hint = StyleSheet.create({
  box: {
    marginTop: -4,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e0f2fe",
    backgroundColor: "#f8fafc",
    overflow: "hidden",
  },
  lead: {
    fontSize: 11.5,
    color: "#64748b",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  name: { fontSize: 14, color: "#0f172a" },
  cong: { fontSize: 12, color: "#64748b", marginTop: 1 },
});
