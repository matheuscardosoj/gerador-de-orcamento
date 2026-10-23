import { writeFileSync } from 'fs'
import { join } from 'path'
import { app, dialog } from 'electron'
import { montarRelatorioDiagnostico } from './diagnostico'

/** Pede o destino e grava o relatório de suporte. Devolve o caminho, ou null se cancelado. */
export async function exportarDiagnostico(): Promise<string | null> {
  const data = new Date().toISOString().slice(0, 10)
  const escolha = await dialog.showSaveDialog({
    title: 'Exportar diagnóstico',
    defaultPath: join(app.getPath('documents'), `diagnostico-gerador-${data}.json`),
    filters: [{ name: 'Diagnóstico (JSON)', extensions: ['json'] }]
  })
  if (escolha.canceled || !escolha.filePath) return null
  writeFileSync(escolha.filePath, montarRelatorioDiagnostico(), 'utf8')
  return escolha.filePath
}
