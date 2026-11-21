/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 50: '#eef2f9', 100: '#dbe4f3', 200: '#b9c9e6', 300: '#8aa5d4', 400: '#5a7fc0', 500: '#3a62a8', 600: '#1e3a6e', 700: '#18305c', 800: '#14284b', 900: '#0d1b33' },
        teal: { 50: '#ecfeff', 100: '#cffafe', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490' },
        ok: { 50: '#ecfdf3', 100: '#d1fae5', 500: '#22c55e', 600: '#15803d', 700: '#166534' },
        warn: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#b45309', 700: '#92400e' },
        bad: { 50: '#fef2f2', 100: '#fee2e2', 500: '#ef4444', 600: '#b91c1c', 700: '#991b1b' },
      },
      borderRadius: { card: '1.25rem' },
      boxShadow: {
        soft: '0 1px 2px rgba(13,27,51,.04), 0 8px 24px -6px rgba(13,27,51,.10)',
        lift: '0 2px 4px rgba(13,27,51,.06), 0 18px 40px -12px rgba(13,27,51,.25)',
        glow: '0 0 0 4px rgba(6,182,212,.15), 0 12px 32px -8px rgba(6,182,212,.45)',
      },
      keyframes: {
        'fade-in-up': { '0%': { opacity: '0', transform: 'translateY(14px)' }, '100%': { opacity: '1', transform: 'none' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'scale-in': { '0%': { opacity: '0', transform: 'scale(.94)' }, '100%': { opacity: '1', transform: 'none' } },
        'slide-down': { '0%': { opacity: '0', transform: 'translateY(-16px)' }, '100%': { opacity: '1', transform: 'none' } },
        float: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-10px)' } },
        blob: {
          '0%,100%': { transform: 'translate(0,0) scale(1)' },
          '33%': { transform: 'translate(30px,-40px) scale(1.1)' },
          '66%': { transform: 'translate(-20px,20px) scale(.92)' },
        },
        shimmer: { '0%': { backgroundPosition: '-400px 0' }, '100%': { backgroundPosition: '400px 0' } },
        'ring-pulse': { '0%': { boxShadow: '0 0 0 0 rgba(34,197,94,.6)' }, '100%': { boxShadow: '0 0 0 28px rgba(34,197,94,0)' } },
        'gradient-x': { '0%,100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        wiggle: { '0%,100%': { transform: 'rotate(0)' }, '25%': { transform: 'rotate(-12deg)' }, '75%': { transform: 'rotate(12deg)' } },
      },
      animation: {
        'fade-in-up': 'fade-in-up .5s cubic-bezier(.2,.8,.2,1) both',
        'fade-in': 'fade-in .4s ease-out both',
        'scale-in': 'scale-in .35s cubic-bezier(.2,.8,.2,1) both',
        'slide-down': 'slide-down .35s cubic-bezier(.2,.8,.2,1) both',
        float: 'float 6s ease-in-out infinite',
        blob: 'blob 14s ease-in-out infinite',
        shimmer: 'shimmer 1.4s linear infinite',
        'ring-pulse': 'ring-pulse 1.2s ease-out infinite',
        'gradient-x': 'gradient-x 8s ease infinite',
        wiggle: 'wiggle .6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
