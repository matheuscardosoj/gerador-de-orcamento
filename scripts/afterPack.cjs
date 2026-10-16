// Aplica o ícone (build/icon.ico) ao executável empacotado.
// Necessário porque signAndEditExecutable=false (usado para evitar o winCodeSign)
// também desativa a edição de recursos do .exe pelo electron-builder.
const path = require('path')
const fs = require('fs')
const { rcedit } = require('rcedit')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const exeName = `${context.packager.appInfo.productFilename}.exe`
  const exePath = path.join(context.appOutDir, exeName)
  const icon = path.join(__dirname, '..', 'build', 'icon.ico')
  if (!fs.existsSync(icon)) {
    console.warn('[afterPack] build/icon.ico não encontrado; ícone não aplicado.')
    return
  }
  await rcedit(exePath, {
    icon,
    'version-string': {
      FileDescription: context.packager.appInfo.productName,
      ProductName: context.packager.appInfo.productName,
      OriginalFilename: exeName,
      InternalName: context.packager.appInfo.productFilename,
      ProductVersion: context.packager.appInfo.version
    },
    'file-version': context.packager.appInfo.version.split('-')[0],
    'product-version': context.packager.appInfo.version.split('-')[0]
  })
  console.log(`[afterPack] ícone aplicado a ${exeName}`)
}
