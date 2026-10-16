import { app } from 'electron'
import { createHash } from 'crypto'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ConfigNuvem } from '../../shared/types'
import { diagnosticoErro } from '../../shared/erros'
import type { ContaApi, ConviteConta, EmpresaConta, EstadoConta } from '../../shared/conta'
import { abrirBanco, fecharBanco, get, run, selecionarPerfilDados, texto } from '../db/sqlite'
import { bancoVazio, semear } from '../repositories'
import { avisarDados } from '../eventos'
import { retirarAvisosEmail } from './avisos-email'
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
import { avaliarConfirmacaoEmail, lerCallbackEmail } from './callback-email'
import { destinoAposLogin } from './entrada-empresa'
import {
  gravarPerfil,
  idPerfil,
  perfilAtual,
  idSolicitacao,
  concluirSolicitacao,
  removerPerfil,
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
  emailPendente: undefined,
  nome: '',
  lembrar: false,
  operador: false,
  empresa: null,
  empresas: []
}
let mudando = false
let concluirEncerramento: (() => Promise<void>) | null = null
let inicializacaoContas: Promise<void> | null = null

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
  let resposta: Response
  try {
    resposta = await fetch(config.url + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: {
        apikey: config.chavePublica,
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    })
  } catch (erro) {
    throw Object.assign(
      new Error(
        `Falha de rede ao acessar o serviço${erro instanceof Error ? `: ${erro.message}` : '.'}`
      ),
      { causaOriginal: erro instanceof Error ? erro.message : String(erro) }
    )
  }
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok)
    throw Object.assign(
      new Error(
        dados?.msg ??
          dados?.message ??
          dados?.erro ??
          `HTTP ${resposta.status}: resposta inválida do serviço.`
      ),
      {
        status: resposta.status,
        code: dados?.code ?? dados?.codigo,
        codigo: dados?.codigo ?? dados?.code,
        details: typeof dados?.details === 'string' ? dados.details : undefined,
        hint: typeof dados?.hint === 'string' ? dados.hint : undefined
      }
    )
  return dados
}

