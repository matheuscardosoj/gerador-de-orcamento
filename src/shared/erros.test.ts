import { describe, expect, it } from 'vitest'
import { diagnosticoErro, mensagemErro } from './erros'

it('preserva diagnóstico PostgreSQL sem expor valores pessoais nem tokens', () => {
  const d = diagnosticoErro({
    code: '23503',
    message: 'constraint codigos_cadastros_empresa_id_fkey for pessoa@exemplo.com',
    details: 'Key (email)=(pessoa@exemplo.com) is not present in table "users".',
    hint: 'access_token=segredo123'
  })
  expect(d.codigo).toBe('23503')
  expect(d.causa).toContain('codigos_cadastros_empresa_id_fkey')
  expect(JSON.stringify(d)).not.toContain('pessoa@exemplo.com')
  expect(JSON.stringify(d)).not.toContain('segredo123')
})

describe('mensagens de erro para a interface', () => {
  it('remove invólucros repetidos do Electron sem perder a validação', () => {
    const validacao = 'Preencha cliente, serviço, valor, local e forma de pagamento.'
    expect(
      mensagemErro(
        new Error(`Error: Error invoking remote method 'recibos.confirmar': Error: ${validacao}`)
      )
    ).toBe(validacao)
    expect(mensagemErro(`Erro: Error: ${validacao}`)).toBe(validacao)
    expect(mensagemErro(validacao)).toBe(validacao)
  })

  it('preserva mensagens de negócio, números e decisões necessárias', () => {
    const mensagens = [
      'Informe um número inteiro entre 1 e 999999.',
      'A revisão foi recusada porque alterou números informados.',
      'Há operações da versão anterior. Preserve-as e revise antes de adotar a numeração reorganizada; elas não serão publicadas automaticamente.',
      'Já existe um orçamento com o número 18.',
      'Conflito de sincronização. Compare as versões e escolha como continuar.'
    ]
    for (const mensagem of mensagens) expect(mensagemErro(new Error(mensagem))).toBe(mensagem)
  })

  it('traduz falhas comprovadas de login e sessão sem confundir senha com rede', () => {
    expect(mensagemErro({ message: 'Invalid login credentials' })).toContain('E-mail ou senha')
    expect(mensagemErro({ message: 'Email not confirmed' })).toContain('ainda não foi confirmado')
    expect(mensagemErro('JWT expired')).toContain('sessão expirou')
    expect(mensagemErro('Invalid login credentials')).not.toContain('conexão')
  })

  it('trata rede e tempo limite sem afirmar que o computador está offline', () => {
    expect(
      mensagemErro(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }))
    ).toContain('acessar o serviço')
    expect(
      mensagemErro({ message: 'getaddrinfo ENOTFOUND project.supabase.co', code: 'ENOTFOUND' })
    ).not.toContain('project.supabase.co')
    expect(
      mensagemErro({ name: 'TimeoutError', message: 'The operation was aborted due to timeout' })
    ).toContain('demorou mais')
    expect(mensagemErro('Verifique o campo de tempo limite.')).toBe(
      'Verifique o campo de tempo limite.'
    )
    expect(mensagemErro({ name: 'AbortError', message: 'The operation was aborted.' })).toContain(
      'interrompida'
    )
  })

  it('não mostra SQL, caminhos, stack, JSON ou detalhes de tokens', () => {
    for (const erro of [
      'SQLITE_ERROR: no such table: recebimentos',
      'Falha no banco: SQLITE_ERROR: no such table: recebimentos',
      'Não foi possível salvar. SELECT * FROM clientes',
      'Não autorizado: Bearer credencial-sensivel',
      'Não foi possível salvar.\n    at salvar (C:\\app\\main.js:25:1)',
      'Arquivo inválido: integridade SQLite = page 52 is corrupt.',
      '{"message":"Não autorizado", "access_token":"token-sensivel"}',
      'Error: ENOENT: no such file or directory, open C:\\Users\\Teste\\backup.db',
      'TypeError: Cannot read properties of undefined (reading id)'
    ]) {
      const mensagem = mensagemErro(erro)
      expect(mensagem).not.toMatch(
        /SELECT|SQLITE|C:\\|access_token|token-sensivel|credencial-sensivel|\bat salvar|undefined/
      )
      expect(mensagem.length).toBeGreaterThan(15)
    }
  })

  it('diferencia arquivo ausente, ocupado, permissões e espaço em disco', () => {
    expect(mensagemErro({ message: 'open', code: 'ENOENT' })).toContain('não foi encontrado')
    expect(mensagemErro({ message: 'open', code: 'EBUSY' })).toContain('outro programa')
    expect(mensagemErro({ message: 'write', code: 'EACCES' })).toContain('permissões')
    expect(mensagemErro({ message: 'write', code: 'ENOSPC' })).toContain('espaço suficiente')
  })

  it('explica conflitos de autorização e alterações simultâneas de usuários', () => {
    expect(mensagemErro('Responsabilidade inválida')).toContain('autorização do documento mudou')
    expect(mensagemErro('Aguarde a operação de acesso em andamento.')).toContain(
      'Outra alteração de usuários'
    )
  })

  it('aceita o código e status usados pelo transporte da nuvem', () => {
    expect(mensagemErro({ message: 'detail', codigo: 'PGRST202', status: 404 })).toContain(
      'script indicado'
    )
    expect(mensagemErro({ message: 'Falha na nuvem (503).', status: 503 })).toContain(
      'serviço está indisponível'
    )
    expect(mensagemErro({ message: 'Rate limit', status: 429 })).toContain('muitas solicitações')
    expect(mensagemErro({ message: 'Falha na nuvem (401).', status: 401 })).toContain(
      'conexão não foi autorizada'
    )
    expect(mensagemErro({ message: 'Invalid API key', status: 401 })).toContain('chave pública')
    expect(
      mensagemErro({
        message:
          'Não foi possível concluir. O convite pendente foi preservado; tente novamente em um minuto.',
        status: 503
      })
    ).toContain('convite foi salvo')
  })

  it('explica integridade e autorização sem expor tabelas ou restrições', () => {
    expect(
      mensagemErro({
        message: 'duplicate key value violates unique constraint "clientes_pkey"',
        code: '23505'
      })
    ).toContain('Já existe um registro')
    expect(mensagemErro({ message: 'foreign key', code: '23503' })).toContain('vínculos')
    expect(
      mensagemErro({
        message:
          'insert or update on table "codigos_cadastros" violates foreign key constraint "codigos_cadastros_empresa_id_fkey"',
        code: '23503',
        details: 'Key (empresa_id) is not present in table "users".'
      })
    ).toContain('configuração de códigos')
    expect(
      mensagemErro({ message: 'permission denied for table imagens', code: '42501' })
    ).toContain('vínculo do usuário')
    expect(
      mensagemErro({ message: 'Could not find the function public.gdo_batch_v3', code: 'PGRST202' })
    ).toContain('script indicado')
  })

  it('substitui diagnóstico de inicialização da IA e mantém recusa dos dados', () => {
    expect(
      mensagemErro('O servidor de IA encerrou durante a inicialização. Process exited 9. llama.cpp')
    ).toContain('IA local não conseguiu iniciar')
    expect(mensagemErro('Não foi possível revisar o texto. TypeError: fetch failed')).toBe(
      'Não foi possível revisar o texto. Não foi possível acessar o serviço. Verifique a conexão e se o serviço está disponível; depois tente novamente.'
    )
    expect(
      mensagemErro('Não foi possível revisar o texto. A sugestão foi recusada por alterar valores.')
    ).toContain('recusada por alterar valores')
  })

  it('usa mensagem genérica para falha desconhecida e não inventa causa', () => {
    for (const erro of [null, undefined, {}, new Error('boom'), 42, 'internal server error']) {
      expect(mensagemErro(erro)).toContain('Não foi possível concluir esta ação')
      expect(mensagemErro(erro)).not.toMatch(/senha incorret|offline|arquivo ocupado/)
    }
  })

  it('acrescenta contexto sem repetir nem alterar o erro original', () => {
    const erro = new Error('Preencha o nome do cliente.')
    expect(mensagemErro(erro, 'Não foi possível salvar.')).toBe(
      'Não foi possível salvar. Preencha o nome do cliente.'
    )
    expect(erro.message).toBe('Preencha o nome do cliente.')
    const mensagem = mensagemErro(erro, 'Não foi possível salvar.')
    expect(mensagemErro(mensagem, 'Não foi possível salvar.')).toBe(mensagem)
  })
  it('diferencia formato recusado de configuração ausente e de cadastro vinculado', () => {
    const formato = mensagemErro(
      'Campos incompatíveis com o esquema da nuvem. Atualize a configuração do banco; nenhuma alteração foi aplicada',
      'Excluir cliente'
    )
    expect(formato).toContain('Excluir cliente')
    expect(formato).toContain('preservada')
    expect(formato).not.toContain('Atualize a configuração do banco')
    expect(mensagemErro({ code: '23503', message: 'foreign key violation' })).toContain('inativar')
    expect(mensagemErro({ code: 'PGRST202', message: 'missing function' })).toContain(
      'configuração da nuvem está incompleta'
    )
  })
})
