(function (global) {
   'use strict';

   function mount(hostEl) {
      if (!hostEl) {
         throw new Error('HubProgress.mount requires a host element');
      }

      hostEl.classList.add('hub-progress-host');
      hostEl.innerHTML =
         '<div class="hub-progress-bar" hidden>' +
         '<div class="hub-progress-bar-track">' +
         '<div class="hub-progress-bar-fill"></div>' +
         '</div>' +
         '<div class="hub-progress-bar-row">' +
         '<div class="hub-progress-bar-label"></div>' +
         '<button type="button" class="hub-progress-dismiss" hidden aria-label="Dismiss">×</button>' +
         '</div>' +
         '</div>';

      var barEl = hostEl.querySelector('.hub-progress-bar');
      var fillEl = hostEl.querySelector('.hub-progress-bar-fill');
      var labelEl = hostEl.querySelector('.hub-progress-bar-label');
      var dismissEl = hostEl.querySelector('.hub-progress-dismiss');
      var active = false;
      var finished = false;

      function setFillPercent(pct) {
         if (!fillEl) {
            return;
         }
         fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';
      }

      function setVariant(variant) {
         if (!barEl) {
            return;
         }
         barEl.classList.remove('hub-progress-success', 'hub-progress-error', 'hub-progress-indeterminate');
         if (variant === 'success') {
            barEl.classList.add('hub-progress-success');
         } else if (variant === 'error') {
            barEl.classList.add('hub-progress-error');
         } else if (variant === 'indeterminate') {
            barEl.classList.add('hub-progress-indeterminate');
         }
      }

      function showBar() {
         if (barEl) {
            barEl.hidden = false;
         }
      }

      dismissEl.addEventListener('click', function () {
         controller.dismiss();
      });

      var controller = {
         start: function (options) {
            options = options || {};
            active = true;
            finished = false;
            showBar();
            setVariant(options.indeterminate ? 'indeterminate' : null);
            setFillPercent(0);
            if (labelEl) {
               labelEl.textContent = options.label || '';
            }
            if (dismissEl) {
               dismissEl.hidden = true;
            }
         },

         update: function (options) {
            options = options || {};
            if (!active) {
               controller.start({ label: options.label });
            }
            showBar();
            setVariant(null);
            var total = options.total || 0;
            var current = options.current || 0;
            var pct = total > 0 ? Math.round((current / total) * 100) : 0;
            setFillPercent(pct);
            if (labelEl && options.label != null) {
               labelEl.textContent = options.label;
            } else if (labelEl && total > 0) {
               labelEl.textContent = current + '/' + total + '…';
            }
            if (dismissEl) {
               dismissEl.hidden = true;
            }
         },

         finish: function (options) {
            options = options || {};
            active = false;
            finished = true;
            showBar();
            var variant = options.variant === 'error' ? 'error' : 'success';
            setVariant(variant);
            setFillPercent(variant === 'error' ? 100 : 100);
            if (labelEl) {
               labelEl.textContent = options.label || (variant === 'error' ? 'Failed' : 'Complete');
            }
            if (dismissEl) {
               dismissEl.hidden = false;
            }
         },

         dismiss: function () {
            active = false;
            finished = false;
            if (barEl) {
               barEl.hidden = true;
               barEl.classList.remove('hub-progress-success', 'hub-progress-error', 'hub-progress-indeterminate');
            }
            setFillPercent(0);
            if (labelEl) {
               labelEl.textContent = '';
            }
            if (dismissEl) {
               dismissEl.hidden = true;
            }
         },

         isActive: function () {
            return active;
         },

         isFinished: function () {
            return finished;
         }
      };

      return controller;
   }

   global.HubProgress = {
      mount: mount
   };
})(window);
