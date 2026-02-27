const LOCAL_HIDDEN_SETTING_PATHS = new Set(['feeds', 'list', 'notifications'])

export const isHiddenLocalSettingPath = (path: string) => LOCAL_HIDDEN_SETTING_PATHS.has(path)
