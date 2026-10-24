import { useEffect, useMemo, useState } from 'react'
import { gerarHtmlRelatorio } from '@shared/documento/template'
import type { EmpresaConfig, Relatorio } from '@shared/types'
import { PreviaDocumentoModal } from './PreviaDocumentoModal'
import { destinatarioComTratamento } from '@shared/documento/comum'
import { api } from '../lib/api'
import type { ReactElement } from 'react'

export function PreviaRelatorioModal({
  relatorio,
  empresa,
  tratamento,
  onClose
}: {
  relatorio: Relatorio
  empresa: EmpresaConfig
  tratamento?: string
  onClose: () => void
}): ReactElement {
  const [anexosCompletos, setAnexosCompletos] = useState(relatorio.anexos)
  useEffect(() => {
    let vivo = true
    void Promise.all(
      relatorio.anexos.map(async (anexo) => ({
        ...anexo,
        imagemDataUrl:
          anexo.imagemDataUrl ??
          (await api.anexosRelatorio.imagem(anexo.id)) ??
          anexo.miniaturaDataUrl
      }))
    ).then((anexos) => {
      if (vivo) setAnexosCompletos(anexos)
    })
    return () => {
      vivo = false
    }
  }, [relatorio.anexos])
  const html = useMemo(
    () =>
      gerarHtmlRelatorio(
        tratamento
          ? {
              ...relatorio,
              anexos: anexosCompletos,
              destinatario: destinatarioComTratamento(tratamento, relatorio.destinatario)
            }
          : { ...relatorio, anexos: anexosCompletos },
        empresa
      ),
    [relatorio, empresa, tratamento, anexosCompletos]
  )
  return (
    <PreviaDocumentoModal
      titulo="Prévia do relatório"
      tituloFrame="Prévia do relatório"
      html={html}
      onClose={onClose}
    />
  )
}
