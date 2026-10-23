# Validação da 1.6.2

Versão: **1.6.2** (correção e engenharia). SQLite esquema 14 e protocolo de nuvem 4, sem migração nova
(local ou Supabase). Inclui o conteúdo da 1.6.1, que não chegou a ser instalada em separado.
Instalador: `release/1.6.2/Gerador de Orçamentos Setup 1.6.2.exe`, 1.166 MiB (1.222.574.872 bytes),
SHA-256 `d43a4c9d043f9f8159cacad84f28669635ce7790d8cd59dbfbb29e0a28135254`. A pasta `release/` fica
fora do Git; o instalador não é assinado (`signAndEditExecutable: false`).

## O que mudou

**Correção do notebook.** Em um computador, o aplicativo mostrava "Não foi possível recuperar seu
acesso" e, depois do login, "Não foi possível concluir" ao escolher qualquer empresa. O "Exportar
diagnóstico" da 1.6.1 mostrou a causa: um `banco.lock` de 21/10 guardava o PID `41740`, que o Windows
passou a dar a outro processo; o aplicativo entendia "outra instância aberta". Agora a trava guarda
também a hora de início do processo, e um PID vivo que começou depois da trava é tratado como trava
velha (substituída e registrada como `trava-obsoleta`). Sem conseguir consultar o processo, a trava
continua valendo. Também: o perfil cujo banco não abre deixa de ficar preso, `contas.json` ilegível é
guardado ao lado, as falhas ficam em `logs/app.jsonl` com um código na mensagem e há "Exportar
diagnóstico" no aviso de abertura e na escolha de empresa.

**Engenharia (sem mudança visível).** Contrato tipado dos canais IPC e validação da forma dos
argumentos no processo principal; testes do renderer com jsdom; divisão de `nuvem.ts`,
`repositories.ts`, `dados.ts`, do editor de orçamento, dos cadastros e do modal de cálculo; API de
demonstração fora do pacote de produção; migrações do Supabase no instalador por glob; auditoria de
dependências no CI; `no-explicit-any` como erro; scripts e documentos antigos em `scripts/legado/` e
`docs/historico/`. Detalhes no `CHANGELOG.md`.

## Ensaios e resultados

| Ensaio                                                             | Resultado                                                                                                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run check` (lint, formatação, tipos, testes e build)          | 593 testes em 84 arquivos aprovados                                                                                                                                                              |
| Testes da trava (`trava-processo.test.ts`)                         | PID reaproveitado reconhecido com consulta real ao processo no Windows; dono verdadeiro e consulta impossível mantêm a trava; abre o banco com trava de dois dias atrás e recusa com trava atual |
| Perfil com banco ilegível e `contas.json` truncado                 | Erro com código e sem caminho; perfil não fica preso; arquivo guardado ao lado                                                                                                                   |
| `App.fumaca.test.tsx` (jsdom)                                      | App, 5 telas e os 2 editores abrem sem `console.error`                                                                                                                                           |
| `scripts/verificar-1-6-2-pacote.mjs` (executável final)            | Abre com `contas.json` truncado e `banco.lock` velho de PID vivo: trava substituída, arquivo guardado, causas registradas; versão 1.6.2; tema escuro salvo ao reabrir; sem erros de página       |
| `scripts/verificar-ipc-validacao.mjs` (código compilado, app real) | Argumento malformado recusado como "inválidos"; chamadas corretas seguem até a regra de acesso                                                                                                   |
| Migrações empacotadas                                              | 10 migrações (004 a 013) e o rollback da 013 no instalador, as mesmas da 1.6.0                                                                                                                   |
| CI no GitHub Actions (Windows, Node 24)                            | Conferido no PR (ver o histórico do PR)                                                                                                                                                          |

## Limites desta validação

- **A correção não foi confirmada no computador que apresentou o erro.** O cenário foi reproduzido em
  teste e no executável empacotado com uma trava fabricada; a confirmação real é instalar a 1.6.2 lá. Se
  o erro persistir, o "Exportar diagnóstico" mostra a causa.
- A consulta ao processo usa o PowerShell, só quando já existe trava com PID vivo; a abertura pode
  demorar cerca de 1 segundo nesse caso.
- A validação do IPC confere a **forma** dos argumentos (texto, objeto, número, valores permitidos),
  não o conteúdo dos objetos; as regras de negócio continuam nos repositórios.
- Os testes do renderer são de fumaça (a tela monta e navega); não cobrem fluxos de edição completos.
  Não foi medida cobertura de código (exigiria um pacote a mais).
- Não foram divididos `executarSincronizacao` (430 linhas dentro de `nuvem.ts`), `mesclar` (500 linhas
  em `dados.ts`), `servico.ts` de contas, `ColaboracaoDocumento.tsx`, `primitives.tsx` nem
  `ConfiguracoesPage.tsx`: dependem de estado compartilhado do módulo e merecem uma mudança própria.
- Não alterado: majors de dependências, assinatura de código e atualização automática; os 26 casts
  `as unknown as` (a maioria em testes); as vulnerabilidades de desenvolvimento do `npm audit` (as de
  produção estão zeradas e o CI as audita).
- O instalador não foi **executado**, para não alterar a instalação do usuário; o conteúdo foi
  validado pelo `win-unpacked`, que é o que o instalador grava.
