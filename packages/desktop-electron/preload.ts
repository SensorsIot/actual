import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRenderer } from 'electron';

import type {
  GetBootstrapDataPayload,
  OpenFileDialogPayload,
  SaveFileDialogPayload,
} from './index';

const { version: VERSION, isDev: IS_DEV }: GetBootstrapDataPayload =
  ipcRenderer.sendSync('get-bootstrap-data');

contextBridge.exposeInMainWorld('Actual', {
  IS_DEV,
  ACTUAL_VERSION: VERSION,
  logToTerminal: console.log,
  ipcConnect: (
    func: (payload: {
      on: IpcRenderer['on'];
      emit: (name: string, data: unknown) => void;
    }) => void,
  ) => {
    func({
      on(name, handler) {
        return ipcRenderer.on(name, (_event, value) => handler(value));
      },
      emit(name, data) {
        return ipcRenderer.send('message', { name, args: data });
      },
    });
  },

  startSyncServer: () => ipcRenderer.invoke('start-sync-server'),

  stopSyncServer: () => ipcRenderer.invoke('stop-sync-server'),

  isSyncServerRunning: () => ipcRenderer.invoke('is-sync-server-running'),

  startOAuthServer: () => ipcRenderer.invoke('start-oauth-server'),

  relaunch: () => {
    ipcRenderer.invoke('relaunch');
  },

  restartElectronServer: () => {
    ipcRenderer.invoke('restart-server');
  },

  openFileDialog: (opts: OpenFileDialogPayload) => {
    return ipcRenderer.invoke('open-file-dialog', opts);
  },

  saveFile: async (
    contents: SaveFileDialogPayload['fileContents'],
    filename: SaveFileDialogPayload['defaultPath'],
    dialogTitle: SaveFileDialogPayload['title'],
  ) => {
    await ipcRenderer.invoke('save-file-dialog', {
      title: dialogTitle,
      defaultPath: filename,
      fileContents: contents,
    });
  },

  openURLInBrowser: (url: string) => {
    ipcRenderer.invoke('open-external-url', url);
  },

  openInFileManager: (filepath: string) => {
    ipcRenderer.invoke('open-in-file-manager', filepath);
  },

  onEventFromMain: (type: string, handler: (...args: unknown[]) => void) => {
    ipcRenderer.on(type, handler);
  },

  isUpdateReadyForDownload: (() => {
    let ready = false;
    ipcRenderer.on('update-downloaded', () => {
      ready = true;
    });
    return () => ready;
  })(),

  waitForUpdateReadyForDownload: () =>
    new Promise<void>(resolve => {
      ipcRenderer.on('update-downloaded', () => {
        resolve();
      });
    }),

  getServerSocket: async () => {
    return null;
  },

  setTheme: (theme: string) => {
    ipcRenderer.send('set-theme', theme);
  },

  moveBudgetDirectory: (
    currentBudgetDirectory: string,
    newDirectory: string,
  ) => {
    return ipcRenderer.invoke(
      'move-budget-directory',
      currentBudgetDirectory,
      newDirectory,
    );
  },

  reload: async () => {
    throw new Error('Reload not implemented in electron app');
  },

  applyAppUpdate: async () => {
    await ipcRenderer.invoke('install-update');
  },

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  downloadUpdate: () => ipcRenderer.invoke('download-update'),

  checkAndDownloadUpdate: () =>
    ipcRenderer.invoke('check-and-download-update'),

  onUpdateEvent: (handler: (type: string, data: unknown) => void) => {
    const events = [
      'update-available',
      'update-not-available',
      'download-progress',
      'update-downloaded',
      'update-error',
    ];
    for (const event of events) {
      ipcRenderer.on(event, (_e, data) => handler(event, data));
    }
  },
} satisfies typeof global.Actual);
