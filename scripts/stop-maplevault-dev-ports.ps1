param(
  [int[]]$Ports = @(5000, 5001, 5173)
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ProjectRootLower = $ProjectRoot.ToLowerInvariant()

function Write-Step($Message) {
  Write-Host "[MapleVault] $Message" -ForegroundColor Cyan
}

function Get-ProcessCommandLine($ProcessId) {
  try {
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
    return $processInfo.CommandLine
  } catch {
    return $null
  }
}

function Test-IsMapleVaultProcess($CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) {
    return $false
  }

  return $CommandLine.ToLowerInvariant().Contains($ProjectRootLower)
}

$connections = foreach ($port in $Ports) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
}

$processIds = $connections |
  Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 } |
  Select-Object -ExpandProperty OwningProcess -Unique

if (-not $processIds) {
  Write-Step "Puertos de desarrollo libres."
  exit 0
}

$blockedByExternalProcess = $false

foreach ($processId in $processIds) {
  $commandLine = Get-ProcessCommandLine $processId
  if (-not (Test-IsMapleVaultProcess $commandLine)) {
    Write-Step "Puerto ocupado por proceso externo PID $processId. No se cierra automaticamente."
    $blockedByExternalProcess = $true
    continue
  }

  Write-Step "Cerrando proceso previo de MapleVault PID $processId..."
  Stop-Process -Id $processId -Force -ErrorAction Stop
  Wait-Process -Id $processId -Timeout 5 -ErrorAction SilentlyContinue
}

if ($blockedByExternalProcess) {
  Write-Host "[MapleVault] Cierra el proceso externo o cambia la configuracion de puertos antes de iniciar." -ForegroundColor Yellow
  exit 1
}

Write-Step "Limpieza de puertos finalizada."
exit 0
