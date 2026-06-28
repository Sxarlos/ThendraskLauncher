import { join } from 'path'
import { BrowserWindow } from 'electron'
import { Client } from 'minecraft-launcher-core'
import type { ChildProcess } from 'child_process'
import type { LaunchProgress, LaunchState } from '@shared/types'
import { getActiveMclcUser } from './accounts'
import { getInstance, instanceGameDir, markPlayed, addPlayTime, updateInstance } from './instances'
import { getSettings, detectJava } from './settings'
import { ensureChatMod } from './chatmod'
import { writeDefaultOptions } from './gameoptions'
import { getVersions } from './mojang'
import { setPlaying, setIdle } from './discord'
import {
  readMarker,
  installMrpack,
  installCfPack,
  resolveFabricVersion,
  resolveQuiltVersion,
  resolveForgeVersion,
  resolveNeoforgeVersion,
  installFabricLoader,
  installQuiltLoader,
  installForgeLoader,
  installNeoforgeLoader
} from './modpack'
import { autoInstallShader } from './shaders'

/** Instances currently running, keyed by instance id. */
const running = new Map<string, ChildProcess>()

function emit(progress: LaunchProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('launch:progress', progress)
  }
}

function setState(instanceId: string, state: LaunchState, message?: string, percent?: number): void {
  emit({ instanceId, state, message, percent })
}

export function isRunning(instanceId: string): boolean {
  return running.has(instanceId)
}

export function runningInstanceIds(): string[] {
  return [...running.keys()]
}

/**
 * Download (if needed) and launch an instance with the active account.
 * Progress and lifecycle are streamed to the renderer via 'launch:progress'.
 */
