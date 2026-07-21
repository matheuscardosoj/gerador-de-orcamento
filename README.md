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
| `npm run test` | Roda os testes do motor de cálculo (Vitest) |
| `npm run dist` | Gera o instalador `.exe` (Windows, via electron-builder) |

## Arquitetura

- `src/main` — processo principal (Node): persistência, IPC, geração de documentos.
- `src/preload` — bridge segura (contextBridge) entre main e renderer.
- `src/shared` — código compartilhado: tipos e o **motor de cálculo** (`calculo/`).
- `src/renderer` — interface React (Tailwind).

Persistência local em **arquivos JSON** no diretório de dados do usuário do app
(`app.getPath('userData')`), sem dependências nativas.

## Status

Em desenvolvimento — ver plano de fases no repositório.
