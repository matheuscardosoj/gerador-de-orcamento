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
    // No runner do CI (Windows, 2 núcleos) o conjunto leva de 3 a 5 min conforme a carga da
    // máquina, e um único teste de sincronização com PGlite já passou de 70 s; localmente
    // o arquivo inteiro leva ~13 s. Prazos folgados só no CI.
    testTimeout: process.env.CI ? 240_000 : 60_000,
    hookTimeout: process.env.CI ? 240_000 : 120_000
  }
})
