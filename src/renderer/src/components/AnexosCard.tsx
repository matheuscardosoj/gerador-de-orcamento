import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { arquivosParaAnexos } from '../lib/imagens'
import { Button, Card, Icone, Input, Modal, SectionTitle, Select, Textarea, cn } from '../ui/primitives'
import type { AnexoOrcamento, ItemServico } from '@shared/types'

/**
 * Fotos do orçamento. Cada anexo pode ser vinculado a um serviço — nesse caso o
 * documento imprime "Referente ao Item N — …" abaixo do título da foto.
 */
export function AnexosCard({
  anexos,
  itensServico,
  onChange
}: {
  anexos: AnexoOrcamento[]
  itensServico: ItemServico[]
  onChange: (anexos: AnexoOrcamento[]) => void
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ampliado, setAmpliado] = useState<AnexoOrcamento | null>(null)

  const adicionar = async (arquivos: FileList | File[]): Promise<void> => {
    setProcessando(true)
    setErro(null)
    try {
      const novos = await arquivosParaAnexos(arquivos)
      if (novos.length === 0) setErro('Nenhuma imagem reconhecida nos arquivos selecionados.')
      else onChange([...anexos, ...novos])
    } catch (e) {
      setErro(String(e).replace(/^Error:\s*/, ''))
    } finally {
      setProcessando(false)
    }
  }

  const atualizar = (id: string, patch: Partial<AnexoOrcamento>): void =>
    onChange(anexos.map((a) => (a.id === id ? { ...a, ...patch } : a)))

  const remover = (id: string): void => onChange(anexos.filter((a) => a.id !== id))

  const mover = (indice: number, delta: number): void => {
    const destino = indice + delta
    if (destino < 0 || destino >= anexos.length) return
    const copia = [...anexos]
    ;[copia[indice], copia[destino]] = [copia[destino], copia[indice]]
    onChange(copia)
  }

  return (
    <Card className="p-6">
      <SectionTitle
        title="Anexos (fotos)"
        description="Opcional. Quando houver anexos, eles começam em uma página nova do documento."
        action={
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={processando}>
            {processando ? 'Processando…' : '+ Fotos'}
          </Button>
        }
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) adicionar(e.target.files)
          e.target.value = ''
        }}
      />

      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          if (e.dataTransfer.files?.length) adicionar(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors',
          arrastando ? 'border-brand-teal bg-brand-teal/5 text-brand-tealDark' : 'border-slate-300 bg-slate-50 text-slate-500'
        )}
      >
        {anexos.length === 0
          ? 'Nenhuma foto anexada. Arraste imagens aqui ou use "+ Fotos".'
          : 'Arraste mais imagens aqui para anexar.'}
      </div>

      {anexos.length > 0 && (
        <div className="mt-4 space-y-3">
          {anexos.map((a, idx) => (
            <div key={a.id} className="flex gap-4 rounded-lg border border-slate-200 p-3">
              <button
                type="button"
                onClick={() => setAmpliado(a)}
                title="Ver em tamanho maior"
                className="h-24 w-24 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
              >
                {a.miniaturaDataUrl && (
                  <img src={a.miniaturaDataUrl} alt={a.titulo} className="h-full w-full object-cover" />
                )}
              </button>

              <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2">
                <Input
                  value={a.titulo}
                  onChange={(e) => atualizar(a.id, { titulo: e.target.value })}
                  placeholder="Título da foto"
                />
                <Select
                  value={a.itemServicoId ?? ''}
                  onChange={(e) => atualizar(a.id, { itemServicoId: e.target.value || null })}
                >
                  <option value="">— sem vínculo com serviço —</option>
                  {itensServico.map((i, n) => (
                    <option key={i.id} value={i.id}>
                      {`Item ${n + 1} — ${i.descricao.slice(0, 60)}`}
                    </option>
                  ))}
                </Select>
                <Textarea
                  value={a.descricao}
                  onChange={(e) => atualizar(a.id, { descricao: e.target.value })}
                  placeholder="Breve descrição (opcional)"
                  className="min-h-[52px] md:col-span-2"
                />
              </div>

              <div className="flex shrink-0 flex-col items-center gap-1">
                <Button variant="ghost" size="sm" className="text-slate-400" onClick={() => mover(idx, -1)} disabled={idx === 0}>
                  <Icone>↑</Icone>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-slate-400"
                  onClick={() => mover(idx, 1)}
                  disabled={idx === anexos.length - 1}
                >
                  <Icone>↓</Icone>
                </Button>
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-600" onClick={() => remover(a.id)}>
                  <Icone>✕</Icone>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {ampliado && <ModalFoto anexo={ampliado} onClose={() => setAmpliado(null)} />}
    </Card>
  )
}

/**
 * Visualização ampliada. A imagem cheia mora no banco (BLOB) e é buscada sob
 * demanda; anexos recém-adicionados ainda a têm em memória.
 */
function ModalFoto({ anexo, onClose }: { anexo: AnexoOrcamento; onClose: () => void }): JSX.Element {
  const [src, setSrc] = useState<string | undefined>(anexo.imagemDataUrl ?? anexo.miniaturaDataUrl)

  useEffect(() => {
    if (anexo.imagemDataUrl) return
    let vivo = true
    void api.anexos.imagem(anexo.id).then((cheia) => {
      if (vivo && cheia) setSrc(cheia)
    })
    return () => {
      vivo = false
    }
  }, [anexo.id, anexo.imagemDataUrl])

  return (
    <Modal open onClose={onClose} title={anexo.titulo || 'Foto'} size="xl" footer={<Button onClick={onClose}>Fechar</Button>}>
      <div className="flex flex-col items-center gap-3">
        {src && <img src={src} alt={anexo.titulo} className="max-h-[60vh] w-auto rounded-lg" />}
        {anexo.descricao && <p className="text-center text-sm text-slate-600">{anexo.descricao}</p>}
      </div>
    </Modal>
  )
}
