/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        magenta: {
          500: '#d927a0',
          600: '#b8219e',
        }
      }
    },
  },
  plugins: [],
}
