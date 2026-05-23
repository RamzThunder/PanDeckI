/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        diary: {
          pink: '#F8B4C8',
          'pink-light': '#FDE8F0',
          'pink-dark': '#E8889E',
          green: '#B8D4B8',
          'green-light': '#E8F4E8',
          cream: '#FFF8F0',
          beige: '#F5EDE0',
        }
      },
      fontFamily: {
        diary: ['"Noto Sans KR"', 'sans-serif'],
      }
    }
  },
  plugins: []
}
