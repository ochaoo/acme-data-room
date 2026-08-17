import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        muted: '#667085',
        canvas: '#f6f7fb',
        brand: '#4f46e5',
      },
      boxShadow: {
        panel: '0 12px 32px rgba(23, 32, 51, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
