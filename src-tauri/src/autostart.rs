//! Starts Canvasist when the user signs in to Windows, through the per-user
//! `Run` registry key.
//!
//! This replaces tauri-plugin-autostart, which registers the executable path
//! without quotes. A path with spaces (a custom install folder such as
//! `D:\Apps\Canvasist v1`) is then ambiguous: Windows tries each prefix that
//! ends at a space as a program first (`D:\Apps\Canvasist.exe`, ...).
//!
//! The registered path is also refreshed on every start, so autostart keeps
//! working after Canvasist is installed to a different folder.

use std::path::Path;

use crate::error::{AppError, AppResult};

/// Argument the autostart entry launches Canvasist with; the app then starts
/// silently in the tray instead of opening its window.
pub const AUTOSTART_ARG: &str = "--autostart";

/// The command line registered for `exe`, with the path always quoted.
pub fn command_line(exe: &Path) -> String {
    format!("\"{}\" {AUTOSTART_ARG}", exe.display())
}

#[cfg(windows)]
mod registry {
    use windows_registry::{Key, CURRENT_USER};

    use super::{AppError, AppResult};

    /// Where a startup entry lives. Tests use their own keys, so they never
    /// touch a real autostart entry.
    pub struct Entry<'a> {
        pub run_key: &'static str,
        /// Task Manager's Startup tab records the user's on/off choice here.
        pub approved_key: &'static str,
        pub name: &'a str,
    }

    /// The entry for the product `name`. The uninstaller removes the value
    /// named after the product, and a build with another product name (such
    /// as a test build) never touches Canvasist's own entry.
    pub fn entry(name: &str) -> Entry<'_> {
        Entry {
            run_key: r"Software\Microsoft\Windows\CurrentVersion\Run",
            approved_key: r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run",
            name,
        }
    }

    /// What Task Manager writes for an entry that is switched on.
    const APPROVED_ENABLED: [u8; 12] = [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    fn is_not_found(e: &windows_registry::Result<()>) -> bool {
        // HRESULT_FROM_WIN32(ERROR_FILE_NOT_FOUND)
        matches!(e, Err(err) if err.code().0 as u32 == 0x8007_0002)
    }

    fn error(e: impl std::fmt::Display) -> AppError {
        AppError::Autostart(e.to_string())
    }

    fn open(path: &str) -> Option<Key> {
        CURRENT_USER.open(path).ok()
    }

    impl Entry<'_> {
        /// The registered command line, if any.
        pub fn registered(&self) -> Option<String> {
            open(self.run_key)?.get_string(self.name).ok()
        }

        /// False when there is no entry or the user switched it off in Task
        /// Manager (whose value then has a non-zero timestamp in its last 8 bytes).
        pub fn is_enabled(&self) -> bool {
            if self.registered().is_none() {
                return false;
            }
            match open(self.approved_key).and_then(|k| k.get_value(self.name).ok()) {
                Some(value) if value.len() >= 8 => value[value.len() - 8..].iter().all(|b| *b == 0),
                _ => true,
            }
        }

        pub fn enable(&self, command_line: &str) -> AppResult<()> {
            CURRENT_USER
                .create(self.run_key)
                .and_then(|k| k.set_string(self.name, command_line))
                .map_err(error)?;
            // Undo a Task Manager "disabled" choice, which would otherwise win.
            if let Ok(key) = CURRENT_USER
                .options()
                .read()
                .write()
                .open(self.approved_key)
            {
                if key.get_value(self.name).is_ok() {
                    key.set_bytes(self.name, windows_registry::Type::Bytes, &APPROVED_ENABLED)
                        .map_err(error)?;
                }
            }
            Ok(())
        }

        pub fn disable(&self) -> AppResult<()> {
            let Ok(key) = CURRENT_USER.options().write().open(self.run_key) else {
                return Ok(());
            };
            let removed = key.remove_value(self.name);
            if is_not_found(&removed) {
                return Ok(());
            }
            removed.map_err(error)
        }
    }
}

// Each function takes the product name (`PackageInfo::name`), which names the
// registry value.

/// True when the app starts with Windows.
pub fn is_enabled(product: &str) -> bool {
    #[cfg(windows)]
    return registry::entry(product).is_enabled();
    #[cfg(not(windows))]
    {
        let _ = product;
        false
    }
}

pub fn set_enabled(product: &str, enabled: bool) -> AppResult<()> {
    #[cfg(windows)]
    {
        let entry = registry::entry(product);
        if enabled {
            entry.enable(&command_line(&std::env::current_exe()?))
        } else {
            entry.disable()
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (product, enabled);
        Err(AppError::Autostart("only supported on Windows".into()))
    }
}

/// Re-registers the current executable when the entry points elsewhere (the
/// app was installed to another folder) or was written without quotes. Does
/// nothing when autostart is off, so a user's choice is never overridden.
pub fn refresh(product: &str) -> AppResult<()> {
    #[cfg(windows)]
    {
        let entry = registry::entry(product);
        let Some(registered) = entry.registered() else {
            return Ok(());
        };
        let expected = command_line(&std::env::current_exe()?);
        if registered != expected {
            entry.enable(&expected)?;
            log::info!("autostart entry updated to this installation");
        }
    }
    #[cfg(not(windows))]
    let _ = product;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_path_is_always_quoted() {
        assert_eq!(
            command_line(Path::new(r"D:\Apps\Canvasist v1\canvasist.exe")),
            r#""D:\Apps\Canvasist v1\canvasist.exe" --autostart"#
        );
    }

    #[cfg(windows)]
    #[test]
    fn enable_disable_round_trip_in_a_test_key() {
        use registry::Entry;
        use windows_registry::CURRENT_USER;

        const BASE: &str = r"Software\Canvasist-autostart-test";
        let entry = Entry {
            run_key: r"Software\Canvasist-autostart-test\Run",
            approved_key: r"Software\Canvasist-autostart-test\Approved",
            name: "CanvasistTest",
        };
        let _ = CURRENT_USER.remove_tree(BASE);

        assert!(!entry.is_enabled());
        entry.enable(r#""C:\a b\c.exe" --autostart"#).unwrap();
        assert!(entry.is_enabled());
        assert_eq!(
            entry.registered().as_deref(),
            Some(r#""C:\a b\c.exe" --autostart"#)
        );

        // Switched off in Task Manager: a timestamp in the last 8 bytes.
        let approved = CURRENT_USER.create(entry.approved_key).unwrap();
        approved
            .set_bytes(
                entry.name,
                windows_registry::Type::Bytes,
                &[3, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8],
            )
            .unwrap();
        assert!(!entry.is_enabled());
        // Turning it on in Canvasist undoes that.
        entry.enable(r#""C:\a b\c.exe" --autostart"#).unwrap();
        assert!(entry.is_enabled());

        entry.disable().unwrap();
        assert!(!entry.is_enabled());
        entry.disable().unwrap(); // already off: still fine

        CURRENT_USER.remove_tree(BASE).unwrap();
    }
}
