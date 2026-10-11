const { createHash } = require('node:crypto')
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { isValidCode } = require('./validation')

// Ownership survives offline periods and restarts without an unbounded in-memory map.
function createClaims(directory) {
  mkdirSync(directory, { recursive: true })
  return {
    authorize(code, secret) {
      if (!isValidCode(code)) throw new Error('Invalid friend code')
      const path = join(directory, code)
      const digest = createHash('sha256').update(secret).digest('hex')
      try {
        writeFileSync(path, digest, { flag: 'wx', mode: 0o600 })
        return true
      } catch (error) {
        if (error.code !== 'EEXIST') throw error
        return readFileSync(path, 'utf8') === digest
      }
    }
  }
}

module.exports = { createClaims }
