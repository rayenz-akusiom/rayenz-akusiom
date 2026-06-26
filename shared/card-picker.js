(function (global) {
   'use strict';

   var STORAGE_KEY = 'rayenzHubPickerCardSize';
   var CARD_SIZE_PX = { S: 150, M: 225, L: 310 };
   var SIZE_LABELS = { S: 'Small', M: 'Medium', L: 'Large' };
   var SIZE_GLYPHS = { S: 12, M: 16, L: 20 };
   var PINNED_CATEGORIES = ['New Set In', 'New Set Out'];
   var UNCategorized_KEY = '__uncategorized__';

   var dialogEl = null;

   function loadCardSize() {
      try {
         var raw = localStorage.getItem(STORAGE_KEY);
         if (raw === 'XL') {
            return 'L';
         }
         if (raw === 'M' || raw === 'L') {
            return raw;
         }
         return 'S';
      } catch (e) {
         return 'S';
      }
   }

   function saveCardSize(sizeKey) {
      try {
         localStorage.setItem(STORAGE_KEY, sizeKey);
      } catch (e) {
         /* ignore */
      }
   }

   function applyGridSize(grid, sizeKey) {
      var px = CARD_SIZE_PX[sizeKey] || CARD_SIZE_PX.S;
      grid.style.setProperty('--hub-picker-card-min', px + 'px');
   }

   function updateSizeButtons(dialog, sizeKey) {
      dialog.querySelectorAll('[data-hub-picker-size]').forEach(function (btn) {
         btn.classList.toggle('active', btn.getAttribute('data-hub-picker-size') === sizeKey);
      });
   }

   function sizeGlyphSvg(px) {
      return '<svg width="' + px + '" height="' + Math.round(px * 1.39) + '" viewBox="0 0 12 17" aria-hidden="true">' +
         '<rect x="1" y="1" width="10" height="15" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
         '</svg>';
   }

   function buildSizeButtonsHtml() {
      return ['S', 'M', 'L'].map(function (key) {
         var label = SIZE_LABELS[key];
         return '<button type="button" class="hub-picker-size-btn" data-hub-picker-size="' + key + '"' +
            ' aria-label="' + label + '" title="' + label + '">' +
            sizeGlyphSvg(SIZE_GLYPHS[key]) + '</button>';
      }).join('');
   }

   function sortItems(items) {
      return items.slice().sort(function (a, b) {
         var aLines = a.lines || [];
         var bLines = b.lines || [];
         var cmp = String(aLines[0] || '').toLowerCase().localeCompare(String(bLines[0] || '').toLowerCase());
         if (cmp !== 0) {
            return cmp;
         }
         return String(aLines[1] || '').toLowerCase().localeCompare(String(bLines[1] || '').toLowerCase());
      });
   }

   function groupItems(items) {
      var buckets = {};
      (items || []).forEach(function (item) {
         var cat = item.category ? String(item.category).trim() : '';
         var key = cat || UNCategorized_KEY;
         if (!buckets[key]) {
            buckets[key] = [];
         }
         buckets[key].push(item);
      });

      Object.keys(buckets).forEach(function (key) {
         buckets[key] = sortItems(buckets[key]);
      });

      var groups = [];
      if (buckets[UNCategorized_KEY] && buckets[UNCategorized_KEY].length) {
         groups.push({ name: null, items: buckets[UNCategorized_KEY] });
         delete buckets[UNCategorized_KEY];
      }

      PINNED_CATEGORIES.forEach(function (cat) {
         if (buckets[cat] && buckets[cat].length) {
            groups.push({ name: cat, items: buckets[cat] });
            delete buckets[cat];
         }
      });

      Object.keys(buckets).sort(function (a, b) {
         return a.localeCompare(b, undefined, { sensitivity: 'base' });
      }).forEach(function (cat) {
         groups.push({ name: cat, items: buckets[cat] });
      });

      return groups;
   }

   function createOptionButton(item, config, dialog) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'hub-picker-option';
      if (item.value === config.selectedValue) {
         btn.classList.add('selected');
      }
      var imgWrap = document.createElement('div');
      imgWrap.className = 'hub-picker-option-image';
      if (item.imgSrc) {
         var img = document.createElement('img');
         img.src = item.imgSrc;
         img.alt = (item.lines && item.lines[0]) || '';
         img.loading = 'lazy';
         imgWrap.appendChild(img);
      } else {
         imgWrap.classList.add('hub-picker-option-image-empty');
         imgWrap.textContent = 'No image';
      }
      var meta = document.createElement('div');
      meta.className = 'hub-picker-option-meta';
      appendOptionMeta(meta, item.lines);
      btn.appendChild(imgWrap);
      btn.appendChild(meta);
      btn.addEventListener('click', function () {
         if (config && config.onPick) {
            config.onPick(item.value, item);
         }
         dialog.close();
      });
      return btn;
   }

   function appendOptionMeta(meta, lines) {
      var nonEmpty = (lines || []).filter(function (line) { return line; });
      if (!nonEmpty.length) {
         return;
      }
      var nameEl = document.createElement('div');
      nameEl.className = 'hub-picker-option-name';
      nameEl.textContent = nonEmpty[0];
      nameEl.title = nonEmpty[0];
      meta.appendChild(nameEl);
      if (nonEmpty.length > 1) {
         var badges = document.createElement('div');
         badges.className = 'hub-picker-option-badges';
         for (var i = 1; i < nonEmpty.length; i++) {
            var badge = document.createElement('span');
            badge.className = 'hub-picker-option-badge';
            badge.textContent = nonEmpty[i];
            badges.appendChild(badge);
         }
         meta.appendChild(badges);
      }
   }

   function ensureDialog() {
      if (dialogEl) {
         return dialogEl;
      }
      dialogEl = document.createElement('dialog');
      dialogEl.className = 'hub-picker-dialog';
      dialogEl.id = 'hub-picker-dialog';
      dialogEl.innerHTML =
         '<div class="hub-picker-dialog-inner">' +
         '<header class="hub-picker-dialog-header">' +
         '<h3 id="hub-picker-title" class="hub-picker-title"></h3>' +
         '<div class="hub-picker-header-controls">' +
         '<div class="hub-picker-size-group" role="group" aria-label="Card size">' +
         buildSizeButtonsHtml() +
         '</div>' +
         '<button type="button" class="hub-picker-close-btn" data-hub-picker-close>Close</button>' +
         '</div></header>' +
         '<div class="hub-picker-grid" id="hub-picker-grid"></div>' +
         '</div>';
      document.body.appendChild(dialogEl);

      var grid = dialogEl.querySelector('#hub-picker-grid');
      var initialSize = loadCardSize();
      applyGridSize(grid, initialSize);
      updateSizeButtons(dialogEl, initialSize);

      dialogEl.querySelectorAll('[data-hub-picker-size]').forEach(function (btn) {
         btn.addEventListener('click', function () {
            var sizeKey = btn.getAttribute('data-hub-picker-size');
            saveCardSize(sizeKey);
            applyGridSize(grid, sizeKey);
            updateSizeButtons(dialogEl, sizeKey);
         });
      });

      dialogEl.querySelector('[data-hub-picker-close]').addEventListener('click', function () {
         dialogEl.close();
      });
      dialogEl.addEventListener('click', function (e) {
         if (e.target === dialogEl) {
            dialogEl.close();
         }
      });

      return dialogEl;
   }

   function open(config) {
      var dialog = ensureDialog();
      var titleEl = dialog.querySelector('#hub-picker-title');
      var grid = dialog.querySelector('#hub-picker-grid');
      titleEl.textContent = (config && config.title) || 'Choose';
      var sizeKey = loadCardSize();
      applyGridSize(grid, sizeKey);
      updateSizeButtons(dialog, sizeKey);
      grid.innerHTML = '';

      var items = (config && config.items) || [];
      if (config && config.groupByCategory) {
         groupItems(items).forEach(function (group) {
            if (group.name) {
               var header = document.createElement('div');
               header.className = 'hub-picker-group-header';
               header.textContent = group.name;
               grid.appendChild(header);
            }
            group.items.forEach(function (item) {
               grid.appendChild(createOptionButton(item, config, dialog));
            });
         });
      } else {
         if (config && config.sort) {
            items = sortItems(items);
         }
         items.forEach(function (item) {
            grid.appendChild(createOptionButton(item, config, dialog));
         });
      }

      if (typeof dialog.showModal === 'function') {
         dialog.showModal();
      } else {
         dialog.setAttribute('open', 'open');
      }
   }

   global.HubCardPicker = { open: open };
})(window);
