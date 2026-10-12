import { api } from '../lib/api'
import { Plus } from 'lucide-react'
import { useAsync } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { PageShell } from '../ui/layout'
import { Button } from '../ui/primitives'
import { HistoricoDocumentos, registroRelatorio } from '../components/HistoricoDocumentos'
export function HistoricoRelatoriosPage(): JSX.Element {
  const { navegar } = useNav()
  const { data, loading, error, reload } = useAsync(() => api.relatorios.list(), [], ['relatorio'])
  return (
    <PageShell
      largura="full"
      titulo="Relatórios"
      descricao="Histórico de serviços prestados"
      acoes={
        <Button icon={Plus} onClick={() => navegar({ nome: 'editorRelatorio' })}>
          Novo relatório
        </Button>
      }
    >
      <HistoricoDocumentos
        tipo="relatorio"
        registros={(data ?? []).map(registroRelatorio)}
        loading={loading}
        erroCarga={error}
        onAtualizar={reload}
      />
    </PageShell>
  )
}
