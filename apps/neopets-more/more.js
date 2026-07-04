(function (global) {
   'use strict';

   function initMoreApp() {
      var root = document.getElementById('more-links');
      if (root && global.NeopetsMore) {
         root.innerHTML = global.NeopetsMore.renderMoreGrid();
      }
   }

   global.__initMoreApp = initMoreApp;
})(window);
