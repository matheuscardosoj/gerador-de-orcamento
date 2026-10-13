import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { EstadoConta } from '@shared/conta'
import type { EmpresaConfig } from '@shared/types'
import { mensagemErro } from '@shared/erros'
import { api } from '../lib/api'
import { Button, Card, Checkbox, Field, Input, Mensagem, SectionTitle } from '../ui/primitives'

const ContaContext = createContext<{
  conta: EstadoConta
  atualizar: (c: EstadoConta) => void
} | null>(null)
export function useConta() {
  const contexto = useContext(ContaContext)
  if (!contexto) throw new Error('Conta indisponível')
  return contexto
}
export function ContaGate({ children }: { children: ReactNode }): JSX.Element {
  const [conta, setConta] = useState<EstadoConta | null>(null)
  const [erro, setErro] = useState('')
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null)
  const [verificando, setVerificando] = useState(true)
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let vivo = true
    const atualizar = () => {
      void api.conta
        .status()
        .then((c) => {
          if (vivo) {
            setConta(c)
            setErro('')
          }
        })
        .catch((e) => {
          if (vivo) setErro(mensagemErro(e))
        })
    }
    atualizar()
    const remover = api.eventos.observarDados((e) => {
      if (e.status) atualizar()
    })
    return () => {
      vivo = false
      remover()
    }
  }, [])
  useEffect(() => {
    let vivo = true
    setEmpresa(null)
    setErro('')
    setVerificando(true)
    if (conta?.fase === 'pronto')
      void api.empresa
        .get()
        .then((e) => {
          if (vivo) {
            setEmpresa(e)
            setVerificando(false)
          }
        })
        .catch((e) => {
          if (vivo) {
            setErro(mensagemErro(e))
            setVerificando(false)
          }
        })
    else setVerificando(false)
    return () => {
      vivo = false
    }
  }, [conta?.fase, conta?.empresa?.id, tentativa])
  if (!conta)
    return (
      <TelaAcesso>
        <SectionTitle title="Gerador de Orçamentos" description="Acessando sua conta" />
        {erro ? <Mensagem>{erro}</Mensagem> : <p role="status">Carregando…</p>}
      </TelaAcesso>
    )
  if (conta.fase !== 'pronto') return <Acesso conta={conta} atualizar={setConta} />
  if (verificando)
    return (
      <TelaAcesso>
        <p role="status">Preparando os dados da empresa…</p>
        {erro && <Mensagem>{erro}</Mensagem>}
      </TelaAcesso>
    )
  if (!empresa)
    return (
      <TelaAcesso>
        <SectionTitle title="Não foi possível abrir os dados da empresa" />
        <Mensagem>{erro || 'Tente novamente para continuar.'}</Mensagem>
        <Button onClick={() => setTentativa((v) => v + 1)}>Tentar novamente</Button>
        <Button
          variant="ghost"
          onClick={() =>
            void api.conta
              .sair()
              .then(setConta)
              .catch((e) => setErro(mensagemErro(e)))
          }
        >
          Sair da conta
        </Button>
      </TelaAcesso>
    )
  return (
    <ContaContext.Provider value={{ conta, atualizar: setConta }}>
      {empresa && !empresa.nome.trim() && conta.empresa?.papel === 'administrador' ? (
        <PrimeirosPassos empresa={empresa} concluir={setEmpresa} />
      ) : (
        <div key={`${conta.email}:${conta.empresa?.id}`} className="h-full">
          {children}
        </div>
      )}
    </ContaContext.Provider>
  )
}
function TelaAcesso({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="flex min-h-full items-center justify-center overflow-y-auto bg-slate-100 px-6 py-10">
      <Card className="w-full max-w-lg space-y-5 p-8">{children}</Card>
    </main>
  )
}
function Acesso({
  conta,
  atualizar
}: {
  conta: EstadoConta
  atualizar: (c: EstadoConta) => void
}): JSX.Element {
  const [email, setEmail] = useState(conta.email),
    [senha, setSenha] = useState(''),
    [lembrar, setLembrar] = useState(conta.lembrar)
  const [modo, setModo] = useState<'entrar' | 'convite' | 'recuperacao'>('entrar'),
    [codigo, setCodigo] = useState(''),
    [enviado, setEnviado] = useState(false)
  const [confirmacao, setConfirmacao] = useState(''),
    [erro, setErro] = useState(''),
    [ocupado, setOcupado] = useState(false)
  const executar = async (tarefa: () => Promise<void>) => {
    setOcupado(true)
    setErro('')
    try {
      await tarefa()
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }
  const mudar = (m: typeof modo) => {
    setModo(m)
    setErro('')
    setSenha('')
    setConfirmacao('')
    setCodigo('')
    setEnviado(false)
  }
  if (!conta.servicoConfigurado)
    return (
      <TelaAcesso>
        <SectionTitle
          title="Vamos preparar seu acesso"
          description="Esta instalação ainda precisa ser conectada ao serviço da sua empresa."
        />
        <Mensagem tom="info">
          Entre em contato com o responsável pela instalação para concluir a configuração. Você não
          precisa criar um banco de dados.
        </Mensagem>
      </TelaAcesso>
    )
  if (conta.fase === 'escolherEmpresa')
    return (
      <TelaAcesso>
        <SectionTitle title="Escolha sua empresa" description={`Conectado como ${conta.email}`} />
        {erro && <Mensagem>{erro}</Mensagem>}
        {conta.empresas.length ? (
          conta.empresas.map((e) => (
            <Button
              className="w-full"
              variant="outline"
              key={e.id}
              disabled={ocupado}
              onClick={() =>
                void executar(async () => atualizar(await api.conta.selecionarEmpresa(e.id)))
              }
            >
              {e.nome}
            </Button>
          ))
        ) : (
          <Mensagem tom="info">
            Sua conta ainda não está vinculada a uma empresa. Peça um convite ao administrador.
          </Mensagem>
        )}
        {conta.operador && <AtivarEmpresa />}
        <Button
          variant="ghost"
          disabled={ocupado}
          onClick={() => void executar(async () => atualizar(await api.conta.sair()))}
        >
          Entrar com outra conta
        </Button>
      </TelaAcesso>
    )
  return (
    <TelaAcesso>
      <SectionTitle
        title={
          modo === 'entrar'
            ? 'Bem-vindo'
            : modo === 'convite'
              ? 'Aceitar convite'
              : 'Recuperar acesso'
        }
        description={
          modo === 'entrar'
            ? 'Entre para acessar os documentos da sua empresa.'
            : 'Use o e-mail que recebeu o convite ou que já está cadastrado.'
        }
      />
      {erro && <Mensagem>{erro}</Mensagem>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void executar(async () => {
            if (modo === 'entrar') atualizar(await api.conta.entrar(email.trim(), senha, lembrar))
            else if (!enviado) {
              await api.conta.enviarCodigo(email.trim(), modo)
              setEnviado(true)
            } else {
              if (senha !== confirmacao)
                throw new Error('As senhas não coincidem. Confira os dois campos.')
              atualizar(await api.conta.confirmarCodigo(email.trim(), codigo.trim(), modo, senha))
            }
          })
        }}
      >
        <Field label="E-mail">
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            disabled={ocupado || enviado}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {modo === 'entrar' ? (
          <>
            <Field label="Senha">
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </Field>
            <Checkbox
              label="Manter conectado neste computador"
              checked={lembrar}
              onChange={setLembrar}
            />
          </>
        ) : (
          enviado && (
            <>
              <Mensagem tom="info">
                Se este e-mail estiver habilitado, você receberá um código. Confira também a pasta
                de spam.
              </Mensagem>
              <Field label="Código recebido por e-mail">
                <Input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Nova senha" hint="Use pelo menos 8 caracteres.">
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </Field>
              <Field label="Confirme a nova senha">
                <Input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                />
              </Field>
            </>
          )
        )}
        <Button type="submit" className="w-full" disabled={ocupado}>
          {ocupado
            ? 'Aguarde…'
            : modo === 'entrar'
              ? 'Entrar'
              : enviado
                ? 'Confirmar e entrar'
                : 'Enviar código'}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {modo === 'entrar' ? (
          <>
            <Button variant="ghost" disabled={ocupado} onClick={() => mudar('recuperacao')}>
              Esqueci minha senha
            </Button>
            <Button variant="ghost" disabled={ocupado} onClick={() => mudar('convite')}>
              Recebi um convite
            </Button>
          </>
        ) : (
          <Button variant="ghost" disabled={ocupado} onClick={() => mudar('entrar')}>
            Voltar para entrar
          </Button>
        )}
      </div>
    </TelaAcesso>
  )
}
function AtivarEmpresa(): JSX.Element {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [administrador, setAdministrador] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState(false)
  return (
    <details className="rounded-lg border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Ativar uma empresa
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setOcupado(true)
          setErro('')
          setAviso('')
          void api.conta
            .criarEmpresa(nome.trim(), email.trim(), administrador.trim())
            .then(() => {
              setAviso(
                'Convite enviado ao administrador. Ele poderá configurar a empresa ao entrar.'
              )
              setNome('')
              setEmail('')
              setAdministrador('')
            })
            .catch((e) => setErro(mensagemErro(e)))
            .finally(() => setOcupado(false))
        }}
      >
        {erro && <Mensagem>{erro}</Mensagem>}
        {aviso && <Mensagem tom="info">{aviso}</Mensagem>}
        <Field label="Nome da empresa">
          <Input
            required
            disabled={ocupado}
            maxLength={120}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </Field>
        <Field label="Nome do administrador">
          <Input
            required
            disabled={ocupado}
            maxLength={120}
            value={administrador}
            onChange={(e) => setAdministrador(e.target.value)}
          />
        </Field>
        <Field label="E-mail do administrador">
          <Input
            required
            disabled={ocupado}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" disabled={ocupado}>
          {ocupado ? 'Enviando…' : 'Criar empresa e enviar convite'}
        </Button>
      </form>
    </details>
  )
}
function PrimeirosPassos({
  empresa,
  concluir
}: {
  empresa: EmpresaConfig
  concluir: (e: EmpresaConfig) => void
}): JSX.Element {
  const [form, setForm] = useState(empresa),
    [erro, setErro] = useState(''),
    [ocupado, setOcupado] = useState(false)
  const { atualizar } = useConta()
  const salvar = async () => {
    setOcupado(true)
    setErro('')
    try {
      await api.empresa.save(form)
      concluir(form)
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <TelaAcesso>
      <SectionTitle
        title="Vamos conhecer sua empresa"
        description="Informe o nome que aparecerá nos documentos. Os outros dados podem ser preenchidos agora ou depois em Configurações."
      />
      {erro && <Mensagem>{erro}</Mensagem>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void salvar()
        }}
      >
        <Field label="Nome da empresa">
          <Input
            required
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
        </Field>
        <Field label="Razão social (opcional)">
          <Input
            value={form.razaoSocial}
            onChange={(e) => setForm({ ...form, razaoSocial: e.target.value })}
          />
        </Field>
        <Field label="E-mail de contato (opcional)">
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>
        <Button
          variant="outline"
          disabled={ocupado}
          onClick={() => {
            void api.logo
              .selecionar()
              .then((logo) => {
                if (logo) setForm((f) => ({ ...f, logoDataUrl: logo }))
              })
              .catch((e) => setErro(mensagemErro(e)))
          }}
        >
          Escolher logo
        </Button>
        <div
          className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center"
          aria-label="Identificação da empresa"
        >
          {form.logoDataUrl && (
            <img
              className="mx-auto mb-3 max-h-20 max-w-full object-contain"
              src={form.logoDataUrl}
              alt="Logo da empresa"
            />
          )}
          <p className="font-semibold text-slate-800">{form.nome || 'Nome da empresa'}</p>
          <p className="text-sm text-slate-500">{form.razaoSocial}</p>
        </div>
        <Button className="w-full" type="submit" disabled={ocupado || !form.nome.trim()}>
          {ocupado ? 'Salvando…' : 'Concluir configuração'}
        </Button>
      </form>
      <Button
        variant="ghost"
        disabled={ocupado}
        onClick={() => {
          void api.conta
            .sair()
            .then(atualizar)
            .catch((e) => setErro(mensagemErro(e)))
        }}
      >
        Sair da conta
      </Button>
    </TelaAcesso>
  )
}
