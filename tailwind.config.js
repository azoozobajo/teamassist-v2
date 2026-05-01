export default {
  content: ['./index.html','./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: { tajawal: ['Tajawal', 'sans-serif'] },
      colors: {
        brand: { 50:'#f0fdf9',100:'#ccfbef',200:'#99f6e0',300:'#5eead4',400:'#2dd4bf',500:'#1D9E75',600:'#0f766e',700:'#085041',800:'#064e3b',900:'#022c22' }
      }
    }
  },
  plugins: []
}
