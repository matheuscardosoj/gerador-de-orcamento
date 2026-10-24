import { MensagemFlutuante } from './MensagemFlutuante'
import { definirContextoNotificacoes } from '../lib/notificacoes'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode
} from 'react'
import { Trash2 } from 'lucide-react'
import type { EstadoConta } from '@shared/conta'
import type { EmpresaConfig } from '@shared/types'
import { mensagemErro } from '@shared/erros'
import { api } from '../lib/api'
import {
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Mensagem,
  PasswordInput,
  SectionTitle,
  Modal
} from '../ui/primitives'
import type { ReactElement } from 'react'

const ContaContext = createContext<{
  conta: EstadoConta
  atualizar: (c: EstadoConta) => void
} | null>(null)
export function useConta() {
  const contexto = useContext(ContaContext)
  if (!contexto) throw new Error('Conta indisponível')
  return contexto
}
export function ContaGate({ children }: { children: ReactNode }): ReactElement {
  const [conta, setConta] = useState<EstadoConta | null>(null)
  const [erro, setErro] = useState('')
  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null)
  const [verificando, setVerificando] = useState(true)
  const [tentativa, setTentativa] = useState(0)
  useLayoutEffect(() => {
    definirContextoNotificacoes(JSON.stringify([conta?.email ?? '', conta?.empresa?.id ?? '']))
  }, [conta?.email, conta?.empresa?.id])
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
        {erro ? <MensagemFlutuante>{erro}</MensagemFlutuante> : <p role="status">Carregando…</p>}
      </TelaAcesso>
    )
  if (conta.fase === 'empresaIndisponivel')
    return (
      <TelaAcesso>
        <SectionTitle
          title={
            conta.indisponibilidade?.motivo === 'empresaExcluida'
              ? 'Esta empresa foi excluída pelo Administrador do Sistema.'
              : conta.indisponibilidade?.motivo === 'sessaoExpirada'
                ? 'Sua sessão expirou'
                : 'Seu acesso a esta empresa foi removido'
          }
        />
        <p className="text-sm text-slate-600">
          {conta.indisponibilidade?.nome}.{' '}
          {conta.indisponibilidade?.concluida
            ? 'O acesso foi encerrado.'
            : 'Encerrando as operações desta empresa…'}
        </p>
        {(erro || conta.indisponibilidade?.erro) && (
          <MensagemFlutuante>{erro || conta.indisponibilidade?.erro}</MensagemFlutuante>
        )}
        <Button
          disabled={!conta.indisponibilidade?.concluida && !conta.indisponibilidade?.erro}
          onClick={() =>
            void api.conta
              .continuarAposIndisponibilidade()
              .then(setConta)
              .catch((e) => setErro(mensagemErro(e)))
          }
        >
          {conta.indisponibilidade?.erro
            ? 'Tentar concluir encerramento'
            : conta.operador && conta.indisponibilidade?.motivo !== 'sessaoExpirada'
              ? 'Escolher outra empresa'
              : 'Voltar ao acesso'}
        </Button>
      </TelaAcesso>
    )
  if (conta.fase !== 'pronto') return <Acesso conta={conta} atualizar={setConta} />
  if (verificando)
    return (
      <TelaAcesso>
        <p role="status">Preparando os dados da empresa…</p>
        {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
      </TelaAcesso>
    )
  if (!empresa)
    return (
      <TelaAcesso>
        <SectionTitle title="Não foi possível abrir os dados da empresa" />
        <MensagemFlutuante>{erro || 'Tente novamente para continuar.'}</MensagemFlutuante>
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
        <div key={conta.empresa?.id ?? 'empresa'} className="h-full">
          {children}
        </div>
      )}
    </ContaContext.Provider>
  )
}
function TelaAcesso({ children }: { children: ReactNode }): ReactElement {
  return (
    <main className="flex min-h-full items-center justify-center overflow-y-auto bg-app px-6 py-10">
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
}): ReactElement {
  const [email, setEmail] = useState(conta.email),
    [senha, setSenha] = useState(''),
    [lembrar, setLembrar] = useState(conta.lembrar)
  const [modo, setModo] = useState<'entrar' | 'convite' | 'recuperacao'>('entrar'),
    [codigo, setCodigo] = useState(''),
    [enviado, setEnviado] = useState(false),
    [proximoEnvio, setProximoEnvio] = useState(0),
    [agora, setAgora] = useState(Date.now())
  const [confirmacao, setConfirmacao] = useState(''),
    [erro, setErro] = useState(''),
    [ocupado, setOcupado] = useState(false)
  const [empresaExcluir, setEmpresaExcluir] = useState<(typeof conta.empresas)[number] | null>(null)
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [erroExclusao, setErroExclusao] = useState('')
  const [diagnostico, setDiagnostico] = useState('')
  const segundosParaReenviar = Math.max(0, Math.ceil((proximoEnvio - agora) / 1000))
  useEffect(() => {
    if (!enviado || segundosParaReenviar === 0) return
    const timer = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [enviado, segundosParaReenviar])
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
    // O convite enviado pelo administrador já contém o primeiro código.
    setEnviado(m === 'convite')
    setProximoEnvio(0)
  }
  const solicitarCodigo = async () => {
    await api.conta.enviarCodigo(email.trim(), modo === 'convite' ? 'convite' : 'recuperacao')
    setEnviado(true)
    setCodigo('')
    setAgora(Date.now())
    setProximoEnvio(Date.now() + 60_000)
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
    if (ocupado)
      return (
        <TelaAcesso>
          <SectionTitle title="Abrindo sua empresa" description={`Conectado como ${conta.email}`} />
          <p role="status" className="text-sm text-slate-500">
            Conectando aos dados compartilhados. Isso pode levar alguns instantes…
          </p>
        </TelaAcesso>
      )
  if (conta.fase === 'escolherEmpresa')
    return (
      <TelaAcesso>
        <SectionTitle
          title="Escolha sua empresa"
          description={
            conta.operador
              ? `Conectado como ${conta.email} · Administrador do Sistema`
              : `Conectado como ${conta.email}`
          }
        />
        <p className="text-sm text-slate-500">
          Selecione a empresa para abrir os dados compartilhados. O cadastro inicial só aparece
          quando os dados básicos dessa empresa ainda não foram preenchidos.
        </p>
        {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
        {conta.empresas.length ? (
          conta.empresas.map((e) => (
            <div className="flex items-stretch gap-2" key={e.id}>
              <Button
                className="min-w-0 flex-1 justify-start whitespace-normal text-left"
                variant="outline"
                disabled={ocupado}
                onClick={() =>
                  void executar(async () => atualizar(await api.conta.selecionarEmpresa(e.id)))
                }
              >
                {e.nome}
              </Button>
              {conta.operador && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  aria-label={`Excluir empresa ${e.nome}`}
                  disabled={ocupado}
                  onClick={() => {
                    setEmpresaExcluir(e)
                    setNomeDigitado('')
                    setErroExclusao('')
                  }}
                >
                  Excluir
                </Button>
              )}
            </div>
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
        {erro && (
          <Button
            variant="ghost"
            onClick={() =>
              void api.aplicativo
                .exportarDiagnostico()
                .then((caminho) => setDiagnostico(caminho ? `Diagnóstico salvo em ${caminho}` : ''))
                .catch((e) => setErro(mensagemErro(e)))
            }
          >
            Exportar diagnóstico
          </Button>
        )}
        {diagnostico && <Mensagem tom="info">{diagnostico}</Mensagem>}
        <Modal
          open={!!empresaExcluir}
          title="Excluir empresa permanentemente"
          size="md"
          busy={ocupado}
          onClose={() => {
            if (!ocupado) setEmpresaExcluir(null)
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={ocupado}
                onClick={() => setEmpresaExcluir(null)}
              >
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={ocupado || !empresaExcluir || nomeDigitado.trim() !== empresaExcluir.nome}
                onClick={() => {
                  if (!empresaExcluir || ocupado) return
                  setOcupado(true)
                  setErroExclusao('')
                  void api.conta
                    .excluirEmpresa(empresaExcluir.id, nomeDigitado)
                    .then((atualizada) => {
                      atualizar(atualizada)
                      setEmpresaExcluir(null)
                      setNomeDigitado('')
                    })
                    .catch((e) => setErroExclusao(mensagemErro(e)))
                    .finally(() => setOcupado(false))
                }}
              >
                {ocupado ? 'Excluindo…' : 'Excluir permanentemente'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Mensagem tom="aviso">
              {empresaExcluir
                ? `Todos os documentos, cadastros, vínculos e dados sincronizados de “${empresaExcluir.nome}” serão removidos. As contas de autenticação das pessoas serão preservadas. Ao reconectar, os computadores encerrarão o acesso e removerão o perfil local, incluindo rascunhos e alterações pendentes.`
                : ''}
            </Mensagem>
            {erroExclusao && <MensagemFlutuante>{erroExclusao}</MensagemFlutuante>}
            <Field
              label={
                empresaExcluir ? `Digite exatamente: ${empresaExcluir.nome}` : 'Nome da empresa'
              }
            >
              <Input
                autoComplete="off"
                value={nomeDigitado}
                disabled={ocupado}
                onChange={(e) => setNomeDigitado(e.target.value)}
              />
            </Field>
          </div>
        </Modal>
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
      {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void executar(async () => {
            if (modo === 'entrar') atualizar(await api.conta.entrar(email.trim(), senha, lembrar))
            else if (!enviado) {
              await solicitarCodigo()
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
            disabled={ocupado || (enviado && proximoEnvio > 0)}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {modo === 'entrar' ? (
          <>
            <Field label="Senha">
              <PasswordInput
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
                {modo === 'convite'
                  ? 'Digite o código enviado com seu convite. Se precisar de outro, use Reenviar código.'
                  : 'Se este e-mail estiver habilitado, você receberá um código.'}{' '}
                Procure a mensagem de Gerador de Orçamentos na caixa de entrada e no spam ou lixo
                eletrônico. Use o código mais recente.
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
                <PasswordInput
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </Field>
              <Field label="Confirme a nova senha">
                <PasswordInput
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
          <>
            {enviado && (
              <>
                <Button
                  variant="outline"
                  disabled={ocupado || segundosParaReenviar > 0}
                  onClick={() => void executar(solicitarCodigo)}
                >
                  {segundosParaReenviar > 0
                    ? `Reenviar em ${segundosParaReenviar}s`
                    : 'Reenviar código'}
                </Button>
                {proximoEnvio > 0 && (
                  <Button
                    variant="ghost"
                    disabled={ocupado}
                    onClick={() => {
                      setEnviado(false)
                      setProximoEnvio(0)
                      setCodigo('')
                      setSenha('')
                      setConfirmacao('')
                      setErro('')
                    }}
                  >
                    Corrigir e-mail
                  </Button>
                )}
              </>
            )}
            <Button variant="ghost" disabled={ocupado} onClick={() => mudar('entrar')}>
              Voltar para entrar
            </Button>
          </>
        )}
      </div>
    </TelaAcesso>
  )
}
function AtivarEmpresa(): ReactElement {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [administrador, setAdministrador] = useState('')
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [atualizacaoPendente, setAtualizacaoPendente] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const atualizarLista = async (): Promise<void> => {
    try {
      await api.conta.atualizarEmpresas()
      setAtualizacaoPendente(false)
    } catch {
      setAtualizacaoPendente(true)
    }
  }
  return (
    <details className="rounded-lg border border-slate-200 p-4">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">
        Criar outra empresa
      </summary>
      <p className="mt-3 text-sm text-slate-500">
        Use esta opção para iniciar um espaço independente. Para acessar uma empresa já vinculada,
        selecione-a acima.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setOcupado(true)
          setErro('')
          setAviso('')
          void api.conta
            .criarEmpresa(nome.trim(), email.trim(), administrador.trim())
            .then(async () => {
              await atualizarLista()
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
        {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
        {aviso && <MensagemFlutuante tom="info">{aviso}</MensagemFlutuante>}
        {atualizacaoPendente && (
          <Mensagem tom="aviso">
            Empresa criada. Não foi possível atualizar a lista.{' '}
            <Button type="button" onClick={() => void atualizarLista()}>
              Atualizar lista
            </Button>
          </Mensagem>
        )}
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
}): ReactElement {
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
      {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
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
