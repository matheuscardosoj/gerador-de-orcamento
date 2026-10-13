const GENERICA =
  'Não foi possível concluir esta ação. Tente novamente. Se o problema continuar, informe a ação realizada e a mensagem ao suporte.'

function detalhe(
  erro: unknown,
  profundidade = 0
): { texto: string; codigo: string; nome: string; status?: number } {
  if (typeof erro === 'string') return { texto: erro, codigo: '', nome: '' }
  if (erro && typeof erro === 'object') {
    const e = erro as {
      message?: unknown
      code?: unknown
      codigo?: unknown
      name?: unknown
      cause?: unknown
      status?: unknown
    }
    const causa =
      profundidade < 4 && e.cause && typeof e.cause === 'object'
        ? detalhe(e.cause, profundidade + 1)
        : undefined
    return {
      texto: typeof e.message === 'string' ? e.message : '',
      codigo:
        typeof e.code === 'string'
          ? e.code
          : typeof e.codigo === 'string'
            ? e.codigo
            : causa?.codigo || '',
      nome: typeof e.name === 'string' ? e.name : '',
      status: typeof e.status === 'number' ? e.status : causa?.status
    }
  }
  return { texto: '', codigo: '', nome: '' }
}

/** Retira somente invólucros de transporte; a validação original continua sendo a causa. */
function semInvólucros(texto: string): string {
  let atual = texto.trim()
  for (let i = 0; i < 12; i++) {
    const proximo = atual
      .replace(/^(?:Error|Erro|TypeError|RangeError|SyntaxError):\s*/i, '')
      .replace(/^Error invoking remote method ['"][^'"\r\n]+['"]:\s*/i, '')
      .trim()
    if (proximo === atual) break
    atual = proximo
  }
  return atual
}

/**
 * Mensagem para a interface. Nunca inclui stack, SQL, caminhos ou respostas JSON.
 * Não altera o erro original, que permanece disponível para diagnóstico no processo principal.
 */
