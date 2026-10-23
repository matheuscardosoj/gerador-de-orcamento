import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'node',
    // Os testes de banco sobem Postgres em WebAssembly (PGlite), que é lento em
    // máquinas com poucos núcleos, como os runners do CI: menos workers e prazos folgados.
    maxWorkers: process.env.CI ? 2 : 4,
    testTimeout: 60_000,
    hookTimeout: 120_000
  }
})
