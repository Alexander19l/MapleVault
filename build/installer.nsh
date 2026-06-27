!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef BUILD_UNINSTALLER

Var InstallLibreTranslate
Var LibreTranslateCheckbox

!macro customInit
  StrCpy $InstallLibreTranslate ${BST_UNCHECKED}
!macroend

Function LibreTranslatePageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 28u "Dependencias y traduccion opcional"
  Pop $0
  CreateFont $1 "$(^Font)" "11" "700"
  SendMessage $0 ${WM_SETFONT} $1 0

  ${NSD_CreateLabel} 0 34u 100% 34u "MapleVault ya incluye sus dependencias principales. La traduccion local es opcional y puede ocupar varios cientos de MB."
  Pop $0

  ${NSD_CreateCheckbox} 0 76u 100% 22u "Instalar LibreTranslate y sus dependencias si son necesarias"
  Pop $LibreTranslateCheckbox
  ${NSD_SetState} $LibreTranslateCheckbox $InstallLibreTranslate

  ${NSD_CreateLabel} 0 106u 100% 52u "Incluye Python 3.11, Microsoft Visual C++ Runtime x64, LibreTranslate y el modelo ingles-español. Requiere Internet y puede solicitar permisos de Windows. Tambien se puede instalar luego desde Ajustes."
  Pop $0

  nsDialogs::Show
FunctionEnd

Function LibreTranslatePageLeave
  ${NSD_GetState} $LibreTranslateCheckbox $InstallLibreTranslate
FunctionEnd

!macro customPageAfterChangeDir
  Page custom LibreTranslatePageCreate LibreTranslatePageLeave
!macroend

!macro customInstall
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
