import { useEffect, useId, useRef, useState } from 'react'
import type { ResourceCatalog } from '../../../app/resources'
import { TITLE_BACKGROUNDS, type TitlePeriod } from './time'
import { TITLE_MOTION as motion } from './motion'

export function SceneFrame({resources,period,playing,previous=false,onImageError}:{resources:ResourceCatalog;period:TitlePeriod;playing:boolean;previous?:boolean;onImageError?:()=>void}) {
  const svg=useRef<SVGSVGElement>(null)
  const id=useId().replaceAll(':','')
  const ref=(name:string)=>`url(#${id}-${name})`
  const image=resources.url(TITLE_BACKGROUNDS[period])
  const [loadedImage,setLoadedImage]=useState<string|null>(null)
  const effectsReady=loadedImage===image
  useEffect(()=>{
    if(playing)svg.current?.unpauseAnimations()
    else svg.current?.pauseAnimations()
  },[playing])
  return <svg ref={svg} className={`title-scene__frame${previous?' title-scene__frame--previous':''}`} viewBox="0 0 1672 941" preserveAspectRatio="xMidYMid slice" aria-hidden="true" data-period={period} data-animation={playing?'playing':'paused'}>
    <defs>
      <filter id={`${id}-soft`}><feGaussianBlur stdDeviation="4" /></filter>
      <linearGradient id={`${id}-canopy-floor`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={motion.canopyFadeStart} y2={motion.canopyFadeEnd}>
        <stop offset="0" stopColor="black" stopOpacity="0"/><stop offset="1" stopColor="black"/>
      </linearGradient>
      <mask id={`${id}-canopy`} maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941">
        <g fill="white" filter={ref('soft')}>
          <path d="M0 0H940L930 100 880 190 850 270 795 325 805 385 780 480 795 559 0 559Z" />
          <path d="M1325 0H1672V580L1585 570 1500 510 1400 490 1340 410 1330 335 1280 255 1300 160Z" />
        </g>
        {/* Fade out lower foliage before background buildings begin; keep the dome rigid. */}
        <rect x="0" y={motion.canopyFadeStart} width="1672" height="736" fill={ref('canopy-floor')}/>
        <rect {...motion.architectureHoldout} fill="black"/>
        <g fill="none" stroke="black" strokeWidth="34" strokeLinecap="round">
          <path d="M20 600Q28 405 45 290L120 0M45 290L15 160M45 290L210 38" />
          <path d="M435 603Q403 438 412 300L424 0M413 340L310 170M417 380L570 180" />
          <path d="M644 575L665 360 680 200 648 100M665 370L800 180" />
          <path d="M1642 603L1635 400 1635 245 1585 0M1635 270L1500 95M1510 530L1465 330 1400 200" />
        </g>
      </mask>
      <mask id={`${id}-sky`} maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941">
        <path fill="white" filter={ref('soft')} d="M925 0H1320L1310 80 1290 150 1310 225 1320 300 1260 310 1200 245 940 245 895 220 925 140Z" />
        <path fill="black" d="M963 98L1050 75 1158 110 1161 173Q1238 195 1283 278L1283 350H812V280Q864 206 955 173Z" />
      </mask>
      <mask id={`${id}-water`} maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941">
        <path fill="white" d="M220 618Q790 607 1672 620V670Q1000 684 264 670Q85 660 100 648Q115 634 220 618Z" />
        <rect x="1395" y="480" width="220" height="170" fill="black" />
      </mask>
      <mask id={`${id}-windows`} maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941">
        {/* Cupola high windows are intentionally excluded: all regions start below y=330. */}
        <g fill="white"><rect x="935" y="344" width="25" height="34"/><rect x="1124" y="344" width="26" height="34"/><rect x="1258" y="349" width="25" height="43"/><rect x="822" y="430" width="17" height="45"/><rect x="1028" y="429" width="23" height="44"/><rect x="1258" y="427" width="25" height="48"/></g>
      </mask>
      <filter id={`${id}-wind`} filterUnits="userSpaceOnUse" x="-4" y="-4" width="1680" height="600">
        <feTurbulence type="fractalNoise" baseFrequency=".006 .014" numOctaves="2" seed="7" result="wind">
          <animate attributeName="baseFrequency" values=".006 .014;.007 .012;.006 .014" dur={`${motion.windCycle}s`} repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="wind" scale={motion.windScale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id={`${id}-ripples`} filterUnits="userSpaceOnUse" x="80" y="600" width="1592" height="105">
        <feTurbulence type="fractalNoise" baseFrequency=".013 .12" numOctaves="1" seed="3" result="ripples">
          <animate attributeName="baseFrequency" values=".013 .12;.014 .13;.013 .12" dur={`${motion.waterCycle}s`} repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" in2="ripples" scale={motion.waterScale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
      <filter id={`${id}-warm`}><feComponentTransfer><feFuncR type="linear" slope="1.035"/><feFuncG type="linear" slope="1.025"/><feFuncB type="linear" slope="1"/></feComponentTransfer></filter>
    </defs>
    <g data-layer="architecture"><image href={image} width="1672" height="941" onLoad={()=>setLoadedImage(image)} onError={()=>{setLoadedImage(null);onImageError?.()}} /></g>
    {playing && effectsReady && resources.has('texture.title-clouds') && <g data-layer="clouds" mask={ref('sky')} opacity={period==='night'?.11:period==='dusk'?.22:.28}>
      <image href={resources.url('texture.title-clouds')} x="380" y="-100" width="1450" height="600">
        <animateTransform attributeName="transform" type="translate" values={`-${motion.cloudTravel} 0;${motion.cloudTravel} 0;-${motion.cloudTravel} 0`} dur={`${motion.cloudCycle}s`} repeatCount="indefinite" />
      </image>
    </g>}
    {playing && effectsReady && <g data-layer="foliage" mask={ref('canopy')}>
      <g filter={ref('wind')}><image href={image} width="1672" height="941">
        <animateTransform attributeName="transform" type="translate" values="0 0;2.5 -.7;-1.5 .5;0 0" dur={`${motion.branchCycle}s`} repeatCount="indefinite" />
      </image></g>
    </g>}
    {playing && effectsReady && <g data-layer="water" mask={ref('water')}><g filter={ref('ripples')}><image href={image} width="1672" height="941" /></g></g>}
    {period==='night' && effectsReady && <g data-layer="window-light" mask={ref('windows')} filter={ref('warm')}><image href={image} width="1672" height="941" /></g>}
  </svg>
}
