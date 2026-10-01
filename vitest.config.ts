import { configDefaults, defineConfig } from 'vitest/config';

// tests/**/*.test.ts corren siempre. Los *.test-d.ts son tests de tipos: vitest
// los chequea con tsc. tests/consumers/ es un proyecto aparte y no corre acá.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'tests/consumers/**'],
    typecheck: {
      enabled: true,
      include: ['tests/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
    testTimeout: 20_000,
  },
});
