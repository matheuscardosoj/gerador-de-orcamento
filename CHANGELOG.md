# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

## 1.3.0 — 2026-08-29

### Adicionado

- Proteção contra perda de alterações ao navegar ou fechar a janela.
- Validação compartilhada de documentos finais, parâmetros financeiros e URL local do Ollama.
- Estados explícitos de salvamento, erro de carga e operações concorrentes.
- Resumos compactos para os históricos de orçamentos e relatórios.
- ESLint, Prettier, EditorConfig e comando único `npm run check`.

### Alterado

- “Margem de lucro” passou a “acréscimo sobre o custo”, preservando a fórmula e os dados antigos.
- “Multa/rescisão” passou a “provisão rescisória estimada”, com aviso de conferência contábil.
- Modais, abas, campos, cabeçalhos e tabelas receberam melhorias de acessibilidade e responsividade.
- Listagens e mesclagem de backups deixaram de repetir consultas por registro.
- Electron, electron-builder, electron-vite, Vite, plugin React e Vitest foram atualizados.
- Runtime da IA fixado no llama.cpp build 10087 (`1f66c3ce1`) e modelo validado por SHA-256.

### Segurança

- URL do Ollama restrita a `localhost`, `127.0.0.1` ou `::1` via HTTP.
- Auditorias de dependências de produção e desenvolvimento sem vulnerabilidades conhecidas.

## 1.2.2 — 2026-08-29

- Backup SQLite completo com restauração e mesclagem.
- Histórico, ícones, datas, anexos e tabelas responsivas padronizados.
- Proteção de BLOBs e testes adicionais de persistência.
