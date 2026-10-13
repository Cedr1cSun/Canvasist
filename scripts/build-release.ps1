#Requires -Version 5.1
<#
.SYNOPSIS
    Builds a signed Canvasist release: the installer, its update signature and latest.json.

.DESCRIPTION
    Uses the key created by setup-update-signing.ps1. The key's password is
    decrypted with DPAPI inside this process and passed to the Tauri CLI in an
    environment variable; it is never printed or written anywhere. Nothing is
    uploaded: publish the installer and latest.json to the GitHub release
    v<version> afterwards. Every release must include latest.json, because
    installed copies look for it in the latest release.

        powershell -ExecutionPolicy Bypass -File scripts\build-release.ps1 -Notes "What changed"

.PARAMETER Notes
    Release notes stored in latest.json.

.PARAMETER Repository
    GitHub repository ("owner/name") the installer will be downloaded from.

.PARAMETER SecretsDir
    Folder holding updater.key, updater.key.pub and updater.key.password.

.PARAMETER ExtraConfig
    Additional Tauri configuration file merged over tauri.conf.json, e.g. for
    a test build under another product name.

.PARAMETER AllowDirty
    Build even if the working tree has uncommitted changes (test builds only).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Notes,
    [string]$Repository = 'ImmortalKilan/Canvasist',
    [string]$SecretsDir,
    [string]$ExtraConfig,
    [switch]$AllowDirty
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
if (-not $SecretsDir) { $SecretsDir = Join-Path $root '.secrets' }
$key = Join-Path $SecretsDir 'updater.key'
$publicKey = "$key.pub"
$passwordFile = "$key.password"
$bundleDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'
$utf8 = New-Object Text.UTF8Encoding $false

function Read-Json([string]$path) {
    [IO.File]::ReadAllText($path, $utf8) | ConvertFrom-Json
}

function Get-Field($object, [string[]]$path) {
    foreach ($name in $path) {
        if ($null -eq $object -or -not ($object.PSObject.Properties.Name -contains $name)) { return $null }
        $object = $object.$name
    }
    $object
}

Push-Location $root
try {
    foreach ($file in $key, $publicKey, $passwordFile) {
        if (-not (Test-Path $file)) { throw "Missing $file. Run scripts\setup-update-signing.ps1 first." }
    }
    if (-not $AllowDirty -and (& git status --porcelain)) {
        throw 'The working tree has uncommitted changes. Commit them first so the release matches a commit.'
    }

    # The effective configuration: tauri.conf.json, then the extra file on top.
    $config = Read-Json 'src-tauri\tauri.conf.json'
    $extra = if ($ExtraConfig) { Read-Json $ExtraConfig } else { $null }
    $productName = (Get-Field $extra 'productName'), $config.productName | Where-Object { $_ } | Select-Object -First 1
    $version = (Get-Field $extra 'version'), $config.version | Where-Object { $_ } | Select-Object -First 1
    $trustedKey = (Get-Field $extra 'plugins', 'updater', 'pubkey'), $config.plugins.updater.pubkey |
        Where-Object { $_ } | Select-Object -First 1

    if (-not $ExtraConfig) {
        $package = Read-Json 'package.json'
        $cargo = Select-String -Path 'src-tauri\Cargo.toml' -Pattern '^version = "(.+)"' | Select-Object -First 1
        if ($package.version -ne $version -or $cargo.Matches[0].Groups[1].Value -ne $version) {
            throw "Version mismatch: tauri.conf.json $version, package.json $($package.version), Cargo.toml $($cargo.Matches[0].Groups[1].Value)."
        }
    }
    if ($trustedKey -ne ([IO.File]::ReadAllText($publicKey, $utf8).Trim())) {
        throw 'plugins.updater.pubkey does not match the signing key, so installed copies would reject this release.'
    }

    # Signing is switched on only here, so contributors can build without the key.
    $signingConfig = Join-Path $root 'src-tauri\target\release-signing.conf.json'
    New-Item -ItemType Directory -Force -Path (Split-Path $signingConfig) | Out-Null
    [IO.File]::WriteAllText($signingConfig, '{"bundle":{"createUpdaterArtifacts":true}}', $utf8)
    $configArgs = @('--config', $signingConfig)
    if ($ExtraConfig) { $configArgs += @('--config', (Resolve-Path $ExtraConfig).Path) }

    $secure = Get-Content -Path $passwordFile | ConvertTo-SecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
        $env:TAURI_SIGNING_PRIVATE_KEY = [IO.File]::ReadAllText($key, $utf8).Trim()
        & npx --no-install tauri build @configArgs
        if ($LASTEXITCODE -ne 0) { throw "tauri build failed with exit code $LASTEXITCODE." }
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD, Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    }

    $installerName = "${productName}_${version}_x64-setup.exe"
    $installer = Join-Path $bundleDir $installerName
    $signatureFile = "$installer.sig"
    if (-not (Test-Path $installer) -or -not (Test-Path $signatureFile)) {
        throw "The build did not produce $installerName and its signature."
    }
    $signature = [IO.File]::ReadAllText($signatureFile, $utf8).Trim()

    # requireSignedVersion: the signature must name the version announced below.
    $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($signature))
    $trusted = ($decoded -split "`n" | Where-Object { $_ -like 'trusted comment:*' } | Select-Object -First 1)
    if (-not $trusted -or @($trusted -split "`t" | Where-Object { $_.Trim() -eq "version:$version" }).Count -ne 1) {
        throw "The signature is not bound to version $version."
    }

    $manifest = [ordered]@{
        version   = $version
        notes     = $Notes
        pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
        platforms = [ordered]@{
            'windows-x86_64' = [ordered]@{
                signature = $signature
                url       = "https://github.com/$Repository/releases/download/v$version/$installerName"
            }
        }
    }
    $latest = Join-Path $bundleDir 'latest.json'
    # No byte order mark: the updater parses the file as plain UTF-8 JSON.
    [IO.File]::WriteAllText($latest, ($manifest | ConvertTo-Json -Depth 5), $utf8)

    Write-Host ''
    Write-Host "Signed release $version is ready:" -ForegroundColor Green
    Write-Host "  $installer"
    Write-Host "  $latest"
    Write-Host "  SHA-256 $((Get-FileHash -Algorithm SHA256 $installer).Hash.ToLowerInvariant())"
}
finally {
    Pop-Location
}
