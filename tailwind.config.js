/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        synapse: {
          // Core green
          50:  '#e6fff5',
          100: '#b3ffe0',
          200: '#80ffcc',
          300: '#4dffb8',
          400: '#1affa3',
          500: '#00ff88',
          600: '#00d473',
          700: '#00aa5c',
          800: '#008045',
          900: '#00552e',
          950: '#002b17',
        },
        surface: {
          0:   '#000000',
          50:  '#050908',
          100: '#0a1210',
          200: '#0f1a17',
          300: '#14221e',
          400: '#1a2a25',
          500: '#1f322c',
          600: '#243a33',
        },
        accent: {
          blue:   '#38bdf8',
          amber:  '#fbbf24',
          rose:   '#fb7185',
          violet: '#a78bfa',
        },
      },
      boxShadow: {
        'glow-sm': '0 0 8px 0 rgba(0,255,136,0.35)',
        'glow':    '0 0 16px 0 rgba(0,255,136,0.45)',
        'glow-lg': '0 0 28px 0 rgba(0,255,136,0.55)',
        'glow-xl': '0 0 48px 0 rgba(0,255,136,0.4)',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 8px 0 rgba(0,255,136,0.3)' },
          '50%':      { boxShadow: '0 0 24px 0 rgba(0,255,136,0.7)' },
        },
        'border-flow': {
          '0%':   { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
        'scan-down': {
          '0%':   { transform: 'translateY(-100%)', opacity: '0' },
          '50%':  { opacity: '1' },
          '100%': { transform: 'translateY(400%)', opacity: '0' },
        },
        'blink-eye': {
          '0%, 90%, 100%': { transform: 'scaleY(1)' },
          '95%':           { transform: 'scaleY(0.1)' },
        },
        'data-flow': {
          '0%':   { strokeDashoffset: '40', opacity: '0' },
          '20%':  { opacity: '1' },
          '80%':  { opacity: '1' },
          '100%': { strokeDashoffset: '0', opacity: '0' },
        },
        'float-up': {
          '0%':   { transform: 'translateY(0)', opacity: '0.4' },
          '50%':  { opacity: '0.8' },
          '100%': { transform: 'translateY(-20px)', opacity: '0' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%':   { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'bounce-in': {
          '0%':   { opacity: '0', transform: 'scale(0.8)' },
          '60%':  { opacity: '1', transform: 'scale(1.05)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'pulse-glow':    'pulse-glow 2s ease-in-out infinite',
        'border-flow':   'border-flow 3s linear infinite',
        'scan-down':     'scan-down 1.5s ease-in-out infinite',
        'blink-eye':     'blink-eye 4s ease-in-out infinite',
        'data-flow':     'data-flow 2s linear infinite',
        'float-up':      'float-up 3s ease-out infinite',
        'spin-slow':     'spin-slow 8s linear infinite',
        'fade-in':       'fade-in 0.3s ease-out',
        'slide-in-right':'slide-in-right 0.3s ease-out',
        'shimmer':       'shimmer 2s linear infinite',
        'bounce-in':     'bounce-in 0.4s ease-out',
      },
    },
  },
  plugins: [],
};
