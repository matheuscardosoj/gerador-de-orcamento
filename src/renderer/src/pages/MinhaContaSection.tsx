import { useState } from 'react'
import { LogOut, Save, KeyRound } from 'lucide-react'
import { mensagemErro } from '@shared/erros'
import { api } from '../lib/api'
import { useBloqueioEdicao, useNav } from '../lib/nav'
import { useConta } from '../components/ContaGate'
import { Button, Card, Field, Input, Mensagem, PasswordInput, SectionTitle } from '../ui/primitives'

export function MinhaContaSection(): JSX.Element {
  const { conta, atualizar } = useConta()
  const { executarComConfirmacao } = useNav()
  const [nome, setNome] = useState(conta.nome)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  useBloqueioEdicao(nome !== conta.nome || !!atual || !!nova || !!confirmacao)
  const executar = async (acao: () => Promise<void>): Promise<void> => {
    setOcupado(true)
    setErro('')
    setSucesso('')
    try {
      await acao()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <div className="space-y-4">
      {erro && <Mensagem>{erro}</Mensagem>}
      {sucesso && <Mensagem tom="info">{sucesso}</Mensagem>}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <Card className="space-y-5 p-6">
          <SectionTitle title="Minha conta" description={conta.email} />
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void executar(async () => {
                const resultado = await api.conta.atualizarNome(nome.trim())
                atualizar(resultado)
                setNome(resultado.nome)
                setSucesso('Seu nome foi atualizado.')
              })
            }}
          >
            <Field label="Seu nome">
              <Input
                required
                maxLength={120}
                value={nome}
                disabled={ocupado}
                autoComplete="name"
                onChange={(e) => setNome(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                icon={Save}
                disabled={ocupado || !nome.trim() || nome.trim() === conta.nome}
              >
                Salvar nome
              </Button>
            </div>
          </form>
        </Card>
        <Card className="space-y-5 p-6">
          <SectionTitle
            title="Alterar senha"
            description="Confirme sua senha atual para proteger o acesso à conta."
          />
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void executar(async () => {
                if (nova !== confirmacao)
                  throw new Error('As novas senhas não coincidem. Confira os dois campos.')
                await api.conta.alterarSenha(atual, nova)
                setAtual('')
                setNova('')
                setConfirmacao('')
                setSucesso('Sua senha foi alterada.')
              })
            }}
          >
            <Field label="Senha atual">
              <PasswordInput
                required
                autoComplete="current-password"
                disabled={ocupado}
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
              />
            </Field>
            <Field label="Nova senha" hint="Use de 8 a 128 caracteres.">
              <PasswordInput
                required
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                disabled={ocupado}
                value={nova}
                onChange={(e) => setNova(e.target.value)}
              />
            </Field>
            <Field label="Confirme a nova senha">
              <PasswordInput
                required
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                disabled={ocupado}
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" icon={KeyRound} disabled={ocupado}>
                Alterar senha
              </Button>
            </div>
          </form>
        </Card>
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <SectionTitle
          title={conta.empresa?.nome ?? 'Empresa'}
          description="Para entrar com outra pessoa ou escolher outra empresa, saia desta conta. Os dados salvos serão preservados."
        />
        <Button
          variant="outline"
          icon={LogOut}
          disabled={ocupado}
          onClick={() =>
            executarComConfirmacao(() => {
              void executar(async () => atualizar(await api.conta.sair()))
            })
          }
        >
          Sair da conta
        </Button>
      </Card>
    </div>
  )
}
