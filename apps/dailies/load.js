(function (global) {
   'use strict';

   async function loadDailiesApp(root) {
      root.innerHTML = '';
      var frame = document.createElement('iframe');
      frame.className = 'hub-web-frame';
      frame.title = "Rayenz's Dailies";
      frame.src = 'web/dailies/index.html';
      root.appendChild(frame);
   }

   global.loadDailiesApp = loadDailiesApp;
})(window);
