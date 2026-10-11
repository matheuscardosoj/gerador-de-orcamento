import { app, clipboard } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'

/** O aplicativo inclui o mesmo script de instalação usado nos testes PostgreSQL. */
export function copiarInstalacaoNuvem(): void {
  const pasta = app.isPackaged
    ? join(process.resourcesPath, 'supabase')
    : join(app.getAppPath(), 'supabase')
  clipboard.writeText(readFileSync(join(pasta, 'schema.sql'), 'utf8'))
}
