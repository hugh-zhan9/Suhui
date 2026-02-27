export type SimpleDiscoverMode = 'rss' | 'rsshub'

export const SIMPLE_DISCOVER_MODES: readonly SimpleDiscoverMode[] = ['rss', 'rsshub']

export const getSimpleDiscoverModes = () => [...SIMPLE_DISCOVER_MODES]

export const shouldShowDiscoverJumpHint = () => false
