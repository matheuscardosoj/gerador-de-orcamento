import { MensagemFlutuante } from './MensagemFlutuante'
import { mensagemErro } from '@shared/erros'
import { ListaOrdenavel } from '../ui/ordenavel'
import { useEffect, useRef, useState } from 'react'
import { X, ImagePlus } from 'lucide-react'
import { arquivosParaAnexos } from '../lib/imagens'
import {
  Button,
  Card,
  IconButton,
  Input,
  Modal,
  SectionTitle,
  Select,
  Textarea,
  cn
} from '../ui/primitives'
import type { AnexoOrcamento } from '@shared/types'
import type { ReactElement } from 'react'

/** Campos comuns aos anexos de orçamento e de relatório. */
export interface AnexoEditavel {
  id: string
  titulo: string
  descricao: string
  miniaturaDataUrl?: string
  imagemDataUrl?: string | null
}

export interface OpcaoVinculoAnexo {
  id: string
  texto: string
}

/** Editor único de fotos: os documentos definem somente os vínculos possíveis. */
export function AnexosCard<T extends AnexoEditavel>({
  anexos,
  onChange,
  titulo = 'Anexos (fotos)',
  descricao = 'Opcional. Quando houver anexos, eles começam em uma página nova do documento.',
  opcoesVinculo = [],
  valorVinculo,
  atualizarVinculo,
  prepararNovos,
  buscarImagem
}: {
  anexos: T[]
  onChange: (anexos: T[]) => void
  titulo?: string
  descricao?: string
  opcoesVinculo?: OpcaoVinculoAnexo[]
  valorVinculo?: (anexo: T) => string
  atualizarVinculo?: (anexo: T, id: string) => Partial<T>
  prepararNovos?: (anexos: AnexoOrcamento[]) => T[]
  buscarImagem: (id: string) => Promise<string | null>
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ampliado, setAmpliado] = useState<T | null>(null)
  const adicionar = async (arquivos: FileList | File[]): Promise<void> => {
    setProcessando(true)
    setErro(null)
    try {
      const novos = await arquivosParaAnexos(arquivos)
      if (!novos.length) setErro('Nenhuma imagem reconhecida nos arquivos selecionados.')
      else
        onChange([...anexos, ...(prepararNovos ? prepararNovos(novos) : (novos as unknown as T[]))])
    } catch (e) {
      setErro(mensagemErro(e))
    } finally {
      setProcessando(false)
    }
  }
  const atualizar = (id: string, patch: Partial<T>): void =>
    onChange(anexos.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const remover = (id: string): void => onChange(anexos.filter((a) => a.id !== id))
  return (
    <Card className="p-6">
      <SectionTitle
        title={titulo}
        description={descricao}
        action={
          <Button
            icon={ImagePlus}
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={processando}
          >
            {processando ? 'Processando…' : 'Fotos'}
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
          if (e.target.files?.length) void adicionar(e.target.files)
          e.target.value = ''
        }}
      />
      {erro && <MensagemFlutuante className="mb-4">{erro}</MensagemFlutuante>}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastando(true)
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault()
          setArrastando(false)
          if (e.dataTransfer.files?.length) void adicionar(e.dataTransfer.files)
        }}
        className={cn(
          'rounded-lg border border-dashed px-4 py-6 text-center text-sm transition-colors',
          arrastando
            ? 'border-brand-teal bg-brand-teal/5 text-brand-tealDark'
            : 'border-slate-300 bg-slate-50 text-slate-500'
        )}
      >
        {anexos.length
          ? 'Arraste mais imagens aqui para anexar.'
          : 'Nenhuma foto anexada. Arraste imagens aqui ou use “Fotos”.'}
      </div>
      {anexos.length > 0 && (
        <div className="mt-4 pilha-y-3">
          <ListaOrdenavel itens={anexos} onChange={onChange}>
            {anexos.map((a, idx) => (
              <div key={a.id} className="flex gap-4 rounded-lg border border-slate-200 p-3">
                <button
                  type="button"
                  onClick={() => setAmpliado(a)}
                  title="Ver em tamanho maior"
                  className="h-24 w-24 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100"
                >
                  {a.miniaturaDataUrl && (
                    <img
                      src={a.miniaturaDataUrl}
                      alt={a.titulo}
                      className="h-full w-full object-cover"
                    />
                  )}
                </button>
                <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2">
                  <Input
                    value={a.titulo}
                    onChange={(e) => atualizar(a.id, { titulo: e.target.value } as Partial<T>)}
                    placeholder="Título da foto"
                  />
                  {atualizarVinculo && (
                    <Select
                      value={valorVinculo?.(a) ?? ''}
                      onChange={(e) => atualizar(a.id, atualizarVinculo(a, e.target.value))}
                    >
                      <option value="">— sem vínculo —</option>
                      {opcoesVinculo.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.texto}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Textarea
                    value={a.descricao}
                    onChange={(e) => atualizar(a.id, { descricao: e.target.value } as Partial<T>)}
                    placeholder="Breve observação (opcional)"
                    className="min-h-[52px] md:col-span-2"
                  />
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <IconButton
                    icon={X}
                    label={`Remover foto ${a.titulo || idx + 1}`}
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => remover(a.id)}
                  />
                </div>
              </div>
            ))}
          </ListaOrdenavel>
        </div>
      )}
      {ampliado && (
        <ModalFoto anexo={ampliado} buscarImagem={buscarImagem} onClose={() => setAmpliado(null)} />
      )}
    </Card>
  )
}

function ModalFoto({
  anexo,
  buscarImagem,
  onClose
}: {
  anexo: AnexoEditavel
  buscarImagem: (id: string) => Promise<string | null>
  onClose: () => void
}): ReactElement {
  const [src, setSrc] = useState<string | undefined>(anexo.imagemDataUrl ?? anexo.miniaturaDataUrl)
  useEffect(() => {
    if (anexo.imagemDataUrl) return
    let vivo = true
    void buscarImagem(anexo.id).then((cheia) => {
      if (vivo && cheia) setSrc(cheia)
    })
    return () => {
      vivo = false
    }
  }, [anexo.id, anexo.imagemDataUrl, buscarImagem])
  return (
    <Modal
      open
      onClose={onClose}
      title={anexo.titulo || 'Foto'}
      size="xl"
      footer={<Button onClick={onClose}>Fechar</Button>}
    >
      <div className="flex flex-col items-center gap-3">
        {src && <img src={src} alt={anexo.titulo} className="max-h-[60vh] w-auto rounded-lg" />}
        {anexo.descricao && <p className="text-center text-sm text-slate-600">{anexo.descricao}</p>}
      </div>
    </Modal>
  )
}
