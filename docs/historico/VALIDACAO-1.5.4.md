# Candidato 1.5.4 — ciclo dos avisos de recuperação

## Revisão após auditoria

**O instalador original desta página foi superado.** Usar o pacote em
`release/candidato-1.5.4-revisado`. A auditoria encontrou riscos adicionais de repetição,
que foram corrigidos e cobertos por testes. Ver [auditoria completa](AUDITORIA-RECUPERACAO-1.5.4.md).

As evidências e o hash abaixo descrevem somente o pacote original, preservado para rastreabilidade.

## Problema reproduzido

Na 1.5.3, o monitor marcava que já havia avisado a conclusão, mas verificava primeiro
se outra sincronização estava em andamento. Como o indicador de interrupção continuava
ativo, o próximo ciclo periódico publicava novamente o cartão de retomada. Atualizações
do status republicavam esse cartão mesmo depois de fechado. O rodapé podia estar
corretamente sincronizado enquanto o cartão permanecia antigo.

## Correção

O monitor acompanha transições explícitas: normal, indisponível e retomando. Ao concluir,
retorna ao estado normal e não publica retomada em sincronizações posteriores. O cartão
intermediário é publicado uma vez por transição; dispensá-lo não o recria por atualizações
do mesmo estado. Uma nova indisponibilidade inicia outro ciclo. Falhas permanentes encerram
o ciclo sem anunciar sucesso.

A fila, os controles de edição e a recuperação rápida não foram alterados. Ensaios com
perfis sintéticos; nenhuma alteração no Supabase nem nos dados da VS.

## Validação

- Testes do ciclo: conclusão seguida de vinte sincronizações; retomada dispensada;
  novo ciclo após nova queda; falha permanente sem sucesso.
- Ensaio Electron/Playwright: cartão de retomada fechado, oito atualizações sem retorno;
  conclusão seguida de sincronizações alternadas sem regressão; estilos, modal, teclado
  e larguras compacta/ampla preservados. Script `scripts/legado/verificar-1-5-4-interface.mjs`.
- `npm run check` aprovado: lint, formatação, TypeScript, **388 testes em 70 arquivos**
  e build.
- Ensaio de interface aprovado sem erros JavaScript. Evidências em
  `output/playwright/1-5-4-cadastros/resultado.json` e `conclusao-sem-regressao.png`.
- Executável empacotado abriu com perfil isolado, versão 1.5.4, sem erros de interface.
- Os cinco arquivos do build correspondem byte a byte ao ASAR final. Evidências em
  `release/candidato-1.5.4/abertura-1.5.4.json` e `integridade-1.5.4.json`.

## Instalador

`release/candidato-1.5.4/Gerador de Orçamentos Setup 1.5.4.exe`

- Tamanho: **1.222.564.055 bytes**.
- SHA-256: `72D80A0C6CAD170982AAD8B8F99EADA54A853837A64B9F7AA4C3D656E821A092`.
- Instaladores anteriores preservados; sem cópia para N.

## Resultado real anterior e confirmação necessária

1.5.3: aviso único, relatório e recibo passaram. Reconhecimento em oito segundos e
sincronização informada em três segundos. O ciclo visual falhou e motivou esta versão.
O teste de queda durante aplicação continua não confirmado.

Na 1.5.4, repetir apenas desconectar/reconectar e aguardar um minuto após a conclusão:
o cartão não pode voltar para retomada. Em outra queda, fechar a retomada e confirmar
que não reaparece sozinho; a conclusão pode ser anunciada quando efetivamente confirmada.
A nova versão permanece candidata até essa confirmação real.
