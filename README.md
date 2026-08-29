# Gerador de Orçamentos — VS Prestadora de Serviços

Aplicação **desktop** (Electron + React + TypeScript) para calcular o custo de serviços,
aplicar acréscimo sobre o custo e gerar orçamentos no layout da VS Prestadora, exportando **PDF** e **DOCX**.

## Requisitos

- Node.js 20+ (testado com Node 24)

## Scripts

| Comando         | O que faz                                                           |
| --------------- | ------------------------------------------------------------------- |
| `npm run dev`   | Roda em modo desenvolvimento (HMR)                                  |
| `npm run build` | Compila main + preload + renderer para `out/`                       |
| `npm run start` | Compila e abre o app empacotado (preview)                           |
| `npm run test`  | Roda os testes (motor de cálculo, banco e geração de DOCX)          |
| `npm run lint`  | Verifica regras estáticas e a padronização do código                |
| `npm run check` | Executa lint, formatação, tipos, testes e build                     |
| `npm run ia`    | Baixa o runtime de IA local para `resources/ia/` (~1,2 GB)          |
| `npm run dist`  | Gera o instalador `.exe` (roda o `npm run ia` antes, via `predist`) |

> **Build do instalador no Windows:** o `electron-builder` baixa o `winCodeSign`,
> que contém symlinks do macOS que o Windows só cria com o **Modo Desenvolvedor**
> ativo. A assinatura de código está desabilitada (`signAndEditExecutable: false`),
> e o build roda com `CSC_IDENTITY_AUTO_DISCOVERY=false`. O instalador sai em
> `release/Gerador de Orçamentos Setup <versão>.exe`.

## Arquitetura

- `src/main` — processo principal (Node): persistência, IPC, geração de documentos.
- `src/preload` — bridge segura (contextBridge) entre main e renderer.
- `src/shared` — código compartilhado: tipos e o **motor de cálculo** (`calculo/`).
- `src/renderer` — interface React (Tailwind).

Persistência local em **SQLite** (`userData/data/banco.db`), via `node-sqlite3-wasm` —
SQLite compilado em WebAssembly, sem nenhuma dependência nativa. Um `banco.json` de
versões anteriores é importado automaticamente na primeira execução e arquivado como
`banco.json.migrado-<timestamp>`. As fotos dos anexos ficam como BLOB no próprio banco.

O **DOCX** é montado diretamente em OOXML (biblioteca `docx`, em `src/shared/documento/docx.ts`),
espelhando as mesmas medidas do HTML que gera o PDF — por isso os dois saem iguais.

O **PDF e a prévia** compartilham um único motor de paginação
(`src/shared/documento/paginar.ts`): ele distribui o conteúdo em folhas A4
autocontidas antes de imprimir ou exibir, em vez de depender da fragmentação de
página do Chromium. A função é autocontida de propósito — o processo main a injeta
por `.toString()` na janela oculta do PDF, e o renderer a importa e chama sobre o
`contentDocument` do iframe da prévia. Por isso a prévia mostra exatamente a mesma
paginação do PDF gerado.

## IA local

O botão “Sugerir com IA” (anotação interna do orçamento) usa um modelo que roda **na
própria máquina**, sem internet. `npm run ia` baixa para `resources/ia/`:

- `llama-server.exe` + DLLs — build 10087 (`1f66c3ce1`) do llama.cpp para Windows x64;
- `qwen2.5-1.5b-instruct-q4_k_m.gguf` — modelo de ~1,1 GB, validado pelo SHA-256
  `6A1A2EB6D15622BF3C96857206351BA97E1AF16C30D7A74EE38970E434E9407E`.

Esses arquivos vão dentro do instalador (`extraResources`), então o `.exe` é
autossuficiente. O servidor sobe sob demanda e se encerra após 5 minutos ocioso.
Em _Configurações → IA local_ dá para trocar para um **Ollama** já instalado na
própria máquina (a URL é restrita a loopback) ou
desativar a sugestão. Sem os arquivos (ex.: `npm run dev` sem ter rodado `npm run ia`),
o app tenta o Ollama automaticamente.

## Status

**Versão 1.3.0** — proteção contra perda de edições, validação de saídas finais,
acessibilidade de diálogos e abas, histórico compacto sem consultas N+1, backup
otimizado, toolchain atualizado e pacote de IA reproduzível.

**Versão 1.2.2** — backup SQLite completo, histórico e tabelas responsivas,
padronização de ícones e datas, preservação de anexos e cobertura de regressão.

**Versão 1.1.0** — custos flexíveis no cálculo do serviço: alimentação,
combustível/deslocamento e estadia viraram listas (com descrição por item),
a estadia aceita aluguel de imóvel por valor mensal × meses, e o vínculo CLT
ficou independente da forma de pagamento (diária, valor fechado ou mensal),
com os encargos incidindo sobre o salário registrado na carteira.

**Versão 1.0.0** — primeira versão completa: cálculo de custo, histórico com busca,
anexos com fotos, anotação por IA local, exportação PDF/DOCX e instalador
autossuficiente.
