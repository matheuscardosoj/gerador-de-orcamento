import { mkdirSync, writeFileSync } from 'node:fs'

const url = process.env.GERADOR_SERVICO_URL?.replace(/\/$/, '')
const chavePublica = process.env.GERADOR_SERVICO_CHAVE
if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) {
  throw new Error('Informe GERADOR_SERVICO_URL com a URL HTTPS do projeto validado.')
}
if (!chavePublica || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(chavePublica)) {
  throw new Error('Informe somente a chave pública publishable em GERADOR_SERVICO_CHAVE.')
}
mkdirSync('resources', { recursive: true })
writeFileSync('resources/servico.json', JSON.stringify({ url, chavePublica, email: '' }, null, 2))
console.log('Configuração pública preparada. Nenhuma credencial administrativa incluída.')
