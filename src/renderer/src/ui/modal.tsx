import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from './cn'
import { AppIcon, Button } from './botoes'
import type { ReactElement } from 'react'

// ------------------------------------------------------------------- Modal
const pilhaModais: symbol[] = []
let ariaRaizAntes: string | null = null
let raizEraInerte = false
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'lg',
  busy = false
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl' | '2xl' | '3xl'
  busy?: boolean
}): ReactElement | null {
  const tituloId = useId()
  const caixaRef = useRef<HTMLDivElement>(null)
  const focoAnterior = useRef<HTMLElement | null>(null)
  const modalId = useRef(Symbol('modal'))
  const fecharAtual = useRef(onClose)
  const ocupadoAtual = useRef(busy)
  useEffect(() => {
    fecharAtual.current = onClose
    ocupadoAtual.current = busy
  }, [onClose, busy])
  useEffect(() => {
    if (!open) return
    const id = modalId.current
    const raiz = document.getElementById('root')
    if (!pilhaModais.length) {
      ariaRaizAntes = raiz?.getAttribute('aria-hidden') ?? null
      raizEraInerte = raiz?.hasAttribute('inert') ?? false
    }
    pilhaModais.push(id)
    focoAnterior.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const timer = window.setTimeout(
      () =>
        caixaRef.current
          ?.querySelector<HTMLElement>(
            'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
          )
          ?.focus(),
      0
    )
    raiz?.setAttribute('inert', '')
    raiz?.setAttribute('aria-hidden', 'true')
    const teclado = (evento: KeyboardEvent): void => {
      if (pilhaModais.at(-1) !== id) return
      if (
        evento.key === 'Escape' &&
        !ocupadoAtual.current &&
        !document.querySelector('[data-arrastando="true"]')
      )
        fecharAtual.current()
      if (evento.key !== 'Tab' || !caixaRef.current) return
      const focaveis = [
        ...caixaRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
        )
      ]
      if (!focaveis.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', teclado)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('keydown', teclado)
      const eraTopo = pilhaModais.at(-1) === id
      const indice = pilhaModais.indexOf(id)
      if (indice >= 0) pilhaModais.splice(indice, 1)
      if (!pilhaModais.length) {
        if (!raizEraInerte) raiz?.removeAttribute('inert')
        if (ariaRaizAntes === null) raiz?.removeAttribute('aria-hidden')
        else raiz?.setAttribute('aria-hidden', ariaRaizAntes)
      }
      if (eraTopo && focoAnterior.current?.isConnected) focoAnterior.current.focus()
    }
  }, [open])
  if (!open) return null
  const width =
    size === 'md'
      ? 'max-w-lg'
      : size === 'lg'
        ? 'max-w-2xl'
        : size === 'xl'
          ? 'max-w-4xl'
          : size === '2xl'
            ? 'max-w-5xl'
            : 'max-w-7xl'
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4 sm:p-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose()
      }}
    >
      <div
        ref={caixaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? tituloId : undefined}
        className={cn(
          'flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl',
          width
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-4">
            <h3 id={tituloId} className="text-base font-semibold text-slate-800">
              {title}
            </h3>
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
              aria-label="Fechar"
            >
              <AppIcon icon={X} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        <div data-gdo-notificacoes />
        {footer && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-slate-200 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Excluir',
  cancelLabel = 'Cancelar',
  danger = true,
  busy = false,
  onCancel,
  onConfirm
}: {
  open: boolean
  title: ReactNode
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}): ReactElement | null {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="md"
      busy={busy}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? 'Aguarde…' : confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-slate-600">{description}</p>
    </Modal>
  )
}
