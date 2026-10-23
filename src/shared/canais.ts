// Contrato dos canais IPC derivado de `AppApi`: preload e main usam os mesmos tipos, então um canal
// que existe na API e não tem tratador no main (ou o contrário) deixa de compilar.
import type { AppApi } from './api'

type Funcao = (...args: never[]) => unknown

/** Grupos de `AppApi` cujos métodos viram canais `grupo.metodo`. */
type GrupoDeCanais = Exclude<keyof AppApi, 'reordenarCadastro' | 'eventos'>

type MetodosDe<G extends GrupoDeCanais> = {
  [M in keyof AppApi[G] & string]: AppApi[G][M] extends Funcao ? `${G}.${M}` : never
}[keyof AppApi[G] & string]

/** Todo canal que o renderer pode invocar. */
export type Canal =
  { [G in GrupoDeCanais & string]: MetodosDe<G> }[GrupoDeCanais & string] | 'cadastros.reordenar'

/** Canais atendidos por `registrarIpc` com tratador simples (os de `conta.*` usam `contaApi`). */
export type CanalDeTratador = Exclude<Canal, `conta.${string}`>

type FuncaoDe<C extends Canal> = C extends 'cadastros.reordenar'
  ? AppApi['reordenarCadastro']
  : C extends `${infer G}.${infer M}`
    ? G extends GrupoDeCanais
      ? M extends keyof AppApi[G]
        ? AppApi[G][M]
        : never
      : never
    : never

export type ArgumentosDoCanal<C extends Canal> =
  FuncaoDe<C> extends (...args: infer A) => unknown ? A : never

export type RetornoDoCanal<C extends Canal> =
  FuncaoDe<C> extends (...args: never[]) => infer R ? Awaited<R> : never
