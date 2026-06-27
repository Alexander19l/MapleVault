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
$VisualCppDownloadUrl = "https://aka.ms/vc14/vc_redist.x64.exe"
$script:VisualCppRestartRequired = $false

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

function Test-VisualCppRuntime {
  $registryPaths = @(
    "HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"
  )

  foreach ($registryPath in $registryPaths) {
    try {
      $runtime = Get-ItemProperty -Path $registryPath -ErrorAction Stop
      if ($runtime.Installed -eq 1 -and $runtime.Major -ge 14) {
        return $true
      }
    } catch {
      # Continue with the file check for minimal or damaged registry installations.
    }
  }

  $requiredFiles = @(
    (Join-Path $env:SystemRoot "System32\vcruntime140.dll"),
    (Join-Path $env:SystemRoot "System32\vcruntime140_1.dll"),
    (Join-Path $env:SystemRoot "System32\msvcp140.dll")
  )
  return -not ($requiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) })
}

function Install-VisualCppRuntime([switch]$Repair) {
  $downloadDirectory = Join-Path $RuntimeDir ".downloads"
  $installerPath = Join-Path $downloadDirectory "vc_redist.x64.exe"

  Write-Step "Descargando Microsoft Visual C++ Runtime x64 desde el sitio oficial..."
  New-Item -ItemType Directory -Force -Path $downloadDirectory | Out-Null

  try {
    $previousSecurityProtocol = [Net.ServicePointManager]::SecurityProtocol
    $previousProgressPreference = $ProgressPreference
    try {
      [Net.ServicePointManager]::SecurityProtocol = $previousSecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
      $ProgressPreference = "SilentlyContinue"
      Invoke-WebRequest -Uri $VisualCppDownloadUrl -OutFile $installerPath -UseBasicParsing
    } finally {
      [Net.ServicePointManager]::SecurityProtocol = $previousSecurityProtocol
      $ProgressPreference = $previousProgressPreference
    }

    $signature = Get-AuthenticodeSignature -FilePath $installerPath
    $isMicrosoftSignature = $signature.Status -eq "Valid" -and
      $signature.SignerCertificate -and
      $signature.SignerCertificate.Subject -match "Microsoft Corporation"
    if (-not $isMicrosoftSignature) {
      throw "La firma digital del instalador de Visual C++ no es valida o no pertenece a Microsoft."
    }

    $installAction = if ($Repair) { "/repair" } else { "/install" }
    $actionLabel = if ($Repair) { "Reparando" } else { "Instalando" }
    Write-Step "$actionLabel Microsoft Visual C++ Runtime x64. Windows puede solicitar confirmacion..."
    $installer = Start-Process -FilePath $installerPath `
      -ArgumentList @($installAction, "/quiet", "/norestart") `
      -Wait `
      -PassThru

    if ($installer.ExitCode -eq 3010) {
      $script:VisualCppRestartRequired = $true
    } elseif ($installer.ExitCode -notin @(0, 1638)) {
      throw "El instalador de Visual C++ termino con codigo $($installer.ExitCode)."
    }
  } finally {
    Remove-Item -LiteralPath $installerPath -Force -ErrorAction SilentlyContinue
  }
}

function Test-CTranslate2Import {
  $output = @(& $VenvPython -c "import ctranslate2; print(ctranslate2.__version__)" 2>&1)
  return @{
    Success = $LASTEXITCODE -eq 0
    Output = ($output -join [Environment]::NewLine)
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

if (-not (Test-VisualCppRuntime)) {
  Write-Step "Falta una dependencia nativa requerida por CTranslate2."
  Install-VisualCppRuntime
}

Write-Step "Instalando LibreTranslate. Esto puede tardar varios minutos la primera vez..."
& $VenvPython -m pip install --upgrade libretranslate
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo instalar LibreTranslate en el entorno local."
}

Write-Step "Normalizando dependencias HTTP compatibles..."
& $VenvPython -m pip install --upgrade "chardet>=3.0.2,<6"
if ($LASTEXITCODE -ne 0) {
  throw "No se pudo preparar una version compatible de chardet."
}

& $VenvPython -m pip check
if ($LASTEXITCODE -ne 0) {
  throw "El entorno de LibreTranslate contiene dependencias incompatibles."
}

$CTranslate2Check = Test-CTranslate2Import
if (-not $CTranslate2Check.Success) {
  Write-Step "CTranslate2 no pudo cargar sus dependencias nativas. Reparando Visual C++ Runtime..."
  Install-VisualCppRuntime -Repair
  $CTranslate2Check = Test-CTranslate2Import
}

if (-not $CTranslate2Check.Success) {
  $restartHint = if ($script:VisualCppRestartRequired) {
    " Reinicia Windows y vuelve a intentar la instalacion desde Ajustes."
  } else {
    ""
  }
  throw "CTranslate2 no pudo importarse despues de instalar Microsoft Visual C++ Runtime.$restartHint Detalle: $($CTranslate2Check.Output)"
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
