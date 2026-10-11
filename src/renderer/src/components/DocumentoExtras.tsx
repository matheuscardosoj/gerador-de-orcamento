import { useEffect, useState } from 'react'
import type { Cliente, DocumentoMetadados, TipoDocumento, VersaoDocumento } from '@shared/types'
import { api } from '../lib/api'
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Checkbox,
  SectionTitle,
  Field,
  Mensagem
} from '../ui/primitives'
import { useNav } from '../lib/nav'
import { paginarDocumento } from '@shared/documento/paginar'

export function DadosClienteDocumento({
  documento,
  clientes,
  onChange
}: {
  documento: DocumentoMetadados & { clienteId?: string | null }
  clientes: Cliente[]
  onChange: (patch: DocumentoMetadados) => void
}): JSX.Element {
  const c = documento.clienteSnapshot ?? clientes.find((c) => c.id === documento.clienteId)
  const campos = documento.camposCliente ?? ['documento']
  return (
    <Card className="p-6">
      <SectionTitle
        title="Dados do cliente no documento"
        description={`${c?.nome ?? 'Selecione um cliente cadastrado.'} · As alterações no cadastro não modificam versões salvas.`}
      />
      <div className="flex flex-wrap gap-4">
        {(['documento', 'endereco', 'telefone', 'email', 'pessoaContato'] as const).map((f) => (
          <Checkbox
            key={f}
            checked={campos.includes(f)}
            onChange={(checked) =>
              onChange({
                camposCliente: checked ? [...campos, f] : campos.filter((x) => x !== f),
                clienteSnapshot: c ?? null
              })
            }
            label={
              {
                documento: 'CPF/CNPJ',
                endereco: 'Endereço',
                telefone: 'Telefone',
                email: 'E-mail',
                pessoaContato: 'Pessoa de contato'
              }[f]
            }
          />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {documento.clienteId && (
          <Button
            variant="outline"
            onClick={() =>
              onChange({
                clienteSnapshot: clientes.find((c) => c.id === documento.clienteId) ?? null
              })
            }
          >
            Atualizar a partir do cadastro
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => {
            void api.empresa.get().then((empresaSnapshot) => onChange({ empresaSnapshot }))
          }}
        >
          Atualizar dados da empresa
        </Button>
      </div>
    </Card>
  )
}
export function LinhaTempo({
  tipo,
  id,
  onRestaurado
}: {
  tipo: TipoDocumento
  id: string
  onRestaurado: () => void
}): JSX.Element {
  const [aberto, setAberto] = useState(false)
  const [versoes, setVersoes] = useState<VersaoDocumento[]>([])
  const [selecionada, setSelecionada] = useState<VersaoDocumento | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [html, setHtml] = useState('')
  const [destino, setDestino] = useState('')
  const [pcs, setPcs] = useState<Array<{ id: string; nome: string }>>([])
  const { navegar } = useNav()
  const executar = async (acao: () => Promise<void>): Promise<void> => {
    if (ocupado) return
    setOcupado(true)
    setErro('')
    try {
      await acao()
    } catch (e) {
      setErro(String(e))
    } finally {
      setOcupado(false)
    }
  }
  useEffect(() => {
    if (!aberto) return
    void api.versoes
      .list(tipo, id)
      .then((v) => {
        setVersoes(v)
        setSelecionada(v[0] ?? null)
      })
      .catch((e) => setErro(String(e)))
    void api.nuvem
      .dispositivos()
      .then(setPcs)
      .catch(() => undefined)
  }, [aberto, tipo, id])
  useEffect(() => {
    if (!selecionada) return
    void api.versoes
      .html(selecionada.id)
      .then(setHtml)
      .catch((e) => setErro(String(e)))
  }, [selecionada])
  const anterior = versoes.find((v) => v.id === selecionada?.anteriorId)
  const resumo = (v: VersaoDocumento): string => {
    const d = v.documento
    return [
      d.destinatario,
      'titulo' in d ? d.titulo : d.descricao,
      d.data,
      d.status,
      'valorTotal' in d
        ? `Total: ${d.valorTotal}`
        : 'valor' in d
          ? `Valor: ${d.valor}`
          : `Saldo: ${d.totais.saldo}`,
      'itensServico' in d
        ? d.itensServico
            .map((i) => `${i.descricao}: ${i.quantidade} ${i.unidade} / ${i.valorTotal}`)
            .join('\n')
        : '',
      'anexos' in d ? `Anexos: ${d.anexos.map((a) => a.titulo).join(', ')}` : ''
    ]
      .filter(Boolean)
      .join('\n')
  }
  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        Versões e transferência
      </Button>
      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Linha do tempo do documento"
        size="xl"
        footer={
          <Button variant="secondary" onClick={() => setAberto(false)}>
            Fechar
          </Button>
        }
      >
        <div className="space-y-4">
          {erro && <Mensagem>{erro}</Mensagem>}
          <Field label="Versão do documento">
            <Select
              aria-label="Escolher versão"
              value={selecionada?.id ?? ''}
              onChange={(e) => setSelecionada(versoes.find((v) => v.id === e.target.value) ?? null)}
            >
              {versoes.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.numero} · {new Date(v.criadoEm).toLocaleString('pt-BR')} · {v.computador}
                  {v.descricao ? ` · ${v.descricao}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          {selecionada && (
            <>
              <Field label="Descrição desta versão" hint="Opcional">
                <Input
                  placeholder="Nome deste marco (opcional)"
                  defaultValue={selecionada.descricao}
                  key={selecionada.id}
                  onBlur={(e) =>
                    void executar(async () => {
                      await api.versoes.nomear(selecionada.id, e.target.value)
                    })
                  }
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={ocupado}
                  onClick={() =>
                    void executar(async () => {
                      await api.versoes.restaurar(selecionada.id, false)
                      setAberto(false)
                      onRestaurado()
                    })
                  }
                >
                  Retomar esta versão
                </Button>
                <Button
                  disabled={ocupado}
                  variant="outline"
                  onClick={() =>
                    void executar(async () => {
                      const d = await api.versoes.restaurar(selecionada.id, true)
                      setAberto(false)
                      navegar(
                        tipo === 'orcamento'
                          ? { nome: 'editor', orcamentoId: d.id }
                          : tipo === 'relatorio'
                            ? { nome: 'editorRelatorio', relatorioId: d.id }
                            : { nome: 'recibos', reciboId: d.id }
                      )
                    })
                  }
                >
                  Criar novo a partir desta
                </Button>
                {(['pdf', 'docx'] as const).map((f) => (
                  <Button
                    key={f}
                    disabled={ocupado}
                    variant="outline"
                    onClick={() =>
                      void executar(async () => {
                        await api.versoes.exportar(selecionada.id, f)
                      })
                    }
                  >
                    {f.toUpperCase()} desta versão
                  </Button>
                ))}
              </div>
              {anterior && (
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-700">Versão anterior</h4>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {resumo(anterior)}
                    </p>
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-slate-700">
                      Versão selecionada
                    </h4>
                    <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {resumo(selecionada)}
                    </p>
                  </div>
                </div>
              )}
              <iframe
                title="Prévia da versão"
                srcDoc={html}
                onLoad={(e) => {
                  const d = e.currentTarget.contentDocument
                  if (d) paginarDocumento(d)
                }}
                className="h-[430px] w-full rounded-lg border border-slate-200 bg-white"
              />
            </>
          )}
          <div className="border-t border-slate-200 pt-6">
            <SectionTitle
              title="Transferência de responsabilidade"
              description="Todas as pendências precisam estar sincronizadas para transferir a emissão a outro computador."
            />
            <Field label="Computador de destino">
              <Select
                aria-label="Computador de destino"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
              >
                <option value="">Escolha o computador</option>
                {pcs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              className="mt-6"
              disabled={!destino || ocupado}
              onClick={() =>
                void executar(async () => {
                  await api.nuvem.transferir(tipo, id, destino)
                  setAberto(false)
                  onRestaurado()
                })
              }
            >
              Transferir
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
