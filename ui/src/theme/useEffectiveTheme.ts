import { useSyncExternalStore } from 'react'

import { useThemeStore } from './store'
import {
  paletteAppearance,
  resolveEffectiveSlot,
  type ThemePaletteId,
  type ThemePreferenceSlot,
} from './palettes'

const mq = window.matchMedia('(prefers-color-scheme: dark)')

function subscribeSystem(cb: () => void): () => void {
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/**
 * Resolve which preference slot is active. Auto follows the OS; a palette's
 * own light/dark appearance does not influence slot selection.
 */
export function useEffectivePreferenceSlot(): ThemePreferenceSlot {
  const theme = useThemeStore((s) => s.theme)
  const systemDark = useSyncExternalStore(
    subscribeSystem,
    () => mq.matches,
    () => true,
  )
  return resolveEffectiveSlot(theme, systemDark)
}

/** The concrete semantic card selected for the currently active slot. */
export function useEffectivePalette(): ThemePaletteId {
  const slot = useEffectivePreferenceSlot()
  const dayPalette = useThemeStore((s) => s.dayPalette)
  const nightPalette = useThemeStore((s) => s.nightPalette)
  return slot === 'night' ? nightPalette : dayPalette
}

/**
 * Resolve the active card's intrinsic appearance. Use this for JS surfaces
 * such as xterm and chart redraws; assigning Midnight to Day must still report
 * a dark color scheme to the shell.
 */
export function useEffectiveTheme(): 'light' | 'dark' {
  return paletteAppearance(useEffectivePalette())
}
