(function (global) {
   'use strict';

   var cssLoaded = false;

   function ensureCss() {
      if (cssLoaded || document.querySelector('link[data-more-css]')) {
         cssLoaded = true;
         return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'apps/neopets-more/more.css';
      link.setAttribute('data-more-css', '1');
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

   async function loadNeopetsMoreApp(root) {
      ensureCss();
      var resp = await fetch('apps/neopets-more/more.html');
      if (!resp.ok) {
         throw new Error('Failed to load more content');
      }
      var html = await resp.text();
      root.innerHTML = '<div class="more-app">' + html + '</div>';
      await loadScript('apps/neopets-more/more-links.js');
      await loadScript('apps/neopets-more/more.js');
      if (typeof window.__initMoreApp === 'function') {
         window.__initMoreApp();
      }
   }

   global.loadNeopetsMoreApp = loadNeopetsMoreApp;
})(window);
