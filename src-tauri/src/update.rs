//! Automatic updates (discussion Rounds 15 and 16).
//!
//! A few minutes after start and then once a day, Canvasist fetches the latest
//! GitHub release's `latest.json`. A newer version is downloaded in the
//! background, and the updater plugin checks its signature against the public
//! key built into the app (`plugins.updater.pubkey` in `tauri.conf.json`).
//! `requireSignedVersion` also makes the signature name the announced version,
//! so an older signed installer cannot be passed off as a newer one. The update
//! is installed only when the user chooses to restart; Canvasist never restarts
//! on its own.
//!
//! The plugin's own commands are not granted to any window. The main window
//! uses the commands in `commands.rs` instead.

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, SystemTime};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::{AppError, AppResult};
use crate::notify;
use crate::settings::SettingsStore;

/// Emitted with an [`UpdateInfo`] once an update has been downloaded and verified.
pub const EVENT_UPDATE_READY: &str = "update-ready";

/// The first check waits a little so it does not compete with the first refresh.
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(2 * 60);
/// Discussion Round 15: check once a day.
const CHECK_INTERVAL: Duration = Duration::from_secs(24 * 60 * 60);
/// After a failed check (offline, GitHub unreachable), try again sooner.
const RETRY_AFTER: Duration = Duration::from_secs(60 * 60);
/// Limit for fetching `latest.json`.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
/// Limit for a whole check, including the download.
const CHECK_TIMEOUT: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
}

/// A downloaded update whose signature has been verified.
struct Ready {
    update: Update,
    bytes: Vec<u8>,
}

pub struct Updates {
    state: Mutex<State>,
}

struct State {
    next_check: SystemTime,
    checking: bool,
    ready: Option<Ready>,
}

impl Updates {
    pub fn new(now: SystemTime) -> Self {
        Self {
            state: Mutex::new(State {
                next_check: now + FIRST_CHECK_DELAY,
                checking: false,
                ready: None,
            }),
        }
    }

    /// The update that is ready to install, if any.
    pub fn ready(&self) -> Option<UpdateInfo> {
        self.lock().ready.as_ref().map(|r| UpdateInfo {
            version: r.update.version.clone(),
        })
    }

    /// Checks on the scheduler's next tick, e.g. after the user turned
    /// automatic updates back on.
    pub fn check_soon(&self) {
        self.lock().next_check = SystemTime::UNIX_EPOCH;
    }

    /// Marks a check as running when one is due. Returns false when none is
    /// due or one is already running.
    fn begin_check(&self, now: SystemTime) -> bool {
        let mut state = self.lock();
        // A wall clock set back would otherwise postpone checks indefinitely.
        let clock_moved_back = state
            .next_check
            .duration_since(now)
            .is_ok_and(|wait| wait > CHECK_INTERVAL);
        if state.checking || (now < state.next_check && !clock_moved_back) {
            return false;
        }
        state.checking = true;
        true
    }

    fn end_check(&self, next_check: SystemTime) {
        let mut state = self.lock();
        state.checking = false;
        state.next_check = next_check;
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        // The state is replaced as a whole, so a panic cannot leave it half-updated.
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Called by the scheduler on every tick. Starts a background check when one
/// is due and automatic updates are on. Debug builds never update themselves.
pub fn tick(app: &AppHandle, now: SystemTime) {
    if cfg!(debug_assertions) || !app.state::<SettingsStore>().get().auto_update {
        return;
    }
    if !app.state::<Updates>().begin_check(now) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let result = tokio::time::timeout(CHECK_TIMEOUT, check_and_download(&app))
            .await
            .unwrap_or_else(|_| Err(AppError::Update("the check timed out".into())));
        let wait = match result {
            Ok(()) => CHECK_INTERVAL,
            Err(e) => {
                log::warn!("update check failed: {e}");
                RETRY_AFTER
            }
        };
        app.state::<Updates>().end_check(SystemTime::now() + wait);
    });
}

