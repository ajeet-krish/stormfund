/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Daylight ground scale: a pale sky tinted paper, the light
        // theme the whole station sits on (morning forecast on paper).
        // Token names stay from the dark draft so no component class
        // had to be rewritten; only the values changed.
        void: '#eaf1fb',
        'void-2': '#ffffff',
        'void-3': '#dbe7f7',
        grid: '#8496b3',
        // Forecast blue: active UI, transfers, focus
        signal: '#0d6ea8',
        'signal-dim': '#0a5380',
        // Money and fuel accents
        fuel: '#8f5502',
        planar: '#5744c2',
        danger: '#c02f12',
        // Cool ink scale: dark slate text on the daylight ground
        ink: '#16273f',
        'ink-dim': '#3f5270',
        'ink-faint': '#56688a',
        // Console verdict bands (cp): one hue per band, re-tuned from
        // the dark draft so every band label clears WCAG AA on white
        // panels and on the daylight ground, while keeping the same
        // five hues (critical hot, storm amber, watch violet, fair
        // blue, clear green). Glyphs and labels always ride with a
        // band name, so color never carries the verdict alone.
        cp: {
          critical: '#c02f12',
          storm: '#8f5502',
          watch: '#5744c2',
          fair: '#0b6b93',
          clear: '#0a7a5a',
        },
      },
      fontFamily: {
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
