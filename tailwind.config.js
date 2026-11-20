/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        eink: {
          paper: '#F4F3EE',
          bar: '#FBFAF7',
          surface: '#F1F0EB',
          ink: '#191919',
          pressed: '#000000',
          text: '#191919',
          sub: '#5C5C5C',
          faint: '#8A8A85',
          line: '#191919',
          divider: '#D8D6CE',
          disabled: '#C6C4BC',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
}
