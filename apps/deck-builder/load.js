(function (global) {
   'use strict';

   async function loadDeckBuilderApp(root) {
      root.innerHTML = '';
      var frame = document.createElement('iframe');
      frame.className = 'hub-web-frame';
      frame.title = 'Deck Builder';
      frame.src = 'web/deck-builder/index.html';
      root.appendChild(frame);
   }

   global.loadDeckBuilderApp = loadDeckBuilderApp;
})(window);
