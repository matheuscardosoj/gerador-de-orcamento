import { avisarDados } from '../eventos'

const avisos: string[] = []

export function registrarAvisoEmail(mensagem: string): void {
  avisos.push(mensagem)
  avisarDados({ origem: 'nuvem', entidades: [], status: true })
}

export function retirarAvisosEmail(): string[] {
  return avisos.splice(0)
}
