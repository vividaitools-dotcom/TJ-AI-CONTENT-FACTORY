import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#05060c',
          900: '#080a14',
          850: '#0b0e1b',
          800: '#0f1322',
          700: '#171c30',
          600: '#222941',
        },
        neon: {
          violet: '#8b5cf6',
          indigo: '#6366f1',
          cyan: '#22d3ee',
          mint: '#34d399',
          amber: '#fbbf24',
          rose: '#fb7185',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(139,92,246,0.35), 0 18px 50px -20px rgba(139,92,246,0.55)',
        card: '0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -32px rgba(0,0,0,0.9)',
      },
      backgroundImage: {
        'grid-fade':
          'radial-gradient(circle at 20% 0%, rgba(139,92,246,0.18), transparent 55%), radial-gradient(circle at 85% 15%, rgba(34,211,238,0.14), transparent 50%), radial-gradient(circle at 50% 100%, rgba(99,102,241,0.12), transparent 55%)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2.2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
