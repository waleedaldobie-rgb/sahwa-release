!macro customInstall
  ; Recreate deterministic shortcuts after the standard electron-builder shortcuts.
  ; Both shortcuts point to the packaged executable and its embedded icon.
  SetShellVarContext current
  CreateShortCut "$DESKTOP\صهوة للخياطة.lnk" "$INSTDIR\sahwa-tailoring.exe" "" "$INSTDIR\sahwa-tailoring.exe" 0
  CreateShortCut "$SMPROGRAMS\صهوة للخياطة.lnk" "$INSTDIR\sahwa-tailoring.exe" "" "$INSTDIR\sahwa-tailoring.exe" 0
!macroend

!macro customUnInstall
  SetShellVarContext current
  Delete "$DESKTOP\صهوة للخياطة.lnk"
  Delete "$SMPROGRAMS\صهوة للخياطة.lnk"
!macroend
