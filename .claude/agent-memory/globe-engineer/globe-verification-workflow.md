---
name: globe-verification-workflow
description: How to screenshot and network-check the Cesium globe headlessly on this Windows machine (CDP script, swiftshader, temp preview page) and process-hygiene rules
metadata:
  type: feedback
---

Verify the globe with headless Chrome driven over the DevTools protocol, not `chrome --screenshot`.

**Why:** `--screenshot` with `--virtual-time-budget` stops before Cesium refines tiles (blocky globe, 1 tile), and `--timeout` produced a black frame. A small Node CDP script (Node 24 has global WebSocket/fetch) that navigates, waits ~20-25 s real time, logs `Network.requestWillBeSent` (for the no-`api.cesium.com` check) and calls `Page.captureScreenshot` worked reliably. Flags: `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`. Clicks can be simulated by dispatching PointerEvents (pointerdown/up, pointerType mouse) on `.cesium-widget canvas`.

**How to apply:** mount the globe from a temporary `apps/web/src/globe/__preview__/index.html` (Vite serves any html under root; URL params seed the store), run Vite on a fixed spare port (5199), delete `__preview__` afterwards. Swiftshader fps is meaningless; report desktop-GPU fps as not measured unless a real GPU run is possible.

Process hygiene: stop only the PID you started (`netstat -ano | grep :PORT`, then `taskkill //F //PID n //T`). A blanket `taskkill /IM node.exe` was denied by the permission system: it would kill the user's other node processes.

Do not edit files under apps/web/src while a CDP run is in progress: Vite HMR reloads the page and the run's store handle goes stale (M3c: a scrub reported 0 uniform updates). Instrument texture uploads by wrapping WebGL texImage2D/texSubImage2D/texStorage2D in an inline head script of the preview page; long scrubs (561 steps x ~350 ms on swiftshader) take minutes, so run them in the background.

M4 additions (2026-11-12): headless Chrome can take more than 10 s to expose `/json/list`, so poll for about 40 s. Real keyboard input via `Input.dispatchKeyEvent` (rawKeyDown/keyUp; Space also needs a `char` event) and mouse drags via `Input.dispatchMouseEvent` drive the TimeScroller like a user would. Pass Windows-style output paths (`pwd -W`) to node. The preview page's missing favicon logs a 404 "error": ignore it, the app has its own.

Related: [[gibs-epsg4326-tiling]], [[cesium-material-texture-gotchas]]
