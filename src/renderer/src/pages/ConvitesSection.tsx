import { useState } from 'react'
import { Mail, RefreshCw, UserRoundX, UserRoundCheck, X } from 'lucide-react'
import type { PapelConta } from '@shared/conta'
import type { MembroEmpresa } from '@shared/evolucao'
import { mensagemErro } from '@shared/erros'
import { api } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { useBloqueioEdicao, useNav } from '../lib/nav'
import { useConta } from '../components/ContaGate'
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Modal,
  Mensagem,
  SectionTitle,
  IconButton,
  ConfirmDialog,
  EmptyState
} from '../ui/primitives'
import { DataTableFrame, TableActions } from '../ui/dataTable'

export function ConvitesSection({
  novo,
  setNovo
}: {
  novo: boolean
  setNovo: (v: boolean) => void
}): JSX.Element {
  const { conta, atualizar } = useConta()
  const { executarComConfirmacao } = useNav()
  const admin = conta.empresa?.papel === 'administrador'
  const [email, setEmail] = useState(''),
    [nome, setNome] = useState(''),
    [papel, setPapel] = useState<PapelConta>('membro')
  const [empresa, setEmpresa] = useState(''),
    [novaEmpresa, setNovaEmpresa] = useState(false)
  const [erro, setErro] = useState(''),
    [aviso, setAviso] = useState(''),
    [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState<{ texto: string; acao: () => Promise<void> } | null>(
    null
  )
  useBloqueioEdicao((novo || novaEmpresa) && !!(nome || email || empresa))
  const { data, error, loading, reload } = useAsync(
    async () => ({
      membros: await api.colaboracao.membros(),
      convites: admin || conta.operador ? await api.conta.convites() : []
    }),
    [admin, conta.operador],
    ['membros']
  )
  const executar = async (acao: () => Promise<void>): Promise<void> => {
    setOcupado(true)
    setErro('')
    setAviso('')
    try {
      await acao()
      reload()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }
  const fechar = (): void => {
    if (!ocupado) {
      executarComConfirmacao(() => {
        setNovo(false)
        setNovaEmpresa(false)
        setEmail('')
        setNome('')
        setEmpresa('')
        setPapel('membro')
        setErro('')
      })
    }
  }
  const alternar = (m: MembroEmpresa): void =>
    setConfirmar({
      texto: `${m.ativo ? 'Desativar' : 'Reativar'} o acesso de ${m.nome}? Documentos e histórico serão preservados. Computadores offline recebem a mudança ao reconectar.`,
      acao: async () => {
        await api.colaboracao.ativarMembro(m.usuarioId, !m.ativo)
        if (m.email.toLowerCase() === conta.email.toLowerCase() && m.ativo)
          atualizar(await api.conta.sair())
      }
    })
  return (
    <div className="space-y-4">
      <SectionTitle
        title="Usuários da empresa"
        description="Convide por e-mail. Cada pessoa define sua senha e usa seu próprio acesso. Administradores também gerenciam pessoas e configurações."
      />
      {(error || (erro && !novo && !novaEmpresa)) && <Mensagem>{error || erro}</Mensagem>}
      {aviso && <Mensagem tom="info">{aviso}</Mensagem>}
      {loading && !data ? (
        <p role="status" className="text-sm text-slate-500">
          Carregando usuários…
        </p>
      ) : !data?.membros.length ? (
        <EmptyState
          title="Nenhum usuário encontrado"
          description="Confira sua conexão e tente novamente."
        />
      ) : (
        <DataTableFrame minWidth="800px">
          <colgroup>
            <col style={{ width: '21%' }} />
            <col style={{ width: '38%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {['Nome', 'E-mail', 'Acesso', 'Estado', 'Ações'].map((t) => (
                <th key={t} className="px-4 py-3 text-left" scope="col">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.membros.map((m) => (
              <tr key={m.usuarioId} className="h-[62px] hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  <span className="line-clamp-2 break-words" title={m.nome}>
                    {m.nome}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="line-clamp-2 break-all" title={m.email}>
                    {m.email}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {admin ? (
                    <Select
                      aria-label={`Perfil de ${m.nome}`}
                      value={m.papel ?? 'membro'}
                      disabled={ocupado}
                      onChange={(e) => {
                        const destino = e.target.value as PapelConta
                        setConfirmar({
                          texto: `Alterar o acesso de ${m.nome} para ${destino === 'administrador' ? 'administrador' : 'membro'}?`,
                          acao: async () =>
                            atualizar(await api.conta.alterarPapel(m.usuarioId, destino))
                        })
                      }}
                    >
                      <option value="membro">Membro</option>
                      <option value="administrador">Administrador</option>
                    </Select>
                  ) : m.papel === 'administrador' ? (
                    'Administrador'
                  ) : (
                    'Membro'
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{m.ativo ? 'Ativo' : 'Inativo'}</td>
                <td className="px-4 py-3">
                  <TableActions>
                    {admin && (
                      <IconButton
                        icon={m.ativo ? UserRoundX : UserRoundCheck}
                        label={`${m.ativo ? 'Desativar' : 'Reativar'} ${m.nome}`}
                        disabled={ocupado}
                        onClick={() => alternar(m)}
                      />
                    )}
                  </TableActions>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableFrame>
      )}
      {(admin || conta.operador) && (
        <Card className="space-y-4 p-6">
          <SectionTitle
            title="Convites"
            description="O destinatário recebe um código e conclui seu acesso pelo aplicativo."
          />
          {!data?.convites.length ? (
            <p className="text-sm text-slate-500">Nenhum convite enviado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.convites.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-slate-800">{c.nome || c.email}</p>
                    <p className="text-sm text-slate-500">
                      {c.email} · {c.estado}
                    </p>
                  </div>
                  {['Pendente', 'Expirado'].includes(c.estado) && (
                    <TableActions>
                      <IconButton
                        icon={RefreshCw}
                        label={`Reenviar convite para ${c.email}`}
                        disabled={ocupado}
                        onClick={() =>
                          void executar(async () => {
                            await api.conta.reenviarConvite(c.id)
                            setAviso('Convite reenviado.')
                          })
                        }
                      />
                      <IconButton
                        icon={X}
                        label={`Cancelar convite para ${c.email}`}
                        disabled={ocupado}
                        onClick={() =>
                          setConfirmar({
                            texto: `Cancelar o convite para ${c.email}?`,
                            acao: () => api.conta.cancelarConvite(c.id)
                          })
                        }
                      />
                    </TableActions>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {conta.operador && (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
          <SectionTitle
            title="Ativar outra empresa"
            description="Cria um espaço separado e convida o primeiro administrador."
          />
          <Button variant="outline" disabled={ocupado} onClick={() => setNovaEmpresa(true)}>
            Nova empresa
          </Button>
        </Card>
      )}
      <Modal
        open={novo || novaEmpresa}
        title={novaEmpresa ? 'Nova empresa' : 'Convidar usuário'}
        size="md"
        onClose={fechar}
        footer={
          <>
            <Button variant="secondary" disabled={ocupado} onClick={fechar}>
              Cancelar
            </Button>
            <Button icon={Mail} type="submit" form="convite-usuario" disabled={ocupado}>
              {ocupado ? 'Enviando…' : 'Enviar convite'}
            </Button>
          </>
        }
      >
        <form
          id="convite-usuario"
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void executar(async () => {
              if (novaEmpresa)
                await api.conta.criarEmpresa(empresa.trim(), email.trim(), nome.trim())
              else await api.conta.convidar(email.trim(), nome.trim(), papel)
              setNovo(false)
              setNovaEmpresa(false)
              setNome('')
              setEmail('')
              setEmpresa('')
              setAviso('Convite enviado. A pessoa pode concluir o acesso pelo aplicativo.')
            })
          }}
        >
          {erro && <Mensagem>{erro}</Mensagem>}
          {novaEmpresa && (
            <Field label="Nome da empresa">
              <Input
                disabled={ocupado}
                required
                maxLength={120}
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
              />
            </Field>
          )}
          <Field label="Nome da pessoa">
            <Input
              disabled={ocupado}
              required
              maxLength={120}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </Field>
          <Field label="E-mail">
            <Input
              disabled={ocupado}
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          {!novaEmpresa && (
            <Field label="Perfil de acesso">
              <Select
                disabled={ocupado}
                value={papel}
                onChange={(e) => setPapel(e.target.value as PapelConta)}
              >
                <option value="membro">Membro</option>
                <option value="administrador">Administrador</option>
              </Select>
            </Field>
          )}
        </form>
      </Modal>
      <ConfirmDialog
        open={!!confirmar}
        title="Confirmar alteração de acesso"
        description={confirmar?.texto ?? ''}
        onCancel={() => setConfirmar(null)}
        onConfirm={async () => {
          const acao = confirmar?.acao
          setConfirmar(null)
          if (acao) await executar(acao)
        }}
      />
    </div>
  )
}
