import { createClient } from 'npm:@supabase/supabase-js@2.117.3'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const required = (name: string) => {
  const value = Deno.env.get(name)
  if (!value) throw new Error('Serviço indisponível')
  return value
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ erro: 'Método não permitido' }, 405)
  if (Number(request.headers.get('content-length') ?? 0) > 8192)
    return json({ erro: 'Solicitação muito grande' }, 413)
  try {
    const raw = await request.text()
    if (raw.length > 8192) return json({ erro: 'Solicitação muito grande' }, 413)
    const body = JSON.parse(raw)
    const url = required('SUPABASE_URL')
    const admin = createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false }
    })
    const remetente = createClient(url, required('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    })
    const enviar = async (email: string) => {
      // Cria a identidade somente após validar o convite, sem enviar outro e-mail.
      // generateLink não envia mensagens; o código retornado não é usado nem registrado.
      const { error: preparacao } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email
      })
      if (preparacao) throw new Error('Não foi possível preparar o acesso')
      const { error } = await remetente.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false }
      })
      if (error) throw new Error('Não foi possível enviar o código. Tente novamente em um minuto')
    }
    if (body.acao === 'enviarCodigo') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
      const { data, error } = await admin.rpc('gdo_autorizar_codigo', { p_email: email })
      if (!error && data === true) {
        try {
          await enviar(email)
        } catch {
          /* Resposta pública não revela convites nem contas. */
        }
      }
      return json({ ok: true })
    }
    const authorization = request.headers.get('Authorization') ?? ''
    const token = authorization.replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await admin.auth.getUser(token)
    if (authError || !auth.user) return json({ erro: 'Entre novamente na sua conta' }, 401)
    const usuario = createClient(url, required('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } }
    })
    if (body.acao === 'listar' || body.acao === 'cancelar') {
      const { data, error } = await usuario.rpc('gdo_convites_operador', {
        p_empresa: body.empresaId ?? null,
        p_cancelar: body.acao === 'cancelar' ? body.id : null
      })
      if (error) return json({ erro: error.message }, 403)
      return json({ convites: data })
    }
    if (body.acao !== 'convidar') return json({ erro: 'Ação inválida' }, 400)
    const { data, error } = await admin.rpc('gdo_preparar_convite', {
      p_ator: auth.user.id,
      p_id: body.id,
      p_empresa: body.empresaId ?? null,
      p_empresa_nome: body.empresaNome ?? '',
      p_email: body.email,
      p_nome: body.nome,
      p_papel: body.papel ?? 'membro'
    })
    if (error) return json({ erro: error.message }, 400)
    await enviar(data.email)
    return json({ ok: true, convite: data })
  } catch {
    return json(
      {
        erro: 'Não foi possível concluir. O convite pendente foi preservado; tente novamente em um minuto.'
      },
      503
    )
  }
})
