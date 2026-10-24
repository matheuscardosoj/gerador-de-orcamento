import { api } from '../lib/api'
import { Plus } from 'lucide-react'
import { useAsync } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import { Button } from '../ui/primitives'
import { HistoricoDocumentos, registroOrcamento } from '../components/HistoricoDocumentos'
import type { ReactElement } from 'react'
export function HistoricoPage(): ReactElement {
  const { navegar } = useNav()
  const { data, loading, error, reload } = useAsync(() => api.orcamentos.list(), [], ['orcamento'])
  return (
    <PageShell
      largura="full"
      titulo="Orçamentos"
      descricao="Histórico de propostas"
      acoes={
        <Button icon={Plus} onClick={() => navegar({ nome: 'editor' })}>
          Novo orçamento
        </Button>
      }
    >
      <HistoricoDocumentos
        tipo="orcamento"
        registros={(data ?? []).map(registroOrcamento)}
        loading={loading}
        erroCarga={error}
        onAtualizar={reload}
      />
    </PageShell>
  )
}
