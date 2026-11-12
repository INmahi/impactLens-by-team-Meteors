---
name: cesium-batch-table-uploads
description: Toggling per-instance show/color or PolylineCollection polylines re-uploads a BatchTable texture; toggle Primitive.show instead to keep "0 texture uploads while scrubbing"
metadata:
  type: feedback
---

To show and hide geometry per time step without texture uploads, build one `Primitive` per step at load and toggle `primitive.show`. Do not use `PolylineCollection` polyline `show`, per-instance `ShowGeometryInstanceAttribute`, or color attributes for scrubbing. All of these write to a `BatchTable`, which re-uploads its texture (`texSubImage2D`) whenever it changes, and the M4 gate instruments every texture call.

`Primitive.update` builds geometry and the batch table even while `show` is false (Cesium 1.146 Primitive.js ~line 2083). So hidden primitives are fully built at load and later toggles cost nothing.

**Why:** found 2026-11-12 in M4 while designing the ice-extent outline layer (`globe/outlineLayer.ts`, 51 year primitives plus a ghost).

**How to apply:** any time-stepped vector overlay (outlines, markers). Related: [[cesium-material-texture-gotchas]], [[globe-verification-workflow]].

Also: `CreditDisplay.cesiumCredit = new Credit(...)` (a public static setter, read when the Viewer is created) replaces the "Cesium ion" logo credit; the GIBS credit is unaffected.
