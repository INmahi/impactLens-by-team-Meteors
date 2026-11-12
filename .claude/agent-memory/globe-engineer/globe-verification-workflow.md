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

Related: [[gibs-epsg4326-tiling]]
