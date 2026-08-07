import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#0b1120',
        line: '#82abdf'
      },
      boxShadow: {
        neon: '0 0 24px rgba(62,167,255,0.2)',
      },
      fontFamily: {
        sora: ['Sora', 'sans-serif'],
        rajdhani: ['Rajdhani', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config;
