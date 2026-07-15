import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    redis: 'src/stores/redis-store.ts',
    sql: 'src/stores/sql-store.ts',
  },
  format: 'esm',
  fixedExtension: false,
  dts: true,
  clean: true,
});
