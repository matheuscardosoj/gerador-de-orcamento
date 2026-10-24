import { MensagemFlutuante } from './MensagemFlutuante'
import { useCallback, useEffect, useState } from 'react'
import { CopyPlus, RefreshCw, Trash2 } from 'lucide-react'
import type { RascunhoCompartilhado, TipoDocumento } from '@shared/evolucao'
import { mensagemErro } from '@shared/erros'
import { api } from '../lib/api'
import { useNav } from '../lib/nav'
import { Button, Card, ConfirmDialog } from '../ui/primitives'
import type { ReactElement } from 'react'

export function RascunhosHistorico({
  tipo,
  registros,
  onAbrir
}: {
  tipo: TipoDocumento
  registros: Array<{ id: string }>
  onAbrir?: (id: string) => void
}): ReactElement | null {
  const { navegar, executarComConfirmacao } = useNav()
  const [lista, setLista] = useState<RascunhoCompartilhado[]>([])
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [excluir, setExcluir] = useState<RascunhoCompartilhado | null>(null)
  const carregar = useCallback(async (): Promise<void> => {
    try {
      setLista(await api.rascunhos.list(tipo))
      setErro('')
    } catch (e) {
      setErro(mensagemErro(e))
    }
  }, [tipo])
  useEffect(() => {
    void carregar()
    // A navegação para o histórico monta uma lista nova após a exclusão remota.
  }, [carregar])
  const ids = new Set(registros.map((r) => r.id))
  const orfaos = lista.filter((r) => !ids.has(r.documentoId))
  if (!orfaos.length && !erro) return null
  const rotulo = { orcamento: 'orçamento', relatorio: 'relatório', recibo: 'recibo' }[tipo]
  return (
    <Card className="space-y-3 border-amber-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">Rascunhos locais recuperáveis</h2>
          <p className="text-sm text-slate-600">
            Alterações guardadas após a exclusão de um {rotulo}. Crie outro documento para
            aproveitá-las.
          </p>
        </div>
        <Button size="sm" variant="outline" icon={RefreshCw} onClick={() => void carregar()}>
          Atualizar
        </Button>
      </div>
      {erro && <MensagemFlutuante>{erro}</MensagemFlutuante>}
      {orfaos.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-surface p-3"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">
              {String(
                (r.documento as { destinatario?: string }).destinatario || `${rotulo} sem cliente`
              )}
            </p>
            <p className="text-xs text-slate-500">
              Guardado em {new Date(r.atualizadoEm).toLocaleString('pt-BR')}
            </p>
          </div>
          <Button
            size="sm"
            icon={CopyPlus}
            disabled={ocupado}
            onClick={() =>
              executarComConfirmacao(() => {
                setOcupado(true)
                void api.rascunhos
                  .copiar(r.id)
                  .then((novo) => {
                    if (onAbrir) onAbrir(novo.id)
                    else
                      navegar(
                        tipo === 'orcamento'
                          ? { nome: 'editor', orcamentoId: novo.id }
                          : { nome: 'editorRelatorio', relatorioId: novo.id }
                      )
                    void carregar()
                  })
                  .catch((e) => setErro(mensagemErro(e)))
                  .finally(() => setOcupado(false))
              })
            }
          >
            Criar outro {rotulo}
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={Trash2}
            disabled={ocupado}
            onClick={() => setExcluir(r)}
          >
            Excluir rascunho
          </Button>
        </div>
      ))}
      <ConfirmDialog
        open={!!excluir}
        title="Excluir rascunho local?"
        description="Este rascunho será removido somente deste computador. O documento já excluído e os dados da nuvem não serão alterados."
        confirmLabel="Excluir rascunho"
        busy={ocupado}
        onCancel={() => !ocupado && setExcluir(null)}
        onConfirm={async () => {
          if (!excluir) return
          setOcupado(true)
          setErro('')
          try {
            await api.rascunhos.remove(excluir.id)
            setExcluir(null)
            await carregar()
          } catch (e) {
            setErro(mensagemErro(e))
          } finally {
            setOcupado(false)
          }
        }}
      />
    </Card>
  )
}
