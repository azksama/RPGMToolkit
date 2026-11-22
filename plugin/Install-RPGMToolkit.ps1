[CmdletBinding()]
param(
    [string]$GamePath,
    [switch]$Uninstall,
    [switch]$Preview,
    [switch]$Yes
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2
$pluginName = 'RPGMToolkit'
$packagePlugin = Join-Path $PSScriptRoot 'RPGMToolkit.js'
$utf8 = New-Object System.Text.UTF8Encoding($false)
. (Join-Path $PSScriptRoot 'Read-PluginRegistry.ps1')

function Write-AtomicText([string]$Path, [string]$Content) {
    $temporary = $Path + '.rpgm-' + [Guid]::NewGuid().ToString('N') + '.tmp'
    try {
        [IO.File]::WriteAllText($temporary, $Content, $utf8)
        if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary, $Path, [NullString]::Value) }
        else { [IO.File]::Move($temporary, $Path) }
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

function Assert-LocalDirectory([string]$Path) {
    $entry = Get-Item -LiteralPath $Path
    if (-not $entry.PSIsContainer) { throw "Dossier attendu : $Path" }
    # Refuse junctions/symlinks along the destination to keep writes inside the game.
    while ($null -ne $entry) {
        if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "Chemin redirige (lien/jonction) non pris en charge : $($entry.FullName)" }
        $entry = $entry.Parent
    }
}

