import { MensagemFlutuante } from '../components/MensagemFlutuante'
import { useEffect, useState } from 'react'
import { Cloud, RefreshCw, LogOut, CloudDownload } from 'lucide-react'
import { api } from '../lib/api'
import { useNav } from '../lib/nav'
import { useConta } from '../components/ContaGate'
import type { ConfigNuvem, StatusNuvem } from '@shared/types'
import { mensagemErro } from '@shared/erros'
import { resumirSincronizacao } from '@shared/status-sincronizacao'
import {
  Button,
  Card,
  Field,
  Input,
  PasswordInput,
  Select,
  ConfirmDialog,
  SectionTitle
} from '../ui/primitives'
import type { ReactElement } from 'react'
export function NuvemSection(): ReactElement {
  const { navegar } = useNav()
  const { conta } = useConta()
  const [c, setC] = useState<ConfigNuvem>({ url: '', chavePublica: '', email: '' })
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'publicar' | 'baixar'>('publicar')
  const [s, setS] = useState<StatusNuvem | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [conciliar, setConciliar] = useState<string | null>(null)
  const [instalacaoCopiada, setInstalacaoCopiada] = useState(false)
  const [atualizarBase, setAtualizarBase] = useState(false)
  const [restaurarBase, setRestaurarBase] = useState(false)
  const [backupRestauracao, setBackupRestauracao] = useState('')
  useEffect(() => {
    void api.nuvem.config().then(setC)
    void api.nuvem.status().then(setS)
    return api.eventos.observarDados((evento) => {
      if (evento.status)
        void api.nuvem
          .status()
          .then(setS)
          .catch(() => undefined)
    })
  }, [])
  const executar = async (acao: () => Promise<StatusNuvem>): Promise<void> => {
    setOcupado(true)
    setErro('')
    try {
      setS(await acao())
      setSenha('')
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setOcupado(false)
    }
  }
  const resumo = resumirSincronizacao(s)
  const mb = (s?.bytesBanco ?? 0) / 1024 / 1024
  return (
    <Card className="p-6">
      <SectionTitle
        title="Nuvem da empresa"
        description="Dados compartilhados com os usuários e computadores da empresa"
      />
      {conta.central ? (
        <p className="mb-4 text-sm text-slate-600">
          Seus dados salvos são compartilhados automaticamente com os membros da empresa. Gerencie
          seu acesso em Minha conta e convide pessoas em Usuários.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-slate-600">
            Use o mesmo projeto Supabase nos computadores desta empresa. Cada pessoa pode usar seu
            próprio login, vinculado em Usuários. Plano gratuito: 500 MB de banco; pouca atividade
            pode pausar o projeto.
          </p>
          <details className="mb-4 rounded-lg border border-slate-200 p-4 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              Como configurar minha empresa na nuvem
            </summary>
            <ol className="mt-3 list-decimal space-y-3 pl-5">
              <li>
                Se você já usa uma versão antiga, primeiro exporte um backup em Dados e backup,
                feche o aplicativo e instale a atualização com o mesmo usuário do Windows. Abra a
                versão atualizada e confira seus clientes, documentos e fotos: a migração local é
                automática e cria um backup verificado. Exporte uma nova cópia antes de publicar.
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
                , crie uma organização no plano Free e um projeto exclusivo para sua empresa.
                Escolha a região mais próxima e guarde a senha do banco.
              </li>
              <li>
                Abra o SQL Editor do projeto, crie uma consulta, cole a configuração copiada pelo
                botão abaixo e execute o script inteiro com Run. Se já existe uma nuvem conectada,
                sincronize e feche todos os aplicativos antes da atualização. A versão 1.5 exige o
                novo protocolo: atualize todos os computadores. Não é necessário criar um Storage.
              </li>
              <li>
                Em Authentication → Users, crie e confirme a primeira conta com e-mail e senha. A
                conta atual continua vinculada após a migração. Para adicionar outra pessoa, crie
                sua conta no painel e vincule o e-mail em Configurações → Usuários. A senha do banco
                é diferente.
              </li>
              <li>
                Copie a URL do projeto e a chave pública publishable no painel de conexão / API
                Keys. Preencha esses dados e o login abaixo.
              </li>
              <li>
                No computador que possui seus dados já migrados, escolha “Publicar os dados locais
                em uma nuvem vazia”. Nos demais, escolha “Baixar a base da empresa”. Clique em
                Conectar e aguarde a sincronização.
              </li>
              <li>
                Faça a primeira sincronização online. No editor, use os controles de edição para
                solicitar, liberar ou transferir. Antes de se desconectar, use “Preparar offline”
                para baixar as dependências e reservar a autorização de emissão. Os números oficiais
                já utilizados são preservados; documentos novos recebem o número definitivo ao
                sincronizar.
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
                  .catch((e) => setErro(mensagemErro(e)))
              }}
            >
              {instalacaoCopiada
                ? 'Configuração copiada — cole no SQL Editor'
                : 'Copiar configuração do banco'}
            </Button>
            <p className="mt-3 text-xs text-slate-500">
              A configuração fornecida não contém senhas. As permissões restringem os dados aos
              membros ativos da empresa, e os avisos de atualização usam um canal privado.
            </p>
          </details>
        </>
      )}
      <section
        aria-label="Estado da sincronização"
        className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"
      >
        <p className="font-semibold">{resumo.titulo}</p>
        <p>{resumo.descricao}</p>
      </section>
      {erro && <MensagemFlutuante className="mb-4">{erro}</MensagemFlutuante>}
      {s?.erro && mensagemErro(s.erro) !== erro && (
        <MensagemFlutuante className="mb-4">{s.erro}</MensagemFlutuante>
      )}
      {s?.atualizacaoPendente && (
        <section
          className="mb-6 rounded-lg border border-slate-200 p-4"
          aria-label="Atualização da base local"
        >
          <SectionTitle
            title="Atualizar a cópia deste computador"
            description="A nuvem já está atualizada. Confira as pendências da versão anterior antes de continuar."
          />
          <p className="mb-3 text-sm text-slate-600">
            {s.atualizacaoPendente.total} registros aguardam conferência. As alterações antigas não
            serão enviadas automaticamente.
          </p>
          <ul className="mb-4 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
            {s.atualizacaoPendente.registros.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <span className="text-slate-700">{r.rotulo}</span>
                <span className="text-slate-500">
                  {r.situacao === 'equivalente'
                    ? 'Já está na nuvem'
                    : r.situacao === 'ausente'
                      ? 'Somente neste computador'
                      : 'Conteúdo diferente'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mb-4 text-sm text-slate-600">
            Para atualizar os cadastros, as operações antigas serão guardadas separadamente neste
            computador e em um backup verificado. Documentos e pagamentos com diferenças precisam de
            comparação; não serão descartados nem reaplicados por essa ação.
          </p>
          <Button
            icon={RefreshCw}
            variant="outline"
            disabled={ocupado || !s.autenticada}
            onClick={() => setAtualizarBase(true)}
          >
            Preservar pendências e atualizar base
          </Button>
        </section>
      )}
      {!conta.central && (
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
          <Field label="E-mail do usuário">
            <Input
              type="email"
              value={c.email}
              onChange={(e) => setC({ ...c, email: e.target.value })}
            />
          </Field>
          <Field label="Senha">
            <PasswordInput
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
      )}
      {conta.central && (
        <Button
          icon={RefreshCw}
          disabled={ocupado || !s?.autenticada}
          variant="outline"
          onClick={() => void executar(() => api.nuvem.sincronizar())}
        >
          Sincronizar agora
        </Button>
      )}
      {s && (
        <div className="mt-6 space-y-3 border-t border-slate-200 pt-6 text-sm text-slate-600">
          <p>
            {s.autenticada ? 'Conta conectada' : 'Conta desconectada'} · {s.pendentes} alterações
            aguardando envio
          </p>
          {!!s.pendenciasPreservadas && (
            <details className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer font-medium text-slate-700">
                Operações antigas preservadas ({s.pendenciasPreservadas})
              </summary>
              <div className="mt-3 space-y-3">
                <p>
                  Estes registros foram guardados durante uma atualização. Eles não fazem parte das
                  alterações aguardando envio e não impedem a sincronização.
                </p>
                <p>
                  O conteúdo continua preservado neste computador para consulta e não será reenviado
                  automaticamente.
                </p>
                {s.backupAtualizacao && (
                  <p className="break-words text-xs text-slate-500">
                    Cópia de segurança verificada: {s.backupAtualizacao}
                  </p>
                )}
              </div>
            </details>
          )}
          {(s.falhas ?? []).map((x) => (
            <div
              key={x.id}
              className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              <p>{x.detalhe}</p>
              <p className="break-all text-xs">
                Operação: {x.id} · Entidade: {x.entidade}
              </p>
              {(x.codigo || x.causa || x.detalhes || x.dica) && (
                <details className="rounded border border-amber-200 p-2 text-xs">
                  <summary className="cursor-pointer font-medium">
                    Detalhes técnicos da falha
                  </summary>
                  {x.codigo && <p>Código: {x.codigo}</p>}
                  {x.causa && <p>Causa: {x.causa}</p>}
                  {x.detalhes && <p>Detalhe: {x.detalhes}</p>}
                  {x.dica && <p>Orientação: {x.dica}</p>}
                </details>
              )}
              <p>
                A operação continua guardada neste computador. Outras alterações podem ser recebidas
                e enviadas.
              </p>
              <Button
                variant="outline"
                onClick={() => void executar(() => api.nuvem.tentarNovamente(x.id))}
              >
                Tentar enviar novamente
              </Button>
            </div>
          ))}
          {!s.pendenciasPreservadas && s.backupAtualizacao && (
            <p className="break-words">Backup verificado da atualização: {s.backupAtualizacao}</p>
          )}
          {s.autenticada && (
            <p>
              Tempo real:{' '}
              {(s.protocolo ?? 1) < 2
                ? 'atualize a configuração SQL para habilitar a colaboração'
                : s.tempoReal === 'conectado'
                  ? 'conectado — alterações confirmadas chegam automaticamente'
                  : s.tempoReal === 'conectando'
                    ? 'conectando…'
                    : s.tempoReal === 'indisponivel'
                      ? 'atualizações automáticas indisponíveis — novas tentativas serão feitas'
                      : 'desconectado'}
            </p>
          )}
          {s.erroTempoReal && <p className="text-amber-800">{mensagemErro(s.erroTempoReal)}</p>}
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
            {(s.protocolo ?? 1) >= 3
              ? 'Documentos novos offline ficam aguardando numeração. Sincronize para emitir o PDF ou Word oficial.'
              : `Atualize a configuração da nuvem para substituir as reservas antecipadas.`}
          </p>
          <p className="text-xs text-slate-500">Identificação deste computador: {s.computador}</p>
          {s.conflitos.map((x) => (
            <div
              key={x.id}
              className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              <p>{x.detalhe}</p>
              {(s.protocolo ?? 1) >= 2 &&
              ['orcamento', 'relatorio', 'recibo'].includes(x.entidade.split(':')[0]) ? (
                <>
                  <p>
                    Suas alterações estão preservadas em um rascunho local. Abra o documento para
                    comparar os campos e manter a alternativa desejada. Recebimentos e estornos
                    continuam protegidos.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const [tipo, ...partes] = x.entidade.split(':')
                      const id = partes.join(':')
                      navegar(
                        tipo === 'orcamento'
                          ? { nome: 'editor', orcamentoId: id }
                          : tipo === 'relatorio'
                            ? { nome: 'editorRelatorio', relatorioId: id }
                            : { nome: 'recibos', reciboId: id }
                      )
                    }}
                  >
                    Abrir documento e comparar
                  </Button>
                </>
              ) : (
                <>
                  <p>
                    Para preservar a edição local, crie uma cópia no editor antes de adotar a versão
                    remota. Recibos e relatório vinculados serão conciliados juntos. Uma cópia de
                    segurança com todas as edições locais será salva antes da conciliação.
                  </p>
                  <Button variant="outline" disabled={ocupado} onClick={() => setConciliar(x.id)}>
                    Adotar versão remota e guardar backup local
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      {conta.central && s?.autenticada && (
        <div className="mt-6 space-y-3 border-t border-slate-200 pt-6">
          <SectionTitle
            title="Recuperar os dados deste computador"
            description="Substitui a base local deste perfil pelos dados confirmados da empresa na nuvem."
          />
          <p className="text-sm text-slate-600">
            Você escolherá onde guardar uma cópia verificada da base atual. Alterações ainda não
            enviadas e rascunhos ficarão nessa cópia para conferência; eles não serão reenviados
            automaticamente.
          </p>
          {backupRestauracao && (
            <MensagemFlutuante tom="info" temporaria>
              Base recuperada. Cópia anterior guardada em: {backupRestauracao}
            </MensagemFlutuante>
          )}
          <Button
            icon={CloudDownload}
            variant="outline"
            disabled={ocupado}
            onClick={() => setRestaurarBase(true)}
          >
            Restaurar este computador pela nuvem
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={restaurarBase}
        title="Restaurar dados deste computador"
        confirmLabel="Escolher local do backup"
        description={`A base local deste perfil será substituída somente após baixar a empresa inteira e verificar uma cópia salva no local que você escolher. ${s?.pendentes ?? 0} operação(ões) pendente(s) e os rascunhos locais permanecerão no backup, sem envio automático. Outros computadores e a nuvem não serão apagados.`}
        onCancel={() => setRestaurarBase(false)}
        onConfirm={() => {
          setRestaurarBase(false)
          setOcupado(true)
          setErro('')
          void api.nuvem
            .restaurarBase()
            .then((resultado) => {
              if (resultado) {
                setS(resultado.status)
                setBackupRestauracao(resultado.backup)
              }
            })
            .catch((e) => setErro(mensagemErro(e)))
            .finally(() => setOcupado(false))
        }}
      />
      <ConfirmDialog
        open={atualizarBase}
        title="Preservar pendências e atualizar base"
        confirmLabel="Guardar e atualizar"
        danger={false}
        description="As operações antigas continuarão guardadas neste computador e em um backup verificado, sem envio automático. Os cadastros da nuvem serão recuperados com a numeração atualizada. Documentos e pagamentos com diferenças permanecerão protegidos para revisão."
        onCancel={() => setAtualizarBase(false)}
        onConfirm={() => {
          setAtualizarBase(false)
          void executar(() => api.nuvem.finalizarAtualizacao(s!.atualizacaoPendente!.revisao))
        }}
      />
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
            : 'Os dados desta empresa serão compartilhados com os usuários autorizados da equipe.'
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
