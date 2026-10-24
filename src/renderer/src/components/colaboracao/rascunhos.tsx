import { CopyPlus, GitCompareArrows, Save, Pencil, Trash2 } from 'lucide-react'
import type { RascunhoCompartilhado, ComparacaoRascunho } from '@shared/evolucao'
import { compararDocumentos } from '@shared/comparacao-documentos'
import { Button, Card, SectionTitle, Field, Select, Mensagem, Badge } from '../../ui/primitives'
import { DataTableViewport } from '../../ui/dataTable'
import type { ReactElement } from 'react'
export const rotuloCampo = (campo: string): string =>
  campo
    .split('.')
    .map(
      (p) =>
        ({
          descricao: 'Descrição',
          preco: 'Preço e cálculo do serviço',
          observacao: 'Observação',
          observacaoInterna: 'Anotação interna',
          introducao: 'Introdução',
          destinatario: 'Cliente',
          valor: 'Valor',
          valorUnitario: 'Valor unitário',
          quantidade: 'Quantidade',
          itensServico: 'Serviços',
          pagamentos: 'Condições de pagamento',
          observacoes: 'Observações',
          materiais: 'Materiais',
          anexos: 'Fotos',
          __ordem: 'Ordem dos itens',
          status: 'Estado',
          quitacao: 'Quitação',
          adiantamentos: 'Adiantamentos',
          reembolsos: 'Reembolsos'
        })[p] ?? (p.length > 30 ? 'Item' : p)
    )
    .join(' / ')
export function texto(v: unknown): string {
  if (v === undefined || v === null) return 'Ausente'
  if (typeof v === 'string') return v || 'Vazio'
  return JSON.stringify(v, null, 2)
}
export function trechoComputador(id: string, ids: string[]): string {
  let tamanho = 8
  while (
    tamanho < id.length &&
    ids.some((outro) => outro !== id && outro.startsWith(id.slice(0, tamanho)))
  )
    tamanho += 1
  return id.slice(0, tamanho)
}

export function TabelaRascunhos({
  rascunhos,
  ocupado,
  onExcluir,
  onEditar,
  onComparar
}: {
  rascunhos: RascunhoCompartilhado[]
  ocupado: boolean
  onExcluir: (r: RascunhoCompartilhado) => void
  onEditar: (r: RascunhoCompartilhado) => void
  onComparar: (r: RascunhoCompartilhado) => void
}): ReactElement {
  return (
    <>
      {rascunhos.length ? (
        <DataTableViewport minWidth="660px">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-3">Atualizado</th>
              <th className="px-4 py-3">Revisão de partida</th>
              <th className="px-4 py-3">Situação</th>
              <th className="w-72 px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rascunhos.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-3">{new Date(r.atualizadoEm).toLocaleString('pt-BR')}</td>
                <td className="px-4 py-3">{r.baseRevisao}</td>
                <td className="px-4 py-3">
                  <Badge color={r.estado === 'conflito' ? 'amber' : 'slate'}>
                    {r.estado === 'envio_interrompido'
                      ? 'Envio precisa de revisão'
                      : r.estado === 'aguardando_confirmacao'
                        ? 'Aguardando confirmação da nuvem'
                        : r.estado === 'conflito'
                          ? 'Conflito'
                          : 'Local'}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      icon={Trash2}
                      size="sm"
                      variant="outline"
                      disabled={ocupado || r.estado === 'aguardando_confirmacao'}
                      onClick={() => onExcluir(r)}
                    >
                      Excluir rascunho
                    </Button>
                    <Button
                      icon={Pencil}
                      size="sm"
                      variant="outline"
                      disabled={ocupado || r.estado === 'aguardando_confirmacao'}
                      onClick={() => onEditar(r)}
                    >
                      Editar
                    </Button>
                    <Button
                      icon={GitCompareArrows}
                      size="sm"
                      variant="outline"
                      disabled={ocupado || r.estado === 'aguardando_confirmacao'}
                      onClick={() => onComparar(r)}
                    >
                      Comparar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTableViewport>
      ) : (
        <p className="text-sm text-slate-500">Não há rascunhos guardados para este documento.</p>
      )}
    </>
  )
}