export async function launchInstance(instanceId: string): Promise<void> {
  if (running.has(instanceId)) throw new Error('This instance is already running.')

  const instance = getInstance(instanceId)
  if (!instance) throw new Error('Instance not found.')

  const settings = getSettings()

  setState(instanceId, 'preparing', 'Authenticating…')
  const authorization = await getActiveMclcUser()

  // ── Modpack installation ────────────────────────────────────────────────────
  // Downloads mod files on the first launch (or after a version switch).

  let resolvedLoaderType = instance.loader as string
  let resolvedLoaderVersion = instance.loaderVersion

  if (instance.source !== 'manual' && instance.externalId) {
    const marker = readMarker(instanceId)
    // Only re-download when there's no local install at all, or the user explicitly
    // switched to a different pack version (packVersionId is set and differs).
    const needsInstall = !marker || (instance.packVersionId != null && marker.packVersionId !== instance.packVersionId)

    let effectiveMarker = marker

    if (needsInstall) {
      try {
        if (instance.source === 'modrinth') {
          effectiveMarker = await installMrpack(
            instanceId,
            instance.externalId,
            instance.packVersionId,
            (msg, pct) => setState(instanceId, 'downloading', msg, pct)
          )
        } else if (instance.source === 'curseforge') {
          effectiveMarker = await installCfPack(
            instanceId,
            instance.externalId,
            instance.packVersionId,
            (msg, pct) => setState(instanceId, 'downloading', msg, pct)
          )
        }
      } catch (err) {
        console.error('[Launcher] Modpack install failed:', err)
        setState(instanceId, 'preparing', `Modpack install failed — launching anyway`)
        await new Promise((r) => setTimeout(r, 1500))
      }
    }

    if (effectiveMarker) {
      resolvedLoaderType = effectiveMarker.loaderType
      resolvedLoaderVersion = effectiveMarker.loaderVersion
      // Persist the installed version ID so subsequent launches skip re-downloading.
      if (effectiveMarker.packVersionId && effectiveMarker.packVersionId !== instance.packVersionId) {
        updateInstance(instanceId, { packVersionId: effectiveMarker.packVersionId })
      }
    }
  }

  // ── Loader setup ────────────────────────────────────────────────────────────

  let customVersion: string | undefined
  let forgeInstallerPath: string | undefined

  if (resolvedLoaderType === 'fabric') {
    // MCLC has no built-in Fabric support — we install the Fabric profile JSON
    // ourselves and point version.custom at it, the same way Quilt is handled.
    const fabricVer = resolvedLoaderVersion ?? await resolveFabricVersion(instance.mcVersion)
    if (fabricVer) {
      setState(instanceId, 'preparing', 'Installing Fabric loader…')
      customVersion = await installFabricLoader(instanceGameDir(instanceId), instance.mcVersion, fabricVer)
        .catch(() => undefined)
      if (!customVersion) {
        setState(instanceId, 'preparing', 'Fabric loader install failed — launching vanilla')
        await new Promise((r) => setTimeout(r, 1000))
      }
    } else {
      setState(instanceId, 'preparing', 'Could not resolve Fabric version — launching vanilla')
      await new Promise((r) => setTimeout(r, 1000))
    }
  } else if (resolvedLoaderType === 'quilt') {
    const quiltVer = resolvedLoaderVersion ?? await resolveQuiltVersion(instance.mcVersion)
    if (quiltVer) {
      setState(instanceId, 'preparing', 'Installing Quilt loader…')
      customVersion = await installQuiltLoader(instanceGameDir(instanceId), instance.mcVersion, quiltVer)
        .catch(() => undefined)
    }
  } else if (resolvedLoaderType === 'forge') {
    // MCLC handles Forge via ForgeWrapper — we just download the installer JAR
    // and pass it as `forge:`. ForgeWrapper runs the installer and reads the
    // resulting version profile. The JAR is cached so only downloaded once.
    const forgeVer = resolvedLoaderVersion ?? await resolveForgeVersion(instance.mcVersion)
    if (forgeVer) {
      setState(instanceId, 'preparing', 'Downloading Forge installer…')
      forgeInstallerPath = await installForgeLoader(instanceGameDir(instanceId), instance.mcVersion, forgeVer)
        .catch(() => undefined)
      if (!forgeInstallerPath) {
        setState(instanceId, 'preparing', 'Forge installer download failed — launching vanilla')
        await new Promise((r) => setTimeout(r, 1000))
      }
    } else {
      setState(instanceId, 'preparing', 'Could not resolve Forge version — launching vanilla')
      await new Promise((r) => setTimeout(r, 1000))
    }
  } else if (resolvedLoaderType === 'neoforge') {
    const neoVer = resolvedLoaderVersion ?? await resolveNeoforgeVersion(instance.mcVersion)
    if (neoVer) {
      setState(instanceId, 'preparing', 'Downloading NeoForge installer…')
      forgeInstallerPath = await installNeoforgeLoader(instanceGameDir(instanceId), neoVer)
        .catch(() => undefined)
      if (!forgeInstallerPath) {
        setState(instanceId, 'preparing', 'NeoForge installer download failed — launching vanilla')
        await new Promise((r) => setTimeout(r, 1000))
      }
    } else {
      setState(instanceId, 'preparing', 'Could not resolve NeoForge version — launching vanilla')
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  // ── Pre-launch helpers ──────────────────────────────────────────────────────

  // Inject No Chat Reports if the setting is on
  if (settings.noChatRestrictions) {
    setState(instanceId, 'preparing', 'Injecting No Chat Reports…')
    await ensureChatMod(instance).catch(() => { /* non-fatal */ })
  }

  // Write default game options for fresh instances (1.12+ only)
  if (settings.defaultGameSettings) {
    writeDefaultOptions(instanceGameDir(instanceId), instance.mcVersion, settings.defaultGameSettings)
  }

  const versions = await getVersions().catch(() => [])
  const versionType = versions.find((v) => v.id === instance.mcVersion)?.type ?? 'release'

  // ── Pre-flight: verify Java is reachable ────────────────────────────────────
  const java = await detectJava()
  if (!java.ok) {
    const msg = settings.javaPath
      ? `Java not found at configured path: ${settings.javaPath}`
      : 'Java is not installed or not on PATH. Install Java 17+ and set the path in Settings → General.'
    setState(instanceId, 'error', msg)
    throw new Error(msg)
  }

  const client = new Client()

  // Capture MCLC's internal errors — without this listener they are silently
  // swallowed and `client.launch()` returns undefined with no explanation.
  let mclcError: Error | undefined
  client.on('error', (e: unknown) => {
    mclcError = e instanceof Error ? e : new Error(String(e))
    console.error('[MCLC]', mclcError.message)
  })

  client.on('debug', (msg: string) => console.log('[MCLC debug]', msg))

  client.on('progress', (e: { type: string; task: number; total: number }) => {
    const percent = e.total > 0 ? Math.round((e.task / e.total) * 100) : undefined
    setState(instanceId, 'downloading', `Downloading ${e.type}…`, percent)
  })

  function emitLog(line: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('launch:log', { instanceId, line })
    }
  }

  // Match: "EuphoriaPatcher: Required: ComplementaryShaders r5.7.1"
  const EUPHORIA_RE = /EuphoriaPatcher:\s+Required:\s+(\S+)\s+(\S+)/

  let launched = false
  let sessionStart = 0
  client.on('data', (line: string) => {
    const str = String(line).trimEnd()
    emitLog(str)

    // Auto-install missing shaders required by EuphoriaPatcher
    const shaderMatch = str.match(EUPHORIA_RE)
    if (shaderMatch) {
      const [, shaderName, version] = shaderMatch
      const shaderpacks = join(instanceGameDir(instanceId), 'shaderpacks')
      emitLog(`[Ender Client] Detected missing shader: ${shaderName} ${version} — downloading automatically…`)
      autoInstallShader(shaderName, version, shaderpacks)
        .then((dest) => {
          if (dest) {
            emitLog(`[Ender Client] ✓ ${shaderName} ${version} installed. Close and relaunch the game to apply.`)
          } else {
            emitLog(`[Ender Client] Could not find ${shaderName} ${version} on Modrinth — download manually from https://www.complementary.dev/`)
          }
        })
        .catch((e: Error) => {
          emitLog(`[Ender Client] Shader auto-download failed: ${e.message}`)
        })
    }

    if (!launched) {
      launched = true
      sessionStart = Date.now()
      markPlayed(instanceId)
      setState(instanceId, 'running', 'Minecraft is running.')
      setPlaying(instance.name, instance.loader, instance.mcVersion)
    }
  })

  client.on('close', (code: number) => {
    running.delete(instanceId)
    if (sessionStart > 0) addPlayTime(instanceId, Date.now() - sessionStart)
    emitLog(`\n[Launcher] Game exited with code ${code}.`)
    setState(instanceId, 'closed', `Game exited (code ${code}).`)
    setIdle()
  })

  setState(instanceId, 'launching', 'Starting Minecraft…')

  console.log('[Launcher] Launching', {
    id: instanceId,
    mc: instance.mcVersion,
    loader: resolvedLoaderType,
    customVersion,
    forgeInstaller: forgeInstallerPath,
    javaPath: java.path,
    javaVersion: java.version
  })

  // msmc's MclcUser is structurally what MCLC needs; the lib's exported types
  // mark a few fields optional, so cast to MCLC's expected authorization type.
  type LaunchAuthorization = Parameters<Client['launch']>[0]['authorization']

  const proc = await client.launch({
    authorization: authorization as LaunchAuthorization,
    root: instanceGameDir(instanceId),
    version: {
      number: instance.mcVersion,
      type: versionType,
      custom: customVersion  // Fabric / Quilt profile ID
    },
    // Forge / NeoForge: MCLC's forge option triggers ForgeWrapper to run
    // the installer JAR and read the resulting version profile.
    ...(forgeInstallerPath ? { forge: forgeInstallerPath } : {}),
    memory: {
      max: `${settings.usePackRam && instance.recommendedRamMb ? instance.recommendedRamMb : settings.maxRamMb}M`,
      min: '512M'
    },
    javaPath: java.path === 'java' ? undefined : java.path,
    ...(instance.jvmArgs?.trim()
      ? { customArgs: instance.jvmArgs.trim().split(/\s+/).filter(Boolean) }
      : {})
  })

  if (!proc) {
    running.delete(instanceId)
    const reason = mclcError?.message ?? 'unknown — check the main process console for [MCLC debug] output'
    setState(instanceId, 'error', `Launch failed: ${reason}`)
    throw new Error(`minecraft-launcher-core returned no process: ${reason}`)
  }

  running.set(instanceId, proc)
}
