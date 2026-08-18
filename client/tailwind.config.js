/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'], // One neutral grotesque for the whole UI.
      },

      /**
       * Semantic colour tokens.
       *
       * Before this the app used five different blues (blue-500/600/700,
       * #007AFF, #2a78d6) and three unrelated status palettes, which is what
       * made the UI feel patchy. Everything now names a role instead of a hex.
       *
       * Contrast was measured, not guessed:
       *   brand   #2a78d6 — 4.42:1 on white. Fine behind large bold button text
       *                     (3:1 threshold); NOT enough for small text.
       *   brandInk #1c5cab — 6.63:1 on white. Use for links and any small text.
       * Each soft/ink status pair clears 4.5:1 (measured 4.8–6.9:1).
       */
      colors: {
        brand: {
          DEFAULT: '#2a78d6', // fills, marks, chart series
          ink: '#1c5cab',     // text, links, hover on a brand fill
          soft: '#e7f0fc',    // tinted backgrounds
        },
        state: {
          success: '#0a7c0a',
          'success-soft': '#e8f6e8',
          warning: '#9a5b00',
          'warning-soft': '#fdf1d6',
          danger: '#b02525',
          'danger-soft': '#fdecec',
          info: '#1c5cab',
          'info-soft': '#e7f0fc',
          neutral: '#52514e',
          'neutral-soft': '#f0efec',
        },
        // The three greys the layouts already use, named so new code stops
        // inventing a fourth.
        surface: {
          DEFAULT: '#ffffff',
          muted: '#F5F5F7',   // cards, inputs, wells
          sunken: '#EDEDF0',  // admin page background
        },
      },

      /**
       * Dropdown panels. Short and slight on purpose — a menu that animates for
       * long enough to notice is a menu you are waiting on, and the panel opens
       * under the pointer where any movement reads as lag.
       *
       * Both are wrapped in prefers-reduced-motion by the utilities below.
       */
      keyframes: {
        'pop-down': {
          from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'pop-up': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'pop-down': 'pop-down 120ms cubic-bezier(0.16, 1, 0.3, 1)',
        'pop-up': 'pop-up 120ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