export function mensagemErro(erro: unknown, contexto?: string): string {
  const { texto, codigo, nome, status } = detalhe(erro)
  const limpa = semInvólucros(texto)
  let mensagem: string
  if (/^(?:Invalid login credentials|Invalid credentials)$/i.test(limpa))
    mensagem = 'E-mail ou senha incorretos. Confira os dados e tente conectar novamente.'
  else if (/^Email not confirmed\.?$/i.test(limpa))
    mensagem = 'Este e-mail ainda não foi confirmado. Confirme a conta antes de conectar.'
  else if (
    /^(?:JWT expired|Token has expired|Refresh Token Not Found|Invalid Refresh Token.*)$/i.test(
      limpa
    )
  )
    mensagem = 'Sua sessão expirou. Entre novamente na conta para continuar a sincronização.'
  else if (/^(?:User not found|Usuário não encontrado)\.?$/i.test(limpa))
    mensagem = 'Conta não encontrada. Confira o e-mail e se o usuário foi criado no Supabase.'
  else if (/^Campos incompatíveis com o esquema da nuvem/.test(limpa))
    mensagem =
      'O formato desta alteração não foi aceito pela nuvem. A operação foi preservada neste computador. Atualize o aplicativo e tente novamente; se persistir, envie esta mensagem ao suporte.'
  else if (codigo === '23503')
    mensagem =
      'Este registro possui vínculos com outros dados. Confira os documentos relacionados antes de excluir. Para cadastros, prefira inativar e preservar o histórico.'
  else if (codigo === 'PGRST202' || /^Could not find the function\b/i.test(limpa))
    mensagem =
      'A configuração da nuvem está incompleta ou desatualizada. Execute o script indicado em Configurações → Nuvem / Sincronização e tente novamente.'
  else if (
    status === 429 ||
    codigo === 'over_request_rate_limit' ||
    /^Too many requests\b/i.test(limpa)
  )
    mensagem = 'O serviço recebeu muitas solicitações. Aguarde um pouco antes de tentar novamente.'
  else if (/^Invalid API key\.?$/i.test(limpa))
    mensagem =
      'A chave pública do projeto não foi aceita. Confira a URL e a chave publishable em Configurações → Nuvem / Sincronização.'
  else if (status === 401)
    mensagem =
      'A conexão não foi autorizada. Confira a configuração da nuvem e entre novamente na conta.'
  else if (status === 403)
    mensagem =
      'Sua conta não tem autorização para esta ação. Confira o vínculo do usuário com a empresa.'
  else if (status && status >= 500 && status <= 599)
    mensagem =
      'O serviço está indisponível ou apresentou uma falha. Aguarde um pouco e tente novamente.'
  else if (
    /^(?:EACCES|EPERM)$/.test(codigo) ||
    /\b(?:EACCES|EPERM):|^Access is denied\b/i.test(limpa)
  )
    mensagem =
      'Não foi possível acessar o arquivo ou a pasta. Verifique as permissões e escolha outro local, se necessário.'
  else if (codigo === 'ENOENT' || /\bENOENT:|^no such file or directory\b/i.test(limpa))
    mensagem =
      'O arquivo ou a pasta não foi encontrado. Confira o local e selecione o arquivo novamente.'
  else if (codigo === 'ENOSPC' || /\bENOSPC:|^no space left on device\b/i.test(limpa))
    mensagem =
      'Não há espaço suficiente no disco. Libere espaço ou escolha outra pasta e tente novamente.'
  else if (codigo === 'EBUSY' || /\bEBUSY:|^resource busy or locked\b/i.test(limpa))
    mensagem = 'O arquivo está sendo usado por outro programa. Feche-o e tente novamente.'
  else if (
    /^(?:ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_HEADERS_TIMEOUT)$/.test(codigo) ||
    nome === 'TimeoutError' ||
    /\b(?:ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT)\b|^(?:request timed out|timeout|timed out)\b/i.test(
      limpa
    )
  )
    mensagem =
      'A solicitação demorou mais que o esperado. Tente novamente quando a conexão ou o serviço estiver disponível.'
  else if (
    /^(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH)$/.test(codigo) ||
    /\b(?:ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH)\b|^(?:fetch failed|Failed to fetch|NetworkError when attempting to fetch resource|Network request failed)\.?$/i.test(
      limpa
    )
  )
    mensagem =
      'Não foi possível acessar o serviço. Verifique a conexão e se o serviço está disponível; depois tente novamente.'
  else if (nome === 'AbortError' || /^The operation was aborted\.?$/i.test(limpa))
    mensagem = 'A solicitação foi interrompida. Tente novamente se ainda precisar concluir a ação.'
  else if (/^Runtime de IA não encontrado\b/.test(limpa))
    mensagem =
      'Os arquivos da IA local não foram encontrados. Reinstale a versão completa do aplicativo ou configure o Ollama em Configurações → IA local.'
  else if (/^O servidor de IA encerrou durante a inicialização\./.test(limpa))
    mensagem =
      'A IA local não conseguiu iniciar. Tente novamente e confira a configuração em Configurações → IA local.'
  else if (/^O servidor de IA não respondeu a tempo\./.test(limpa))
    mensagem =
      'A IA local demorou para iniciar. Tente novamente e confira a configuração em Configurações → IA local.'
  else if (/^(?:Servidor de IA|Ollama) respondeu (?:4\d\d|5\d\d)\./.test(limpa))
    mensagem =
      'O serviço de IA não conseguiu atender à solicitação. Confira a configuração e tente novamente.'
  else if (/^Não foi possível revisar o texto\.\s+/.test(limpa))
    mensagem = mensagemErro(
      limpa.replace(/^Não foi possível revisar o texto\.\s+/, ''),
      'Não foi possível revisar o texto.'
    )
  else if (
    codigo === '23505' ||
    /UNIQUE constraint failed|duplicate key value violates unique constraint/i.test(limpa)
  )
    mensagem =
      'Já existe um registro com essa identificação. Confira os dados antes de salvar novamente.'
  else if (
    codigo === '23503' ||
    /FOREIGN KEY constraint failed|violates foreign key constraint/i.test(limpa)
  )
    mensagem =
      'Esta ação depende de outros registros. Confira os vínculos do documento antes de continuar.'
  else if (
    codigo === '42501' ||
    /^(?:permission denied for|new row violates row-level security policy)/i.test(limpa)
  )
    mensagem =
      'Sua conta não tem autorização para esta ação. Confira o vínculo do usuário com a empresa.'
  else if (codigo === 'SQLITE_BUSY' || /^database is locked\b/i.test(limpa))
    mensagem = 'O banco local está ocupado. Aguarde a operação atual e tente novamente.'
  else if (
    /[\r\n]\s*at\s|\b(?:SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|SQLITE_[A-Z_]+|PGRST\d+|access_token|refresh_token|authorization|Bearer\s+|sb_secret_[\w-]+)\b|(?:[A-Z]:\\|file:\/\/)|^\s*[[{]|\b(?:Cannot read properties|is not a function|Unexpected token)\b/i.test(
      limpa
    ) ||
    limpa.includes('\uFFFD') ||
    /^(?:Arquivo incompatível: faltam as tabelas|Arquivo inválido: integridade SQLite)/.test(limpa)
  )
    mensagem = /^Arquivo (?:incompatível|inválido):/.test(limpa)
      ? 'Este arquivo não é um backup válido ou compatível. Selecione um backup exportado pelo aplicativo.'
      : GENERICA
  else if (
    limpa &&
    /\b(?:não|nao|erro|falha|inválid[oa]|inválidos|incompatível|informe|preencha|aguarde|confira|revise|salve|preserve|sincronize|resolva|entre|atualize|selecione|escolha|ative|desativada|cancelad[ao]|recusada|indisponível|conta|documento|arquivo|cliente|imagem|número|numeração|versão|permissão|autorização|conflito|limite|revisão|operações|campos|já|esta|este|existem|somente)\b/i.test(
      limpa
    )
  )
    mensagem = limpa
  else mensagem = GENERICA

  const prefixo = contexto?.trim()
  return prefixo && !mensagem.startsWith(prefixo) ? `${prefixo} ${mensagem}` : mensagem
}
