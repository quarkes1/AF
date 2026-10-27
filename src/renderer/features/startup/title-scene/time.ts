export type TitlePeriod = 'day' | 'dusk' | 'night'
/** Prototype defaults use the OS local clock, not estimated astronomical sunrise. */
export function titlePeriodAt(date: Date): TitlePeriod {
  const hour=date.getHours()
  if(!Number.isFinite(hour))return 'day'
  return hour>=6 && hour<17?'day':hour>=17 && hour<19?'dusk':'night'
}
export const TITLE_BACKGROUNDS: Record<TitlePeriod,string> = {
  day:'background.sipailou-auditorium-day', dusk:'background.title-auditorium-dusk', night:'background.title-auditorium-night',
}
export function requestedTitlePeriod(date: Date): TitlePeriod {
  const override=import.meta.env.VITE_TITLE_ART_REVIEW==='1'?import.meta.env.VITE_TITLE_PERIOD:undefined
  return override==='day'||override==='dusk'||override==='night'?override:titlePeriodAt(date)
}
