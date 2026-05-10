/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b0f17',
          elev: '#131826',
          card: '#1a2030',
        },
        ink: {
          DEFAULT: '#e6ebf2',
          dim: '#9aa3b2',
          faint: '#5b6577',
        },
        accent: {
          DEFAULT: '#3b82f6',
          hover: '#2563eb',
        },
        good: '#22c55e',
        bad: '#ef4444',
        warn: '#f59e0b',
        bank: '#3b82f6',
        park: '#eab308',
        admin: '#f97316',
      },
      fontFamily: {
        sans: [
          '"Inter"',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif',
        ],
      },
      animation: {
        'pulse-bad': 'pulse-bad 1.6s ease-in-out infinite',
      },
      keyframes: {
        'pulse-bad': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
    },
  },
  plugins: [],
};
