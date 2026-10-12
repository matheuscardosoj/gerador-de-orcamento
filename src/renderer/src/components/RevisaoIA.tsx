import { mensagemErro } from '@shared/erros'
import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import { Button, ConfirmDialog, Field, Mensagem, Modal, Textarea } from '../ui/primitives'
import type { RevisaoTextoEntrada } from '@shared/revisao-ia'
import type { SugestaoObservacaoEntrada } from '@shared/api'

export function RevisaoIA({
  texto,
  onAplicar,
  campo,
  anotacao,
  disabled = false
}: {
  texto: string
  onAplicar: (texto: string) => void
  campo: RevisaoTextoEntrada['campo']
  anotacao?: SugestaoObservacaoEntrada
  disabled?: boolean
}): JSX.Element {
  const [aberto, setAberto] = useState(false),
    [original, setOriginal] = useState(''),
    [sugestao, setSugestao] = useState('')
  const [gerando, setGerando] = useState(false),
    [erro, setErro] = useState(''),
    [confirmar, setConfirmar] = useState(false)
  const requisicao = useRef('')
  useEffect(
    () => () => {
      if (requisicao.current) void api.ia.cancelarRevisao(requisicao.current)
    },
    []
  )
  const cancelar = (): void => {
    const id = requisicao.current
    requisicao.current = ''
    if (id) void api.ia.cancelarRevisao(id)
    setGerando(false)
    setAberto(false)
    setConfirmar(false)
  }
  const gerar = async (alvo: string): Promise<void> => {
    const id = crypto.randomUUID()
    requisicao.current = id
    setGerando(true)
    setErro('')
    setSugestao('')
    try {
      const s = await api.ia.revisarTexto({ id, campo, texto: alvo, anotacao })
      if (requisicao.current === id) setSugestao(s)
    } catch (e) {
      if (requisicao.current === id) setErro(mensagemErro(e))
    } finally {
      if (requisicao.current === id) {
        setGerando(false)
        requisicao.current = ''
      }
    }
  }
  const aplicar = (): void => {
    onAplicar(sugestao)
    cancelar()
  }
  return (
    <>
      <Button
        icon={Sparkles}
        type="button"
        size="sm"
        variant="outline"
        className="mt-2"
        disabled={disabled || (!anotacao && !texto.trim())}
        onClick={() => {
          setOriginal(texto)
          setAberto(true)
          void gerar(texto)
        }}
      >
        {anotacao ? 'Sugerir com IA' : 'Revisar com IA'}
      </Button>
      <Modal
        open={aberto}
        onClose={cancelar}
        title={anotacao ? 'Sugestão de anotação interna' : 'Revisão do texto com IA'}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={cancelar}>
              Cancelar
            </Button>
            <Button variant="outline" disabled={gerando} onClick={() => void gerar(original)}>
              Tentar novamente
            </Button>
            <Button
              disabled={gerando || !sugestao}
              onClick={() => (texto !== original ? setConfirmar(true) : aplicar())}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          A sugestão só será aplicada depois da sua revisão. Confira os fatos e as condições do
          serviço.
        </p>
        {gerando && (
          <p role="status" className="mb-4 text-sm text-slate-600">
            Preparando a IA local e revisando o texto… Você pode cancelar a qualquer momento.
          </p>
        )}
        {erro && <Mensagem className="mb-4">{erro}</Mensagem>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Texto original">
            <Textarea value={original} readOnly className="min-h-[220px]" />
          </Field>
          <Field label="Sugestão da IA">
            <Textarea value={sugestao} readOnly className="min-h-[220px]" />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmar}
        title="O texto foi alterado"
        description="O campo mudou depois que esta revisão começou. Aplicar a sugestão substituirá o texto atual."
        confirmLabel="Substituir pelo texto revisado"
        cancelLabel="Manter texto atual"
        onCancel={() => setConfirmar(false)}
        onConfirm={aplicar}
      />
    </>
  )
}
