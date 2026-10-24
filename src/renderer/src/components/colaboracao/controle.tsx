import { ArrowRightLeft, LockKeyhole } from 'lucide-react'
import type { ControleEdicao, StatusNuvem } from '@shared/evolucao'
import { Button, SectionTitle, Field, Select, Mensagem } from '../../ui/primitives'
import { trechoComputador } from './rascunhos'
import type { ReactElement } from 'react'

export function ControleDaEdicao({
  controle,
  status,
  computadores,
  destino,
  recuperar,
  ocupado,
  sujo,
  onDestino,
  onRecuperar,
  onControlar
}: {
  controle: ControleEdicao | null
  status: StatusNuvem | null
  computadores: Array<{ id: string; nome: string }>
  destino: string
  recuperar: boolean
  ocupado: boolean
  sujo: boolean
  onDestino: (id: string) => void
  onRecuperar: (ativo: boolean) => void
  onControlar: (acao: 'transferir' | 'recuperar', computador?: string) => void
}): ReactElement {
  return (
    <>
      <SectionTitle
        title="Controle da edição"
        description="A emissão offline é exclusiva. Recuperar revoga a autorização anterior; alterações de computadores desconectados serão conciliadas quando retornarem."
      />
      <div className="flex flex-wrap items-end gap-3">
        {controle?.podeEditar && (
          <>
            <Field label="Transferir para">
              <Select value={destino} onChange={(e) => onDestino(e.target.value)}>
                <option value="">Escolha o computador</option>
                {computadores.map((c) => {
                  const atual = c.id === status?.computador
                  return (
                    <option value={c.id} key={c.id} title={c.id} disabled={atual}>
                      {c.nome} ·{' '}
                      {trechoComputador(
                        c.id,
                        computadores.map((item) => item.id)
                      )}
                      {atual ? ' (este computador)' : ''}
                    </option>
                  )
                })}
              </Select>
            </Field>
            <Button
              variant="outline"
              icon={ArrowRightLeft}
              disabled={!destino || ocupado || sujo}
              onClick={() => onControlar('transferir', destino)}
            >
              Transferir controle
            </Button>
          </>
        )}
        <Button
          variant="outline"
          icon={LockKeyhole}
          disabled={ocupado}
          onClick={() => onRecuperar(true)}
        >
          Recuperar controle
        </Button>
      </div>
      {recuperar && (
        <Mensagem tom="aviso">
          <p className="mb-3">
            A autorização anterior será revogada no servidor. Um computador desconectado só receberá
            a revogação ao reconectar, e seus números reservados não serão reutilizados. Preserve
            seu rascunho antes de continuar.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={ocupado || sujo} onClick={() => onControlar('recuperar')}>
              Confirmar recuperação
            </Button>
            <Button variant="outline" onClick={() => onRecuperar(false)}>
              Voltar
            </Button>
          </div>
        </Mensagem>
      )}
    </>
  )
}