async fn check_and_download(app: &AppHandle) -> AppResult<()> {
    let updater = app.updater_builder().timeout(REQUEST_TIMEOUT).build()?;
    let Some(update) = updater.check().await? else {
        log::info!("update check: Canvasist is up to date");
        return Ok(());
    };
    let updates = app.state::<Updates>();
    if updates.ready().is_some_and(|r| r.version == update.version) {
        return Ok(());
    }
    log::info!("update check: version {} is available", update.version);
    // `download` verifies the signature and returns an error if it does not match.
    let bytes = update.download(|_, _| {}, || {}).await?;
    let info = UpdateInfo {
        version: update.version.clone(),
    };
    updates.lock().ready = Some(Ready { update, bytes });
    log::info!("update {} downloaded and verified", info.version);
    if let Err(e) = app.emit(EVENT_UPDATE_READY, &info) {
        log::warn!("could not announce the update: {e}");
    }
    notify::send_update_ready(app, &info.version);
    Ok(())
}

/// Installs the downloaded update. On Windows the plugin starts the installer
/// and exits the app, so this only returns on failure. The installer starts
/// Canvasist again when it finishes.
pub fn install(app: &AppHandle) -> AppResult<()> {
    let updates = app.state::<Updates>();
    // Taken out so that a second click cannot start a second installer.
    let ready = updates
        .lock()
        .ready
        .take()
        .ok_or_else(|| AppError::Update("no update has been downloaded".into()))?;
    let version = ready.update.version.clone();
    let store = app.state::<SettingsStore>();
    store.update(|s| s.updating_to = Some(version.clone()))?;
    log::info!("installing update {version}");
    let result = ready.update.install(&ready.bytes);
    // Only reached when the installer could not be started.
    if let Err(e) = store.update(|s| s.updating_to = None) {
        log::warn!("could not clear the update marker: {e}");
    }
    updates.lock().ready = Some(ready);
    Err(match result {
        Ok(()) => AppError::Update("the installer did not start".into()),
        Err(e) => e.into(),
    })
}

/// True when this start follows an update the user chose to install, so the
/// window opens again even though the app may have been started at sign-in
/// (the installer restarts it with the same arguments). Clears the marker.
pub fn take_restart_marker(app: &AppHandle) -> bool {
    let store = app.state::<SettingsStore>();
    let Some(version) = store.get().updating_to else {
        return false;
    };
    if let Err(e) = store.update(|s| s.updating_to = None) {
        log::warn!("could not clear the update marker: {e}");
    }
    let updated = version == app.package_info().version.to_string();
    if updated {
        log::info!("started after updating to {version}");
    } else {
        log::warn!("the update to {version} was not installed");
    }
    updated
}

#[cfg(test)]
mod tests {
    use super::*;

    fn start() -> SystemTime {
        SystemTime::UNIX_EPOCH + Duration::from_secs(1_800_000_000)
    }

    #[test]
    fn first_check_waits_for_the_start_delay() {
        let updates = Updates::new(start());
        assert!(!updates.begin_check(start()));
        assert!(!updates.begin_check(start() + FIRST_CHECK_DELAY - Duration::from_secs(1)));
        assert!(updates.begin_check(start() + FIRST_CHECK_DELAY));
    }

    #[test]
    fn only_one_check_runs_at_a_time() {
        let updates = Updates::new(start());
        let due = start() + FIRST_CHECK_DELAY;
        assert!(updates.begin_check(due));
        assert!(!updates.begin_check(due + Duration::from_secs(30)));
        updates.end_check(due + CHECK_INTERVAL);
        assert!(!updates.begin_check(due + Duration::from_secs(60)));
        assert!(updates.begin_check(due + CHECK_INTERVAL));
    }

    #[test]
    fn check_soon_makes_a_check_due() {
        let updates = Updates::new(start());
        updates.check_soon();
        assert!(updates.begin_check(start()));
    }

    #[test]
    fn a_clock_set_back_does_not_postpone_checks() {
        let updates = Updates::new(start());
        let due = start() + FIRST_CHECK_DELAY;
        assert!(updates.begin_check(due));
        updates.end_check(due + CHECK_INTERVAL);
        // The clock jumps back two days: the next check would be three days away.
        assert!(updates.begin_check(due - 2 * CHECK_INTERVAL));
    }

    #[test]
    fn nothing_is_ready_at_first() {
        assert_eq!(Updates::new(start()).ready(), None);
    }
}
