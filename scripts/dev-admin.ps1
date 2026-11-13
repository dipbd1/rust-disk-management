param(
    [string]$Node = $env:npm_node_execpath,
    [string]$Npm = $env:npm_execpath,
    [string]$Project = (Get-Location).Path,
    [switch]$Takeover
)

$ErrorActionPreference = "Stop"

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-PortBusy([int]$Port) {
    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        return $false
    } catch {
        return $true
    } finally {
        if ($listener) { $listener.Stop() }
    }
}

if (-not (Test-Admin)) {
    if (-not $Node -or -not $Npm) {
        Write-Error "Run this as npm run dev:admin so node and npm can be passed to the elevated session."
        exit 1
    }
    if (-not $Takeover -and (Test-PortBusy 1420)) {
        Write-Error "Port 1420 is already in use. Stop the other npm run tauri dev, then run npm run dev:admin."
        exit 1
    }
    $argList = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Node `"$Node`" -Npm `"$Npm`" -Project `"$Project`""
    if ($Takeover) { $argList += " -Takeover" }
    try {
        Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList $argList | Out-Null
    } catch {
        exit 1
    }
    exit 0
}

Set-Location -LiteralPath $Project
if ($Takeover) {
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline -and (Test-PortBusy 1420)) {
        Start-Sleep -Seconds 1
    }
}
if (Test-PortBusy 1420) {
    Write-Host "Port 1420 is already in use. Stop the other npm run tauri dev, then run npm run dev:admin."
    Read-Host "Press Enter to close"
    exit 1
}
if (-not $Node -or -not (Test-Path -LiteralPath $Node)) {
    $Node = (Get-Command node.exe -ErrorAction Stop).Source
}
if (-not $Npm -or -not (Test-Path -LiteralPath $Npm)) {
    $Npm = (Get-Command npm.cmd -ErrorAction Stop).Source
}

if ($Npm -like "*.js") {
    & $Node $Npm run tauri dev
} else {
    & $Npm run tauri dev
}
exit $LASTEXITCODE
