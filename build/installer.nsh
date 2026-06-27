!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

Var InstallLibreTranslate
Var LibreTranslateCheckbox
Var ResetMapleVaultData
Var ResetMapleVaultDataCheckbox

!macro customInit
  StrCpy $InstallLibreTranslate ${BST_UNCHECKED}
  StrCpy $ResetMapleVaultData ${BST_UNCHECKED}
!macroend

Function LibreTranslatePageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 20u "Dependencias y traduccion opcional"
  Pop $0
  CreateFont $1 "$(^Font)" "11" "700"
  SendMessage $0 ${WM_SETFONT} $1 0

  ${NSD_CreateLabel} 0 26u 100% 28u "MapleVault ya incluye sus dependencias principales. La traduccion local es opcional y puede ocupar varios cientos de MB."
  Pop $0

  ${NSD_CreateCheckbox} 0 60u 100% 20u "Instalar LibreTranslate y sus dependencias si son necesarias"
  Pop $LibreTranslateCheckbox
  ${NSD_SetState} $LibreTranslateCheckbox $InstallLibreTranslate

  ${NSD_CreateLabel} 0 86u 100% 28u "Incluye Python 3.11, Visual C++ Runtime x64, LibreTranslate y el modelo ingles-español."
  Pop $0

  ${NSD_CreateCheckbox} 0 120u 100% 20u "Iniciar con biblioteca y ajustes vacios"
  Pop $ResetMapleVaultDataCheckbox
  ${NSD_SetState} $ResetMapleVaultDataCheckbox $ResetMapleVaultData

  ${NSD_CreateLabel} 0 146u 100% 24u "Elimina datos locales anteriores. LibreTranslate se conserva."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function LibreTranslatePageLeave
  ${NSD_GetState} $LibreTranslateCheckbox $InstallLibreTranslate
  ${NSD_GetState} $ResetMapleVaultDataCheckbox $ResetMapleVaultData
FunctionEnd

!macro customPageAfterChangeDir
  Page custom LibreTranslatePageCreate LibreTranslatePageLeave
!macroend

!macro customInstall
  ${If} $ResetMapleVaultData == ${BST_CHECKED}
    DetailPrint "Eliminando biblioteca y ajustes locales anteriores..."
    RMDir /r "$APPDATA\${APP_FILENAME}"
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  ${EndIf}

  ${If} $InstallLibreTranslate == ${BST_CHECKED}
    SetOutPath "$PLUGINSDIR"
    File /oname=setup-libretranslate.ps1 "${PROJECT_DIR}\scripts\setup-libretranslate.ps1"
    CreateDirectory "$LOCALAPPDATA\MapleVault"

    DetailPrint "Comprobando dependencias y preparando LibreTranslate..."
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\setup-libretranslate.ps1" -DataDir "$LOCALAPPDATA\MapleVault" -NonInteractive'
    Pop $0

    ${If} $0 != "0"
      MessageBox MB_OK|MB_ICONEXCLAMATION "MapleVault se instalo correctamente, pero LibreTranslate no pudo prepararse. Puedes reintentar la instalacion desde Ajustes."
    ${EndIf}
  ${EndIf}
!macroend

!endif
