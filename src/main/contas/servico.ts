import { app } from 'electron'
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ConfigNuvem } from '../../shared/types'
import type { ContaApi, ConviteConta, EmpresaConta, EstadoConta } from '../../shared/conta'
import { abrirBanco, fecharBanco, get, run, selecionarPerfilDados, texto } from '../db/sqlite'
import { bancoVazio, semear } from '../repositories'
import { avisarDados } from '../eventos'
import { encerrarIA } from '../ia'
import { encerrarEdicoesConta } from '../colaboracao'
import {
  adotarSessaoConta,
  configuracaoNuvem,
  configurarSessaoConta,
  inicializarNuvem,
  lerSessaoConta,
  pedidoNuvem,
  sairNuvem,
  sincronizarNuvem,
  statusNuvem,
  suspenderNuvemConta,
  observarAcessoNuvem
} from '../nuvem'
import { aguardarOperacoes, definirAcesso } from './acesso'
import {
  gravarPerfil,
  idPerfil,
  perfilAtual,
  idSolicitacao,
  concluirSolicitacao,
  type PerfilConta
} from './perfis'

type Token = NonNullable<ReturnType<typeof lerSessaoConta>> & {
  user: { id: string; user_metadata?: { name?: string }; email?: string }
}
type ContasRemotas = { operador: boolean; empresas: Array<EmpresaConta & { usuarioNome: string }> }
let perfil: PerfilConta | null = null
let tokenEntrada: Token | null = null
let configEntrada: ConfigNuvem | null = null
let nomeEntrada = ''
let estado: EstadoConta = {
  central: false,
  fase: 'desconectado',
  servicoConfigurado: false,
  email: '',
  nome: '',
  lembrar: false,
  operador: false,
  empresa: null,
  empresas: []
}
let mudando = false

