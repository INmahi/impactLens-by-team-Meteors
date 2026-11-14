// Describe-popup text per variable id (data/public/variables.json).
// Owner: science-writer. Pure data: no React, no app imports.
// Facts not computed by the app carry a source link. Region-specific caveats
// live in regions.json notes.

export interface VariableText {
  title: string;
  what: string;
  whyItMatters: string;
  howItRelates?: string;
  sources: { label: string; url: string }[];
}

const IMBIE = { label: 'IMBIE: ice sheet mass balance', url: 'https://imbie.org/' };
const IMBIE_GREENLAND = {
  label: 'IMBIE Team (2020), Mass balance of the Greenland Ice Sheet from 1992 to 2018, Nature',
  url: 'https://doi.org/10.1038/s41586-019-1855-2',
};
const IMBIE_ANTARCTICA = {
  label: 'IMBIE Team (2018), Mass balance of the Antarctic Ice Sheet from 1992 to 2017, Nature',
  url: 'https://doi.org/10.1038/s41586-018-0179-y',
};
const NASA_SEA_LEVEL = { label: 'NASA Sea Level Change portal', url: 'https://sealevel.nasa.gov/' };
const NASA_SSH = {
  label: 'NASA-SSH gridded sea surface height V1.1 (PO.DAAC)',
  url: 'https://doi.org/10.5067/NSREF-SG0V11',
};
const FREDERIKSE = {
  label: 'Frederikse et al. (2020), The causes of sea-level rise since 1900, Nature',
  url: 'https://doi.org/10.1038/s41586-020-2591-3',
};
const JPL_RECON = {
  label: 'NASA JPL_RECON_GMSL (PO.DAAC)',
  url: 'https://podaac.jpl.nasa.gov/dataset/JPL_RECON_GMSL',
};
const IPCC_CH9 = {
  label: 'IPCC AR6 WG1 Chapter 9: Ocean, cryosphere and sea level change',
  url: 'https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-9/',
};
const NSIDC_ICE_SHEETS = { label: 'NSIDC: Ice sheets', url: 'https://nsidc.org/learn/parts-cryosphere/ice-sheets' };
const ITS_LIVE = { label: 'NSIDC-0793 ITS_LIVE Greenland ice masks', url: 'https://nsidc.org/data/nsidc-0793' };
const MERRA2 = {
  label: 'NASA MERRA-2 monthly surface fields (M2TMNXSLV)',
  url: 'https://disc.gsfc.nasa.gov/datasets/M2TMNXSLV_5.12.4/summary',
};

const ICE_SHEET_RELATES =
  'Ice mass, ice mass change rate and ice extent are three views of one ice sheet. ' +
  'Ice mass (Gt) is how much ice there is compared with the start of the record. ' +
  'Ice mass change rate (Gt/yr) is how much the mass changes each year; negative means ice was lost. A trend in this rate means loss is speeding up or slowing down. ' +
  'Ice extent (km2) is area, not mass: an ice sheet can thin and lose mass while its area hardly changes.';

