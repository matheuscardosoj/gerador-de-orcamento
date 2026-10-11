import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ConfigNuvem, StatusNuvem } from '@shared/types'
import { Button, Card, Field, Input, Select, ConfirmDialog } from '../ui/primitives'
export function NuvemSection(): JSX.Element {
  const [c, setC] = useState<ConfigNuvem>({ url: '', chavePublica: '', email: '' })
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'publicar' | 'baixar'>('publicar')
  const [s, setS] = useState<StatusNuvem | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  useEffect(() => {
    void api.nuvem.config().then(setC)
    void api.nuvem.status().then(setS)
  }, [])
  const executar = async (acao: () => Promise<StatusNuvem>): Promise<void> => {
    setOcupado(true)
    setErro('')
    try {
      setS(await acao())
      setSenha('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setOcupado(false)
    }
  }
  const mb = (s?.bytesBanco ?? 0) / 1024 / 1024
  return (
    <Card>
      <h3 className="mb-3 font-semibold">Nuvem da empresa</h3>
      <p className="mb-4 text-sm text-slate-600">
        Use o mesmo projeto Supabase e a mesma conta em todos os computadores desta empresa. Cada
        empresa configura seu próprio projeto. Plano gratuito: 500 MB de banco; pouca atividade pode
        pausar o projeto.
      </p>
      <p className="mb-4 text-sm">
        Configure as tabelas com o arquivo de instalação Supabase fornecido com o aplicativo e crie
        sua conta no painel de autenticação. Depois preencha os dados abaixo.
      </p>
      {erro && (
        <p role="alert" className="text-red-600">
          {erro}
        </p>
      )}
      {s?.erro && (
        <p role="alert" className="text-red-600">
          {s.erro}
        </p>
      )}
      <div className="grid gap-3">
        <Field label="URL do projeto">
          <Input
            value={c.url}
            onChange={(e) => setC({ ...c, url: e.target.value })}
            placeholder="https://seu-projeto.supabase.co"
          />
        </Field>
        <Field label="Chave pública (publishable)">
          <Input
            value={c.chavePublica}
            onChange={(e) => setC({ ...c, chavePublica: e.target.value })}
          />
        </Field>
        <Field label="E-mail da conta da empresa">
          <Input
            type="email"
            value={c.email}
            onChange={(e) => setC({ ...c, email: e.target.value })}
          />
        </Field>
        <Field label="Senha">
          <Input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {!s?.configurada && (
          <Field label="Primeira conexão neste computador">
            <Select value={modo} onChange={(e) => setModo(e.target.value as typeof modo)}>
              <option value="publicar">Publicar os dados locais em uma nuvem vazia</option>
              <option value="baixar">
                Baixar a base da empresa — salva backup dos dados locais
              </option>
            </Select>
          </Field>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={ocupado || !senha || !c.url || !c.chavePublica || !c.email}
            onClick={() => setConfirmar(true)}
          >
            Conectar
          </Button>
          <Button
            disabled={ocupado || !s?.autenticada}
            variant="outline"
            onClick={() => void executar(() => api.nuvem.sincronizar())}
          >
            Sincronizar agora
          </Button>
          <Button
            disabled={ocupado || !s?.autenticada}
            variant="outline"
            onClick={() =>
              void executar(async () => {
                await api.nuvem.sair()
                return api.nuvem.status()
              })
            }
          >
            Sair da conta
          </Button>
        </div>
      </div>
      {s && (
        <div className="mt-5 space-y-2 text-sm">
          <p>
            {s.autenticada ? 'Conta conectada' : 'Conta desconectada'} · {s.pendentes} alterações
            aguardando envio
          </p>
          <p>
            Última sincronização:{' '}
            {s.ultimaSincronizacao
              ? new Date(s.ultimaSincronizacao).toLocaleString('pt-BR')
              : 'Ainda não realizada'}
          </p>
          <p>
            Banco: {mb.toFixed(1)} MiB / aproximadamente 477 MiB (500 MB)
            {mb >= (500000000 / 1048576) * 0.9
              ? ' — 90%: limite próximo; amplie o plano antes de acrescentar dados'
              : mb >= (500000000 / 1048576) * 0.8
                ? ' — 80%: atenção ao consumo do plano gratuito'
                : ''}
          </p>
          <p>
            Números disponíveis offline: propostas {s.reservas.orcamento}, relatórios{' '}
            {s.reservas.relatorio}, recibos {s.reservas.recibo}.
          </p>
          <p className="text-xs text-slate-500">Identificação deste computador: {s.computador}</p>
          {s.conflitos.map((x) => (
            <div key={x.id} className="rounded border border-amber-300 p-3">
              <p>{x.detalhe}</p>
              <p>
                Para preservar a edição local, crie uma cópia no editor antes de adotar a versão
                remota. Uma cópia de segurança será salva antes da conciliação.
              </p>
              <Button
                variant="outline"
                disabled={ocupado}
                onClick={() =>
                  void executar(async () => {
                    await api.nuvem.aceitarRemoto(x.id)
                    return api.nuvem.status()
                  })
                }
              >
                Adotar versão remota e guardar backup local
              </Button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmar}
        title="Conectar à base da empresa"
        description={
          modo === 'baixar' && !s?.configurada
            ? 'Uma cópia de segurança será criada e a base local será substituída pelos dados da nuvem. Após conectar, reabra os documentos.'
            : 'Os dados desta empresa serão compartilhados com os computadores conectados à mesma conta.'
        }
        onCancel={() => setConfirmar(false)}
        onConfirm={() => {
          setConfirmar(false)
          void executar(() => api.nuvem.conectar(c, senha, modo))
        }}
      />
    </Card>
  )
}
