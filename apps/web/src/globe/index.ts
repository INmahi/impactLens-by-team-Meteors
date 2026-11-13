// Public surface of the globe folder for the layout (main).
export { default as Globe } from './Globe'
export { default as GlobeControls, PoleToggle, ZoomControls } from './GlobeControls'
export { default as MapLegend, NoMapNote } from './MapLegend'
export { default as MapModePicker } from './MapModePicker'
export { default as MapModeTray } from './MapModeTray'
export { default as MapModeMenu } from './MapModeMenu'
export { default as SyntheticWatermark } from './SyntheticWatermark'
export { flyToPole, flyToRegion, zoomIn, zoomOut } from './controller'
export { GIBS_CREDIT } from './engine'
export { dataLayerStats } from './dataLayer'
export { outlineLayerStats } from './outlineLayer'
export { formatDate, formatUnits, getManifest, getVariables, layerTimeline, mapLayerIds, type TimelineStep } from './layerData'
export {
  dateSpan,
  datesInPeriod,
  mapModeForVariable,
  mapModes,
  modeLabel,
  modeShowsVariable,
  monthNumber,
  OUTLINE_SUFFIX,
  resolveMapMode,
  variableHasMap,
  variableWithoutMap,
  type GridMode,
  type MapMode,
  type ModeStep,
  type OutlineMode,
} from './mapModes'
export { POLAR_KINDS } from './regions'
export {
  useActiveMode,
  useManifest,
  useMapModes,
  useShowsSyntheticData,
  useVariables,
  useVariableWithoutMap,
  type ActiveMode,
} from './useLayerInfo'
