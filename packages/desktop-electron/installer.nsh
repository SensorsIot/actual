!macro customInit
  ; Kill any running Actual.exe processes before install/uninstall.
  ; This prevents "failed to uninstall old application" errors during
  ; auto-update, where quitAndInstall launches the installer before
  ; the main process and utility processes have fully exited.
  nsExec::ExecToLog 'taskkill /F /IM "Actual.exe"'
  ; Wait a moment for processes to fully terminate
  Sleep 2000
!macroend