export async function concluirCallbackEmail(url: string): Promise<string> {
  const retorno = lerCallbackEmail(url)
  if (!retorno) return 'O link de confirmação não pertence a este aplicativo.'
  if (retorno.tipo === 'erro')
    return 'Este link não foi confirmado. Confira o estado da troca em Minha conta; se a mudança não concluir, solicite novos links.'
  const atual = perfil ?? perfilAtual()
  if (!atual?.emailPendente)
    return 'Confirmação recebida. Entre na conta para consultar o endereço atualizado.'
  try {
    const usuario = (await requisitar(
      atual.configuracao,
      '/auth/v1/user',
      undefined,
      retorno.token
    )) as { id?: string; email?: string }
    const resultado = avaliarConfirmacaoEmail(usuario, {
      usuario: atual.usuario,
      emailPendente: atual.emailPendente
    })
    if (resultado === 'outra-conta')
      return 'Este link pertence a outra conta. Entre na conta correspondente para conferir a alteração.'
    if (resultado === 'aguardando') {
      perfil = { ...atual, emailConfirmacaoRecebida: true }
      gravarPerfil(perfil)
      estado.emailConfirmacaoRecebida = true
      emitir()
      return 'Esta confirmação foi recebida. Confirme também o link enviado ao outro endereço de e-mail.'
    }
    perfil = {
      ...atual,
      email: usuario.email!,
      emailPendente: undefined,
      emailConfirmacaoRecebida: undefined,
      configuracao: { ...atual.configuracao, email: usuario.email! }
    }
    gravarPerfil(perfil)
    estado.email = usuario.email!
    estado.emailPendente = undefined
    estado.emailConfirmacaoRecebida = undefined
    emitir()
    return 'Troca de e-mail confirmada. Para renovar o acesso, saia e entre com o novo endereço.'
  } catch {
    return 'Não foi possível verificar esta confirmação. Entre na conta e confira o endereço de e-mail atual.'
  }
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
  await encerrarEdicoesConta()
  await suspenderNuvemConta()
  encerrarIA()
  fecharBanco()
}
function gravar(chave: string, valor: unknown): void {
  run(
    'INSERT INTO configuracoes VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor',
    [chave, JSON.stringify(valor)]
  )
}
export function inicializarContas(): Promise<void> {
  inicializacaoContas ??= recuperarContas()
  return inicializacaoContas
}
async function recuperarContas(): Promise<void> {
  observarAcessoNuvem((contexto, motivo) => {
    if (!contexto && estado.fase === 'empresaIndisponivel') return
    if (!contexto && motivo && perfil) {
      if (estado.fase === 'empresaIndisponivel') return
      const anterior = perfil
      const token = lerSessaoConta() as Token | null
      definirAcesso(false)
      estado = {
        ...estado,
        fase: 'empresaIndisponivel',
        empresa: null,
        indisponibilidade: {
          motivo,
          empresaId: anterior.empresa.id,
          nome: anterior.empresa.nome,
          concluida: false
        }
      }
      emitir()
      // Não esperar a própria sincronização/renovação de dentro de seu callback.
      concluirEncerramento = async () => {
        try {
          await fecharPerfil()
          selecionarPerfilDados(null)
          if (motivo === 'empresaExcluida') removerPerfil(anterior.id)
          perfil = null
          tokenEntrada = motivo !== 'sessaoExpirada' && anterior.operador ? token : null
          configEntrada = anterior.configuracao
          estado = {
            ...estado,
            empresas: estado.empresas.filter((e) => e.id !== anterior.empresa.id),
            indisponibilidade: {
              motivo,
              empresaId: anterior.empresa.id,
              nome: anterior.empresa.nome,
              concluida: true
            }
          }
          emitir()
        } catch {
          // Mantém a tela de encerramento; nunca reabre um perfil excluído.
          estado = {
            ...estado,
            indisponibilidade: {
              motivo,
              empresaId: anterior.empresa.id,
              nome: anterior.empresa.nome,
              concluida: false,
              erro: 'Não foi possível concluir o encerramento dos dados locais. Tente novamente.'
            }
          }
          emitir()
        }
      }
      const concluir = concluirEncerramento
      setTimeout(() => void concluir(), 0)
      return
    }
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
    emailPendente: salvo?.emailPendente,
    emailConfirmacaoRecebida: salvo?.emailConfirmacaoRecebida,
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
    emailPendente: salvo.emailPendente,
    emailConfirmacaoRecebida: salvo.emailConfirmacaoRecebida,
    nome: salvo.nome,
    central: salvo.central,
    operador: salvo.operador
  }
  definirAcesso(true, salvo.empresa.papel)
  try {
    await inicializarNuvem()
  } catch (erro) {
    if ((erro as { codigo?: string })?.codigo === 'EMPRESA_EXCLUIDA') {
      await fecharPerfil()
      selecionarPerfilDados(null)
      removerPerfil(salvo.id)
      perfil = null
      estado = {
        ...estado,
        fase: 'desconectado',
        lembrar: false,
        empresa: null,
        empresas: [],
        operador: false
      }
      emitir()
      return
    }
    definirAcesso(false)
    estado = { ...estado, fase: 'desconectado', empresa: null }
    throw erro
  }
  if (estado.fase === 'empresaIndisponivel') return
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
  contas = normalizarContas(contas)
  const destino = destinoAposLogin(contas.operador, contas.empresas)
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
  // A seleção é uma função do operador. Usuários comuns entram direto no único vínculo.
  return destino.tipo === 'selecionar' ? emitir() : selecionar(destino.empresaId)
}

function normalizarContas(valor: unknown): ContasRemotas {
  if (!valor || typeof valor !== 'object')
    throw new Error('A resposta de empresas não é válida. Entre novamente.')
  const bruto = valor as { operador?: unknown; empresas?: unknown }
  if (!Array.isArray(bruto.empresas))
    throw new Error('A resposta de empresas não é válida. Entre novamente.')
  const ids = new Set<string>()
  const empresas = bruto.empresas.map((item) => {
    const empresa = item as Partial<EmpresaConta & { usuarioNome: string }>
    const id = typeof empresa.id === 'string' ? empresa.id.trim() : ''
    const nome = typeof empresa.nome === 'string' ? empresa.nome.trim() : ''
    const papel = empresa.papel
    const usuarioNome = typeof empresa.usuarioNome === 'string' ? empresa.usuarioNome.trim() : ''
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ||
      !nome ||
      nome.length > 120 ||
      (papel !== 'administrador' && papel !== 'membro') ||
      ids.has(id)
    )
      throw new Error(
        'Uma empresa retornou dados inválidos. Atualize o cadastro e entre novamente.'
      )
    ids.add(id)
    return { id, nome, papel, usuarioNome }
  })
  return { operador: bruto.operador === true, empresas }
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
  // Perfis de conta recebem os padrões exclusivamente da empresa na nuvem.
  // Semear IDs locais antes do primeiro delta duplica os textos em cada login.
  if (bancoVazio()) semear(false)
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
  // Falhas de rede ou de uma operação pendente não invalidam o login. A sessão
  // fica disponível para abrir o perfil e tentar sincronizar novamente. O
  // observador de acesso altera a fase para desconectado apenas quando o
  // servidor realmente revoga ou nega o vínculo com a empresa.
  if (estado.fase === 'desconectado' || !sincronizada.autenticada) {
    await suspenderNuvemConta()
    sairNuvem()
    perfil = null
    tokenEntrada = null
    estado.fase = 'desconectado'
    emitir()
    throw new Error(sincronizada.erro ?? 'Não foi possível validar o acesso à empresa.')
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
  continuarAposIndisponibilidade: () =>
    exclusiva(async () => {
      if (estado.indisponibilidade?.erro && concluirEncerramento) {
        await concluirEncerramento()
        return emitir()
      }
      if (!estado.indisponibilidade?.concluida)
        throw new Error('Aguarde o encerramento da empresa.')
      if (estado.operador && tokenEntrada && configEntrada) {
        const contas = normalizarContas(
          await requisitar(configEntrada, '/rest/v1/rpc/gdo_contas', {}, tokenEntrada.access_token)
        )
        estado = {
          ...estado,
          fase: 'escolherEmpresa',
          empresas: contas.empresas,
          indisponibilidade: undefined
        }
      } else {
        tokenEntrada = null
        estado = {
          ...estado,
          fase: 'desconectado',
          empresas: [],
          empresa: null,
          lembrar: false,
          indisponibilidade: undefined
        }
      }
      return emitir()
    }),
  avisosEmail: async () => retirarAvisosEmail(),
  status: async () => {
    // A janela já pode mostrar o carregamento sem expor um perfil parcialmente aberto.
    await inicializacaoContas?.catch(() => undefined)
    return structuredClone(estado)
  },
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
      await encerrarEdicoesConta()
      await suspenderNuvemConta()
      sairNuvem()
      if (perfil) gravarPerfil({ ...perfil, lembrar: false })
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
  alterarEmail: (senhaAtual, novoEmail) =>
    exclusiva(async () => {
      const atual = exigirConta()
      const email = novoEmail.trim().toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        throw new Error('Informe um endereço de e-mail válido.')
      if (email === atual.email.toLowerCase())
        throw new Error('O novo e-mail deve ser diferente do endereço atual.')

      const confirmada = (await requisitar(
        atual.configuracao,
        '/auth/v1/token?grant_type=password',
        { email: atual.email, password: senhaAtual }
      )) as Token
      try {
        await requisitar(
          atual.configuracao,
          '/auth/v1/user',
          { email },
          confirmada.access_token,
          'PUT'
        )
      } finally {
        await requisitar(
          atual.configuracao,
          '/auth/v1/logout?scope=local',
          {},
          confirmada.access_token
        ).catch(() => undefined)
      }

      perfil = { ...atual, emailPendente: email, emailConfirmacaoRecebida: false }
      gravarPerfil(perfil)
      estado.emailPendente = email
      estado.emailConfirmacaoRecebida = false
      return emitir()
    }),
  confirmarAlteracaoEmail: (codigo) =>
    exclusiva(async () => {
      const atual = exigirConta()
      const email = atual.emailPendente?.trim().toLowerCase()
      const token = codigo.trim()
      if (!email) throw new Error('Solicite uma nova troca de e-mail antes de informar o código.')
      if (!/^\d{6,12}$/.test(token)) throw new Error('Informe o código recebido por e-mail.')
      const confirmada = (await requisitar(atual.configuracao, '/auth/v1/verify', {
        email,
        token,
        type: 'email_change'
      })) as Token
      const usuario = (await requisitar(
        atual.configuracao,
        '/auth/v1/user',
        undefined,
        confirmada.access_token
      )) as { id?: string; email?: string }
      if (usuario.id !== atual.usuario || usuario.email?.toLowerCase() !== email)
        throw new Error(
          'O código não confirmou o novo e-mail. Solicite outro código e tente novamente.'
        )
      perfil = {
        ...atual,
        email,
        emailPendente: undefined,
        emailConfirmacaoRecebida: undefined,
        configuracao: { ...atual.configuracao, email }
      }
      gravarPerfil(perfil)
      estado = { ...estado, email, emailPendente: undefined, emailConfirmacaoRecebida: undefined }
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
  convites: async () => {
    const p = exigirConta()
    const r = (await edge({ acao: 'listar', empresaId: p.empresa.id })) as {
      convites: Array<Record<string, string>>
    }
    if (!perfil || perfil.id !== p.id)
      throw new Error(
        'A empresa ativa mudou enquanto os convites eram carregados. Atualize a lista.'
      )
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
  },
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
        empresaId: p.empresa.id
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
  atualizarEmpresas: () =>
    exclusiva(async () => {
      const contas = normalizarContas(
        estado.fase === 'escolherEmpresa' && tokenEntrada && configEntrada
          ? await requisitar(
              configEntrada,
              '/rest/v1/rpc/gdo_contas',
              {},
              tokenEntrada.access_token
            )
          : await pedidoNuvem('/rest/v1/rpc/gdo_contas', {})
      )
      estado = { ...estado, empresas: contas.empresas, operador: contas.operador }
      return emitir()
    }),
  criarEmpresa: (nome, email, nomeAdministrador) =>
    exclusiva(async () => {
      await enviarConvite({
        empresaNome: nome,
        email,
        nome: nomeAdministrador,
        papel: 'administrador'
      })
    }),
  excluirEmpresa: (empresaId, nomeConfirmado) =>
    exclusiva(async () => {
      if (!estado.operador)
        throw new Error('Somente o Administrador do Sistema pode remover empresas.')
      const empresa = estado.empresas.find((item) => item.id === empresaId)
      if (!empresa) throw new Error('A empresa não está mais disponível. Atualize a lista.')
      if (nomeConfirmado.trim() !== empresa.nome)
        throw new Error('O nome digitado não corresponde ao nome exato da empresa.')
      const erroExclusao = (etapa: 'capacidades' | 'exclusao', erro: unknown): Error => {
        const e = erro as { message?: unknown; status?: unknown; codigo?: unknown; code?: unknown }
        const status = typeof e.status === 'number' ? e.status : null
        const codigo =
          typeof e.codigo === 'string' ? e.codigo : typeof e.code === 'string' ? e.code : ''
        const diagnostico = diagnosticoErro(erro)
        const pasta = join(app.getPath('userData'), 'logs')
        try {
          mkdirSync(pasta, { recursive: true })
          appendFileSync(
            join(pasta, 'exclusao-empresa.jsonl'),
            `${JSON.stringify({ em: new Date().toISOString(), etapa, status, ...diagnostico, codigo: codigo || diagnostico.codigo })}\n`,
            'utf8'
          )
        } catch {
          // A falha de gravação do diagnóstico não substitui a falha original.
        }
        console.error('Falha ao excluir empresa:', { etapa, status, ...diagnostico })
        return new Error(
          `Não foi possível excluir a empresa${status ? ` (HTTP ${status})` : ''}${codigo ? `, código ${codigo}` : ''}. O diagnóstico técnico foi registrado neste computador.`,
          { cause: erro }
        )
      }
      let capacidades: { excluirEmpresa?: boolean }
      try {
        capacidades = (await edge({ acao: 'capacidades' })) as { excluirEmpresa?: boolean }
      } catch (erro) {
        if (
          (erro as { status?: number }).status === 400 &&
          /Ação inválida/.test((erro as Error).message)
        )
          throw new Error(
            'O serviço de exclusão precisa ser atualizado pelo Administrador do Sistema.'
          )
        throw erroExclusao('capacidades', erro)
      }
      if (!capacidades.excluirEmpresa)
        throw new Error(
          'O serviço de exclusão precisa ser atualizado pelo Administrador do Sistema.'
        )
      try {
        await edge({ acao: 'excluirEmpresa', empresaId })
      } catch (erro) {
        throw erroExclusao('exclusao', erro)
      }
      estado = { ...estado, empresas: estado.empresas.filter((item) => item.id !== empresaId) }
      return emitir()
    })
}
