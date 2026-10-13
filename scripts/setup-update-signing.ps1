#Requires -Version 5.1
<#
.SYNOPSIS
    One-time setup of the key that signs Canvasist updates.

.DESCRIPTION
    Run this yourself, in a terminal you opened (not through an assistant or CI):

        powershell -ExecutionPolicy Bypass -File scripts\setup-update-signing.ps1

    1. Restricts .secrets\ (ignored by git) to your Windows account.
    2. Generates the update signing key pair with the Tauri CLI. The CLI asks
       for the key's password itself, so it never appears on a command line.
    3. Asks for the same password once more, signs a test file with it to prove
       that it matches, and stores it encrypted with Windows DPAPI. Only your
       Windows account can decrypt it; build-release.ps1 uses it to sign
       releases without asking.

    The public key is printed at the end. It goes into tauri.conf.json
    (plugins.updater.pubkey) and is safe to publish.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path $root '.secrets'
$key = Join-Path $secrets 'updater.key'
$publicKey = "$key.pub"
$passwordFile = "$key.password"
$minPasswordLength = 12

function ConvertTo-PlainText([securestring]$secure) {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# Signs a scratch file with the key and the given password; true when the password is right.
function Test-Password([securestring]$secure) {
    $scratch = Join-Path ([IO.Path]::GetTempPath()) ("canvasist-sign-test-" + [guid]::NewGuid() + ".txt")
    Set-Content -Path $scratch -Value 'Canvasist signing test' -Encoding ascii
    # Windows PowerShell turns redirected stderr into errors, which 'Stop' would make fatal.
    $ErrorActionPreference = 'Continue'
    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ConvertTo-PlainText $secure
    try {
        & npx --no-install tauri signer sign -f $key $scratch *> $null
        return $LASTEXITCODE -eq 0
    }
    finally {
        Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
        Remove-Item $scratch, "$scratch.sig" -ErrorAction SilentlyContinue
    }
}

Push-Location $root
try {
    if (Test-Path $key) {
        throw "A signing key already exists at $key. Replacing it means installed copies of Canvasist stop accepting updates, so this script never overwrites it."
    }
    & git check-ignore -q -- '.secrets/updater.key'
    if ($LASTEXITCODE -ne 0) { throw '.secrets/ is not ignored by git. Fix .gitignore before creating a key.' }

    New-Item -ItemType Directory -Force -Path $secrets | Out-Null
    # Secondary drives often let every local account read files; keep only this one.
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls $secrets /inheritance:r /grant:r "*${sid}:(OI)(CI)F" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict access to .secrets.' }

    Write-Host ''
    Write-Host "Step 1 of 2: choose a password for the signing key (at least $minPasswordLength characters)."
    Write-Host 'The Tauri CLI asks for it now. Nothing is shown while you type.'
    & npx --no-install tauri signer generate -w $key
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $key) -or -not (Test-Path $publicKey)) {
        throw 'Key generation failed.'
    }

    Write-Host ''
    Write-Host 'Step 2 of 2: enter the same password again so release builds can use it.'
    $saved = $false
    for ($attempt = 1; $attempt -le 3 -and -not $saved; $attempt++) {
        $secure = Read-Host -AsSecureString 'Signing key password'
        if ($secure.Length -lt $minPasswordLength) {
            Write-Warning "Use at least $minPasswordLength characters."
            continue
        }
        if (-not (Test-Password $secure)) {
            Write-Warning 'That password does not open the key.'
            continue
        }
        # Without -Key, ConvertFrom-SecureString encrypts with DPAPI for the current user.
        $secure | ConvertFrom-SecureString | Set-Content -Path $passwordFile -Encoding ascii
        $saved = $true
    }
    if (-not $saved) {
        # Nothing depends on the new key yet, so start over cleanly.
        Remove-Item $key, $publicKey, $passwordFile -ErrorAction SilentlyContinue
        throw "No password was stored and the new key was deleted. Run the script again (passwords need at least $minPasswordLength characters)."
    }

    Write-Host ''
    Write-Host 'Done.' -ForegroundColor Green
    Write-Host "  Private key (password-protected):        $key"
    Write-Host "  Password (DPAPI, this Windows account):  $passwordFile"
    Write-Host "  Public key (goes into tauri.conf.json):  $publicKey"
    Write-Host ''
    Write-Host 'Back up now, in two separate places:' -ForegroundColor Yellow
    Write-Host "  1. the file $key (for example on an encrypted USB drive)"
    Write-Host '  2. the password (for example in a password manager)'
    Write-Host 'The stored password file only works for this Windows account, so it is not a backup.'
    Write-Host 'Never share the private key or the password with anyone, including in a chat.'
}
finally {
    Pop-Location
}
