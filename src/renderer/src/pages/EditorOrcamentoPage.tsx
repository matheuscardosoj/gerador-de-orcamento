import { PageShell } from '../ui/layout'
import { EmptyState } from '../ui/primitives'

// Stub temporário — implementado na Fase 4.
export function EditorOrcamentoPage({ orcamentoId }: { orcamentoId?: string }): JSX.Element {
  return (
    <PageShell titulo="Editor de orçamento">
      <EmptyState title="Em construção" description={`Editor (id: ${orcamentoId ?? 'novo'}) será implementado na próxima fase.`} />
    </PageShell>
  )
}
