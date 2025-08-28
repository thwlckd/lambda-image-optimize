import { defineConfig } from 'vitest/config';
import packageJson from './package.json';

export default defineConfig({
  test: {
    name: packageJson.name,
    watch: false,
    include: ['**/*.test.ts'],
  },
});
