import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { gunzipSync } from 'zlib'

/** Minimal NBT reader — only handles what's needed for servers.dat. */
function parseNbt(raw: Buffer): Record<string, unknown> {
  const buf = (raw[0] === 0x1f && raw[1] === 0x8b) ? gunzipSync(raw) : raw
  let p = 0

  const u8  = (): number => buf.readUInt8(p++)
  const i16 = (): number => { const v = buf.readInt16BE(p); p += 2; return v }
  const u16 = (): number => { const v = buf.readUInt16BE(p); p += 2; return v }
  const i32 = (): number => { const v = buf.readInt32BE(p); p += 4; return v }

  const str = (): string => { const n = u16(); const v = buf.toString('utf8', p, p + n); p += n; return v }

  function payload(type: number): unknown {
    switch (type) {
      case 1:  { const v = buf.readInt8(p++); return v }
      case 2:  return i16()
      case 3:  return i32()
      case 4:  { p += 8; return 0n }
      case 5:  { p += 4; return 0 }
      case 6:  { p += 8; return 0 }
      case 7:  { const n = i32(); p += n; return null }
      case 8:  return str()
      case 9:  {
        const et = u8(); const count = i32()
        const arr: unknown[] = []
        for (let i = 0; i < count; i++) arr.push(payload(et))
        return arr
      }
      case 10: {
        const obj: Record<string, unknown> = {}
        for (;;) {
          const t = u8()
          if (t === 0) break
          const name = str()
          obj[name] = payload(t)
        }
        return obj
      }
      case 11: { const n = i32(); p += n * 4; return null }
      case 12: { const n = i32(); p += n * 8; return null }
      default: throw new Error(`Unknown NBT tag type ${type}`)
    }
  }

  const rootType = u8()
  str() // root name (usually empty)
  return payload(rootType) as Record<string, unknown>
}

export interface SavedServer {
  name: string
  ip: string
}

/** Returns the servers saved in an instance's servers.dat, or [] if none / not found. */
export function readSavedServers(gameDir: string): SavedServer[] {
  const file = join(gameDir, 'servers.dat')
  if (!existsSync(file)) return []
  try {
    const nbt = parseNbt(readFileSync(file))
    const list = nbt['servers']
    if (!Array.isArray(list)) return []
    return list
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === 'object')
      .flatMap((e) => {
        const ip = e['ip']
        if (typeof ip !== 'string' || !ip) return []
        const name = typeof e['name'] === 'string' ? e['name'] : ip
        return [{ name, ip }]
      })
  } catch {
    return []
  }
}
