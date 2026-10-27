import type { ResourceCatalog } from '../app/resources'
export function Icon({ name, resources }: { name: string; resources: ResourceCatalog }) {
  const url = resources.url(`icon.${name}`)
  return <span className="icon" aria-hidden="true" style={{ maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")` }} />
}
