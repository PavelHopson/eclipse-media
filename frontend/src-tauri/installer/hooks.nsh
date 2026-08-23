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