export function PainelComparacao({
  comparacao,
  escolhas,
  ocupado,
  reciboProtegido,
  onEscolher,
  onAplicar,
  onCriarNovo
}: {
  comparacao: ComparacaoRascunho
  escolhas: Record<string, 'local' | 'remoto'>
  ocupado: boolean
  reciboProtegido: boolean
  onEscolher: (caminho: string, valor: 'local' | 'remoto') => void
  onAplicar: () => void
  onCriarNovo: () => void
}): ReactElement {
  return (
    <div className="space-y-4 border-t border-slate-200 pt-5">
      <SectionTitle
        title="Comparar com a versão da empresa"
        description={`Revisão atual: ${comparacao.revisaoRemota}. Alterações em campos diferentes são combinadas; disputas precisam da sua escolha.`}
      />
      {!comparacao.remoto && (
        <Mensagem tom="aviso">
          O documento foi excluído. Preserve este trabalho criando um novo documento.
        </Mensagem>
      )}
      {comparacao.conflitos.map((c) => (
        <Card key={c.caminho} className="p-4">
          <p className="mb-3 font-medium text-slate-700">
            {rotuloCampo(c.caminho)}{' '}
            {c.financeiro && <Badge color="amber">Revisar valores / condições</Badge>}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {(
              [
                ['Partida', c.base],
                ['Seu rascunho', c.local],
                ['Empresa', c.remoto]
              ] as const
            ).map(([label, v]) => (
              <div key={label}>
                <p className="mb-1 text-xs font-medium text-slate-500">{label}</p>
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">
                  {texto(v)}
                </pre>
              </div>
            ))}
          </div>
          <Field label="Usar neste campo">
            <Select
              value={escolhas[c.caminho] ?? ''}
              onChange={(e) => onEscolher(c.caminho, e.target.value as 'local' | 'remoto')}
            >
              <option value="">Escolha uma alternativa</option>
              <option value="local">Seu rascunho</option>
              <option value="remoto">Versão da empresa</option>
            </Select>
          </Field>
        </Card>
      ))}
      {!!comparacao.remoto && (
        <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
          <DataTableViewport minWidth="640px">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Mudança independente</th>
                <th className="px-4 py-3">Empresa</th>
                <th className="px-4 py-3">Resultado combinado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {compararDocumentos(comparacao.remoto, comparacao.documento).map((d) => (
                <tr key={d.campo}>
                  <th className="px-4 py-3 text-left font-medium">{d.campo}</th>
                  <td className="break-words px-4 py-3">{d.anterior}</td>
                  <td className="break-words px-4 py-3">{d.atual}</td>
                </tr>
              ))}
            </tbody>
          </DataTableViewport>
        </div>
      )}
      <Mensagem tom="info">
        Recebimentos, estornos e quitação não são desfeitos por esta comparação. Uma nova revisão
        preserva todas as anteriores.
      </Mensagem>
      {reciboProtegido && (
        <Mensagem tom="info">
          Este recibo já foi confirmado ou cancelado. Para corrigir, use cancelamento e crie uma
          cobrança substituta. O rascunho pode ser comparado, copiado ou excluído.
        </Mensagem>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          icon={Save}
          disabled={
            ocupado ||
            reciboProtegido ||
            !comparacao.remoto ||
            comparacao.conflitos.some((c) => !escolhas[c.caminho])
          }
          onClick={onAplicar}
        >
          Aplicar como nova revisão
        </Button>
        <Button icon={CopyPlus} variant="outline" disabled={ocupado} onClick={onCriarNovo}>
          Criar novo documento
        </Button>
      </div>
    </div>
  )
}