function emitir(): EstadoConta {
  avisarDados({ origem: 'nuvem', entidades: [], status: true })
  return structuredClone(estado)
}
function servico(): ConfigNuvem | null {
  const caminho = join(process.resourcesPath, 'servico.json')
  const url = process.env.GERADOR_SERVICO_URL
  const chavePublica = process.env.GERADOR_SERVICO_CHAVE
  const dados =
    url && chavePublica
      ? { url, chavePublica, email: '' }
      : existsSync(caminho)
        ? JSON.parse(readFileSync(caminho, 'utf8'))
        : null
  if (
    dados &&
    (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(dados.url) ||
      !String(dados.chavePublica).startsWith('sb_publishable_'))
  )
    throw new Error('A configuração do serviço não é válida. Solicite o instalador atualizado.')
  return dados
}
async function requisitar(
  config: ConfigNuvem,
  path: string,
  body?: unknown,
  token?: string,
  method?: string
): Promise<unknown> {
  const resposta = await fetch(config.url + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: {
      apikey: config.chavePublica,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000)
  })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok)
    throw Object.assign(
      new Error(
        dados?.msg ?? dados?.message ?? dados?.erro ?? 'Não foi possível acessar o serviço.'
      ),
      { status: resposta.status, codigo: dados?.code }
    )
  return dados
}
function configuracaoAcesso(): ConfigNuvem {
  const config =
    servico() ?? perfil?.configuracao ?? perfilAtual()?.configuracao ?? configuracaoNuvem()
  if (!config.url || !config.chavePublica)
    throw new Error(
      'Esta instalação ainda não está conectada ao serviço. Procure o responsável pela instalação.'
    )
  return config
}
async function exclusiva<T>(acao: () => Promise<T>): Promise<T> {
  if (mudando) throw new Error('Aguarde a operação de acesso em andamento.')
  mudando = true
  try {
    return await acao()
  } finally {
    mudando = false
  }
}
async function fecharPerfil(): Promise<void> {
  definirAcesso(false)
  await aguardarOperacoes()
  await suspenderNuvemConta()
  encerrarEdicoesConta()
  encerrarIA()
  fecharBanco()
}
function gravar(chave: string, valor: unknown): void {
  run(
    'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
    [chave, JSON.stringify(valor)]
  )
}
export async function inicializarContas(): Promise<void> {
  observarAcessoNuvem((contexto) => {
    if (!contexto) {
      definirAcesso(false)
      estado = { ...estado, fase: 'desconectado', empresa: null }
      emitir()
      return
    }
    if (
      perfil?.empresa.id !== contexto.empresaId ||
      perfil.usuario !== contexto.usuarioId ||
      !contexto.papel
    )
      return
    const mudou = perfil.empresa.papel !== contexto.papel || perfil.nome !== contexto.usuarioNome
    if (!mudou) return
    perfil = {
      ...perfil,
      nome: contexto.usuarioNome,
      empresa: { ...perfil.empresa, papel: contexto.papel }
    }
    gravarPerfil(perfil)
    estado = { ...estado, nome: perfil.nome, empresa: perfil.empresa }
    definirAcesso(estado.fase === 'pronto', contexto.papel)
    emitir()
  })
  const salvo = perfilAtual()
  const config = servico() ?? salvo?.configuracao ?? configuracaoNuvem()
  estado = {
    ...estado,
    central: !!servico(),
    servicoConfigurado: !!config.url,
    email: salvo?.email ?? config.email,
    lembrar: salvo?.lembrar ?? false
  }
  if (!salvo?.lembrar) return
  await fecharPerfil()
  selecionarPerfilDados(salvo.id)
  abrirBanco()
  configurarSessaoConta(true, salvo.empresa.id, salvo.central)
  if (!lerSessaoConta()) return
  perfil = salvo
  estado = {
    ...estado,
    fase: 'pronto',
    empresa: salvo.empresa,
    empresas: [salvo.empresa],
    email: salvo.email,
    nome: salvo.nome,
    central: salvo.central,
    operador: salvo.operador
  }
  definirAcesso(true, salvo.empresa.papel)
  try {
    await inicializarNuvem()
  } catch (erro) {
    definirAcesso(false)
    estado = { ...estado, fase: 'desconectado', empresa: null }
    throw erro
  }
  const erro = statusNuvem().erro
  if (erro && /sessão expirou|não tem acesso|não autorizad|Entre novamente/i.test(erro)) {
    definirAcesso(false)
    estado.fase = 'desconectado'
  }
}
async function listarAposAutenticar(
  token: Token,
  config: ConfigNuvem,
  lembrar: boolean
): Promise<EstadoConta> {
  tokenEntrada = token
  configEntrada = config
  let contas: ContasRemotas
  if (servico())
    contas = (await requisitar(
      config,
      '/rest/v1/rpc/gdo_aceitar_convites',
      {},
      token.access_token
    )) as ContasRemotas
  else {
    const c = (await requisitar(
      config,
      '/rest/v1/rpc/gdo_contexto_v3',
      { p_criar: false },
      token.access_token
    )) as { empresaId: string; usuarioNome: string }
    contas = {
      operador: false,
      empresas: [
        {
          id: c.empresaId,
          nome: 'Minha empresa',
          papel: 'administrador',
          usuarioNome: c.usuarioNome
        }
      ]
    }
  }
  nomeEntrada = contas.empresas[0]?.usuarioNome ?? token.user.user_metadata?.name ?? config.email
  estado = {
    ...estado,
    central: !!servico(),
    fase: 'escolherEmpresa',
    lembrar,
    email: config.email,
    nome: nomeEntrada,
    empresas: contas.empresas,
    empresa: null,
    operador: contas.operador
  }
  return contas.empresas.length === 1 ? selecionar(contas.empresas[0].id) : emitir()
}
async function selecionar(id: string): Promise<EstadoConta> {
  const empresa = estado.empresas.find((e) => e.id === id)
  if (!empresa || !tokenEntrada || !configEntrada)
    throw new Error('Entre novamente e escolha uma empresa autorizada.')
  const config = configEntrada
  const token = tokenEntrada
  const destino = idPerfil(config.url, empresa.id, token.user.id)
  // Migra somente a cópia legada pertencente ao mesmo usuário e projeto.
  const contexto = get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")
  const legado = contexto ? JSON.parse(texto(contexto.valor)) : null
  const origem = join(app.getPath('userData'), 'data', 'banco.db')
  const pasta = join(app.getPath('userData'), 'perfis', destino, 'data')
  const banco = join(pasta, 'banco.db')
  const migrarLegado =
    !perfil &&
    !existsSync(banco) &&
    legado?.usuarioId === token.user.id &&
    legado?.empresaId === empresa.id &&
    configuracaoNuvem().url === config.url &&
    existsSync(origem)
  await fecharPerfil()
  if (migrarLegado) {
    mkdirSync(pasta, { recursive: true })
    copyFileSync(origem, banco)
    if (
      createHash('sha256').update(readFileSync(origem)).digest('hex') !==
      createHash('sha256').update(readFileSync(banco)).digest('hex')
    )
      throw new Error('A cópia dos dados não passou na verificação. O original foi preservado.')
  }
  selecionarPerfilDados(destino)
  abrirBanco()
  if (bancoVazio()) semear()
  configurarSessaoConta(estado.lembrar, empresa.id, estado.central)
  adotarSessaoConta(config, token)
  gravar('usuarioNuvem', token.user.id)
  gravar('empresaNuvem', empresa.id)
  if (!get("SELECT 1 FROM configuracoes WHERE chave='contextoNuvem'"))
    gravar('contextoNuvem', {
      protocolo: estado.central ? 4 : 3,
      empresaId: empresa.id,
      usuarioId: token.user.id,
      usuarioNome: nomeEntrada
    })
  await inicializarNuvem()
  const sincronizada = await sincronizarNuvem()
  if (sincronizada.erro) {
    await suspenderNuvemConta()
    sairNuvem()
    perfil = null
    tokenEntrada = null
    estado.fase = 'desconectado'
    emitir()
    throw new Error(sincronizada.erro)
  }
  perfil = {
    id: destino,
    usuario: token.user.id,
    email: config.email,
    nome: nomeEntrada,
    empresa,
    lembrar: estado.lembrar,
    central: estado.central,
    operador: estado.operador,
    configuracao: config
  }
  gravarPerfil(perfil)
  estado = { ...estado, fase: 'pronto', empresa }
  tokenEntrada = null
  definirAcesso(true, empresa.papel)
  return emitir()
}
function exigirConta(): PerfilConta {
  if (estado.fase !== 'pronto' || !perfil) throw new Error('Entre na sua conta para continuar.')
  return perfil
}
async function edge(body: unknown): Promise<unknown> {
  if (estado.fase === 'escolherEmpresa' && estado.operador && tokenEntrada && configEntrada)
    return requisitar(
      configEntrada,
      '/functions/v1/central-contas',
      body,
      tokenEntrada.access_token
    )
  exigirConta()
  return pedidoNuvem('/functions/v1/central-contas', body)
}
async function enviarConvite(dados: Record<string, string>): Promise<void> {
  const usuario = estado.fase === 'pronto' ? exigirConta().usuario : tokenEntrada?.user.id
  if (!usuario) throw new Error('Entre na sua conta para continuar.')
  const identidade = `${configuracaoAcesso().url}:${usuario}`
  const normalizados = {
    ...dados,
    email: dados.email.trim().toLowerCase(),
    nome: dados.nome.trim()
  }
  const id = idSolicitacao(identidade, normalizados)
  await edge({ acao: 'convidar', id, ...normalizados })
  concluirSolicitacao(identidade, normalizados)
}
function senhaValida(senha: string): void {
  if (typeof senha !== 'string' || senha.length < 8 || senha.length > 128)
    throw new Error('Use uma senha com 8 a 128 caracteres.')
}
export const contaApi: ContaApi = {
  status: async () => structuredClone(estado),
  entrar: (email, senha, lembrar) =>
    exclusiva(async () => {
      if (estado.fase === 'pronto')
        throw new Error('Saia da conta atual antes de entrar com outra pessoa.')
      const config = { ...configuracaoAcesso(), email: email.trim().toLowerCase() }
      const token = (await requisitar(config, '/auth/v1/token?grant_type=password', {
        email: config.email,
        password: senha
      })) as Token
      return listarAposAutenticar(token, config, lembrar === true)
    }),
  selecionarEmpresa: (id) => exclusiva(() => selecionar(id)),
  sair: () =>
    exclusiva(async () => {
      definirAcesso(false)
      await aguardarOperacoes()
      await suspenderNuvemConta()
      sairNuvem()
      if (perfil) gravarPerfil({ ...perfil, lembrar: false })
      encerrarEdicoesConta()
      encerrarIA()
      tokenEntrada = null
      estado = {
        ...estado,
        fase: 'desconectado',
        lembrar: false,
        nome: '',
        empresa: null,
        empresas: [],
        operador: false
      }
      return emitir()
    }),
  atualizarNome: (nome) =>
    exclusiva(async () => {
      const atual = exigirConta()
      if (!nome.trim() || nome.trim().length > 120)
        throw new Error('Informe seu nome, com até 120 caracteres.')
      await pedidoNuvem('/rest/v1/rpc/gdo_meu_nome', { p_nome: nome.trim() })
      perfil = { ...atual, nome: nome.trim() }
      gravarPerfil(perfil)
      estado.nome = perfil.nome
      const c = get("SELECT valor FROM configuracoes WHERE chave='contextoNuvem'")
      if (c) gravar('contextoNuvem', { ...JSON.parse(texto(c.valor)), usuarioNome: perfil.nome })
      return emitir()
    }),
  alterarPapel: (usuarioId, papel) =>
    exclusiva(async () => {
      const atual = exigirConta()
      if (papel !== 'administrador' && papel !== 'membro')
        throw new Error('Escolha um perfil de acesso válido.')
      await pedidoNuvem('/rest/v1/rpc/gdo_papel_membro', { p_usuario: usuarioId, p_papel: papel })
      if (usuarioId === atual.usuario) {
        perfil = { ...atual, empresa: { ...atual.empresa, papel } }
        gravarPerfil(perfil)
        estado.empresa = perfil.empresa
        definirAcesso(true, papel)
      }
      return emitir()
    }),
  alterarSenha: (senhaAtual, novaSenha) =>
    exclusiva(async () => {
      const p = exigirConta()
      senhaValida(novaSenha)
      const confirmada = (await requisitar(p.configuracao, '/auth/v1/token?grant_type=password', {
        email: p.email,
        password: senhaAtual
      })) as Token
      try {
        await requisitar(
          p.configuracao,
          '/auth/v1/user',
          { password: novaSenha },
          confirmada.access_token,
          'PUT'
        )
      } finally {
        await requisitar(
          p.configuracao,
          '/auth/v1/logout?scope=local',
          {},
          confirmada.access_token
        ).catch(() => undefined)
      }
    }),
  enviarCodigo: async (email, tipo) => {
    const config = configuracaoAcesso()
    await requisitar(
      config,
      tipo === 'convite' ? '/functions/v1/central-contas' : '/auth/v1/recover',
      tipo === 'convite' ? { acao: 'enviarCodigo', email } : { email }
    )
  },
  confirmarCodigo: (email, codigo, tipo, novaSenha) =>
    exclusiva(async () => {
      senhaValida(novaSenha)
      const config = { ...configuracaoAcesso(), email: email.trim().toLowerCase() }
      const verificar = (tipoCodigo: 'invite' | 'recovery') =>
        requisitar(config, '/auth/v1/verify', {
          email: config.email,
          token: codigo,
          type: tipoCodigo
        }) as Promise<Token>
      let token: Token
      if (tipo === 'convite') {
        try {
          token = await verificar('invite')
        } catch (erro) {
          const status = (erro as { status?: number })?.status
          if (status !== 400 && status !== 403) throw erro
          // Contas já existentes recebem o template de recuperação.
          token = await verificar('recovery')
        }
      } else token = await verificar('recovery')
      await requisitar(config, '/auth/v1/user', { password: novaSenha }, token.access_token, 'PUT')
      return listarAposAutenticar(token, config, false)
    }),
  convites: () =>
    exclusiva(async () => {
      const p = exigirConta()
      const r = (await edge({ acao: 'listar', empresaId: p.operador ? null : p.empresa.id })) as {
        convites: Array<Record<string, string>>
      }
      return r.convites.map((c) => ({
        ...c,
        estado: c.canceladoEm
          ? 'Cancelado'
          : c.aceitoEm
            ? 'Aceito'
            : Date.parse(c.expiraEm) < Date.now()
              ? 'Expirado'
              : 'Pendente',
        criadoEm: c.ultimoEnvio
      })) as unknown as ConviteConta[]
    }),
  convidar: (email, nome, papel) =>
    exclusiva(async () => {
      await enviarConvite({
        empresaId: exigirConta().empresa.id,
        email,
        nome,
        papel
      })
    }),
  cancelarConvite: (id) =>
    exclusiva(async () => {
      await edge({ acao: 'cancelar', empresaId: exigirConta().empresa.id, id })
    }),
  reenviarConvite: (id) =>
    exclusiva(async () => {
      const p = exigirConta()
      const lista = (await edge({
        acao: 'listar',
        empresaId: p.operador ? null : p.empresa.id
      })) as { convites: Array<Record<string, string>> }
      const c = lista.convites.find((v) => v.id === id)
      if (!c) throw new Error('Convite não encontrado. Atualize a lista.')
      await edge({
        acao: 'convidar',
        id,
        empresaId: c.empresaId,
        email: c.email,
        nome: c.nome,
        papel: c.papel
      })
    }),
  criarEmpresa: (nome, email, nomeAdministrador) =>
    exclusiva(async () => {
      await enviarConvite({
        empresaNome: nome,
        email,
        nome: nomeAdministrador,
        papel: 'administrador'
      })
    })
}
