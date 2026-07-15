(function (global) {
   'use strict';

   var routes = {};
   var currentRoute = null;
   var appRoot = null;
   var navLinks = [];
   var suppressNextHashChange = false;

   function registerRoute(path, loader) {
      routes[path] = loader;
   }

   function normalizeHash(hash) {
      if (!hash || hash === '#') {
         return '#/dailies';
      }
      var path = hash.replace(/^#/, '').split('?')[0];
      if (!path.startsWith('/')) {
         path = '/' + path;
      }
      return '#' + path;
   }

   function getRoutePath() {
      return normalizeHash(window.location.hash).slice(1);
   }

   function setActiveNav(path) {
      navLinks.forEach(function (link) {
         var href = link.getAttribute('href') || '';
         var linkPath = href.replace(/^#/, '');
         var prefix = link.getAttribute('data-nav-prefix');
         var active = linkPath === path;
         if (!active && prefix) {
            active = path === prefix || path.indexOf(prefix + '/') === 0;
         }
         link.classList.toggle('active', active);
      });
   }

   function closeMobileNav() {
      var nav = document.getElementById('hub-nav');
      var backdrop = document.getElementById('hub-nav-backdrop');
      if (nav) {
         nav.classList.remove('open');
      }
      if (backdrop) {
         backdrop.classList.remove('open');
      }
   }

   async function navigate(hash, options) {
      var opts = options || {};
      var normalized = normalizeHash(hash || window.location.hash);
      var path = normalized.slice(1);

      if (!opts.replace) {
         if (window.location.hash !== normalized) {
            suppressNextHashChange = true;
            window.location.hash = normalized;
         }
      }

      if (currentRoute === path && !opts.force) {
         return;
      }

      var loader = routes[path];
      if (!loader) {
         path = '/dailies';
         loader = routes[path];
         normalized = '#/dailies';
      }

      currentRoute = path;
      setActiveNav(path);

      if (global.HubStorage) {
         global.HubStorage.setLastRoute(normalized);
      }

      if (!appRoot) {
         return;
      }

      appRoot.innerHTML = '<div class="hub-loading">Loading…</div>';

      try {
         await loader(appRoot);
      } catch (err) {
         appRoot.innerHTML = '<div class="hub-error">Failed to load app: ' + (err.message || err) + '</div>';
         console.error(err);
      }

      closeMobileNav();

      if (path === '/dailies') {
         document.body.setAttribute('data-neopets-dailies', 'rayenz');
      } else {
         document.body.removeAttribute('data-neopets-dailies');
      }
   }

   function init() {
      appRoot = document.getElementById('app-root');
      navLinks = Array.prototype.slice.call(document.querySelectorAll('.hub-nav-link'));

      navLinks.forEach(function (link) {
         link.addEventListener('click', function () {
            closeMobileNav();
         });
      });

      var toggle = document.getElementById('hub-nav-toggle');
      var nav = document.getElementById('hub-nav');
      var backdrop = document.getElementById('hub-nav-backdrop');

      if (toggle && nav) {
         toggle.addEventListener('click', function () {
            nav.classList.toggle('open');
            if (backdrop) {
               backdrop.classList.toggle('open');
            }
         });
      }

      if (backdrop) {
         backdrop.addEventListener('click', closeMobileNav);
      }

      window.addEventListener('hashchange', function () {
         if (suppressNextHashChange) {
            suppressNextHashChange = false;
            return;
         }
         navigate(window.location.hash, { force: true });
      });

      var initial = window.location.hash;
      if (!initial) {
         initial = global.HubStorage ? global.HubStorage.getLastRoute() : '#/dailies';
         window.location.replace(initial);
      }
      navigate(initial, { force: true });
   }

   global.HubRouter = {
      registerRoute: registerRoute,
      navigate: navigate,
      init: init,
      getRoutePath: getRoutePath
   };
})(window);
