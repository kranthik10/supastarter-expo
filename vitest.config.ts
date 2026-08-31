import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/{src,test}/**/*.test.{ts,tsx}', 'packages/**/__tests__/**/*.{ts,tsx}', 'apps/mobile/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/web-build/**', '**/coverage/**'],
    passWithNoTests: true,
  },
});
