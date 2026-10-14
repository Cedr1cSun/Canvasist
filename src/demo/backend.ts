// A fake backend for `npm run demo`. The frontend runs in an ordinary browser
// against made-up data, so the UI can be developed and screenshotted without
// a Canvas account. Nothing here contacts a real service or reads real files.
// It is only imported in Vite's demo mode (see main.tsx), never in a build.
//
// URL parameters: `?lang=en|zh-CN`, `?signedOut`, `?update` (shows the banner).
import { emit } from "@tauri-apps/api/event";
import { mockIPC } from "@tauri-apps/api/mocks";
import packageJson from "../../package.json";
import type { Locale } from "../i18n/translate";
import type {
  AuthStatus,
  LanguagePreference,
  Marks,
  Preferences,
  SettingsView,
  Snapshot,
  UpdateInfo,
} from "../ipc";
import { DEMO_ORIGIN, DEMO_SCHOOLS, DEMO_STARRED_ID, demoSnapshot } from "./data";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function languageParam(value: string | null): LanguagePreference {
  return value === "en" || value === "zh-CN" ? value : "system";
}

export function installDemoBackend(): void {
  const params = new URLSearchParams(window.location.search);
  const signedIn: AuthStatus = { state: "signedIn", origin: DEMO_ORIGIN };
  let language = languageParam(params.get("lang"));
  let auth: AuthStatus = params.has("signedOut") ? { state: "signedOut" } : signedIn;
  let snapshot: Snapshot = demoSnapshot(new Date());
  let autostart = true;
  let marks: Marks = {
    done: {},
    dismissed: {},
    starred: { [DEMO_STARRED_ID]: new Date().toISOString() },
  };
  let preferences: Preferences = {
    reminderOffsetsMinutes: [1440, 180],
    hiddenCourses: [],
    showUnsubmittable: false,
    pinStarred: true,
    autoUpdate: true,
  };
  const update: UpdateInfo | null = params.has("update") ? { version: "9.9.9" } : null;

  const settings = (): SettingsView => {
    const system: Locale = navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
    return { language, effectiveLocale: language === "system" ? system : language };
  };
  const setAuth = (next: AuthStatus) => {
    auth = next;
    void emit("auth-changed", auth);
  };
  const mark = (kind: keyof Marks, id: string, on: boolean): Marks => {
    const entries = Object.entries(marks[kind]).filter(([key]) => key !== id);
    if (on) entries.push([id, new Date().toISOString()]);
    marks = { ...marks, [kind]: Object.fromEntries(entries) };
    return marks;
  };

  mockIPC(
    (cmd, payload) => {
      const args = (payload ?? {}) as Record<string, unknown>;
      const id = String(args.id ?? "");
      switch (cmd) {
        case "get_settings":
          return settings();
        case "set_language":
          language = languageParam(String(args.language));
          return settings();
        case "get_autostart":
          return autostart;
        case "set_autostart":
          autostart = Boolean(args.enabled);
          return autostart;
        case "get_app_info":
          return { version: packageJson.version };

        case "search_schools": {
          const query = String(args.query).toLowerCase();
          return delay(300).then(() =>
            DEMO_SCHOOLS.filter((s) => s.name.toLowerCase().includes(query)),
          );
        }
        case "check_canvas_url":
          return delay(300).then(() => DEMO_ORIGIN);
        case "start_canvas_login":
          // Pretend the user signed in on their school's page.
          setTimeout(() => setAuth(signedIn), 1500);
          return null;
        case "cancel_canvas_login":
        case "start_gradescope_login":
        case "open_external":
        case "install_update":
          return null;
        case "get_auth_status":
          return auth;
        case "sign_out":
          setAuth({ state: "signedOut" });
          return null;

        case "get_snapshot":
          return auth.state === "signedOut" ? null : snapshot;
        case "refresh":
          return delay(800).then(() => {
            snapshot = { ...snapshot, fetchedAt: new Date().toISOString() };
            return snapshot;
          });

        case "get_marks":
          return marks;
        case "mark_done":
          return mark("done", id, true);
        case "dismiss":
          return mark("dismissed", id, true);
        case "restore":
          mark("done", id, false);
          return mark("dismissed", id, false);
        case "set_starred":
          return mark("starred", id, Boolean(args.starred));

        case "get_preferences":
          return preferences;
        case "set_reminder_offsets":
          preferences = {
            ...preferences,
            reminderOffsetsMinutes: [...new Set(args.minutes as number[])].sort((a, b) => b - a),
          };
          return preferences;
        case "set_course_hidden": {
          const courseId = String(args.courseId);
          const rest = preferences.hiddenCourses.filter((c) => c !== courseId);
          preferences = { ...preferences, hiddenCourses: args.hidden ? [...rest, courseId] : rest };
          return preferences;
        }
        case "set_show_unsubmittable":
          preferences = { ...preferences, showUnsubmittable: Boolean(args.show) };
          return preferences;
        case "set_pin_starred":
          preferences = { ...preferences, pinStarred: Boolean(args.pin) };
          return preferences;
        case "set_auto_update":
          preferences = { ...preferences, autoUpdate: Boolean(args.enabled) };
          return preferences;
        case "get_update":
          return update;

        default:
          throw new Error(`demo mode does not implement "${cmd}"`);
      }
    },
    { shouldMockEvents: true },
  );
}
