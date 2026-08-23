; Eclipse Media installer presentation contract.
; Keep the operational pages native; brand only the welcome/final surfaces so
; Windows controls retain system contrast, keyboard behavior and accessibility.

!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "05070A"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "F2F5F9"
!endif

; NSIS bug #443: themed checkbox labels ignore SetCtlColors and render black.
; Classic checkbox rendering keeps the native control while honoring the
; explicit foreground/background colors on the dark finish page.
!define MUI_FORCECLASSICCONTROLS
!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_LINK "Eclipse Forge"
!define MUI_FINISHPAGE_LINK_LOCATION "https://eclipse-forge.ru"
!define MUI_FINISHPAGE_LINK_COLOR "6BA3FF"

; Tauri checks only the visible desktop executable by default. Eclipse Media
; also ships a PyInstaller sidecar, and an older build can leave its worker
; alive after the window closes. Check both processes before NSIS starts
; copying files so an update never ends in the raw "cannot open for writing"
; dialog. CheckIfAppIsRunning asks for explicit consent before terminating a
; process and supports Retry/Cancel through the native localized UI.
!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
  !insertmacro CheckIfAppIsRunning "eclipse-media-core.exe" "${PRODUCTNAME}"
!macroend
