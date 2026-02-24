!macro customInit
  ; Kill any running Actual.exe processes before install/uninstall.
  ; Electron spawns multiple Actual.exe processes (main, GPU, renderer,
  ; utility). /F = force, /T = kill process tree, /IM = image name.
  nsExec::ExecToLog 'taskkill /F /T /IM "Actual.exe"'
  ; Wait for processes to fully terminate
  Sleep 3000
!macroend
