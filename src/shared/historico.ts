import type { Relatorio } from './types'

/** Ordena a origem como número de proposta; cliente é o desempate legível. */
export function compararOrigemRelatorio(a: Relatorio, b: Relatorio): number {
  const numeroA = a.origemOrcamento?.numero
  const numeroB = b.origemOrcamento?.numero
  if (numeroA == null && numeroB != null) return 1
  if (numeroA != null && numeroB == null) return -1
  if (numeroA != null && numeroB != null && numeroA !== numeroB) return numeroA - numeroB
  return (a.origemOrcamento?.cliente ?? '').localeCompare(b.origemOrcamento?.cliente ?? '', 'pt-BR')
}
