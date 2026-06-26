/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        panel: 'var(--surface)',
        panel2: 'var(--surface-2)',
        panel3: 'var(--surface-3)',
        border: 'var(--border)',
        accent: 'var(--accent)',
        accent2: 'var(--accent-strong)',
        muted: 'var(--text-muted)'
      },
      boxShadow: {
        'glow-sm': '0 0 12px rgba(var(--accent-rgb), 0.2)',
        'glow': '0 0 24px rgba(var(--accent-rgb), 0.25)',
        'glow-lg': '0 0 40px rgba(var(--accent-rgb), 0.3)',
      }
    }
  },
  plugins: []
}
