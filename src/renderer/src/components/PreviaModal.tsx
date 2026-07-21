import { useMemo } from 'react'
import { gerarHtmlOrcamento } from '@shared/documento/template'
import type { EmpresaConfig, Orcamento } from '@shared/types'
import { Button } from '../ui/primitives'

export function PreviaModal({
  orc,
  empresa,
  onClose
}: {
  orc: Orcamento
  empresa: EmpresaConfig
  onClose: () => void
}): JSX.Element {
  const html = useMemo(() => gerarHtmlOrcamento(orc, empresa), [orc, empresa])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-4 sm:p-8">
      <div className="mx-auto flex h-full w-full max-w-[820px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Prévia do orçamento</h3>
          <Button size="sm" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
        <iframe title="Prévia" srcDoc={html} className="h-full w-full flex-1 border-0 bg-slate-200" />
      </div>
    </div>
  )
}
