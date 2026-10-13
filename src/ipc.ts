// Typed wrappers around the Rust commands and events. Names and payloads must
// match src-tauri/src/commands.rs and src-tauri/src/account.rs.
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Locale } from "./i18n/translate";

export type LanguagePreference = "system" | Locale;

export interface SettingsView {
  language: LanguagePreference;
  effectiveLocale: Locale;
}

export interface AppInfo {
  version: string;
}

/** A downloaded, verified update waiting to be installed. */
export interface UpdateInfo {
  version: string;
}

export interface School {
  name: string;
  url: string;
}

export type AuthStatus =
  | { state: "signedOut" }
  | { state: "signedIn"; origin: string }
  | { state: "expired"; origin: string };

export type AssignmentStatus =
  "notSubmitted" | "submitted" | "late" | "graded" | "missing" | "excused";

export type SubmissionKind = "online" | "onPaper" | "noSubmission" | "notGraded";

export type Source = "canvas" | "gradescope";

/** Outcome of the Gradescope part of the last refresh. */
export type GradescopeState =
  "ok" | "notLinked" | "needsCanvasLogin" | "needsGradescopeLogin" | "unavailable";

export interface Course {
  id: string;
  code: string;
  name: string;
  source: Source;
}

export interface Assignment {
  id: string;
  courseId: string;
  title: string;
  dueAt: string;
  lateDueAt: string | null;
  url: string | null;
  kind: SubmissionKind;
  status: AssignmentStatus;
  source: Source;
  linksToGradescope: boolean;
  /** A Gradescope entry that also appeared on Canvas and was merged. */
  alsoInCanvas: boolean;
  /** Canvas's deadline for a merged entry, only when it differs. */
  canvasDueAt: string | null;
}

export interface Preferences {
  /** Minutes before a deadline at which to remind, largest first. */
  reminderOffsetsMinutes: number[];
  hiddenCourses: string[];
  showUnsubmittable: boolean;
  /** Show starred open work in its own group at the top. */
  pinStarred: boolean;
  /** Check for a new version once a day and download it in the background. */
  autoUpdate: boolean;
}

/** The user's local marks: assignment ID -> when it was marked. */
export interface Marks {
  done: Record<string, string>;
  dismissed: Record<string, string>;
  /** Starred as important; independent of done and dismissed. */
  starred: Record<string, string>;
}

export interface Snapshot {
  fetchedAt: string;
  courses: Course[];
  assignments: Assignment[];
  gradescope: GradescopeState;
}

export type ErrorKind =
  | "io"
  | "data"
  | "autostart"
  | "internal"
  | "network"
  | "crypto"
  | "invalidUrl"
  | "notCanvas"
  | "notSignedIn"
  | "sessionExpired"
  | "canvas"
  | "busy"
  | "gradescopeAuth"
  | "gradescope"
  | "invalidInput"
  | "update";

export interface AppError {
  kind: ErrorKind;
  message: string;
}

export const api = {
  getSettings: () => invoke<SettingsView>("get_settings"),
  setLanguage: (language: LanguagePreference) => invoke<SettingsView>("set_language", { language }),
  getAutostart: () => invoke<boolean>("get_autostart"),
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),

  searchSchools: (query: string) => invoke<School[]>("search_schools", { query }),
  checkCanvasUrl: (input: string) => invoke<string>("check_canvas_url", { input }),
  startCanvasLogin: (origin: string) => invoke<null>("start_canvas_login", { origin }),
  cancelCanvasLogin: () => invoke<null>("cancel_canvas_login"),
  startGradescopeLogin: () => invoke<null>("start_gradescope_login"),
  getAuthStatus: () => invoke<AuthStatus>("get_auth_status"),
  signOut: () => invoke<null>("sign_out"),

  getSnapshot: () => invoke<Snapshot | null>("get_snapshot"),
  refresh: () => invoke<Snapshot>("refresh"),
  openExternal: (url: string) => invoke<null>("open_external", { url }),

  getMarks: () => invoke<Marks>("get_marks"),
  markDone: (id: string) => invoke<Marks>("mark_done", { id }),
  dismiss: (id: string) => invoke<Marks>("dismiss", { id }),
  restore: (id: string) => invoke<Marks>("restore", { id }),
  setStarred: (id: string, starred: boolean) => invoke<Marks>("set_starred", { id, starred }),

  getPreferences: () => invoke<Preferences>("get_preferences"),
  setReminderOffsets: (minutes: number[]) =>
    invoke<Preferences>("set_reminder_offsets", { minutes }),
  setCourseHidden: (courseId: string, hidden: boolean) =>
    invoke<Preferences>("set_course_hidden", { courseId, hidden }),
  setShowUnsubmittable: (show: boolean) => invoke<Preferences>("set_show_unsubmittable", { show }),
  setPinStarred: (pin: boolean) => invoke<Preferences>("set_pin_starred", { pin }),
  setAutoUpdate: (enabled: boolean) => invoke<Preferences>("set_auto_update", { enabled }),

  getUpdate: () => invoke<UpdateInfo | null>("get_update"),
  /** Starts the installer, which closes and restarts Canvasist. */
  installUpdate: () => invoke<null>("install_update"),
};

export const events = {
  onAuthChanged: (handler: (status: AuthStatus) => void): Promise<UnlistenFn> =>
    listen<AuthStatus>("auth-changed", (e) => handler(e.payload)),
  onLoginCancelled: (handler: () => void): Promise<UnlistenFn> =>
    listen("canvas-login-cancelled", () => handler()),
  onSnapshotUpdated: (handler: (snapshot: Snapshot) => void): Promise<UnlistenFn> =>
    listen<Snapshot>("snapshot-updated", (e) => handler(e.payload)),
  onGradescopeLoginCompleted: (handler: () => void): Promise<UnlistenFn> =>
    listen("gradescope-login-completed", () => handler()),
  onUpdateReady: (handler: (update: UpdateInfo) => void): Promise<UnlistenFn> =>
    listen<UpdateInfo>("update-ready", (e) => handler(e.payload)),
};

function isAppError(e: unknown): e is AppError {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as AppError).kind === "string" &&
    typeof (e as AppError).message === "string"
  );
}

/** Normalizes anything thrown by `invoke` into an `AppError`. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (typeof e === "string") return { kind: "internal", message: e };
  if (e instanceof Error) return { kind: "internal", message: e.message };
  return { kind: "internal", message: String(e) };
}

/** Human-readable detail for errors whose kind has no dedicated message. */
export function errorMessage(e: unknown): string {
  return toAppError(e).message;
}
