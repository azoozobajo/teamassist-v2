export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        tajawal: ['Tajawal', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0fdf9',
          100: '#ccfbef',
          200: '#99f6e0',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#1D9E75',
          600: '#0f766e',
          700: '#085041',
          800: '#064e3b',
          900: '#022c22',
        },
        sport: {
          50:  '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
      },
      boxShadow: {
        'card':  '0 1px 6px rgba(15,23,42,0.06)',
        'card-hover': '0 4px 16px rgba(15,23,42,0.10)',
        'hero':  '0 6px 24px rgba(29,158,117,0.30)',
        'hero-blue': '0 6px 24px rgba(37,99,235,0.28)',
      },
      borderRadius: {
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
