# Gerador de Orçamentos — VS Prestadora de Serviços

Aplicação **desktop** (Electron + React + TypeScript) para calcular o custo de serviços,
aplicar margem de lucro e gerar orçamentos no layout da VS Prestadora, exportando **PDF** e **DOCX**.

## Requisitos

- Node.js 20+ (testado com Node 24)

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Roda em modo desenvolvimento (HMR) |
| `npm run build` | Compila main + preload + renderer para `out/` |
| `npm run start` | Compila e abre o app empacotado (preview) |
| `npm run test` | Roda os testes (motor de cálculo, banco e geração de DOCX) |
| `npm run ia` | Baixa o runtime de IA local para `resources/ia/` (~1,2 GB) |
| `npm run dist` | Gera o instalador `.exe` (roda o `npm run ia` antes, via `predist`) |

> **Build do instalador no Windows:** o `electron-builder` baixa o `winCodeSign`,
> que contém symlinks do macOS que o Windows só cria com o **Modo Desenvolvedor**
> ativo. A assinatura de código está desabilitada (`signAndEditExecutable: false`),
> e o build roda com `CSC_IDENTITY_AUTO_DISCOVERY=false`. O instalador sai em
> `release/Gerador de Orçamentos VS Setup <versão>.exe`.

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

## IA local

O botão “Sugerir com IA” (anotação interna do orçamento) usa um modelo que roda **na
própria máquina**, sem internet. `npm run ia` baixa para `resources/ia/`:

- `llama-server.exe` + DLLs — build oficial de CPU do llama.cpp para Windows x64;
- `qwen2.5-1.5b-instruct-q4_k_m.gguf` — modelo de ~1,1 GB.

Esses arquivos vão dentro do instalador (`extraResources`), então o `.exe` é
autossuficiente. O servidor sobe sob demanda e se encerra após 5 minutos ocioso.
Em *Configurações → IA local* dá para trocar para um **Ollama** já instalado ou
desativar a sugestão. Sem os arquivos (ex.: `npm run dev` sem ter rodado `npm run ia`),
o app tenta o Ollama automaticamente.

## Status

Em desenvolvimento — ver plano de fases no repositório.
