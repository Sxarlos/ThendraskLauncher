import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import App from '../src/renderer/src/App'
import { useApp } from '../src/renderer/src/store'

describe('renderer startup', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders safely before accounts and instances have loaded', () => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    })
    useApp.setState({
      page: 'home',
      accounts: [],
      instances: [],
      progress: {},
      error: null
    })

    const html = renderToString(createElement(App))

    expect(html).toContain('Thendrask Launcher')
    expect(html).toContain('Home')
  })
})
