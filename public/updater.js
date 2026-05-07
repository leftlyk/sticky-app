// Auto-update check on launch.
// Polls the GitHub Releases endpoint configured in tauri.conf.json. If a newer
// signed build is available, shows an in-app banner. (window.confirm() is
// suppressed in production WKWebView, so we render our own DOM prompt.)
(function () {
  if (!window.__TAURI__) return;
  const updater = window.__TAURI__.updater;
  const process = window.__TAURI__.process;
  if (!updater || !process) return;

  function showBanner(update) {
    const bar = document.createElement('div');
    bar.id = 'update-banner';
    bar.innerHTML = `
      <span class="ub-msg">sticky <b>v${update.version}</b> available · you're on v${update.currentVersion}</span>
      <button class="ub-btn ub-go">update &amp; restart</button>
      <button class="ub-btn ub-skip">later</button>
      <span class="ub-status"></span>
    `;
    document.body.appendChild(bar);

    const status = bar.querySelector('.ub-status');
    const go = bar.querySelector('.ub-go');
    const skip = bar.querySelector('.ub-skip');

    skip.addEventListener('click', () => bar.remove());
    go.addEventListener('click', async () => {
      go.disabled = true;
      skip.disabled = true;
      status.textContent = 'downloading…';
      try {
        await update.downloadAndInstall(event => {
          if (event.event === 'Progress' && event.data?.chunkLength != null) {
            status.textContent = 'downloading…';
          }
          if (event.event === 'Finished') {
            status.textContent = 'restarting…';
          }
        });
        await process.relaunch();
      } catch (err) {
        status.textContent = `error: ${err}`;
        go.disabled = false;
        skip.disabled = false;
        console.error('updater error:', err);
      }
    });
  }

  async function checkForUpdate() {
    try {
      const update = await updater.check();
      if (!update?.available) return;
      showBanner(update);
    } catch (err) {
      console.warn('updater check failed:', err);
    }
  }

  setTimeout(checkForUpdate, 4000);
})();
