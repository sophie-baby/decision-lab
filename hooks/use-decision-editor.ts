"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AutosaveController, type AutosaveStatus } from "@/lib/autosave-controller";
import { validateBuilderStep, type BuilderStep } from "@/lib/builder-validation";
import type { Decision } from "@/lib/decision-domain";
import { getDecision, saveDecision, saveDecisionAsCopy, subscribeDecisionChanges, type DecisionChange } from "@/lib/decision-repository";
import { DraftSchema, getMissingDecisionItemsFromDecision } from "@/lib/decision-validation";

export type EditorConflict = { local: Decision; current: Decision | null };

export function useDecisionEditor(id: string, step: BuilderStep) {
  const router = useRouter();
  const [draft, setDraft] = useState<Decision | null>(null);
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const [message, setMessage] = useState("正在加载…");
  const [externalChange, setExternalChange] = useState<DecisionChange | null>(null);
  const [conflict, setConflict] = useState<EditorConflict | null>(null);
  const controller = useRef<AutosaveController | null>(null);
  const first = useRef(true);
  const skipNextDraftUpdate = useRef(false);
  const draftParse = useMemo(() => draft ? DraftSchema.safeParse(draft) : null, [draft]);
  const draftValid = draftParse?.success === true;
  const missing = useMemo(() => draftParse?.success ? getMissingDecisionItemsFromDecision(draftParse.data as Decision) : [], [draftParse]);

  useEffect(() => {
    let active = true;
    first.current = true;
    setDraft(null);
    setStatus("saved");
    setMessage("正在加载…");
    setExternalChange(null);
    setConflict(null);
    void getDecision(id).then(decision => {
      if (!active) return;
      if (!decision) { setMessage("这份决策不存在或已被删除。"); return; }
      setDraft(decision);
      setMessage("");
      controller.current = new AutosaveController({
        initial: decision,
        save: async (snapshot, expectedRevision) => {
          const result = await saveDecision(snapshot, expectedRevision);
          if (result.status === "conflict") setConflict({ local: snapshot, current: result.current });
          return result;
        },
        onStateChange: state => setStatus(state.status),
      });
    }).catch(() => setMessage("无法读取本地决策，请检查浏览器存储权限。"));
    return () => { active = false; controller.current?.stop(); controller.current = null; };
  }, [id]);

  useEffect(() => subscribeDecisionChanges(change => {
    if (change.decisionId !== id) return;
    controller.current?.pause();
    setExternalChange(change);
    setMessage(change.type === "deleted" ? "这份决策已在其他标签页删除。" : "这份决策已在其他标签页中更新。");
  }), [id]);

  useEffect(() => {
    if (!draft || !controller.current) return;
    if (first.current) { first.current = false; return; }
    if (skipNextDraftUpdate.current) { skipNextDraftUpdate.current = false; return; }
    controller.current.update(draft, draftValid);
  }, [draft, draftValid]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (controller.current?.shouldWarnBeforeUnload()) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const patch = useCallback((update: (current: Decision) => Decision) => setDraft(current => current ? update(current) : current), []);
  const flush = useCallback(async () => {
    await controller.current?.flush();
    return controller.current?.getState().status === "saved";
  }, []);
  const retry = useCallback(() => controller.current?.retry(), []);
  const onEditorBlur = useCallback((currentTarget: HTMLElement, relatedTarget: EventTarget | null) => {
    if (relatedTarget instanceof Node && currentTarget.contains(relatedTarget)) return;
    void controller.current?.blur();
  }, []);

  const go = useCallback(async (target: BuilderStep) => {
    if (!draft) return;
    const errors = validateBuilderStep(draft, step);
    if (errors.length) {
      setMessage(errors[0].message);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-error-key="${errors[0].key}"]`)?.focus());
      return;
    }
    if (!draftValid) { setMessage("当前草稿结构无效，请检查已有数据。"); return; }
    await controller.current?.flush();
    if (controller.current?.getState().status !== "saved") return;
    router.push(`/decisions/${draft.id}/${target}`);
  }, [draft, draftValid, router, step]);

  const loadLatest = useCallback(async () => {
    try {
      const latest = await getDecision(id);
      if (!latest) { setMessage("最新版本已不存在。"); return; }
      controller.current?.loadLatest(latest);
      skipNextDraftUpdate.current = true;
      setDraft(latest);
      setExternalChange(null);
      setMessage("已加载最新版本");
    } catch {
      setMessage("加载最新版本失败，请检查浏览器本地存储。");
    }
  }, [id]);

  const continueEditing = useCallback(() => {
    controller.current?.resume();
    setExternalChange(null);
    setMessage("已继续编辑；保存时如有冲突会要求你选择处理方式。");
  }, []);

  const loadConflictCurrent = useCallback(() => {
    if (!conflict?.current) return;
    controller.current?.loadLatest(conflict.current);
    skipNextDraftUpdate.current = true;
    setDraft(conflict.current);
    setConflict(null);
    setExternalChange(null);
  }, [conflict]);

  const saveCopy = useCallback(async (source: Decision, suffixStep = step) => {
    try {
      const copy = await saveDecisionAsCopy(source);
      router.push(`/decisions/${copy.id}/${suffixStep}`);
    } catch {
      setMessage("另存副本失败，请检查浏览器本地存储。");
    }
  }, [router, step]);

  return { draft, status, message, setMessage, externalChange, conflict, setConflict, draftValid, missing, patch, go, flush, retry, onEditorBlur, loadLatest, continueEditing, loadConflictCurrent, saveCopy };
}
