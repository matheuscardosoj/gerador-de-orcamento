import { useState } from 'react'
import { UserRoundCheck, UserRoundX, Save, FilterX } from 'lucide-react'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import {
  Button,
  Field,
  Input,
  Modal,
  Mensagem,
  Badge,
  ConfirmDialog,
  EmptyState,
  SectionTitle,
  IconButton
} from '../ui/primitives'
import { DataTableFrame, TableActions } from '../ui/dataTable'
import { correspondeBusca } from '@shared/historico-preferencias'
import type { MembroEmpresa, StatusNuvem } from '@shared/evolucao'

export function UsuariosSection({
  novo,
  setNovo
}: {
  novo: boolean
  setNovo: (novo: boolean) => void
}): JSX.Element {
  const [status, setStatus] = useState<StatusNuvem | null>(null)
  const [email, setEmail] = useState(''),
    [nome, setNome] = useState(''),
    [busca, setBusca] = useState('')
  const [erro, setErro] = useState(''),
    [ocupado, setOcupado] = useState(false),
    [confirmar, setConfirmar] = useState<MembroEmpresa | null>(null)
  const { data, loading, error, reload } = useAsync(
    async () => {
      const s = await api.nuvem.status()
      setStatus(s)
      return s.protocolo === 2 && s.autenticada ? await api.colaboracao.membros() : []
    },
    [],
    ['membros']
  )
  const salvar = async (): Promise<void> => {
    setOcupado(true)
    setErro('')
    try {
      await api.colaboracao.vincularMembro(email, nome)
      setNovo(false)
      setEmail('')
      setNome('')
      reload()
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setOcupado(false)
    }
  }
  const alternar = async (): Promise<void> => {
    if (!confirmar) return
    setOcupado(true)
    setErro('')
    try {
      await api.colaboracao.ativarMembro(confirmar.usuarioId, !confirmar.ativo)
      if (confirmar.usuarioId === status?.usuarioId && confirmar.ativo) await api.nuvem.sair()
      setConfirmar(null)
      reload()
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
      setConfirmar(null)
    } finally {
      setOcupado(false)
    }
  }
  const lista = (data ?? []).filter((m) => correspondeBusca(busca, [m.nome, m.email]))
  return (
    <div className="space-y-4">
      <SectionTitle
        title="Usuários da empresa"
        description="Cada pessoa usa seu login. Todos os membros ativos têm acesso completo; as alterações ficam identificadas no histórico."
      />
      {status && (status.protocolo !== 2 || !status.autenticada) && (
        <Mensagem>
          Conecte à nuvem com a configuração de colaboração atualizada para gerenciar usuários. Os
          dados locais permanecem disponíveis.
        </Mensagem>
      )}
      {(erro || error) && !novo && <Mensagem>{erro || error}</Mensagem>}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="max-w-md"
          aria-label="Buscar usuários"
          placeholder="Buscar por nome ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Button variant="ghost" icon={FilterX} onClick={() => setBusca('')}>
          Limpar filtros
        </Button>
      </div>
      {loading && !data ? (
        <p className="text-sm text-slate-500">Carregando…</p>
      ) : !lista.length ? (
        <EmptyState
          title="Nenhum usuário encontrado"
          description={
            status?.protocolo === 2
              ? 'Vincule uma conta já criada em Authentication.'
              : 'Sua empresa será exibida após conectar à nuvem.'
          }
        />
      ) : (
        <DataTableFrame minWidth="800px">
          <colgroup>
            <col style={{ width: '35%' }} />
            <col style={{ width: '45%' }} />
            <col className="w-32" />
            <col className="w-24" />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">
                Nome
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                E-mail
              </th>
              <th scope="col" className="px-4 py-3 text-left">
                Estado
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lista.map((m) => (
              <tr key={m.usuarioId} className="h-[62px] hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  <span className="line-clamp-2 break-words">{m.nome}</span>
                  {m.usuarioId === status?.usuarioId && (
                    <span className="block text-xs text-slate-400">Sua conta</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="line-clamp-2 break-words">{m.email}</span>
                </td>
                <td className="px-4 py-3">
                  <Badge color={m.ativo ? 'green' : 'slate'}>{m.ativo ? 'Ativo' : 'Inativo'}</Badge>
                </td>
                <td className="px-4 py-3">
                  <TableActions>
                    <IconButton
                      icon={m.ativo ? UserRoundX : UserRoundCheck}
                      label={`${m.ativo ? 'Desativar' : 'Reativar'} usuário ${m.nome}`}
                      disabled={ocupado}
                      onClick={() => setConfirmar(m)}
                    />
                  </TableActions>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableFrame>
      )}
      <p className="text-xs text-slate-500">
        Contas são criadas e confirmadas no Supabase → Authentication → Users. Vincular não envia
        e-mails nem compartilha senhas.
      </p>
      <Modal
        open={novo}
        onClose={() => !ocupado && setNovo(false)}
        title="Vincular usuário"
        size="md"
        footer={
          <>
            <Button variant="secondary" disabled={ocupado} onClick={() => setNovo(false)}>
              Cancelar
            </Button>
            <Button
              icon={Save}
              disabled={ocupado || status?.protocolo !== 2 || !status.autenticada}
              onClick={() => void salvar()}
            >
              {ocupado ? 'Salvando…' : 'Vincular usuário'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Crie e confirme a conta em Authentication. Depois informe o e-mail aqui. O usuário
            poderá entrar no aplicativo com seu próprio login.
          </p>
          {erro && <Mensagem>{erro}</Mensagem>}
          <Field label="Nome do usuário">
            <Input
              maxLength={120}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </Field>
          <Field label="E-mail da conta">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={!!confirmar}
        title={confirmar?.ativo ? 'Desativar usuário' : 'Reativar usuário'}
        description={
          confirmar?.ativo
            ? `Desativar ${confirmar.nome}? Os documentos e o histórico serão preservados. Computadores offline só receberão a alteração quando reconectarem.`
            : `Reativar o acesso completo de ${confirmar?.nome ?? ''}?`
        }
        onCancel={() => setConfirmar(null)}
        onConfirm={alternar}
      />
    </div>
  )
}
