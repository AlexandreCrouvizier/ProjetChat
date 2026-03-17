/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Couleurs de l'app (Glassmorphism theme)
        accent: {
          DEFAULT: '#8b5cf6',
          light: '#a78bfa',
          dark: '#7c3aed',
          glow: 'rgba(139, 92, 246, 0.35)',
          soft: 'rgba(139, 92, 246, 0.12)',
        },
        online: '#34d399',
      },
      backdropBlur: {
        glass: '28px',
        'glass-strong': '40px',
      },
      borderRadius: {
        glass: '16px',
      },
    },
  },
  plugins: [],
};
