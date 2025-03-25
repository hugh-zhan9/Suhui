import { TrackerPoints, trackManager } from "./points"

export const setOpenPanelTracker = trackManager.setTrackFn.bind(trackManager)

export const tracker = new TrackerPoints()

export { type TrackerPoints } from "./points"
export { TrackerMapper } from "./points"
