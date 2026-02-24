!macro customInit
  ; Kill any running Actual.exe processes before install/uninstall.
  ; Electron spawns multiple Actual.exe processes (main, GPU, renderer,
  ; utility). /F = force, /T = kill process tree, /IM = image name.
  nsExec::ExecToLog 'taskkill /F /T /IM "Actual.exe"'
  ; Wait for processes to fully terminate and Windows to release all
  ; file locks (native modules like better-sqlite3 can hold locks
  ; briefly after process exit).
  Sleep 5000
  ; Second attempt in case any process respawned or was slow to die.
  nsExec::ExecToLog 'taskkill /F /T /IM "Actual.exe"'
  Sleep 2000
!macroend
