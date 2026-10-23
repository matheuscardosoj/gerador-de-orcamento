import { execFileSync } from 'child_process'

/** Folga entre o relógio do arquivo da trava e a hora de início do processo. */
const TOLERANCIA_MS = 5_000

/** Conteúdo gravado no `banco.lock`: PID e hora de início deste processo. */
export function conteudoDaTrava(): string {
  return `${process.pid}\n${Math.round(Date.now() - process.uptime() * 1000)}\n`
}

/** Hora (ms desde 1970) em que o processo começou, ou null se não for possível saber. */
export function inicioDoProcesso(pid: number): number | null {
  if (process.platform !== 'win32') return null
  try {
    const saida = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `[DateTimeOffset]::new((Get-Process -Id ${Math.trunc(pid)}).StartTime).ToUnixTimeMilliseconds()`
      ],
      { encoding: 'utf8', timeout: 10_000, windowsHide: true }
    )
    const ms = Number.parseInt(saida.trim(), 10)
    return Number.isFinite(ms) && ms > 0 ? ms : null
  } catch {
    return null
  }
}

/**
 * O PID da trava ainda existe, mas o Windows reaproveita PIDs: um processo que começou bem depois
 * de a trava ser gravada não é quem a criou. Na dúvida (não consegue consultar), a trava vale.
 */
export function travaObsoleta(
  conteudo: string,
  modificadoEm: number,
  consultarInicio: (pid: number) => number | null = inicioDoProcesso
): boolean {
  const [linhaPid, linhaInicio] = conteudo.trim().split(/\r?\n/)
  const pid = Number.parseInt(linhaPid ?? '', 10)
  if (!(pid > 0)) return true
  const inicio = consultarInicio(pid)
  if (inicio === null) return false
  const gravadoPeloDono = Number.parseInt(linhaInicio ?? '', 10)
  const referencia = gravadoPeloDono > 0 ? gravadoPeloDono : modificadoEm
  return inicio > referencia + TOLERANCIA_MS
}
