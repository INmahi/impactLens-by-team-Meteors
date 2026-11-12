// One-line explanation per region KIND (regions.json "kind"), never per region id.
// Owner: science-writer. Pure data: no React, no app imports.

export const REGION_KIND_TEXT: Record<string, string> = {
  ice_sheet:
    'A whole ice sheet: a continent-sized layer of ice on land, so its losses raise sea level.',
  ice_sheet_basin:
    'One part of an ice sheet, grouped by where its ice flows; different parts can change in different ways.',
  glacier_region:
    'A mountain glacier region: many separate glaciers on land, added together.',
  coastal_sea:
    'Satellite sea level averaged over an open-sea area about 100 km offshore; not the value at a town, and land sinking is not included.',
  global:
    'The mean over the whole ocean; not the value at any place.',
};
