// Auto-update check on launch.
// Polls the GitHub Releases endpoint configured in tauri.conf.json. If a newer
// signed build is available, prompts the user, downloads, installs, restarts.
(function () {
  if (!window.__TAURI__) return;
  const updater = window.__TAURI__.updater;
  const process = window.__TAURI__.process;
  if (!updater || !process) return;

  async function checkForUpdate() {
    try {
      const update = await updater.check();
      if (!update?.available) return;

      const ok = window.confirm(
        `sticky ${update.version} is available (you're on ${update.currentVersion}).\n\n` +
        `Download and install now? The app will restart.`
      );
      if (!ok) return;

      await update.downloadAndInstall();
      await process.relaunch();
    } catch (err) {
      console.warn('updater check failed:', err);
    }
  }

  // delay so first render isn't blocked by network
  setTimeout(checkForUpdate, 4000);
})();
