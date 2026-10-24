// Chamada HTTP ao serviço de contas (Auth, RPC e funções de borda) com erros padronizados.
import type { ConfigNuvem } from '../../shared/types'

export async function requisitar(
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
