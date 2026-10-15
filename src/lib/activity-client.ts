import type { ActivityAction, ActivityState } from "./activity-types";
import { APP_STAGES } from "./types";

const empty = (): ActivityState => ({ applications: [], saved: [], notifications: [] });

export function activitySlice(state: ActivityState): ActivityState {
  return { applications: state.applications, saved: state.saved, notifications: state.notifications };
}

/** Apply the same intent in demo mode and while a signed-in write is pending. */
function optimistic(state: ActivityState, action: ActivityAction): ActivityState {
  switch (action.type) {
    case "apply":
      return state.applications.some((a) => a.opportunityId === action.opportunityId)
        ? state
        : { ...state, applications: [{ id: action.applicationId, opportunityId: action.opportunityId,
            stage: "Applied", updatedDaysAgo: 0, ...(action.note ? { note: action.note } : {}) }, ...state.applications] };
    case "advance":
      return { ...state, applications: state.applications.map((a) => a.id === action.applicationId && a.stage === action.expectedStage
        ? { ...a, stage: APP_STAGES[Math.min(APP_STAGES.indexOf(a.stage) + 1, APP_STAGES.length - 1)], updatedDaysAgo: 0 } : a) };
    case "saved":
      return { ...state, saved: action.saved
        ? state.saved.includes(action.opportunityId) ? state.saved : [action.opportunityId, ...state.saved]
        : state.saved.filter((id) => id !== action.opportunityId) };
    case "read":
      return { ...state, notifications: state.notifications.map((n) => action.notificationIds.includes(n.id) ? { ...n, unread: false } : n) };
  }
}

/** Serial writes prevent response ordering from undoing a later optimistic edit.
 * A failed intent is removed, then remaining intents are replayed over the last
 * confirmed server snapshot, rather than restoring an obsolete whole-store copy.
 */
export class ActivityClient {
  private confirmed: ActivityState;
  private pending: ActivityAction[] = [];
  private userId: string | null = null;
  private epoch = 0;
  private running = false;
  revision = 0;
  state: ActivityState;

  constructor(initial: ActivityState, private publish: (state: ActivityState) => void) {
    this.confirmed = activitySlice(initial);
    this.state = this.confirmed;
  }

  reset(userId: string | null, state: ActivityState = empty()) {
    this.epoch++;
    this.revision++;
    this.userId = userId;
    this.pending = [];
    this.running = false;
    this.confirmed = activitySlice(state);
    this.render();
  }

  dispose() {
    this.epoch++;
    this.revision++;
    this.pending = [];
    this.running = false;
  }

  belongsTo(userId: string | null) { return this.userId === userId; }

  hydrate(state: ActivityState, revision: number) {
    // A slow read must not overwrite edits made since that read began.
    if (revision !== this.revision || this.pending.length) return;
    this.confirmed = activitySlice(state);
    this.render();
  }

  dispatch(action: ActivityAction) {
    this.revision++;
    if (!this.userId) {
      this.confirmed = optimistic(this.confirmed, action);
      this.render();
      return;
    }
    this.pending.push(action);
    this.render();
    void this.drain(this.epoch);
  }

  private render() {
    this.state = this.pending.reduce(optimistic, this.confirmed);
    this.publish(this.state);
  }

  private async drain(epoch: number) {
    if (this.running) return;
    this.running = true;
    while (epoch === this.epoch && this.pending.length) {
      const action = this.pending[0];
      try {
        const res = await fetch("/api/activity", {
          method: "POST", headers: { "content-type": "application/json", "x-earnly-user": this.userId! }, body: JSON.stringify(action),
        });
        const data = await res.json();
        if (!res.ok || !data.activity) throw new Error(typeof data.error === "string" ? data.error : "Activity could not be saved.");
        if (epoch !== this.epoch) return;
        this.confirmed = data.activity;
      } catch (error) {
        if (epoch !== this.epoch) return;
        console.error("[earnly] activity save failed; rolled back", error);
      }
      this.pending.shift();
      this.revision++;
      this.render();
    }
    if (epoch === this.epoch) this.running = false;
  }
}
