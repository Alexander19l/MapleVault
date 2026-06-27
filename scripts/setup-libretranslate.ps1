param(
  [string]$DataDir = "",
  [switch]$NonInteractive
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$ResolvedDataDir = if ([string]::IsNullOrWhiteSpace($DataDir)) {
  Join-Path $ProjectRoot "app\data"
} else {
  [System.IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($DataDir))
}

$DataDir = $ResolvedDataDir
$RuntimeDir = Join-Path $DataDir "libretranslate"
$VenvDir = Join-Path $RuntimeDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$ArgosPm = Join-Path $VenvDir "Scripts\argospm.exe"
$LibreTranslateCli = Join-Path $VenvDir "Scripts\libretranslate.exe"

function Write-Step($Message) {
  Write-Host "[LibreTranslate] $Message" -ForegroundColor Cyan
}

function Test-RealPythonCommand($Command, [string[]]$ArgsPrefix = @()) {
  $cmdInfo = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $cmdInfo) {
    return $null
  }

  if ($cmdInfo.Source -like "*\Microsoft\WindowsApps\python.exe") {
    return $null
  }

  try {
    $versionOutput = & $Command @ArgsPrefix --version 2>&1
    if ($LASTEXITCODE -eq 0 -and "$versionOutput" -match "Python 3") {
      return @{
        Command = $Command
        ArgsPrefix = $ArgsPrefix
        Version = "$versionOutput"
      }
    }
  } catch {
    return $null
  }

  return $null
}

function Get-RealPython {
  $py = Test-RealPythonCommand "py" @("-3")
  if ($py) { return $py }

  $python = Test-RealPythonCommand "python"
  if ($python) { return $python }

  return $null
}

function Invoke-Python($Python, [string[]]$Arguments) {
  & $Python.Command @($Python.ArgsPrefix + $Arguments)
  if ($LASTEXITCODE -ne 0) {
    throw "Python command failed: $($Python.Command) $($Arguments -join ' ')"
  }
}

Write-Step "Preparando entorno local en $RuntimeDir"
New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null

$Python = Get-RealPython
if (-not $Python) {
  Write-Step "No se encontro una instalacion real de Python 3. Intentando instalar Python 3.11 con winget..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "No se encontro Python real ni winget. Instala Python 3.11 o superior y vuelve a ejecutar este script."
  }

  $WingetArguments = @(
    "install",
    "--id", "Python.Python.3.11",
    "-e",
    "--scope", "user",
    "--accept-package-agreements",
    "--accept-source-agreements"
  )
  if ($NonInteractive) {
    $WingetArguments += "--silent"
  }

  & winget @WingetArguments
  if ($LASTEXITCODE -ne 0) {
    throw "winget no pudo instalar Python 3.11."
  }

  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
  $Python = Get-RealPython
}

if (-not $Python) {
  throw "Python sigue sin estar disponible. Deshabilita el alias de Microsoft Store o instala Python manualmente."
}

Write-Step "Usando $($Python.Command) $($Python.ArgsPrefix -join ' ') ($($Python.Version))"

if (-not (Test-Path $VenvPython)) {
  Write-Step "Creando entorno virtual local..."
  Invoke-Python $Python @("-m", "venv", $VenvDir)
}

Write-Step "Actualizando pip..."
& $VenvPython -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo actualizar pip en el entorno local."
}

Write-Step "Instalando LibreTranslate. Esto puede tardar varios minutos la primera vez..."
& $VenvPython -m pip install --upgrade libretranslate
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo instalar LibreTranslate en el entorno local."
}

Write-Step "Verificando modulo instalado..."
& $VenvPython -c "import libretranslate; print('LibreTranslate instalado correctamente')"
if ($LASTEXITCODE -ne 0) {
  throw "LibreTranslate no pudo importarse desde el entorno local."
}

if (-not (Test-Path $ArgosPm)) {
  throw "argospm no esta disponible en el entorno local. Revisa la instalacion de LibreTranslate."
}

Write-Step "Actualizando indice de modelos de traduccion..."
& $ArgosPm update
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo actualizar el indice de modelos de Argos Translate."
}

$RequiredPackages = @("translate-en_es")
$InstalledPackages = @(& $ArgosPm list)
foreach ($PackageName in $RequiredPackages) {
  if ($InstalledPackages -contains $PackageName) {
    Write-Step "Modelo $PackageName ya instalado."
    continue
  }

  Write-Step "Instalando modelo $PackageName..."
  & $ArgosPm install $PackageName
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo instalar el modelo $PackageName."
  }
}

Write-Host ""
Write-Host "[OK] LibreTranslate quedo preparado para MapleVault." -ForegroundColor Green
Write-Host "Ruta usada por MapleVault: $LibreTranslateCli"
Write-Host "Modelo instalado para sinopsis en espanol: translate-en_es"
Write-Host "Al abrir MapleVault, el backend iniciara LibreTranslate automaticamente en http://localhost:5001."
