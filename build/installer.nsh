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

  ${NSD_CreateLabel} 0 0 100% 28u "Componente opcional de traduccion"
  Pop $0
  CreateFont $1 "$(^Font)" "11" "700"
  SendMessage $0 ${WM_SETFONT} $1 0

  ${NSD_CreateLabel} 0 34u 100% 44u "LibreTranslate permite mostrar sinopsis en español sin enviar datos a servicios externos. Requiere Python, el servicio local y el modelo ingles-español, por lo que puede ocupar varios cientos de MB."
  Pop $0

  ${NSD_CreateCheckbox} 0 88u 100% 20u "Instalar LibreTranslate junto con MapleVault"
  Pop $LibreTranslateCheckbox
  ${NSD_SetState} $LibreTranslateCheckbox $InstallLibreTranslate

  ${NSD_CreateLabel} 0 116u 100% 36u "La descarga necesita conexion a Internet y puede tardar varios minutos. Si se omite o falla, se puede instalar luego desde Ajustes."
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

    DetailPrint "Preparando LibreTranslate y el modelo ingles-español..."
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\setup-libretranslate.ps1" -DataDir "$LOCALAPPDATA\MapleVault" -NonInteractive'
    Pop $0

    ${If} $0 != "0"
      MessageBox MB_OK|MB_ICONEXCLAMATION "MapleVault se instalo correctamente, pero LibreTranslate no pudo prepararse. Puedes reintentar la instalacion desde Ajustes."
    ${EndIf}
  ${EndIf}
!macroend

!endif
