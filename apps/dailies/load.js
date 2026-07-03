(function (global) {
   'use strict';

   var cssLoaded = false;
   var scriptLoaded = false;

   function ensureCss() {
      if (cssLoaded || document.querySelector('link[data-dailies-css]')) {
         cssLoaded = true;
         return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'apps/dailies/dailies.css';
      link.setAttribute('data-dailies-css', '1');
      document.head.appendChild(link);
      cssLoaded = true;
   }

   function loadScript() {
      if (scriptLoaded || global.__dailiesScriptLoaded) {
         return Promise.resolve();
      }
      return new Promise(function (resolve, reject) {
         var script = document.createElement('script');
         script.src = 'apps/dailies/dailies.js';
         script.onload = function () {
            scriptLoaded = true;
            global.__dailiesScriptLoaded = true;
            resolve();
         };
         script.onerror = function () {
            reject(new Error('Failed to load dailies.js'));
         };
         document.body.appendChild(script);
      });
   }

   async function loadDailiesApp(root) {
      ensureCss();
      var resp = await fetch('apps/dailies/dailies.html');
      if (!resp.ok) {
         throw new Error('Failed to load dailies content');
      }
      var html = await resp.text();
      root.innerHTML =
         '<div class="dailies-app" data-neopets-dailies="rayenz">' +
         '<div class="center_column"><div id="mainshell" valign="top">' +
         html +
         '</div></div></div>';
      await loadScript();
      var progressHost = document.getElementById('dailies-progress-host');
      if (progressHost && global.HubUtils) {
         global.__dailiesProgress = HubUtils.mountAppProgress(progressHost, 'dailies');
      }
      if (typeof window.__initDailiesApp === 'function') {
         window.__initDailiesApp();
      }
      if (typeof window.__neopetsFetch === 'function') {
         document.dispatchEvent(new CustomEvent('neopets-dailies-ready'));
      }
   }

   global.loadDailiesApp = loadDailiesApp;
})(window);
