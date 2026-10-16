# Validação da versão 1.5.0

Data: 16/10/2026

Branch de preparação: `claude`
Versão: `1.5.0`

## Seletor de opções

- Os campos continuam usando `<select>` e `<option>` nativos.
- O popup agora segue o tema dos campos do app: tipografia, borda slate, cantos arredondados, realce teal, foco visível e sombra.
- A lista tem altura máxima de 320 px (ou 60% da janela, quando menor) e rola para opções adicionais.
- Verificação Playwright com 40 opções extras: `node scripts/verificar-rc20-calculo.mjs` passou; orçamento e relatório mantiveram o fluxo e não produziram erros de renderer.
- Captura do popup longo: `output/playwright/rc20-calculo/select-opcoes-com-rolagem.png`.

## Aplicativo e cálculos

- `npm run check`: aprovado — lint, formatação, TypeScript, 359 testes em 66 arquivos e build de produção.
- `node scripts/verificar-rc20-calculo.mjs`: aprovado em orçamento e relatório, incluindo valores de itens, impostos, metas, prévia e exportações simuladas de PDF e Word.
- `node scripts/verificar-rc20-pacote.mjs`: executável final abriu com perfil isolado, informou `1.5.0` e não registrou erros de renderer.
- `npm run dist`: gerou o instalador Windows x64.

## Banco Supabase

Backup completo anterior às alterações:

- `output/backups/supabase-pre-final-changes-20261016-004456.dump`
- SHA-256: `6CFFCBE655E60161587C5FD7F2FA8A2C74BFD0B8B0C415C36BA058BDC0ADEFA4`
- O catálogo do dump foi lido com `pg_restore`; os esquemas `auth`, `public` e `sincronizacao` foram restaurados em uma instância PostgreSQL local isolada. A exclusão de usuários e a renumeração foram ensaiadas nessa cópia e revertidas.

Alterações e conferências remotas:

- Usuários Auth: removidas 3 contas; mantida somente `matheuscardosoj@outlook.com`. Antes da exclusão, elas tinham zero sessões, associações com empresas, convites, dispositivos, edições ou objetos de Storage.
- Orçamentos: números ativos 1–20; relatórios: 1–5; recibos: 1. Já estavam consecutivos, então não foram alterados.
- Históricos: 20 orçamentos, 5 relatórios e 1 recibo; todas as sequências começam em v1. Não foram reescritas.
- Cadastros: 13 clientes agora exibem códigos 1–13; 4 serviços exibem 1–4. Um código de cliente e um de serviço continuam reservados para cadastros excluídos, no fim de cada sequência interna, para impedir reutilização em sincronizações atrasadas.
- Não foram aplicadas migrações nem alterados documentos, pagamentos ou empresa.

## Instalador final

- Local: `release/Gerador de Orçamentos Setup 1.5.0.exe`
- Compartilhamento de N: `F:\Users\Public\Downloads\Gerador de Orçamentos Setup 1.5.0 final 20261016.exe`
- Tamanho em ambos: `1.222.560.095 bytes`
- SHA-256 em ambos: `4F807D60A63142696DE7B29CDBFAC1340EC621F466723B493A75309DB8598618`

O pacote foi aberto automaticamente em perfil isolado. A instalação e o uso em D-MATHEUS e N-MATHEUS ainda dependem da verificação manual do usuário.
