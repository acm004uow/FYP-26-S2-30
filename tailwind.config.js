/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/actors/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        divider: '#e2e5ea',
        accent: {
          DEFAULT: '#2564cf',
          100: '#e8f0fe',
          200: '#cfe0fc',
          300: '#a6c8f9',
          400: '#6fa4f0',
          500: '#2564cf',
          600: '#1d54b3',
          700: '#164290',
          800: '#123571',
          900: '#0d2856',
        },
        accent2: {
          DEFAULT: '#0b1f3a',
          100: '#e7eaf0',
          200: '#c7cdda',
          300: '#97a2ba',
          400: '#566284',
          500: '#0b1f3a',
          600: '#0a1c34',
          700: '#08172b',
          800: '#061020',
          900: '#040a15',
        },
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15, 23, 42, 0.06)',
        DEFAULT: '0 1px 2px rgba(15, 23, 42, 0.06)',
        md: '0 4px 12px rgba(15, 23, 42, 0.08)',
        lg: '0 16px 40px rgba(15, 23, 42, 0.16)',
      },
    },
  },
  plugins: [],
}
