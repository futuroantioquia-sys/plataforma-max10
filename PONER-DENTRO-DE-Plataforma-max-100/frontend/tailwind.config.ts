import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        verde: {
          50:  '#F0FAF0',
          100: '#E8F5E9',
          200: '#A5D6A7',
          500: '#3D8B37',
          700: '#2E7D2E',
          900: '#1a472a',
        },
      },
    },
  },
  plugins: [],
};

export default config;
