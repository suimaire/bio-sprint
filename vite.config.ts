import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === 'true' ? '/bio-sprint/' : '/',
  plugins: [react()],
  test: { include: ['src/**/*.test.ts'] },
});
