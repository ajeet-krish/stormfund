/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Deep space background scale
        void: '#05070f',
        'void-2': '#0a0e1c',
        'void-3': '#101628',
        grid: '#1b2440',
        // Signal cyan: active UI, transfers, focus
        signal: '#39c2e0',
        'signal-dim': '#1a7f96',
        // Money and fuel accents
        fuel: '#f0b429',
        planar: '#8b7cf6',
        danger: '#e05a5a',
        // Cool ink scale
        ink: '#dce6f5',
        'ink-dim': '#8b9bb4',
        'ink-faint': '#55657f',
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