export const VARIABLE_TEXT: Record<string, VariableText> = {
  ice_mass: {
    title: 'Ice mass',
    what:
      'How much ice an ice sheet holds, in gigatonnes (Gt), compared with the start of its record. ' +
      'One gigatonne is a billion tonnes. A falling line means the ice sheet is losing more ice than snowfall adds back. ' +
      'It is measured with satellites and models: by weighing the ice with gravity (since 2002), tracking its height (since the 1990s), and comparing snowfall from climate models with ice flowing out, seen in satellite images (since the 1970s). Early years are less certain.',
    whyItMatters:
      'Ice on land that melts or flows into the ocean raises sea level. ' +
      'About 362 Gt of lost ice raises global mean sea level by about 1 mm. ' +
      'Greenland loses ice both by surface melt and by glaciers pouring ice into the sea. ' +
      'Antarctica loses ice mainly where warm ocean water thins West Antarctic glaciers and makes them flow faster.',
    howItRelates: ICE_SHEET_RELATES,
    sources: [IMBIE, IMBIE_GREENLAND, IMBIE_ANTARCTICA, NSIDC_ICE_SHEETS],
  },

  ice_mass_rate: {
    title: 'Ice mass change rate',
    what:
      'How fast an ice sheet gains or loses ice each year, in gigatonnes per year (Gt/yr). ' +
      'A negative value means the ice sheet lost ice that year. ' +
      'It is the yearly change in ice mass, the speed at which the ice mass line goes down or up.',
    whyItMatters:
      'A trend in this rate tells you whether loss is speeding up or slowing down (an acceleration, in Gt/yr per year). ' +
      'Faster loss means faster sea level rise: 362 Gt/yr is about 1 mm of global sea level per year. ' +
      'Single years jump around with weather, so a trend needs many years to stand out.',
    howItRelates: ICE_SHEET_RELATES,
    sources: [IMBIE, IMBIE_GREENLAND, IMBIE_ANTARCTICA],
  },

  ice_extent: {
    title: 'Ice extent',
    what:
      'The area of Greenland covered by ice, in square kilometres (km2), month by month. ' +
      'It is measured from satellite images that show where the ice edge is. ' +
      'This is area, not mass: it says nothing directly about how thick the ice is.',
    whyItMatters:
      'When glacier fronts retreat, the ice-covered area shrinks, and you can see the change on the map. ' +
      'But an ice sheet can thin a lot while its edge moves little. ' +
      'So a small change in area can come with a large loss of mass, and extent alone cannot tell you how much ice was lost.',
    howItRelates: ICE_SHEET_RELATES,
    sources: [ITS_LIVE, NSIDC_ICE_SHEETS],
  },

  temperature: {
    title: 'Summer air temperature',
    what:
      'Air temperature about 2 m above the surface in summer, shown as a difference from the 1991-2020 average (degC). ' +
      'Greenland uses June to August. Antarctica uses December to February. ' +
      'The values come from a reanalysis: a weather model combined with observations, not a thermometer at one spot.',
    whyItMatters:
      'On Greenland, warmer summers bring more surface melt, so summer air temperature matters for its ice loss. ' +
      'Antarctica is different. Most of its surface stays below freezing even in summer. ' +
      'Its ice loss comes mainly from warm ocean water thinning the floating ends of glaciers from below, not from warm air. ' +
      'Same warming planet, different response.',
    sources: [MERRA2, IMBIE_GREENLAND, IMBIE_ANTARCTICA],
  },

  sea_level: {
    title: 'Sea level',
    what:
      'Sea surface height measured by satellites since 1993, in millimetres (mm). ' +
      'Pick the global mean over the whole ocean, or the mean over one coastal sea. ' +
      'A coastal sea is an open-sea area at least about 100 km offshore, because satellites are less reliable near land. ' +
      'It is not the value at any town, and it does not include land sinking.',
    whyItMatters:
      'Sea level rises because ocean water warms and expands, and because mountain glaciers and ice sheets add water. ' +
      'Ice sheets are one part of this budget. Some seas rise faster than the global mean. ' +
      'Where land sinks, as in the Bangladesh delta, people on the coast feel a larger rise than shown here.',
    sources: [NASA_SSH, NASA_SEA_LEVEL, IPCC_CH9],
  },

  sea_level_long: {
    title: 'Sea level, long record',
    what:
      'Global mean sea level each year since 1900, in millimetres (mm). ' +
      'It is rebuilt from tide gauges and models, because satellites only started in 1993. ' +
      'It is a separate record from the satellite data and is never joined to it.',
    whyItMatters:
      'It shows how fast sea level rose before satellites, so you can see whether the rise has sped up. ' +
      'The same study splits the rise into parts: ocean warming, mountain glaciers, Greenland, Antarctica and water stored on land.',
    howItRelates:
      'This is a different record from "Sea level". It covers 1900-2018 and only the global mean. ' +
      'The two use different methods, so their lines can differ where they overlap. Compare their trends, not their levels.',
    sources: [JPL_RECON, FREDERIKSE],
  },

  ice_mass_long: {
    title: 'Ice mass, long record',
    what:
      'Change in ice sheet mass since 1900, in gigatonnes (Gt), for Greenland and Antarctica. ' +
      'It is rebuilt from models and older measurements, so it is less certain in the early decades. ' +
      'For Greenland, the years before 2003 (before gravity satellites) rest on reconstructions from models, older images and field data. ' +
      'Greenland here includes its small nearby glaciers.',
    whyItMatters:
      'It puts the satellite years in a longer context and shows how ice sheet loss compares with the century before. ' +
      'Each 362 Gt lost adds about 1 mm to global mean sea level.',
    howItRelates:
      'This is a separate record from "Ice mass" and is never joined to it. ' +
      'It uses different methods and a different start, so the two lines need not match. Compare their trends, not their levels.',
    sources: [JPL_RECON, FREDERIKSE, IMBIE],
  },
};
