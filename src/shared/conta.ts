export type PapelConta = 'administrador' | 'membro'
export interface EmpresaConta {
  id: string
  nome: string
  papel: PapelConta
}
export interface EstadoConta {
  central: boolean
  fase: 'desconectado' | 'escolherEmpresa' | 'pronto'
  servicoConfigurado: boolean
  email: string
  nome: string
  lembrar: boolean
  operador: boolean
  empresa: EmpresaConta | null
  empresas: EmpresaConta[]
}
export interface ConviteConta {
  id: string
  email: string
  nome: string
  papel: PapelConta
  estado: string
  criadoEm: string
}
export interface ContaApi {
  status(): Promise<EstadoConta>
  entrar(email: string, senha: string, lembrar: boolean): Promise<EstadoConta>
  selecionarEmpresa(id: string): Promise<EstadoConta>
  sair(): Promise<EstadoConta>
  atualizarNome(nome: string): Promise<EstadoConta>
  alterarSenha(senhaAtual: string, novaSenha: string): Promise<void>
  alterarPapel(usuarioId: string, papel: PapelConta): Promise<EstadoConta>
  enviarCodigo(email: string, tipo: 'convite' | 'recuperacao'): Promise<void>
  confirmarCodigo(
    email: string,
    codigo: string,
    tipo: 'convite' | 'recuperacao',
    novaSenha: string
  ): Promise<EstadoConta>
  convites(): Promise<ConviteConta[]>
  convidar(email: string, nome: string, papel: PapelConta): Promise<void>
  cancelarConvite(id: string): Promise<void>
  reenviarConvite(id: string): Promise<void>
  criarEmpresa(nome: string, email: string, nomeAdministrador: string): Promise<void>
}
