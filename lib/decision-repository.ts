import type { Decision } from "./decision-domain";
import { CompleteDecisionSchema, DraftSchema } from "./decision-validation";

const DB_NAME = "decisionlab";
const STORE = "decisions";
const DB_VERSION = 1;
const CHANNEL = "decisionlab";
let tabId: string | null = null;

function getTabId() {
  if (tabId) return tabId;
  tabId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return tabId;
}

export type DecisionChange = {
  decisionId: string;
  revision: number;
  type: "created" | "saved" | "deleted";
};

type DecisionChangeMessage = DecisionChange & { senderId: string };

function migrate(db: IDBDatabase, oldVersion: number) {
  if (oldVersion < 1 && !db.objectStoreNames.contains(STORE)) {
    const store = db.createObjectStore(STORE, { keyPath: "id" });
    store.createIndex("updatedAt", "updatedAt");
  }
}

const open = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = event => migrate(request.result, event.oldVersion);
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const complete = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
});

function notify(change: DecisionChange) {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ ...change, senderId: getTabId() } satisfies DecisionChangeMessage);
    channel.close();
  } catch {}
}

export function subscribeDecisionChanges(listener: (change: DecisionChange) => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  const receive = (event: MessageEvent<DecisionChangeMessage>) => {
    if (event.data.senderId === getTabId()) return;
    const { senderId: _senderId, ...change } = event.data;
    listener(change);
  };
  channel.addEventListener("message", receive);
  return () => { channel.removeEventListener("message", receive); channel.close(); };
}

export async function listDecisions() {
  const db = await open();
  try {
    const values = await complete(db.transaction(STORE).objectStore(STORE).getAll()) as Decision[];
    return values.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}

export type DecisionSummary = {
  id: string;
  revision: number;
  name: string;
  source: Decision["source"];
  optionCount: number;
  criterionCount: number;
  status: "draft" | "complete";
  updatedAt: string;
};

export async function listDecisionSummaries(): Promise<DecisionSummary[]> {
  const db = await open();
  try {
    const summaries = await new Promise<DecisionSummary[]>((resolve, reject) => {
      const results: DecisionSummary[] = [];
      const request = db.transaction(STORE).objectStore(STORE).openCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(results); return; }
        const decision = cursor.value as Decision;
        results.push({
          id: decision.id,
          revision: decision.revision,
          name: decision.name,
          source: decision.source,
          optionCount: decision.options.length,
          criterionCount: decision.criteria.length,
          status: CompleteDecisionSchema.safeParse(decision).success ? "complete" : "draft",
          updatedAt: decision.updatedAt,
        });
        cursor.continue();
      };
    });
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } finally { db.close(); }
}
export async function getDecision(id: string) {
  const db = await open();
  try {
    const value = await complete(db.transaction(STORE).objectStore(STORE).get(id));
    return (value as Decision | undefined) ?? null;
  } finally { db.close(); }
}
export async function createDecision(input: Pick<Decision, "name" | "source" | "options" | "criteria" | "values"> & Partial<Pick<Decision, "description">>) {
  const now = new Date().toISOString();
  const decision = DraftSchema.parse({ ...input, schemaVersion: 1, revision: 1, id: crypto.randomUUID(), createdAt: now, updatedAt: now }) as Decision;
  const db = await open();
  try { await complete(db.transaction(STORE, "readwrite").objectStore(STORE).add(decision)); }
  finally { db.close(); }
  notify({ decisionId: decision.id, revision: decision.revision, type: "created" });
  return decision;
}
export async function saveDecision(decision: Decision, expectedRevision: number) {
  const saved = DraftSchema.parse({ ...decision, revision: expectedRevision + 1, updatedAt: new Date().toISOString() }) as Decision;
  const db = await open();
  try {
    const tx = db.transaction(STORE, "readwrite"); const store = tx.objectStore(STORE);
    const current = await complete(store.get(decision.id)) as Decision | undefined;
    if (!current || current.revision !== expectedRevision) return { status: "conflict" as const, current: current ?? null };
    await complete(store.put(saved));
    notify({ decisionId: saved.id, revision: saved.revision, type: "saved" });
    return { status: "saved" as const, decision: saved };
  } finally { db.close(); }
}
export async function deleteDecision(id: string, expectedRevision: number) {
  const db = await open();
  try {
    const tx = db.transaction(STORE, "readwrite"); const store = tx.objectStore(STORE);
    const current = await complete(store.get(id)) as Decision | undefined;
    if (!current) return { status: "not-found" as const };
    if (current.revision !== expectedRevision) return { status: "conflict" as const, current };
    await complete(store.delete(id)); notify({ decisionId: id, revision: expectedRevision, type: "deleted" }); return { status: "deleted" as const };
  } finally { db.close(); }
}

export async function duplicateDecision(id: string) {
  const source = await getDecision(id);
  if (!source) throw new Error("决策不存在");
  const optionIds = new Map(source.options.map(option => [option.id, crypto.randomUUID()]));
  const criterionIds = new Map(source.criteria.map(criterion => [criterion.id, crypto.randomUUID()]));
  return createDecision({
    name: `${source.name}（副本）`, source: source.source, description: source.description,
    options: source.options.map(option => ({ ...option, id: optionIds.get(option.id)! })),
    criteria: source.criteria.map(criterion => ({ ...criterion, id: criterionIds.get(criterion.id)! })),
    values: source.values.map(value => ({ ...value, optionId: optionIds.get(value.optionId)!, criterionId: criterionIds.get(value.criterionId)! })),
  });
}

export function saveDecisionAsCopy(decision: Decision) {
  return createDecision({
    name: `${decision.name}（冲突副本）`,
    source: decision.source, description: decision.description,
    options: structuredClone(decision.options),
    criteria: structuredClone(decision.criteria),
    values: structuredClone(decision.values),
  });
}
