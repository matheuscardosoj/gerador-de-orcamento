; Mantém páginas nativas do Windows, com dimensionamento por DPI.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Gerador de Orçamentos"
  !define MUI_WELCOMEPAGE_TEXT "Instale o aplicativo para preparar propostas, relatórios e recibos da sua empresa.$\r$\n$\r$\nEsta atualização preserva os dados locais. Aguarde a conclusão antes de abrir o aplicativo.$\r$\n$\r$\nClique em Avançar para continuar."
  !insertmacro MUI_PAGE_WELCOME
!macroend
