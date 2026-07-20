// preload (main world bridge) — exposes a narrow, typed `window.api` to the
// renderer via contextBridge. The renderer has no Node access; every call is
// forwarded to a main-process IPC handler. Channel names come from the shared
// contract so they cannot drift.

import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type PedigreeApi } from '../../src/lib/ipc';

const api: PedigreeApi = {
  pickDatabase: () => ipcRenderer.invoke(IPC.pickDatabase),
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  searchAnimals: (query) => ipcRenderer.invoke(IPC.searchAnimals, query),
  getAnimal: (name) => ipcRenderer.invoke(IPC.getAnimal, name),
  getPedigree: (name, generations) =>
    ipcRenderer.invoke(IPC.getPedigree, name, generations),
  getPedigreeTree: (name, generations) =>
    ipcRenderer.invoke(IPC.getPedigreeTree, name, generations),
  getLinebreeding: (name, generations, minCrosses) =>
    ipcRenderer.invoke(IPC.getLinebreeding, name, generations, minCrosses),
  getFoundation: (name) => ipcRenderer.invoke(IPC.getFoundation, name),
  importFoundation: () => ipcRenderer.invoke(IPC.importFoundation),
  clearFoundation: () => ipcRenderer.invoke(IPC.clearFoundation),
  getConfig: () => ipcRenderer.invoke(IPC.getConfig),
  setGenerations: (generations) =>
    ipcRenderer.invoke(IPC.setGenerations, generations),
  printPdf: (options) => ipcRenderer.invoke(IPC.printPdf, options),
  savePng: (options) => ipcRenderer.invoke(IPC.savePng, options),
  saveText: (defaultName, content) =>
    ipcRenderer.invoke(IPC.saveText, defaultName, content),
};

contextBridge.exposeInMainWorld('api', api);
