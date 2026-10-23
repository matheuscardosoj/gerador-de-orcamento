import { useState } from 'react'
import { Plus } from 'lucide-react'
import { PageShell, Tabs } from '../ui/layout'
import { Button } from '../ui/primitives'
import type { Cliente, ServicoCatalogo } from '@shared/types'
import { SecaoClientes } from './cadastros/clientes'
import { SecaoServicos } from './cadastros/servicos'

type Aba = 'clientes' | 'servicos'

export function CadastrosPage(): JSX.Element {
  const [aba, setAba] = useState<Aba>('clientes')
  const [editCliente, setEditCliente] = useState<Cliente | 'novo' | null>(null)
  const [editServico, setEditServico] = useState<ServicoCatalogo | 'novo' | null>(null)
  return (
    <PageShell
      largura="full"
      titulo="Cadastros"
      descricao="Clientes e catálogo de serviços"
      acoes={
        <Button
          icon={Plus}
          onClick={() => (aba === 'clientes' ? setEditCliente('novo') : setEditServico('novo'))}
        >
          {aba === 'clientes' ? 'Novo cliente' : 'Novo serviço'}
        </Button>
      }
    >
      <Tabs
        atual={aba}
        onChange={setAba}
        tabs={[
          { id: 'clientes', label: 'Clientes' },
          { id: 'servicos', label: 'Catálogo de serviços' }
        ]}
      />
      {aba === 'clientes' ? (
        <SecaoClientes edit={editCliente} setEdit={setEditCliente} />
      ) : (
        <SecaoServicos edit={editServico} setEdit={setEditServico} />
      )}
    </PageShell>
  )
}
