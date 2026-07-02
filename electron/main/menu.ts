// menu.ts (main process) — the application menu. With no menu set, Electron
// installs its default one, whose Help submenu links to electronjs.org; this
// replaces it. The standard roles (editMenu/windowMenu) are KEPT deliberately:
// they wire the clipboard (Cmd/Ctrl+C/V/X/A, undo/redo) and window shortcuts
// into the renderer, so setting the menu to null would break paste in the
// search box.
import { Menu, shell, type MenuItemConstructorOptions } from 'electron';

const REPO_URL = 'https://github.com/feedgine/pedigree-insights';
const ISSUES_URL = `${REPO_URL}/issues`;

export function applyAppMenu(): void {
  const isMac = process.platform === 'darwin';
  const macAppMenu: MenuItemConstructorOptions[] = isMac ? [{ role: 'appMenu' }] : [];

  const template: MenuItemConstructorOptions[] = [
    ...macAppMenu,
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'PedigreeInsights on GitHub', click: () => shell.openExternal(REPO_URL) },
        { label: 'Report an Issue…', click: () => shell.openExternal(ISSUES_URL) },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
