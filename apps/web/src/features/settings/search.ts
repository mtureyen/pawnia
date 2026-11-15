export const SETTINGS_TABS = ['board', 'voice', 'coach'] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]

/** URL search params of /settings: which tab is open. */
export function parseSettingsSearch(search: Record<string, unknown>): { tab?: SettingsTab } {
  const { tab } = search
  return SETTINGS_TABS.find((known) => known === tab) ? { tab: tab as SettingsTab } : {}
}
