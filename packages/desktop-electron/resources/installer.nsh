!macro customInit
  ; Kill any running Actual.exe processes before install/uninstall.
  ; Electron spawns multiple Actual.exe processes (main, GPU, renderer,
  ; utility). /F = force, /T = kill process tree, /IM = image name.
  nsExec::ExecToLog 'taskkill /F /T /IM "Actual.exe"'
  Sleep 3000

  ; Remove the old uninstall registry key so the NSIS installer does NOT
  ; try to run the old uninstaller (which fails with "failed to uninstall
  ; old application"). Instead the installer simply overwrites files in
  ; the install directory, which is safe because we already killed all
  ; processes above.
  DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.actualbudget.actual"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.actualbudget.actual"
!macroend
