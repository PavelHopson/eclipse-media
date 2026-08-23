; Eclipse Media installer presentation contract.
; Keep the operational pages native; brand only the welcome/final surfaces so
; Windows controls retain system contrast, keyboard behavior and accessibility.

!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "05070A"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "F2F5F9"
!endif

!define MUI_ABORTWARNING
!define MUI_UNABORTWARNING
!define MUI_WELCOMEPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_TITLE_3LINES
!define MUI_FINISHPAGE_LINK "Eclipse Forge"
!define MUI_FINISHPAGE_LINK_LOCATION "https://eclipse-forge.ru"
