import { useId } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { PreferenciaTema } from '@shared/tema'
import { definirPreferenciaTema, usePreferenciaTema, useTemaEfetivo } from '../lib/tema'
import { AppIcon } from '../ui/primitives'

const OPCOES: ReadonlyArray<{ valor: PreferenciaTema; rotulo: string; icone: typeof Sun }> = [
  { valor: 'claro', rotulo: 'Claro', icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', icone: Moon },
  { valor: 'sistema', rotulo: 'Automático (Windows)', icone: Monitor }
]

/** Escolha do tema com botões de opção nativos: teclado e leitor de tela funcionam sem código extra. */
export function SeletorTema(): JSX.Element {
  const [preferencia, definir] = usePreferenciaTema()
  const grupo = useId()
  return (
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">Tema da interface</legend>
      {OPCOES.map(({ valor, rotulo, icone }) => (
        <label key={valor}>
          <input
            type="radio"
            name={grupo}
            value={valor}
            checked={preferencia === valor}
            onChange={() => definir(valor)}
            className="peer sr-only"
          />
          <span className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-surface px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 peer-checked:border-brand-teal peer-checked:bg-brand-teal/10 peer-checked:text-brand-tealDark peer-focus-visible:ring-2 peer-focus-visible:ring-brand-teal/40">
            <AppIcon icon={icone} size="sm" />
            {rotulo}
          </span>
        </label>
      ))}
    </fieldset>
  )
}

/** Atalho da barra lateral: alterna entre claro e escuro a partir do tema que está na tela. */
export function BotaoAlternarTema(): JSX.Element {
  const escuro = useTemaEfetivo() === 'escuro'
  const rotulo = escuro ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'
  return (
    <button
      type="button"
      onClick={() => definirPreferenciaTema(escuro ? 'claro' : 'escuro')}
      aria-label={rotulo}
      title={rotulo}
      className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
    >
      <AppIcon icon={escuro ? Sun : Moon} size="sm" />
    </button>
  )
}
