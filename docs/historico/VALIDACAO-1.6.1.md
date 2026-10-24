# Validação da 1.6.1

Versão: **1.6.1** (correção). SQLite esquema 14 e protocolo de nuvem 4, sem migração nova (local ou
Supabase).
Instalador: `release/1.6.1/Gerador de Orçamentos Setup 1.6.1.exe`, 1.166 MiB (1.222.576.389 bytes),
SHA-256 `3d9ae92cabc333a5988a66ccae8923080714233c60c11f555aa2cc1f55b4d43e`. A pasta `release/`
fica fora do Git; o instalador não é assinado (`signAndEditExecutable: false`).

## O que mudou

Em um notebook, o aplicativo mostrava "Não foi possível recuperar seu acesso" e, depois do login,
"Não foi possível concluir" ao escolher qualquer empresa. Causa provável (inferida do código; o
computador não foi examinado): o banco local do perfil salvo não abria, e o perfil continuava
selecionado sem conexão, de modo que toda leitura seguinte reabria o mesmo banco e falhava. A causa
real também se perdia na mensagem genérica.

- O perfil que não abre deixa de ficar preso: o aplicativo volta ao banco padrão e permite escolher
  outra empresa.
- `contas.json` ilegível é guardado como `contas.json.corrompido-<data>`.
- Registro de falhas em `logs/app.jsonl` (rotação em 1 MB) com código de 6 caracteres na mensagem.
- "Exportar diagnóstico" no aviso de abertura e na escolha de empresa.

## Ensaios e resultados

| Ensaio                                                         | Resultado                                                                                                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (lint, formatação, tipos, testes e build)      | 563 testes em 81 arquivos aprovados                                                                                                                   |
| Teste de perfil com banco ilegível (`perfil-danificado`)       | Erro com código e sem caminho; o perfil não fica preso e o banco padrão volta a abrir                                                                 |
| Teste de `contas.json` truncado e do registro de falhas        | Arquivo guardado ao lado; registro sem e-mails; falha de gravação do log não lança erro                                                               |
| `scripts/legado/verificar-1-6-1-pacote.mjs` (executável final) | Abre na 1.6.1 com `contas.json` truncado: arquivo guardado, causa registrada com código, tela de entrada, exportação disponível; tema escuro reaberto |
| CI no GitHub Actions (Windows, Node 24)                        | Conferido no PR (ver o histórico do PR)                                                                                                               |

## Limites desta validação

- **O defeito não foi reproduzido no notebook do usuário** nem no aplicativo empacotado com um banco
  de perfil ilegível: o aviso de abertura é um diálogo síncrono do Windows, que impede o ensaio
  automatizado. Esse caminho é coberto por teste de unidade (`perfil-danificado.test.ts`), não pelo
  executável. A confirmação real é instalar a 1.6.1 no notebook e, se o erro persistir, enviar o
  arquivo de "Exportar diagnóstico".
- Se o perfil danificado for o da empresa que o usuário escolhe, ela ainda falha, agora com código e
  diagnóstico. Não há ainda um botão "Reparar perfil" (mover o perfil para quarentena e
  ressincronizar da nuvem); o remédio manual é renomear a pasta `perfis\<hash>`, depois de conferir
  que não há operações pendentes salvas só naquele computador.
- O instalador não foi **executado**, pelo mesmo motivo da 1.6.0: a instalação do usuário seria
  alterada. O conteúdo foi validado pelo `win-unpacked`, que é o que o instalador grava.
- O `Exportar diagnóstico` foi testado por montagem do relatório (teste de unidade), não pelo diálogo
  de salvar.
- Itens da auditoria de engenharia ainda não feitos: validação de entrada do IPC, testes do renderer,
  divisão dos arquivos grandes, glob das migrações no empacotamento e limpeza de scripts antigos.
