import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { AppIcon } from './primitives'

export function ListaOrdenavel<T extends { id: string }>({
  itens,
  onChange,
  children,
  disabled = false
}: {
  itens: T[]
  onChange: (itens: T[]) => void
  children: ReactNode
  disabled?: boolean
}): ReactElement {
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const linhas = Children.toArray(children)
  return (
    <DndContext
      sensors={sensores}
      collisionDetection={closestCenter}
      accessibility={{
        container: document.body,
        screenReaderInstructions: {
          draggable:
            'Pressione espaço para mover, setas para escolher a posição, espaço para confirmar e Escape para cancelar.'
        }
      }}
      onDragEnd={({ active, over }) => {
        if (disabled || !over || active.id === over.id) return
        const de = itens.findIndex((i) => i.id === active.id),
          ate = itens.findIndex((i) => i.id === over.id)
        if (de >= 0 && ate >= 0) onChange(arrayMove(itens, de, ate))
      }}
    >
      <SortableContext items={itens.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {linhas.map((linha, n) =>
          itens[n] && isValidElement(linha) ? (
            <LinhaOrdenavel key={itens[n].id} id={itens[n].id} disabled={disabled} linha={linha} />
          ) : (
            linha
          )
        )}
      </SortableContext>
    </DndContext>
  )
}
function LinhaOrdenavel({
  id,
  disabled,
  linha
}: {
  id: string
  disabled: boolean
  linha: ReactElement
}): ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver
  } = useSortable({ id, disabled })
  const props = linha.props as {
    className?: string
    style?: React.CSSProperties
    children?: ReactNode
  }
  const alca = (
    <button
      type="button"
      ref={setActivatorNodeRef}
      disabled={disabled}
      {...attributes}
      {...listeners}
      aria-label="Arrastar para reordenar"
      data-arrastando={isDragging ? 'true' : undefined}
      title="Arraste para reordenar; também funciona com espaço e setas"
      className="shrink-0 touch-none rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-brand-teal/40 disabled:opacity-40"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <AppIcon icon={GripVertical} size="sm" />
    </button>
  )
  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : undefined,
    outline: isOver && !isDragging ? '2px solid #cbd5e1' : undefined
  }
  if (linha.type === 'tr') {
    const celulas = Children.toArray(props.children)
    const primeira = celulas[0] as ReactElement<{ children?: ReactNode }>
    celulas[0] = cloneElement(
      primeira,
      {},
      <div className="flex min-w-0 items-center gap-2">
        {alca}
        <div className="min-w-0 flex-1">{primeira.props.children}</div>
      </div>
    )
    return cloneElement(
      linha as ReactElement<Record<string, unknown>>,
      { ref: setNodeRef, style },
      celulas
    )
  }
  if (linha.type === 'div')
    return cloneElement(
      linha as ReactElement<Record<string, unknown>>,
      { ref: setNodeRef, style, className: `${props.className ?? ''} relative pl-10` },
      <>
        <span className="absolute left-2 top-3">{alca}</span>
        {props.children}
      </>
    )
  return (
    <div ref={setNodeRef} style={style} className="relative pl-8">
      <span className="absolute left-0 top-3">{alca}</span>
      {linha}
    </div>
  )
}
