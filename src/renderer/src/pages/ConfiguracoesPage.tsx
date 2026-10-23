import { PadroesConfig } from './PadroesConfig'
import { NuvemSection } from './NuvemSection'
import { UsuariosSection } from './UsuariosSection'
import { MinhaContaSection } from './MinhaContaSection'
import { useConta } from '../components/ContaGate'
import { useState } from 'react'
import { Save, Check, Plus } from 'lucide-react'
import { useNav, type AbaConfiguracoes } from '../lib/nav'
import { PageShell, Tabs } from '../ui/layout'
import { Button } from '../ui/primitives'

import { AcoesFormulario, type EstadoSalvar } from './configuracoes/comum'
import { SecaoEmpresa } from './configuracoes/empresa'
import { SecaoParametros } from './configuracoes/parametros'
import { SecaoIA } from './configuracoes/ia'
import { SecaoDados } from './configuracoes/dados'

type Aba = AbaConfiguracoes

export function ConfiguracoesPage(): JSX.Element {
  const { conta } = useConta()
  const { rota, navegar } = useNav()
  const aba: Aba = rota.nome === 'configuracoes' ? (rota.aba ?? 'conta') : 'conta'
  const [novoUsuario, setNovoUsuario] = useState(false)
  const [novoTexto, setNovoTexto] = useState(false)
  const [estadoSalvar, setEstadoSalvar] = useState<EstadoSalvar>({
    salvando: false,
    ok: false,
    disabled: false
  })
  const formId = ['empresa', 'parametros', 'ia'].includes(aba) ? `config-${aba}` : undefined
  return (
    <AcoesFormulario.Provider value={{ formId, atualizar: setEstadoSalvar }}>
      <PageShell
        largura="full"
        titulo="Configurações"
        descricao="Dados fixos, parâmetros de cálculo e textos padrão"
        acoes={
          aba === 'usuarios' && (!conta.central || conta.empresa?.papel === 'administrador') ? (
            <Button icon={Plus} onClick={() => setNovoUsuario(true)}>
              {conta.central ? 'Convidar usuário' : 'Vincular usuário'}
            </Button>
          ) : aba === 'observacoes' || aba === 'pagamentos' ? (
            <Button icon={Plus} onClick={() => setNovoTexto(true)}>
              {aba === 'observacoes' ? 'Nova observação' : 'Nova forma de pagamento'}
            </Button>
          ) : formId ? (
            <Button
              icon={estadoSalvar.ok && !estadoSalvar.salvando ? Check : Save}
              type="submit"
              form={formId}
              disabled={estadoSalvar.disabled}
            >
              {estadoSalvar.salvando
                ? 'Salvando…'
                : estadoSalvar.ok
                  ? 'Salvo'
                  : 'Salvar alterações'}
            </Button>
          ) : undefined
        }
      >
        <Tabs
          atual={aba}
          onChange={(aba) => {
            navegar({ nome: 'configuracoes', aba })
            setNovoTexto(false)
          }}
          tabs={[
            { id: 'conta', label: 'Minha conta' },
            { id: 'empresa', label: 'Empresa / Cabeçalho' },
            { id: 'parametros', label: 'Parâmetros financeiros' },
            { id: 'observacoes', label: 'Observações padrão' },
            { id: 'pagamentos', label: 'Formas de pagamento' },
            { id: 'dados', label: 'Dados e backup' },
            { id: 'nuvem', label: 'Nuvem / Sincronização' },
            { id: 'usuarios', label: 'Usuários' },
            { id: 'ia', label: 'IA local' }
          ]}
        />
        {aba === 'nuvem' && <NuvemSection />}
        {aba === 'conta' && <MinhaContaSection />}
        {aba === 'usuarios' && <UsuariosSection novo={novoUsuario} setNovo={setNovoUsuario} />}
        {aba === 'empresa' && <SecaoEmpresa />}
        {aba === 'parametros' && <SecaoParametros />}
        {aba === 'observacoes' && (
          <PadroesConfig tipo="observacoes" novo={novoTexto} setNovo={setNovoTexto} />
        )}
        {aba === 'pagamentos' && (
          <PadroesConfig tipo="pagamentos" novo={novoTexto} setNovo={setNovoTexto} />
        )}
        {aba === 'dados' && <SecaoDados />}
        {aba === 'ia' && <SecaoIA />}
      </PageShell>
    </AcoesFormulario.Provider>
  )
}
