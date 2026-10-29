import { createRoot } from 'react-dom/client'
import registry from '../../assets/registry.json'
import titleReviewAssets from '../../config/title-review-assets.json'
import { createResourceCatalog } from './app/resources'
import { readPreviewPreferences } from './app/preview-preferences'
import { StartupController } from './features/startup/controller'
import { StartupAudioBus } from './audio/startup-audio'
import { App } from './app/App'
import {MaterialLibrary} from './pages/materials/library'
import { requestedTitlePeriod, TITLE_BACKGROUNDS } from './features/startup/title-scene/time'
import './styles/app.css'
import {readHomeMusic,resolveHomeMusic} from './pages/home/music'

const resources = createResourceCatalog(registry.resources, window.location.href, import.meta.env.VITE_TITLE_ART_REVIEW === '1' ? titleReviewAssets : [])
const library=new MaterialLibrary(resources)
async function start(){
await library.load()
const audio = new StartupAudioBus(resources)
const homeMusic=resolveHomeMusic(readHomeMusic(),resources.has)
if(homeMusic)audio.setInitialHomeTrack(homeMusic)
const preferences = readPreviewPreferences()
audio.configure(preferences)
async function prepare() {
  const images = ['brand.logo.inverse', 'background.sipailou-auditorium-day', 'background.library-hall-day', 'background.campus-courtyard-day', 'character.af-guide.01-neutral']
  const sceneId=TITLE_BACKGROUNDS[requestedTitlePeriod(new Date())]
  if(resources.has(sceneId)&&!images.includes(sceneId))images.push(sceneId)
  await Promise.all([
    ...images.map(id => { const image = new Image(); image.src = resources.url(id); return image.decode() }),
    document.fonts.load('400 16px "Source Han Sans SC"'), document.fonts.load('500 16px Inter'),
  ])
}
const controller = new StartupController({ prepare, audio, random: Math.random, ...preferences })
createRoot(document.getElementById('root')!).render(<App controller={controller} resources={resources} library={library} />)

}
void start()
