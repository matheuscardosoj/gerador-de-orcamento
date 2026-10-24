import { MensagemFlutuante } from '../components/MensagemFlutuante'
import { useState } from 'react'
import { LogOut, Save, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { mensagemErro } from '@shared/erros'
import { api } from '../lib/api'
import { useBloqueioEdicao, useNav } from '../lib/nav'
import { useConta } from '../components/ContaGate'
import { SeletorTema } from '../components/SeletorTema'
import { Button, Card, Field, Input, PasswordInput, SectionTitle } from '../ui/primitives'
import type { ReactElement } from 'react'

export function MinhaContaSection(): ReactElement {
  const { conta, atualizar } = useConta()
  const { executarComConfirmacao } = useNav()
  const [nome, setNome] = useState(conta.nome)
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [senhaEmail, setSenhaEmail] = useState('')
  const [codigoEmail, setCodigoEmail] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  useBloqueioEdicao(
    nome !== conta.nome ||
      !!atual ||
      !!nova ||
      !!confirmacao ||
      !!novoEmail ||
      !!senhaEmail ||
      !!codigoEmail
  )
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
    <div className="w-full pilha-y-4">
      {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
      {sucesso && (
        <MensagemFlutuante tom="sucesso" temporaria>
          {sucesso}
        </MensagemFlutuante>
      )}
      <div className="grid gap-4">
        <Card className="pilha-y-4 p-6">
          <SectionTitle
            title="Aparência"
            description="Vale para este computador e fica salvo ao fechar o aplicativo. Os documentos gerados (PDF, Word) continuam com fundo branco."
          />
          <SeletorTema />
        </Card>
        <Card className="pilha-y-5 p-6">
          <SectionTitle
            title="Minha conta"
            description={conta.email}
            action={
              conta.operador ? (
                <span className="rounded-full bg-brand-teal/10 px-2 py-1 text-xs font-medium text-brand-tealDark">
                  Administrador do Sistema
                </span>
              ) : undefined
            }
          />
          <form
            className="pilha-y-4"
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
        <Card className="pilha-y-5 p-6">
          <SectionTitle
            title="Alterar e-mail"
            description={
              conta.emailPendente
                ? `Aguardando confirmação do novo endereço: ${conta.emailPendente}`
                : `E-mail atual: ${conta.email}`
            }
          />
          {conta.emailPendente && (
            <div className="rounded-lg border border-brand-teal/20 bg-brand-teal/5 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-800">Confirme o novo e-mail</p>
              <p className="mt-2">
                Digite o código enviado para {conta.emailPendente}. O endereço atual recebe apenas o
                aviso de segurança depois da conclusão.
              </p>
              <form
                className="mt-3 flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void executar(async () => {
                    const resultado = await api.conta.confirmarAlteracaoEmail(codigoEmail)
                    atualizar(resultado)
                    setCodigoEmail('')
                    setSucesso('Seu e-mail foi alterado com segurança.')
                  })
                }}
              >
                <Field label="Código recebido" className="min-w-[13rem] flex-1">
                  <Input
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    required
                    disabled={ocupado}
                    value={codigoEmail}
                    onChange={(e) => setCodigoEmail(e.target.value.replace(/\D/g, ''))}
                  />
                </Field>
                <Button type="submit" icon={ShieldCheck} disabled={ocupado || !codigoEmail}>
                  Confirmar código
                </Button>
              </form>
            </div>
          )}
          <form
            className="pilha-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void executar(async () => {
                const resultado = await api.conta.alterarEmail(senhaEmail, novoEmail)
                atualizar(resultado)
                setSenhaEmail('')
                setNovoEmail('')
                setSucesso(
                  `Enviamos um código de confirmação para ${resultado.emailPendente}. Digite-o nesta tela para concluir a troca.`
                )
              })
            }}
          >
            <Field label="Novo e-mail">
              <Input
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                disabled={ocupado}
                value={novoEmail}
                onChange={(e) => setNovoEmail(e.target.value)}
              />
            </Field>
            <Field label="Senha atual" hint="Confirme sua identidade para alterar o e-mail.">
              <PasswordInput
                required
                autoComplete="current-password"
                disabled={ocupado}
                value={senhaEmail}
                onChange={(e) => setSenhaEmail(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                icon={Mail}
                disabled={ocupado || !novoEmail.trim() || !senhaEmail}
              >
                Enviar confirmação
              </Button>
            </div>
            <p className="text-sm text-slate-500">
              Sua senha atual é exigida para iniciar a troca. O código é enviado somente ao novo
              e-mail.
            </p>
          </form>
        </Card>
        <Card className="pilha-y-5 p-6">
          <SectionTitle
            title="Alterar senha"
            description="Confirme sua senha atual para proteger o acesso à conta."
          />
          <form
            className="pilha-y-4"
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