try {
    if (-not $GamePath) {
        Add-Type -AssemblyName System.Windows.Forms
        $picker = New-Object System.Windows.Forms.FolderBrowserDialog
        $picker.Description = 'Choisissez le dossier du jeu RPG Maker MV ou MZ (contenant js, ou www).'
        $picker.ShowNewFolderButton = $false
        if ($picker.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { Write-Host 'Operation annulee.'; exit 0 }
        $GamePath = $picker.SelectedPath
        $picker.Dispose()
    }
    $gameRoot = (Resolve-Path -LiteralPath $GamePath).ProviderPath
    if (-not (Test-Path -LiteralPath (Join-Path $gameRoot 'js/plugins.js') -PathType Leaf)) {
        $wwwRoot = Join-Path $gameRoot 'www'
        if (Test-Path -LiteralPath (Join-Path $wwwRoot 'js/plugins.js') -PathType Leaf) { $gameRoot = $wwwRoot }
        else { throw 'Aucun js/plugins.js trouve. Choisissez le dossier du jeu, pas son fichier .exe. Les archives non extraites ne sont pas prises en charge.' }
    }
    Assert-LocalDirectory $gameRoot
    Assert-LocalDirectory (Join-Path $gameRoot 'js')
    $pluginDirectory = Join-Path $gameRoot 'js/plugins'
    if (-not (Test-Path -LiteralPath $pluginDirectory -PathType Container)) { throw 'Dossier js/plugins absent. Installation abandonnee.' }
    Assert-LocalDirectory $pluginDirectory
    $engine = if (Test-Path -LiteralPath (Join-Path $gameRoot 'js/rmmz_core.js')) { 'MZ' } elseif (Test-Path -LiteralPath (Join-Path $gameRoot 'js/rpg_core.js')) { 'MV' } else { throw 'Moteur MV/MZ non reconnu (rpg_core.js ou rmmz_core.js absent).' }
    $listPath = Join-Path $gameRoot 'js/plugins.js'
    $installedPlugin = Join-Path $pluginDirectory 'RPGMToolkit.js'
    foreach ($targetFile in @($listPath, $installedPlugin)) {
        if ((Test-Path -LiteralPath $targetFile) -and (((Get-Item -LiteralPath $targetFile).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw "Fichier redirige non pris en charge : $targetFile" }
    }
    $originalBytes = [IO.File]::ReadAllBytes($listPath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $listHashBefore = [BitConverter]::ToString($sha.ComputeHash($originalBytes)).Replace('-', '') } finally { $sha.Dispose() }
    $originalText = [IO.File]::ReadAllText($listPath)
    $match = [regex]::Match($originalText, '(?s)\A(?<prefix>.*?\b(?:var|let|const)\s+\$plugins\s*=\s*)(?<json>\[.*\])(?<suffix>(?:\s|;|//[^\r\n]*(?:\r?\n|\z)|/\*.*?\*/)*)\z')
    if (-not $match.Success) { throw 'plugins.js utilise un format non standard. Installez manuellement via le gestionnaire de plugins ; aucun fichier modifie.' }
    try {
        $parsedEntries = ConvertFrom-PluginLiteral $match.Groups['json'].Value
        $entries = @($parsedEntries)
    } catch { throw "Liste de plugins illisible : $($_.Exception.Message). Aucun fichier modifie." }
    foreach ($entry in $entries) {
        if ($null -eq $entry -or -not $entry.PSObject.Properties['name'] -or $entry.name -isnot [string]) { throw 'Entree de plugin invalide. Aucun fichier modifie.' }
    }
    $existing = @($entries | Where-Object { $_.name -eq $pluginName })
    if ($existing.Count -gt 1) { throw 'Plusieurs entrees RPGMToolkit existent. Corrigez les doublons dans le gestionnaire de plugins.' }
    if ($Uninstall -and $existing.Count -eq 0 -and -not (Test-Path -LiteralPath $installedPlugin)) { Write-Host 'RPGMToolkit est deja desinstalle.'; exit 0 }
    if (-not $Uninstall -and -not (Test-Path -LiteralPath $packagePlugin -PathType Leaf)) { throw 'RPGMToolkit.js est absent du paquet. Extrayez le ZIP entier.' }
    $newEntries = @($entries | Where-Object { $_.name -ne $pluginName })
    if (-not $Uninstall) {
        if ($existing.Count -eq 1) {
            $entry = $existing[0]
            $entry | Add-Member -NotePropertyName status -NotePropertyValue $true -Force
        } else {
            $entry = [pscustomobject]@{ name = $pluginName; status = $true; description = 'RPGM Toolkit 1.11.0'; parameters = [pscustomobject]@{ Hotkey = 'F6'; ShowButton = 'true'; PlaytestOnly = 'false'; PageSize = '60' } }
        }
        $newEntries += $entry
    }
    $json = ConvertTo-Json -InputObject @($newEntries) -Depth 100
    $updatedText = $match.Groups['prefix'].Value + $json + $match.Groups['suffix'].Value
    $modeName = if ($Uninstall) { 'DESINSTALLATION' } else { 'INSTALLATION / MISE A JOUR' }
    Write-Host "`nRPGM Toolkit - $modeName"
    Write-Host "Moteur : $engine"
    Write-Host "Jeu : $gameRoot"
    Write-Host "Liste : $listPath"
    if ($Uninstall) { Write-Host '- Retirer uniquement l entree RPGMToolkit et son fichier JS.' }
    else { Write-Host '+ Copier RPGMToolkit.js et activer son entree en fin de liste.' }
    Write-Host 'Les autres plugins gardent leurs parametres et leur ordre relatif.'
    Write-Host 'La liste JSON sera reformatee. Les fichiers de donnees et sauvegardes ne sont pas modifies.'
    Write-Host 'Les fichiers touches seront sauvegardes dans RPGMToolkit-backups.'
    if ($Preview) { Write-Host "`nAPERCU SEULEMENT - aucun fichier modifie."; exit 0 }
    if (-not $Yes) {
        Write-Host "`nFermez le jeu et l editeur RPG Maker avant de continuer."
        $answer = Read-Host 'Appliquer ces changements ? Tapez OUI'
        if ($answer -cne 'OUI') { Write-Host 'Operation annulee.'; exit 0 }
    }
    if ((Get-FileHash -LiteralPath $listPath -Algorithm SHA256).Hash -ne $listHashBefore) { throw 'plugins.js a change depuis son analyse. Relancez l installation.' }
    $pluginExisted = Test-Path -LiteralPath $installedPlugin -PathType Leaf
    $backupParent = Join-Path $gameRoot 'RPGMToolkit-backups'
    if (Test-Path -LiteralPath $backupParent) { Assert-LocalDirectory $backupParent }
    $backupPath = Join-Path $backupParent ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
    [IO.File]::WriteAllBytes((Join-Path $backupPath 'plugins.js'), $originalBytes)
    if ($pluginExisted) { Copy-Item -LiteralPath $installedPlugin -Destination (Join-Path $backupPath 'RPGMToolkit.js') }
    $manifest = [pscustomobject]@{ action = $modeName; game = $gameRoot; date = (Get-Date).ToString('o'); previousPluginsSha256 = $listHashBefore; hadPluginFile = $pluginExisted }
    [IO.File]::WriteAllText((Join-Path $backupPath 'manifest.json'), (ConvertTo-Json $manifest), $utf8)
    if ((Get-FileHash -LiteralPath $listPath -Algorithm SHA256).Hash -ne $listHashBefore) { throw 'plugins.js a change pendant l operation. Installation abandonnee.' }
    try {
        if (-not $Uninstall) { Write-AtomicText $installedPlugin ([IO.File]::ReadAllText($packagePlugin)) }
        Write-AtomicText $listPath $updatedText
        if ($Uninstall -and $pluginExisted) { Remove-Item -LiteralPath $installedPlugin -Force }
        $verifiedText = [IO.File]::ReadAllText($listPath)
        if ($verifiedText -cne $updatedText) { throw 'La verification de plugins.js a echoue.' }
        if (-not $Uninstall -and (Get-FileHash -LiteralPath $installedPlugin).Hash -ne (Get-FileHash -LiteralPath $packagePlugin).Hash) { throw 'La verification du plugin a echoue.' }
    } catch {
        [IO.File]::WriteAllBytes($listPath, $originalBytes)
        if ($pluginExisted) { Copy-Item -LiteralPath (Join-Path $backupPath 'RPGMToolkit.js') -Destination $installedPlugin -Force }
        elseif (Test-Path -LiteralPath $installedPlugin) { Remove-Item -LiteralPath $installedPlugin -Force }
        throw
    }
    Write-Host "`nTermine. Copie de secours : $backupPath" -ForegroundColor Green
    if (-not $Uninstall) { Write-Host 'Lancez une partie, rejoignez la carte et appuyez sur F6 (ou cliquez Toolkit).' }
} catch {
    Write-Host "`nERREUR : $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
