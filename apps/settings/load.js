(function (global) {
   'use strict';

   function tabFromPath(path) {
      if (path === '/settings/deck-suggest') {
         return 'deck-suggest';
      }
      if (path === '/settings/order-reconcile') {
         return 'order-reconcile';
      }
      return 'dailies';
   }

   async function loadSettingsApp(root) {
      root.innerHTML = '';
      var path = global.HubRouter && global.HubRouter.getRoutePath
         ? global.HubRouter.getRoutePath()
         : '/settings';
      var tab = tabFromPath(path);
      var frame = document.createElement('iframe');
      frame.className = 'hub-web-frame';
      frame.title = 'Hub settings';
      frame.src = 'web/settings/index.html?tab=' + encodeURIComponent(tab);
      root.appendChild(frame);
   }

   global.loadSettingsApp = loadSettingsApp;
})(window);
