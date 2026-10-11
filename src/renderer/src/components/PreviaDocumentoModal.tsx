import { paginarDocumento } from '@shared/documento/paginar'
import { Modal } from '../ui/primitives'

/** Todas as prévias usam a mesma moldura, rolagem e controles do aplicativo. */
export function PreviaDocumentoModal({
  titulo,
  tituloFrame,
  html,
  onClose
}: {
  titulo: string
  tituloFrame: string
  html: string
  onClose: () => void
}): JSX.Element {
  return (
    <Modal open title={titulo} size="2xl" onClose={onClose}>
      <iframe
        title={tituloFrame}
        srcDoc={html}
        onLoad={(e) => {
          const doc = e.currentTarget.contentDocument
          if (doc) void doc.fonts.ready.then(() => paginarDocumento(doc))
        }}
        className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white"
      />
    </Modal>
  )
}
