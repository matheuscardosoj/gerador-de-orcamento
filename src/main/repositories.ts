// Repositórios sobre SQLite. As assinaturas públicas são as mesmas de quando a
// persistência era JSON — o IPC, o preload e o renderer não conhecem o banco.
import { randomUUID } from 'crypto'
import { proximoCodigoCadastro } from './codigos-cadastros'
import { registrarImagem, imagemDataUrl } from './imagens'
import { all, get, run, tx, texto, numero, numeroOuNulo } from './db/sqlite'
import type { Linha } from './db/sqlite'
import { lerConfig, gravarConfig } from './repositories/base'
import { observacoesRepo, pagamentosRepo } from './repositories/textos-padrao'
export { observacoesRepo, pagamentosRepo }
export { relatoriosRepo, anexosRelatorioRepo } from './repositories/relatorios'
export { orcamentosRepo, anexosRepo, definirSeqOrcamento } from './repositories/orcamentos'
import { bancoInicial, configIAPadrao } from './db/seeds'
import type { EmpresaConfig, ParametrosFinanceiros, ServicoCatalogo, ConfigIA } from '@shared/types'
import {
  exigirValidacao,
  validarParametrosFinanceiros,
  validarUrlOllamaLocal
} from '@shared/validacao'
import { validarEmpresaParcial, validarServicoCatalogo } from '@shared/validacao-cadastros'

// -------------------------------------------------------------- Configurações
// Singletons guardados como JSON numa linha de `configuracoes`.

/** Cria as linhas iniciais quando o banco nasce vazio. */
export function semear(incluirPadroes = true): void {
  const inicial = bancoInicial()
  tx(() => {
    gravarConfig('empresa', inicial.empresa)
    gravarConfig('parametros', inicial.parametros)
    gravarConfig('configIA', inicial.configIA)
    gravarConfig('seqOrcamento', 0)
    inicial.servicos.forEach((s) => servicosRepo.create(s))
    if (incluirPadroes) {
      inicial.observacoesPadrao.forEach((o) => observacoesRepo.create(o))
      inicial.pagamentosPadrao.forEach((p) => pagamentosRepo.create(p))
    }
  })
}

export function bancoVazio(): boolean {
  return !get('SELECT valor FROM configuracoes WHERE chave = ?', ['empresa'])
}

// ---------------------------------------------------------------- Empresa
export const empresaRepo = {
  get: (): EmpresaConfig => {
    const e = lerConfig('empresa', bancoInicial().empresa)
    return e.logoHash ? { ...e, logoDataUrl: imagemDataUrl(e.logoHash) ?? null } : e
  },
  save: (patch: Partial<EmpresaConfig>): EmpresaConfig => {
    exigirValidacao(validarEmpresaParcial(patch))
    const atual = { ...empresaRepo.get(), ...patch }
    const hash = atual.logoDataUrl ? registrarImagem(atual.logoDataUrl, null, 0, 0, true) : null
    gravarConfig('empresa', { ...atual, logoHash: hash ?? undefined, logoDataUrl: null })
    return atual
  }
}

// ------------------------------------------------------------- Parâmetros
export const parametrosRepo = {
  get: (): ParametrosFinanceiros => lerConfig('parametros', bancoInicial().parametros),
  save: (patch: Partial<ParametrosFinanceiros>): ParametrosFinanceiros => {
    const atual = { ...parametrosRepo.get(), ...patch }
    exigirValidacao(validarParametrosFinanceiros(atual))
    gravarConfig('parametros', atual)
    return atual
  }
}

// --------------------------------------------------------------- Config IA
export const configIARepo = {
  get: (): ConfigIA => {
    const config = lerConfig('configIA', configIAPadrao)
    if (!validarUrlOllamaLocal(config.urlOllama).length) return config
    // Bancos legados podiam guardar um endpoint remoto. Não o reutilizamos
    // silenciosamente, pois o resumo enviado à IA contém dados do documento.
    return {
      ...config,
      modo: config.modo === 'ollama' ? 'desligada' : config.modo,
      urlOllama: configIAPadrao.urlOllama
    }
  },
  save: (patch: Partial<ConfigIA>): ConfigIA => {
    const atual = { ...configIARepo.get(), ...patch }
    if (atual.modo === 'ollama') exigirValidacao(validarUrlOllamaLocal(atual.urlOllama))
    gravarConfig('configIA', atual)
    return atual
  }
}

// Cadastro isolado; a fachada mantém compatibilidade com IPC e consumidores.
export { clientesRepo } from './repositories/clientes'

// -------------------------------------------------------- Catálogo serviços
const paraServico = (l: Linha): ServicoCatalogo => ({
  id: texto(l.id),
  codigo: numero(l.codigo),
  nome: texto(l.nome),
  descricaoPadrao: texto(l.descricao_padrao),
  unidade: texto(l.unidade),
  precoReferencia: numeroOuNulo(l.preco_referencia)
})

export const servicosRepo = {
  list: (): ServicoCatalogo[] =>
    all('SELECT * FROM servicos ORDER BY ordem,nome COLLATE NOCASE,id').map(paraServico),
  get: (id: string): ServicoCatalogo | null => {
    const l = get('SELECT * FROM servicos WHERE id = ?', [id])
    return l ? paraServico(l) : null
  },
  create: (dto: Omit<ServicoCatalogo, 'id'> & { id?: string }): ServicoCatalogo => {
    exigirValidacao(validarServicoCatalogo(dto, false))
    const id = dto.id ?? randomUUID()
    return tx(() => {
      const s: ServicoCatalogo = { ...dto, codigo: proximoCodigoCadastro('servico', id), id }
      run(
        `INSERT INTO servicos (id, nome, descricao_padrao, unidade, preco_referencia, codigo)
       VALUES (?, ?, ?, ?, ?, ?)`,
        [s.id, s.nome, s.descricaoPadrao, s.unidade, s.precoReferencia, s.codigo]
      )
      run(
        'UPDATE servicos SET ordem=(SELECT COALESCE(MAX(ordem),-1)+1 FROM servicos WHERE id<>?) WHERE id=?',
        [s.id, s.id]
      )
      return s
    })
  },
  update: (id: string, patch: Partial<ServicoCatalogo>): ServicoCatalogo | null => {
    exigirValidacao(validarServicoCatalogo(patch, true))
    const atual = servicosRepo.get(id)
    if (!atual) return null
    const novo = { ...atual, ...patch, id, codigo: atual.codigo }
    run(
      `UPDATE servicos SET nome = ?, descricao_padrao = ?, unidade = ?, preco_referencia = ? WHERE id = ?`,
      [novo.nome, novo.descricaoPadrao, novo.unidade, novo.precoReferencia, id]
    )
    return novo
  },
  remove: (id: string): void => {
    run('DELETE FROM servicos WHERE id = ?', [id])
  }
}
