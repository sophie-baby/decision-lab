import type { Decision } from "./decision-domain";
import { DraftSchema } from "./decision-validation";

export type AutosaveStatus = "saved" | "dirty" | "saving" | "failed" | "conflict";
export type AutosaveState = {
  status: AutosaveStatus;
  hasInvalidInput: boolean;
  error?: unknown;
  conflict?: Decision;
};

type SaveResult = { status: "saved"; decision: Decision } | { status: "conflict"; current: Decision | null };

export type AutosaveControllerOptions = {
  initial: Decision;
  save: (decision: Decision, expectedRevision: number) => Promise<SaveResult>;
  onStateChange?: (state: AutosaveState) => void;
  debounceMs?: number;
};

export class AutosaveController {
  private state: AutosaveState = { status: "saved", hasInvalidInput: false };
  private persisted: Decision;
  private pending: Decision | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active: Promise<void> | null = null;
  private stopped = false;
  private paused = false;

  constructor(private readonly options: AutosaveControllerOptions) {
    this.persisted = structuredClone(options.initial);
  }

  getState() { return this.state; }
  getPersisted() { return structuredClone(this.persisted); }
  shouldWarnBeforeUnload() { return this.state.hasInvalidInput || this.state.status !== "saved"; }

  update(input: unknown, alreadyValidated = false) {
    if (this.stopped) return;
    const parsed = alreadyValidated ? { success: true as const, data: input } : DraftSchema.safeParse(input);
    if (!parsed.success) {
      this.pending = null;
      this.clearTimer();
      this.setState({ status: "dirty", hasInvalidInput: true });
      return;
    }
    this.pending = structuredClone(parsed.data) as Decision;
    this.setState({ status: "dirty", hasInvalidInput: false });
    this.clearTimer();
    if (this.paused) return;
    this.timer = setTimeout(() => { void this.flush(); }, this.options.debounceMs ?? 800);
  }

  blur() { return this.flush(); }

  async flush(): Promise<void> {
    this.clearTimer();
    if (this.stopped || this.paused || this.state.hasInvalidInput || this.state.status === "conflict") return;
    if (this.active) {
      await this.active;
      if (this.pending && this.state.status === "dirty") await this.flush();
      return;
    }
    if (!this.pending) return;

    const snapshot = this.pending;
    this.pending = null;
    const expectedRevision = this.persisted.revision;
    snapshot.revision = expectedRevision;
    this.setState({ status: "saving", hasInvalidInput: false });
    this.active = this.performSave(snapshot, expectedRevision);
    await this.active;
    this.active = null;
    if (this.pending && this.state.status === "dirty") await this.flush();
  }

  async retry() {
    if (this.state.status !== "failed") return;
    if (!this.pending) this.pending = structuredClone(this.persisted);
    await this.flush();
  }

  pause() {
    if (this.stopped) return;
    this.paused = true;
    this.clearTimer();
  }

  resume() {
    if (this.stopped) return;
    this.paused = false;
    if (this.pending && !this.state.hasInvalidInput && this.state.status !== "conflict") {
      this.clearTimer();
      this.timer = setTimeout(() => { void this.flush(); }, this.options.debounceMs ?? 800);
    }
  }

  loadLatest(decision: Decision) {
    this.paused = false;
    this.pending = null;
    this.persisted = structuredClone(decision);
    this.setState({ status: "saved", hasInvalidInput: false });
  }

  stop() {
    this.stopped = true;
    this.clearTimer();
  }

  private async performSave(snapshot: Decision, expectedRevision: number) {
    try {
      const result = await this.options.save(snapshot, expectedRevision);
      if (result.status === "conflict") {
        this.pending = snapshot;
        this.setState({ status: "conflict", hasInvalidInput: false, conflict: result.current ?? undefined });
        return;
      }
      this.persisted = structuredClone(result.decision);
      this.setState({ status: this.pending ? "dirty" : "saved", hasInvalidInput: false });
    } catch (error) {
      if (!this.pending) this.pending = snapshot;
      this.setState({ status: "failed", hasInvalidInput: false, error });
    }
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private setState(state: AutosaveState) {
    this.state = state;
    this.options.onStateChange?.(state);
  }
}
