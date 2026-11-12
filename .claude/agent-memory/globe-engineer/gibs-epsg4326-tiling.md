---
name: gibs-epsg4326-tiling
description: GIBS EPSG:4326 tiles do not fit Cesium's default GeographicTilingScheme; the over-wide-rectangle trick also fails; use the custom scheme in globe/gibsTilingScheme.ts; 500m set max level is 7
metadata:
  type: feedback
---

GIBS EPSG:4326 level 0 is 2x1 tiles of 512 px at 0.5625 deg/px (288 degrees per tile, padded overhang east and south); each level halves. A plain `new GeographicTilingScheme()` misregisters imagery. Using `rectangle: Rectangle.fromDegrees(-180,-198,396,90)` (the common forum trick) also fails in Cesium 1.146: Cesium's wrapping `Rectangle.intersection` drops every tile east of about 36-108E, which leaves a wedge with no imagery.

**Why:** found 2026-11-12 in M3b by screenshot. Only the custom scheme (world `rectangle`, true overhanging `tileXYToRectangle`, level-0 X count 1.25 for correct texel spacing) gave full coverage with the coastline outlines lining up.

**How to apply:** use the custom scheme for any new GIBS EPSG:4326 layer (for example dated imagery). Check that the TileMatrixSet's level-0 ScaleDenominator implies 288 degrees (500m, 250m... sets differ in max level, not level 0; check before assuming).

The 500m TileMatrixSet has levels 0-7 only: level 8 returns HTTP 400 for every tile (found 2026-11-12 in M3c when zooming to a pole; M3b had maximumLevel 8). Check the max level by requesting one tile per level before setting maximumLevel.
