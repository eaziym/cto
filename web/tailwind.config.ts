import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f8ff',
          100: '#e1f0ff',
          200: '#b9d8ff',
          300: '#88bbff',
          400: '#4b95ff',
          500: '#1f6eff',
          600: '#1553d6',
          700: '#123f9f',
          800: '#102f73',
          900: '#0d2458'
        },
        verdict: {
          likely: '#0f9d58',
          borderline: '#f4b400',
          unlikely: '#db4437'
        }
      },
      boxShadow: {
        card: '0 10px 30px -15px rgba(16,47,115,0.25)'
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'fade-in-up': 'fade-in-up 0.3s ease-out',
      },
    }
  },
  plugins: [
    require('@tailwindcss/typography'),
  ]
} satisfies Config;
