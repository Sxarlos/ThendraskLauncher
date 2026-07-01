import { join } from 'path'
import { spawn } from 'child_process'
import { BrowserWindow } from 'electron'
import { Client } from 'minecraft-launcher-core'
import type { ChildProcess } from 'child_process'
import type { LaunchProgress, LaunchState } from '@shared/types'
import { getActiveMclcUser } from './accounts'
import { getInstance, instanceGameDir, markPlayed, addPlayTime, updateInstance } from './instances'
import { getSettings } from './settings'
import { ensureJava, requiredJavaMajor, detectNeoforgeJavaMajor } from './java'
import { ensureChatMod } from './chatmod'
import { writeDefaultOptions } from './gameoptions'
import { getVersions } from './mojang'
import { setPlaying, setIdle } from './discord'
import {
  readMarker,
  installMrpack,
  installCfPack,
  installFtbPack,
  installAtlPack,
  installTechnicPack,
  resolveFabricVersion,
  resolveQuiltVersion,
  resolveForgeVersion,
  resolveNeoforgeVersion,
  installFabricLoader,
  installQuiltLoader,
  installForgeLoader,
  installNeoforgeProfile,
  readNeoforgeJvmArgs
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

function quickPlayType(mcVersion: string): 'multiplayer' | 'legacy' {
  const [, minor = '0'] = mcVersion.split('.')
  return parseInt(minor, 10) >= 20 ? 'multiplayer' : 'legacy'
}

/**
 * Download (if needed) and launch an instance with the active account.
 * Pass serverAddress (e.g. "play.example.com:25565") to auto-connect on launch.
 * Progress and lifecycle are streamed to the renderer via 'launch:progress'.
 */
export async function launchInstance(instanceId: string, serverAddress?: string): Promise<void> {
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
        } else if (instance.source === 'ftb' || instance.source === 'ftb-legacy') {
          effectiveMarker = await installFtbPack(
            instanceId,
            instance.externalId,
            instance.packVersionId,
            (msg, pct) => setState(instanceId, 'downloading', msg, pct)
          )
        } else if (instance.source === 'atlauncher') {
          effectiveMarker = await installAtlPack(
            instanceId,
            instance.externalId,
            instance.packVersionId,
            (msg, pct) => setState(instanceId, 'downloading', msg, pct)
          )
        } else if (instance.source === 'technic') {
          effectiveMarker = await installTechnicPack(
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

  // ── Java: auto-detect or auto-download the correct version ─────────────────
  // Must happen before loader setup — NeoForge needs Java to run its installer.
  let requiredMajor = requiredJavaMajor(instance.mcVersion)
  let resolvedJavaPath: string
  try {
    resolvedJavaPath = await ensureJava(
      requiredMajor,
      settings.javaPath || undefined,
      (msg, pct) => setState(instanceId, 'preparing', msg, pct)
    )
  } catch (err) {
    const msg = (err as Error).message
    setState(instanceId, 'error', msg)
    throw new Error(msg)
  }

  // ── Loader setup ────────────────────────────────────────────────────────────

  let customVersion: string | undefined
  let forgeInstallerPath: string | undefined
  let neoforgeJvmArgs: string[] = []

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
    // NeoForge 20.4+ uses a new installer format incompatible with MCLC's ForgeWrapper.
    // We run the installer directly (it creates a version profile) and point MCLC at the profile.
    const neoVer = resolvedLoaderVersion ?? await resolveNeoforgeVersion(instance.mcVersion)
    if (neoVer) {
      try {
        customVersion = await installNeoforgeProfile(
          instanceGameDir(instanceId),
          neoVer,
          resolvedJavaPath,
          (msg) => setState(instanceId, 'preparing', msg),
          (line) => {
            for (const win of BrowserWindow.getAllWindows()) {
              win.webContents.send('launch:log', { instanceId, line })
            }
          }
        )
        neoforgeJvmArgs = readNeoforgeJvmArgs(instanceGameDir(instanceId), customVersion)
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        console.error('[Launcher] NeoForge install failed:', reason)
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send('launch:log', { instanceId, line: `[Launcher] NeoForge ${neoVer} install failed: ${reason}` })
        }
        setState(instanceId, 'error', `NeoForge ${neoVer} install failed — check the log panel for details.`)
        throw new Error(`NeoForge ${neoVer} install failed: ${reason}`)
      }
    } else {
      setState(instanceId, 'preparing', 'Could not resolve NeoForge version — launching vanilla')
      await new Promise((r) => setTimeout(r, 1000))
    }
  }

  // ── Pre-launch helpers ──────────────────────────────────────────────────────

  // bootstraplauncher 2.x (shipped by NeoForge) requires Java 21 regardless of
  // MC version. Check on every launch so already-installed instances are covered.
  if (resolvedLoaderType === 'neoforge') {
    const neoJavaMajor = detectNeoforgeJavaMajor(instanceGameDir(instanceId))
    if (neoJavaMajor !== null && neoJavaMajor > requiredMajor) {
      setState(instanceId, 'preparing', `NeoForge requires Java ${neoJavaMajor} — checking…`)
      try {
        resolvedJavaPath = await ensureJava(
          neoJavaMajor,
          settings.javaPath || undefined,
          (msg, pct) => setState(instanceId, 'preparing', msg, pct)
        )
        requiredMajor = neoJavaMajor
      } catch (javaErr) {
        const msg = (javaErr as Error).message
        setState(instanceId, 'error', msg)
        throw new Error(msg)
      }
    }
  }

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

  const client = new Client()

  // Override startMinecraft to suppress the console/terminal window that MCLC's
  // default detached spawn creates on Windows, while still piping stdout/stderr.
  ;(client as any).startMinecraft = function(launchArguments: string[]): ChildProcess {
    const proc = spawn(
      (this.options.javaPath as string | undefined) ?? 'java',
      launchArguments,
      {
        cwd: (this.options.overrides?.cwd as string | undefined) ?? this.options.root as string,
        detached: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    )
    proc.stdout!.on('data', (d: Buffer) => this.emit('data', d.toString('utf-8')))
    proc.stderr!.on('data', (d: Buffer) => this.emit('data', d.toString('utf-8')))
    proc.on('close', (code: number) => this.emit('close', code))
    return proc
  }

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
      emitLog(`[Ender Launcher] Detected missing shader: ${shaderName} ${version} — downloading automatically…`)
      autoInstallShader(shaderName, version, shaderpacks)
        .then((dest) => {
          if (dest) {
            emitLog(`[Ender Launcher] ✓ ${shaderName} ${version} installed. Close and relaunch the game to apply.`)
          } else {
            emitLog(`[Ender Launcher] Could not find ${shaderName} ${version} on Modrinth — download manually from https://www.complementary.dev/`)
          }
        })
        .catch((e: Error) => {
          emitLog(`[Ender Launcher] Shader auto-download failed: ${e.message}`)
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
    if (!launched) {
      // Game process exited before producing any output — it crashed on startup.
      setState(instanceId, 'error', `Game crashed on startup (exit code ${code}). Open the log panel for details.`)
    } else {
      setState(instanceId, 'closed', `Game exited (code ${code}).`)
    }
    setIdle()
  })

  setState(instanceId, 'launching', 'Starting Minecraft…')

  console.log('[Launcher] Launching', {
    id: instanceId,
    mc: instance.mcVersion,
    loader: resolvedLoaderType,
    customVersion,
    forgeInstaller: forgeInstallerPath,
    javaPath: resolvedJavaPath
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
    javaPath: resolvedJavaPath === 'java' ? undefined : resolvedJavaPath,
    ...(serverAddress ? { quickPlay: { type: quickPlayType(instance.mcVersion), identifier: serverAddress } } : {}),
    ...(() => {
      const userArgs = instance.jvmArgs?.trim() ? instance.jvmArgs.trim().split(/\s+/).filter(Boolean) : []
      const allArgs = [...neoforgeJvmArgs, ...userArgs]
      return allArgs.length > 0 ? { customArgs: allArgs } : {}
    })()
  })

  if (!proc) {
    running.delete(instanceId)
    const reason = mclcError?.message ?? 'unknown — check the main process console for [MCLC debug] output'
    setState(instanceId, 'error', `Launch failed: ${reason}`)
    throw new Error(`minecraft-launcher-core returned no process: ${reason}`)
  }

  running.set(instanceId, proc)
}
