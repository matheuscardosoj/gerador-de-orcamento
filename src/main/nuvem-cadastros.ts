// Captura dos cadastros locais alterados para a fila de envio e verificação de integridade.
import type { ConfigNuvem } from '@shared/types'
import { criarPayloadCadastroSalvo } from '@shared/cadastros-sincronizacao'
import { all, db, get, texto } from './db/sqlite'
import { enfileirar } from './versoes'
import { conteudoEquivalente } from './pendencias-anteriores'
import { config, salvar, tabelas } from './nuvem-config'

export function capturarCadastros(): void {
  if (!config<ConfigNuvem>('nuvem')) return
  const inicio = performance.now()
  // Imagens são endereçadas por hash e nunca alteradas: as que já têm estado
  // conhecido não precisam ser relidas (o base64 completo é pesado).
  const imagensConhecidas = new Set(
    all(`SELECT chave FROM configuracoes WHERE chave LIKE 'estado:imagens:%'`).map((l) =>
      texto(l.chave)
    )
  )
  for (const t of tabelas) {
    const linhas =
      t === 'configuracoes'
        ? // Só estas chaves são sincronizadas; evita carregar os caches `estado:*`.
          all(
            `SELECT * FROM configuracoes WHERE chave IN ('empresa','parametros','camposClientePadrao')`
          )
        : t === 'imagens'
          ? all(`SELECT hash FROM imagens`)
              .filter((l) => !imagensConhecidas.has(`estado:imagens:${texto(l.hash)}`))
              .map((l) => get(`SELECT * FROM imagens WHERE hash=?`, [texto(l.hash)]) ?? l)
          : all(`SELECT * FROM ${t}`)
    for (const l of linhas) {
      const id = texto(l.id ?? l.hash ?? l.chave)
      // Apenas captura quando o estado difere do último envio conhecido.
      const chave = `estado:${t}:${id}`
      const payload = criarPayloadCadastroSalvo(
        t as Parameters<typeof criarPayloadCadastroSalvo>[0],
        id,
        l
      )
      const estado = JSON.stringify(payload)
      const anterior = config<string>(chave)
      let igual = anterior === estado
      if (!igual && anterior) {
        try {
          const conhecido = JSON.parse(anterior)
          igual = conteudoEquivalente(conhecido, payload)
        } catch {
          // Cache inválido não pode esconder uma mudança local real.
        }
      }
      if (!igual) {
        enfileirar(`${t}:${id}`, payload)
        salvar(chave, estado)
      }
    }
  }
  const ms = performance.now() - inicio
  if (ms > 200) console.warn(`[desempenho] capturarCadastros levou ${Math.round(ms)} ms`)
}
export function verificarIntegridadeLocal(): void {
  if (texto(db().get('PRAGMA integrity_check')?.integrity_check) !== 'ok')
    throw new Error('Falha de integridade local.')
}
