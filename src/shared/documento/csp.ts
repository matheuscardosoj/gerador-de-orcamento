/**
 * CSP dos HTMLs de documento (prévia e PDF): só estilos embutidos e imagens em
 * data URL. Impede script e requisições externas mesmo que algum conteúdo
 * sincronizado escape do escape de HTML.
 */
export const META_CSP_DOCUMENTO =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">'
