/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/frontend/index.html",
    "./app/frontend/static/js/**/*.js",
    "./app/frontend/src/**/*.{vue,ts,js}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          500: '#10b981',
          600: '#059669',
        },
        success: {
          500: '#10b981',
        },
        warning: {
          500: '#f59e0b',
        },
        error: {
          500: '#ef4444',
        }
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'bounce-subtle': 'bounceSubtle 0.6s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideIn: {
          from: { 
            opacity: '0',
            transform: 'translateY(-10px)'
          },
          to: { 
            opacity: '1',
            transform: 'translateY(0)'
          },
        },
        bounceSubtle: {
          '0%, 20%, 50%, 80%, 100%': {
            transform: 'translateY(0)',
          },
          '40%': {
            transform: 'translateY(-3px)',
          },
          '60%': {
            transform: 'translateY(-2px)',
          },
        }
      }
    },
  },
  safelist: [
    'hero-container', 'hero-inner', 'hero-copy', 'hero-title', 'hero-sub',
    'cta-row', 'cta-primary', 'cta-secondary', 'hero-card', 'svg-icon', 'svg-icon.lg'
  ],
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
}
