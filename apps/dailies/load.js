(function (global) {
   'use strict';

   var cssLoaded = false;
   var scriptsLoaded = false;

   var MODULE_SCRIPTS = [
      'apps/dailies/dailies-settings.js',
      'apps/dailies/dailies-links.js',
      'apps/dailies/dailies-timed.js',
      'apps/dailies/dailies-itemdb.js',
      'apps/dailies/dailies-wishing-well.js',
      'apps/dailies/dailies-render.js'
   ];

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

   function loadScript(src) {
      return new Promise(function (resolve, reject) {
         var script = document.createElement('script');
         script.src = src;
         script.onload = function () { resolve(); };
         script.onerror = function () { reject(new Error('Failed to load ' + src)); };
         document.body.appendChild(script);
      });
   }

   function loadModules() {
      if (scriptsLoaded || global.__dailiesModulesLoaded) {
         return Promise.resolve();
      }
      var chain = Promise.resolve();
      MODULE_SCRIPTS.forEach(function (src) {
         chain = chain.then(function () { return loadScript(src); });
      });
      return chain.then(function () {
         return loadScript('apps/dailies/dailies.js');
      }).then(function () {
         scriptsLoaded = true;
         global.__dailiesModulesLoaded = true;
         global.__dailiesScriptLoaded = true;
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
      await loadModules();
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
