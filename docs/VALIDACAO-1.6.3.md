# Validação da 1.6.3

Versão: **1.6.3** (manutenção). SQLite esquema 14 e protocolo de nuvem 4, sem migração nova. Nenhuma
mudança visível; atualiza dependências e divide módulos grandes. Detalhes no `CHANGELOG.md`.
Instalador: `release/1.6.3/Gerador de Orçamentos Setup 1.6.3.exe`, 1.173 MiB (1.230.738.035 bytes),
SHA-256 `2f6bf879b70deb6dce0a8f1832a15146192638cd43891597313fdad56f42ded0`. A pasta `release/` fica
fora do Git; o instalador não é assinado (`signAndEditExecutable: false`).

## Ensaios e resultados

| Ensaio                                                                 | Resultado                                                                                                                 |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run check` (lint, formatação, tipos, testes com cobertura, build) | 599 testes em 85 arquivos aprovados; cobertura de instruções 54,0% (piso 52%)                                             |
| `scripts/capturar-telas.mjs` (Tailwind 3 → 4)                          | 30 capturas (claro e escuro) idênticas pixel a pixel antes e depois                                                       |
| `scripts/verificar-1-6-3-pacote.mjs` (executável final, Electron 45)   | Abre na 1.6.3 sem erros de página; trava velha substituída; `contas.json` truncado guardado; tema escuro salvo ao reabrir |
| `scripts/verificar-ipc-validacao.mjs` (app compilado)                  | Argumentos malformados recusados; chamadas corretas passam                                                                |
| `scripts/verificar-paginacao-longa.mjs` (layout real, Electron 45)     | 11 folhas, 0 estouros, texto preservado, mesmo número de folhas no PDF                                                    |
| `npm audit --omit=dev`                                                 | 0 vulnerabilidades em dependências de produção                                                                            |
| CI no GitHub Actions (Windows, Node 24)                                | Conferido no PR (ver o histórico do PR)                                                                                   |

## Limites desta validação

- A comparação de telas usa a API de demonstração (listas vazias): 30 capturas (entrada, as cinco telas principais, o editor de orçamento, as abas de Configurações disponíveis, os modais de novo cliente e o seletor de colunas, em claro e escuro) ficaram idênticas pixel a pixel contra o Tailwind 3. Tabelas com muitos dados não foram comparadas.
- Teste real no executável 1.6.3 (Electron 45), empresa **TESTE** do Supabase, com a sessão aberta pelo usuário: protocolo 4, tempo real "conectado"; um orçamento criado ficou com número definitivo após sincronizar, sem pendências nem erro; uma edição foi enviada em 2,8 s; a IA local iniciou o modelo embutido e corrigiu o texto de teste (acentos, maiúscula e ponto final) em 4,4 s. O orçamento de teste ("Teste Electron 45") ficou na empresa TESTE.
- Não foi exercitada a propagação entre dois computadores nesta versão (feita na 1.6.0), nem o diálogo nativo de salvar PDF/Word: a geração do PDF foi validada pelo ensaio de paginação em layout real (`printToPDF` no Electron 45) e a do Word, pelos testes automatizados.
- O Electron 45 não foi instalado como aplicativo; o executável foi validado pelo `win-unpacked`.
- TypeScript 7 e a atualização automática/assinatura de código não foram feitos (ver o CHANGELOG).
- Com o Vitest 5, um teste de `Retry-After` passou a coincidir com a vigilância periódica no mesmo instante;
  a asserção foi ajustada para "nada antes do prazo; envio no prazo".
