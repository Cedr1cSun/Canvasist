# Screenshots

Captures the README images from demo mode, so they only ever show made-up courses.

```sh
npm run demo                      # in the repository root: serves http://localhost:1430
cd spikes/screenshots
npm install --ignore-scripts
npm run capture                   # PNGs in out/ (light, dark, menu, settings, sign-in; en and zh-CN)
npm run gif                       # out/star-en.gif, the starring demo used in the README
```

Edge must be installed (Playwright drives it with `channel: "msedge"`). The clock is pinned to a Wednesday afternoon so every group has something in it.
