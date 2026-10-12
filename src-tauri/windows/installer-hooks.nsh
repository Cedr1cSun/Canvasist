; Hooks for Canvasist's NSIS installer (bundle.windows.nsis.installerHooks in
; tauri.conf.json). The installer template defines MANUPRODUCTKEY,
; MAINBINARYNAME, PRODUCTNAME and the CheckIfAppIsRunning macro used here.

; Runs before the files are copied. If the previous version was installed in a
; different folder, remove it from there:
; - After "Do not uninstall" (or a failed uninstall) and a new folder, the old
;   copy would stay behind, unregistered, and could keep running in the tray.
; - After "Uninstall before installing", the old folder keeps its
;   uninstall.exe, which cannot delete itself while it runs.
; Only Canvasist's own two files are deleted, and the folder only if it is
; then empty, so nothing else the user keeps there is touched.
!macro NSIS_HOOK_PREINSTALL
  ReadRegStr $R9 SHCTX "${MANUPRODUCTKEY}" ""
  ${If} $R9 != ""
  ${AndIf} $R9 != $INSTDIR
  ${AndIf} ${FileExists} "$R9\uninstall.exe"
    ${If} ${FileExists} "$R9\${MAINBINARYNAME}.exe"
      !insertmacro CheckIfAppIsRunning "$R9\${MAINBINARYNAME}.exe" "${PRODUCTNAME}"
      Delete "$R9\${MAINBINARYNAME}.exe"
    ${EndIf}
    Delete "$R9\uninstall.exe"
    RMDir "$R9"
  ${EndIf}
!macroend
