import { useEffect, useState } from 'react'
import { Cloud, RefreshCw, LogOut } from 'lucide-react'
import { api } from '../lib/api'
import type { ConfigNuvem, StatusNuvem } from '@shared/types'
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  ConfirmDialog,
  SectionTitle,
  Mensagem
} from '../ui/primitives'
export function NuvemSection(): JSX.Element {
  const [c, setC] = useState<ConfigNuvem>({ url: '', chavePublica: '', email: '' })
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'publicar' | 'baixar'>('publicar')
  const [s, setS] = useState<StatusNuvem | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [conciliar, setConciliar] = useState<string | null>(null)
  const [instalacaoCopiada, setInstalacaoCopiada] = useState(false)
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
    <Card className="p-6">
      <SectionTitle
        title="Nuvem da empresa"
        description="Dados compartilhados com os computadores conectados à mesma conta"
      />
      <p className="mb-4 text-sm text-slate-600">
        Use o mesmo projeto Supabase e a mesma conta em todos os computadores desta empresa. Cada
        empresa configura seu próprio projeto. Plano gratuito: 500 MB de banco; pouca atividade pode
        pausar o projeto.
      </p>
      <details className="mb-4 rounded-lg border border-slate-200 p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">
          Como configurar minha empresa na nuvem
        </summary>
        <ol className="mt-3 list-decimal space-y-3 pl-5">
          <li>
            Se você já usa uma versão antiga, primeiro exporte um backup em Dados e backup, feche o
            aplicativo e instale a atualização com o mesmo usuário do Windows. Abra a versão
            atualizada e confira seus clientes, documentos e fotos: a migração local é automática e
            cria um backup verificado. Exporte uma nova cópia antes de publicar.
          </li>
          <li>
            Entre no{' '}
            <a
              className="text-teal-700 underline"
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              painel do Supabase
            </a>
            , crie uma organização no plano Free e um projeto exclusivo para sua empresa. Escolha a
            região mais próxima e guarde a senha do banco.
          </li>
          <li>
            Abra o SQL Editor do projeto, crie uma consulta, cole a configuração copiada pelo botão
            abaixo e execute com Run. Não é necessário criar um Storage.
          </li>
          <li>
            Em Authentication → Users, adicione o usuário da empresa com e-mail e senha e confirme o
            e-mail. Essa é a conta usada em todos os computadores; a senha do banco é diferente.
          </li>
          <li>
            Copie a URL do projeto e a chave pública publishable no painel de conexão / API Keys.
            Preencha esses dados e o login abaixo.
          </li>
          <li>
            No computador que possui seus dados já migrados, escolha “Publicar os dados locais em
            uma nuvem vazia”. Nos demais, escolha “Baixar a base da empresa”. Clique em Conectar e
            aguarde a sincronização.
          </li>
          <li>
            Faça a primeira sincronização online. Ela reserva números para emitir offline. Para
            transferir a edição definitiva de um documento, use “Versões e transferência” com os
            computadores sincronizados.
          </li>
        </ol>
        <Button
          className="mt-4"
          variant="outline"
          disabled={ocupado}
          onClick={() => {
            setErro('')
            void api.nuvem
              .copiarInstalacao()
              .then(() => setInstalacaoCopiada(true))
              .catch((e) => setErro(String(e)))
          }}
        >
          {instalacaoCopiada
            ? 'Configuração copiada — cole no SQL Editor'
            : 'Copiar configuração do banco'}
        </Button>
        <p className="mt-3 text-xs text-slate-500">
          A configuração fornecida não contém senhas. As permissões restringem os dados ao usuário
          autenticado da empresa.
        </p>
      </details>
      {erro && <Mensagem className="mb-4">{erro}</Mensagem>}
      {s?.erro && <Mensagem className="mb-4">{s.erro}</Mensagem>}
      <div className="grid gap-4 md:grid-cols-2">
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
        <div className="mt-2 flex flex-wrap gap-2 md:col-span-2">
          <Button
            icon={Cloud}
            disabled={ocupado || !senha || !c.url || !c.chavePublica || !c.email}
            onClick={() => setConfirmar(true)}
          >
            Conectar
          </Button>
          <Button
            icon={RefreshCw}
            disabled={ocupado || !s?.autenticada}
            variant="outline"
            onClick={() => void executar(() => api.nuvem.sincronizar())}
          >
            Sincronizar agora
          </Button>
          <Button
            icon={LogOut}
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
        <div className="mt-6 space-y-3 border-t border-slate-200 pt-6 text-sm text-slate-600">
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
            <div
              key={x.id}
              className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              <p>{x.detalhe}</p>
              <p>
                Para preservar a edição local, crie uma cópia no editor antes de adotar a versão
                remota. Recibos e relatório vinculados serão conciliados juntos. Uma cópia de
                segurança com todas as edições locais será salva antes da conciliação.
              </p>
              <Button variant="outline" disabled={ocupado} onClick={() => setConciliar(x.id)}>
                Adotar versão remota e guardar backup local
              </Button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={conciliar !== null}
        title="Adotar dados da nuvem"
        confirmLabel="Guardar backup e adotar"
        description="O documento e seus recibos e pagamentos vinculados voltarão aos dados da nuvem. Alterações e documentos ainda não enviados serão preservados no backup local. Essa ação mantém recibos e saldo do relatório consistentes."
        onCancel={() => setConciliar(null)}
        onConfirm={() => {
          const id = conciliar!
          setConciliar(null)
          void executar(async () => {
            await api.nuvem.aceitarRemoto(id)
            return api.nuvem.status()
          })
        }}
      />
      <ConfirmDialog
        open={confirmar}
        title="Conectar à base da empresa"
        confirmLabel="Conectar"
        danger={false}
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
