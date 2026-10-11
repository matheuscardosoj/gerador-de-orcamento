import { useEffect, useMemo, useState } from 'react'
import { gerarHtmlOrcamento } from '@shared/documento/template'
import type { EmpresaConfig, Orcamento } from '@shared/types'
import { PreviaDocumentoModal } from './PreviaDocumentoModal'
import { destinatarioComTratamento } from '@shared/documento/comum'
import { api } from '../lib/api'

export function PreviaModal({
  orc,
  empresa,
  tratamento,
  onClose
}: {
  orc: Orcamento
  empresa: EmpresaConfig
  tratamento?: string
  onClose: () => void
}): JSX.Element {
  const [anexosCompletos, setAnexosCompletos] = useState(orc.anexos ?? [])
  useEffect(() => {
    let vivo = true
    void Promise.all(
      (orc.anexos ?? []).map(async (anexo) => ({
        ...anexo,
        imagemDataUrl:
          anexo.imagemDataUrl ?? (await api.anexos.imagem(anexo.id)) ?? anexo.miniaturaDataUrl
      }))
    ).then((anexos) => {
      if (vivo) setAnexosCompletos(anexos)
    })
    return () => {
      vivo = false
    }
  }, [orc.anexos])
  const html = useMemo(
    () =>
      gerarHtmlOrcamento(
        tratamento
          ? {
              ...orc,
              anexos: anexosCompletos,
              destinatario: destinatarioComTratamento(tratamento, orc.destinatario)
            }
          : { ...orc, anexos: anexosCompletos },
        empresa
      ),
    [orc, empresa, tratamento, anexosCompletos]
  )
  return (
    <PreviaDocumentoModal
      titulo="Prévia do orçamento"
      tituloFrame="Prévia"
      html={html}
      onClose={onClose}
    />
  )
}
