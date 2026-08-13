const ALLOWED_GET_PATHS = [
  /^\/v1\/mods\/search$/,
  /^\/v1\/mods\/\d+$/,
  /^\/v1\/mods\/\d+\/files$/,
  /^\/v1\/mods\/\d+\/files\/\d+$/,
  /^\/v1\/mods\/\d+\/files\/\d+\/(?:download-url|changelog)$/
]

const ALLOWED_QUERY_KEYS = new Set([
  'gameId',
  'classId',
  'categoryId',
  'gameVersion',
  'gameVersionTypeId',
  'searchFilter',
  'sortField',
  'sortOrder',
  'modLoaderType',
  'index',
  'pageSize',
  'slug',
  'authorId'
])

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function isAllowedCurseForgeRequest(method, pathname, searchParams = new URLSearchParams()) {
  if (typeof pathname !== 'string' || pathname.length > 300) return false
  if (method === 'GET') {
    if (!ALLOWED_GET_PATHS.some((pattern) => pattern.test(pathname))) return false
    for (const [key, value] of searchParams) {
      if (!ALLOWED_QUERY_KEYS.has(key) || value.length > 200) return false
    }
    const pageSize = searchParams.get('pageSize')
    if (pageSize && (!/^\d+$/.test(pageSize) || Number(pageSize) > 50)) return false
    const index = searchParams.get('index')
    if (index && (!/^\d+$/.test(index) || Number(index) > 10000)) return false
    return true
  }
  return method === 'POST' && (pathname === '/v1/mods' || pathname === '/v1/mods/files')
}

function validCurseForgeBody(pathname, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  const keys = Object.keys(body)
  if (keys.length !== 1) return false
  const field = pathname === '/v1/mods' ? 'modIds' : pathname === '/v1/mods/files' ? 'fileIds' : null
  if (!field || keys[0] !== field || !Array.isArray(body[field])) return false
  const max = field === 'modIds' ? 50 : 100
  return body[field].length > 0
    && body[field].length <= max
    && body[field].every(isPositiveInteger)
}

module.exports = { isAllowedCurseForgeRequest, validCurseForgeBody }
