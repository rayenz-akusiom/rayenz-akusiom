(function (global) {
   'use strict';

   async function loadDailiesSettingsApp(root) {
      root.innerHTML = '';
      var frame = document.createElement('iframe');
      frame.className = 'hub-web-frame';
      frame.title = 'Dailies settings';
      frame.src = 'web/dailies-settings/index.html';
      root.appendChild(frame);
   }

   global.loadDailiesSettingsApp = loadDailiesSettingsApp;
})(window);
