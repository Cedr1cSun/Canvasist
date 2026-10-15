# Contributing to Canvasist

Thanks for helping! Bug reports, ideas and pull requests are all welcome, in English or Chinese.

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md) ([中文翻译](https://www.contributor-covenant.org/zh-cn/version/2/1/code_of_conduct/)).

## Keep personal data out of issues

Canvasist handles school sign-in sessions, so please never post:

- passwords, cookies, session data or anything copied from the sign-in window,
- course names, assignment titles or grades,
- screenshots of the app while you are signed in (describe the problem, or use [demo mode](#development) to show it).

Canvasist's log never contains any of these, so it is safe to attach. It is at
`%LOCALAPPDATA%\io.github.immortalkilan.canvasist\logs\Canvasist.log`.

Security problems go through a private report instead of an issue; see [SECURITY.md](SECURITY.md).

## Before you start

- For a bug, open an issue with the steps to reproduce it.
- For anything larger than a small fix, open an issue first so we can agree on the approach before you spend time on it.

## Development

**Prerequisites (Windows):** Node.js 24+, the Rust stable toolchain (MSVC), Visual Studio C++ Build Tools, and WebView2 (preinstalled on Windows 11).

```sh
npm ci                 # install frontend dependencies (install scripts are disabled by .npmrc)
npm run demo           # the UI alone in a browser at http://localhost:1430, with made-up data
npm run tauri dev      # the full app with hot reload; needs a Canvas account to sign in
```

Demo mode needs no Canvas account and is the right place for UI work and screenshots.

## Checks

Pull requests must pass the same checks as CI:

```sh
npm run typecheck && npm run lint && npm run format:check && npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

## Guidelines

- Match the style of the surrounding code. Comments are in English.
- Put pure logic in tested modules (for example `grouping.ts`, `reminders.rs`) and add tests for what you change.
- Test fixtures and examples use generic hosts such as `canvas.example.edu`, never a real school.
- Logs may contain counts and status labels only: no cookies, credentials, course names, assignment titles or grades.
- Windows that show remote pages (Canvas or Gradescope sign-in) must never be given access to Canvasist's commands, and the Content Security Policy stays strict.
- A new command for the window needs five changes; see "Rules that span files" in [CLAUDE.md](CLAUDE.md).
- User-facing text goes in `src/i18n/en.ts` with a Chinese translation in `zh-CN.ts`. If you don't speak Chinese, add the English text there too and say so in the pull request.

## Pull requests

- Keep each pull request focused on one change, with commit subjects in the imperative ("Fix …", "Add …").
- Describe what changed and why, and how you tested it.
- For UI changes, include screenshots from demo mode.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
