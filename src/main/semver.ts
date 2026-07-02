/** Numeric semver comparison; prerelease/build suffixes are ignored ("0.4.0-beta.1" == "0.4.0"). */
export function semverGt(a: string, b: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split(/[-+]/)[0].split('.').map((s) => parseInt(s, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff > 0) return true
    if (diff < 0) return false
  }
  return false
}
