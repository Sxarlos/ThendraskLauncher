import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class RendererErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] Unhandled render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div
        className="h-screen w-screen flex items-center justify-center p-8"
        style={{ background: 'var(--bg)', color: 'var(--text)' }}
      >
        <div
          className="w-full max-w-lg rounded-2xl p-6"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div className="text-2xl mb-3">⚠</div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text-bright)' }}>
            The launcher hit a display error
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            Your instances and settings are safe. Reload the interface to recover.
          </p>
          <pre
            className="mt-4 p-3 rounded-lg text-xs overflow-auto max-h-32 whitespace-pre-wrap"
            style={{ background: 'var(--bg-inset)', color: 'var(--danger-soft)' }}
          >
            {this.state.error.message}
          </pre>
          <button
            className="mt-5 px-4 py-2 rounded-lg text-sm font-semibold text-black"
            style={{ background: 'var(--accent-strong)' }}
            onClick={() => window.location.reload()}
          >
            Reload launcher
          </button>
        </div>
      </div>
    )
  }
}
