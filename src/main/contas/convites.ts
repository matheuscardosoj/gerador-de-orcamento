// Apresentação dos convites e regra de senha da conta.
import type { ConviteConta } from '../../shared/conta'

export function senhaValida(senha: string): void {
  if (typeof senha !== 'string' || senha.length < 8 || senha.length > 128)
    throw new Error('Use uma senha com 8 a 128 caracteres.')
}

/** Acrescenta o estado legível (Pendente, Aceito, Cancelado, Expirado) a cada convite. */
export function rotularConvites(convites: Array<Record<string, string>>): ConviteConta[] {
  return convites.map((c) => ({
    ...c,
    estado: c.canceladoEm
      ? 'Cancelado'
      : c.aceitoEm
        ? 'Aceito'
        : Date.parse(c.expiraEm) < Date.now()
          ? 'Expirado'
          : 'Pendente',
    criadoEm: c.ultimoEnvio
  })) as unknown as ConviteConta[]
}
