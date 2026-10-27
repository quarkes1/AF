/** Milliseconds shared by the state controller and its rendered CSS animations. */
export const STARTUP_TIMINGS = {
  black: 450,
  logoFadeIn: 700,
  logoHold: 2300,
  logoFadeOut: 400,
  titleFadeOut: 1000,
  homeFadeIn: 1000,
  reducedMotion: 120,
  assetTimeout: 5000,
} as const

export const LOGO_PRESENTATION_MS = STARTUP_TIMINGS.logoFadeIn + STARTUP_TIMINGS.logoHold
export const TITLE_TO_HOME_MS = STARTUP_TIMINGS.titleFadeOut + STARTUP_TIMINGS.homeFadeIn
