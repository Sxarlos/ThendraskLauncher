import type { LoaderType, PackVersion } from '../shared/types'
import type { CreateInstanceInput } from './instances'

const LOADERS = new Set<LoaderType>(['vanilla', 'fabric', 'forge', 'quilt', 'neoforge'])

export function resolvePackRelease(input: CreateInstanceInput, versions: PackVersion[]): CreateInstanceInput {
  const release = input.packVersionId
    ? versions.find((version) => version.id === input.packVersionId)
    : versions[0]
  if (!release) throw new Error('The selected modpack release is unavailable.')
  const mcVersion = release.gameVersions[0]
  const loader = release.loaders.find((value): value is LoaderType => LOADERS.has(value as LoaderType))
  if (!mcVersion || !loader) throw new Error('The selected release does not specify a supported Minecraft version and loader.')
  return { ...input, packVersionId: release.id, mcVersion, loader, loaderVersion: undefined }
}
