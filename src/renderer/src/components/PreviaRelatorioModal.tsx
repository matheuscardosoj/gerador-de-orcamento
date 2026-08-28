import { useEffect, useMemo, useRef, useState } from 'react'
import { gerarHtmlRelatorio } from '@shared/documento/template'
import { paginarDocumento } from '@shared/documento/paginar'
import type { EmpresaConfig, Relatorio } from '@shared/types'
import { Button } from '../ui/primitives'
import { destinatarioComTratamento } from '@shared/documento/comum'
import { api } from '../lib/api'

export function PreviaRelatorioModal({ relatorio, empresa, tratamento, onClose }: { relatorio: Relatorio; empresa: EmpresaConfig; tratamento?: string; onClose: () => void }): JSX.Element {
  const [anexosCompletos, setAnexosCompletos] = useState(relatorio.anexos)
  useEffect(() => {
    let vivo = true
    void Promise.all(
      relatorio.anexos.map(async (anexo) => ({
        ...anexo,
        imagemDataUrl: anexo.imagemDataUrl ?? await api.anexosRelatorio.imagem(anexo.id) ?? anexo.miniaturaDataUrl
      }))
    ).then((anexos) => { if (vivo) setAnexosCompletos(anexos) })
    return () => { vivo = false }
  }, [relatorio.anexos])
  const html = useMemo(() => gerarHtmlRelatorio(tratamento ? { ...relatorio, anexos: anexosCompletos, destinatario: destinatarioComTratamento(tratamento, relatorio.destinatario) } : { ...relatorio, anexos: anexosCompletos }, empresa), [relatorio, empresa, tratamento, anexosCompletos])
  const ref = useRef<HTMLIFrameElement>(null)
  return <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-4 sm:p-8"><div className="mx-auto flex h-full w-full max-w-[880px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><h3 className="text-sm font-semibold text-slate-800">Prévia do relatório</h3><Button size="sm" variant="secondary" onClick={onClose}>Fechar</Button></div>
    <iframe ref={ref} title="Prévia do relatório" srcDoc={html} onLoad={() => { const doc = ref.current?.contentDocument; if (doc) paginarDocumento(doc) }} className="h-full w-full flex-1 border-0 bg-white" />
  </div></div>
}
