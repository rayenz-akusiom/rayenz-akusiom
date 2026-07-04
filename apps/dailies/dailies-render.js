(function (global) {
   'use strict';

   var escapeHtml = global.HubUtils ? global.HubUtils.escapeHtml : function (s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
   };

   function buildPetHref(template, petName) {
      if (!template) {
         return 'https://www.neopets.com/petlookup.phtml?pet=' + encodeURIComponent(petName);
      }
      return template.replace('{pet}', encodeURIComponent(petName));
   }

   function renderLinkTile(link, petName, extraClass) {
      var url = link.url;
      var img = link.img;
      if (link.petLink) {
         url = buildPetHref(link.petHref, petName);
      }
      if (link.kind === 'pet') {
         img = 'https://pets.neopets.com/cpn/' + encodeURIComponent(petName) + '/1/4.png';
      }
      var tileClass = 'daily-tile' + (extraClass ? ' ' + extraClass : '');
      var html = '<div class="' + tileClass + '" data-link-id="' + escapeHtml(link.id) + '">';
      html += '<a href="' + escapeHtml(url) + '" target="_blank"';
      if (link.petLink || link.kind === 'pet') {
         html += ' class="main-pet-link" data-pet-href="' + escapeHtml(link.petHref || link.url || '') + '"';
      }
      html += '>';
      if (img) {
         html += '<img src="' + escapeHtml(img) + '" alt="" referrerpolicy="no-referrer">';
      }
      html += '</a>';
      html += '<a href="' + escapeHtml(url) + '" target="_blank"';
      if (link.petLink || link.kind === 'pet') {
         html += ' class="main-pet-label main-pet-link" data-pet-href="' + escapeHtml(link.petHref || '') + '"';
      }
      html += '>' + escapeHtml(link.label) + '</a>';
      if (link.note) {
         html += '<span class="text-small">' + escapeHtml(link.note) + '</span>';
      }
      html += '</div>';
      return html;
   }

   function renderItemdbTile(target, petName) {
      var list = target.list;
      var item = target.item;
      if (!item) {
         var fallbackNote = 'List link';
         if (target.error === 'no-key') {
            fallbackNote = 'Set ItemDB key';
         } else if (target.error === 'loading') {
            fallbackNote = 'Loading…';
         }
         return renderLinkTile({
            id: list.id,
            label: list.label,
            url: list.listUrl,
            img: list.img,
            note: fallbackNote
         }, petName);
      }
      var sswUrl = item.findAt && item.findAt.shopWizard
         ? item.findAt.shopWizard
         : 'https://www.neopets.com/shops/wizard.phtml?string=' + encodeURIComponent(item.name);
      var html = '<div class="daily-tile itemdb-tile" data-link-id="' + escapeHtml(list.id) + '">';
      html += '<a href="' + escapeHtml(sswUrl) + '" target="_blank" title="Shop Wizard: ' + escapeHtml(item.name) + '">';
      html += '<img src="' + escapeHtml(item.image || list.img) + '" alt="" referrerpolicy="no-referrer">';
      html += '</a>';
      html += '<a href="' + escapeHtml(sswUrl) + '" target="_blank">' + escapeHtml(item.name) + '</a>';
      html += '<a class="itemdb-list-link" href="' + escapeHtml(list.listUrl) + '" target="_blank" title="Open ItemDB list">List</a>';
      html += '</div>';
      return html;
   }

   function renderCollapsible(title, innerHtml, extraClass) {
      var btnClass = 'collapsible sidebar-collapsible' + (extraClass ? ' ' + extraClass : '');
      return (
         '<button type="button" class="' + btnClass + '">' + escapeHtml(title) + '</button>' +
         '<div class="collapsible-content">' + innerHtml + '</div>'
      );
   }

   function renderTileGrid(tilesHtml, gridClass) {
      var cls = 'grid dailies-grid' + (gridClass ? ' ' + gridClass : '');
      return '<div class="' + cls + '">' + tilesHtml + '</div>';
   }

   function renderWishlistsSection(itemdbTargets, petName) {
      var tiles = (itemdbTargets || []).map(function (target) {
         return renderItemdbTile(target, petName);
      }).join('');
      return (
         '<section class="dailies-wishlists-section">' +
         '<h2 class="dailies-section-heading">Wishlists</h2>' +
         renderTileGrid(tiles, 'dailies-wishlists-grid') +
         '</section>'
      );
   }

   function renderAutomatedPanel() {
      return (
         '<div class="automated-panel">' +
         '<div class="automated-item" id="cocoshy-automation">' +
         '<div class="automated-header">' +
         '<a class="daily-icon-box" href="https://www.neopets.com/halloween/cocoshy.phtml" target="_blank">' +
         '<img src="https://images.neopets.com/items/spo_coconut_1.gif" alt="Coconut Shy" referrerpolicy="no-referrer">' +
         '</a><div><strong>Coconut Shy</strong><br><span class="text-small">20 throws/day · 100 NP each</span></div></div>' +
         '<button type="button" class="automated-run" id="cocoshy-run">Run 20 throws</button>' +
         '<div class="automated-status" id="cocoshy-status">Ready.</div></div>' +
         '<hr class="automated-divider">' +
         '<div class="automated-item" id="wishingwell-automation">' +
         '<div class="automated-header">' +
         '<a class="daily-icon-box" href="https://www.neopets.com/wishing.phtml" target="_blank">' +
         '<img src="https://images.neopets.com/items/foo_toyww_chococoin.gif" alt="Wishing Well" referrerpolicy="no-referrer">' +
         '</a><div><strong>Wishing Well</strong><br><span class="text-small">7 wishes per period · 21 NP min</span></div></div>' +
         '<div class="automated-field"><label for="wishingwell-wish">Wish for</label>' +
         '<input type="text" id="wishingwell-wish" placeholder="e.g. Snowager Stamp"></div>' +
         '<div class="automated-field"><label for="wishingwell-donation">Donation (NP)</label>' +
         '<input type="number" id="wishingwell-donation" min="21" value="21"></div>' +
         '<button type="button" class="automated-run" id="wishingwell-run">Run 7 wishes</button>' +
         '<div class="automated-status" id="wishingwell-status">Ready.</div></div></div>'
      );
   }

   function renderAutomatedSection() {
      return (
         '<section class="dailies-automated-section">' +
         '<h2 class="dailies-section-heading">Automated</h2>' +
         renderAutomatedPanel() +
         '</section>'
      );
   }

   function renderDailiesSection(settings, petName) {
      var DL = global.DailiesLinks;
      var groups = DL.getLinksByGroup(settings);
      var tiles = '';
      Object.keys(groups).sort(function (a, b) {
         return Number(a) - Number(b);
      }).forEach(function (groupKey) {
         var groupNum = Number(groupKey);
         if (groupNum <= 2) {
            return;
         }
         (groups[groupKey] || []).forEach(function (link) {
            tiles += renderLinkTile(link, petName);
         });
      });
      return (
         '<section class="dailies-dailies-section">' +
         '<h2 class="dailies-section-heading">Dailies</h2>' +
         renderTileGrid(tiles) +
         '</section>'
      );
   }

   function renderMainGrid(settings, itemdbTargets, petName) {
      return (
         renderWishlistsSection(itemdbTargets, petName) +
         renderDailiesSection(settings, petName) +
         renderAutomatedSection()
      );
   }

   function renderShopTiles(shops) {
      return shops.map(function (shop) {
         var html = '<div class="daily-tile sidebar-tile" data-link-id="' + escapeHtml(shop.id) + '">';
         html += '<a href="' + escapeHtml(shop.url) + '" target="_blank">';
         html += '<img src="' + escapeHtml(shop.img) + '" alt="" referrerpolicy="no-referrer">';
         html += '</a>';
         html += '<a href="' + escapeHtml(shop.url) + '" target="_blank">' + escapeHtml(shop.label) + '</a>';
         html += '</div>';
         return html;
      }).join('');
   }

   function renderSidebar(settings, petName) {
      var DL = global.DailiesLinks;
      var groups = DL.getLinksByGroup(settings);
      var group1 = groups[1] || [];
      var group2 = groups[2] || [];
      var mainPet = group1.find(function (link) { return link.id === 'main-pet'; });
      var quickLinks = group1.filter(function (link) { return link.id !== 'main-pet'; });
      var albumLinks = group2.filter(function (link) {
         return DL.ALBUM_LINK_IDS.indexOf(link.id) !== -1;
      });
      var html = '';

      if (mainPet) {
         var petTile = Object.assign({}, mainPet, { label: petName });
         html += '<div class="dailies-sidebar-pet">';
         html += renderLinkTile(petTile, petName, 'sidebar-tile');
         html += '</div>';
      }

      if (quickLinks.length > 0) {
         html += renderCollapsible('Quick Links', renderTileGrid(
            quickLinks.map(function (link) {
               return renderLinkTile(link, petName, 'sidebar-tile');
            }).join(''),
            'dailies-sidebar-grid'
         ));
      }

      if (albumLinks.length > 0) {
         html += renderCollapsible('My Albums', renderTileGrid(
            albumLinks.map(function (link) {
               return renderLinkTile(link, petName, 'sidebar-tile');
            }).join(''),
            'dailies-sidebar-grid'
         ));
      }

      html += renderCollapsible('Pinned Shops',
         '<div class="dailies-sidebar-grid">' + renderShopTiles(DL.BOOK_SHOPS) + '</div>'
      );

      return html;
   }

   function renderAlertCards(settings) {
      var container = document.getElementById('seasonal-alerts');
      var grid = document.getElementById('seasonal-alerts-grid');
      if (!container || !grid) {
         return;
      }
      var active = global.DailiesTimed.getActiveCards(settings);
      if (active.length === 0) {
         container.hidden = true;
         grid.innerHTML = '';
         return;
      }
      grid.innerHTML = active.map(function (card) {
         return '<a class="seasonal-alert-card ' + card.styleClass + '" href="' + escapeHtml(card.url) + '" target="_blank" data-timed-id="' + escapeHtml(card.id) + '">' +
            '<img src="' + escapeHtml(card.img) + '" alt="" referrerpolicy="no-referrer">' +
            '<span><span class="seasonal-alert-label">' + escapeHtml(card.name) + '</span>' +
            (card.note ? '<span class="seasonal-alert-note">' + escapeHtml(card.note) + '</span>' : '') +
            '</span></a>';
      }).join('');
      container.hidden = false;

      grid.querySelectorAll('[data-timed-id]').forEach(function (el) {
         el.addEventListener('click', function () {
            var id = el.getAttribute('data-timed-id');
            var card = active.find(function (c) { return c.id === id; });
            if (card) {
               global.DailiesTimed.handleCardClick(card);
            }
         });
      });
   }

   function renderSettingsTray(settings) {
      var DS = global.DailiesSettings;
      var schoolKeys = Object.keys(DS.SCHOOL_LABELS);
      var html = '';

      html += '<div class="settings-field"><label for="main-pet-name">Main Pet</label>';
      html += '<input type="text" id="main-pet-name" autocomplete="off" spellcheck="false">';
      html += '<p class="settings-hint">Updates header portrait and pet-specific links.</p></div>';

      html += '<div class="settings-field"><span class="settings-label">Faerie quest (once per day)</span>';
      html += '<div class="settings-radios">';
      html += '<label class="settings-radio"><input type="radio" name="faerie-quest" value="illusen"' + (settings.faerieQuest === 'illusen' ? ' checked' : '') + '> Illusen</label>';
      html += '<label class="settings-radio"><input type="radio" name="faerie-quest" value="jhudora"' + (settings.faerieQuest === 'jhudora' ? ' checked' : '') + '> Jhudora</label>';
      html += '</div></div>';

      html += '<div class="settings-field"><span class="settings-label">Training links</span><div class="settings-checkboxes">';
      schoolKeys.forEach(function (key) {
         var checked = settings.schools && settings.schools[key] !== false;
         html += '<label class="settings-checkbox"><input type="checkbox" data-school="' + escapeHtml(key) + '"' + (checked ? ' checked' : '') + '> ' + escapeHtml(DS.SCHOOL_LABELS[key]) + '</label>';
      });
      html += '</div></div>';

      html += '<div class="settings-field"><label for="magma-pool-time">Magma Pool open time (local)</label>';
      html += '<input type="time" id="magma-pool-time" value="' + escapeHtml(settings.magmaPoolLocalTime || '14:47') + '"></div>';
      html += '<div class="settings-field"><label for="magma-pool-buffer">Magma Pool buffer (minutes)</label>';
      html += '<input type="number" id="magma-pool-buffer" min="1" max="120" value="' + escapeHtml(String(settings.magmaPoolBufferMinutes || 15)) + '"></div>';

      html += '<div class="settings-field"><label for="itemdb-api-key">ItemDB API key (optional)</label>';
      html += '<input type="password" id="itemdb-api-key" autocomplete="off" value="' + escapeHtml(settings.itemdbApiKey || '') + '">';
      html += '<p class="settings-hint">Requires Rayenz Dailies userscript for ItemDB API access.</p></div>';

      html += '<button type="button" id="settings-save" class="settings-save">Save settings</button>';

      var body = document.querySelector('.settings-tray-body');
      if (body) {
         body.innerHTML = html;
      }
   }

   function readSettingsFromTray(current) {
      var settings = Object.assign({}, current, {
         schools: Object.assign({}, current.schools || {})
      });
      var fq = document.querySelector('input[name="faerie-quest"]:checked');
      if (fq) {
         settings.faerieQuest = fq.value;
      }
      document.querySelectorAll('[data-school]').forEach(function (el) {
         settings.schools[el.getAttribute('data-school')] = el.checked;
      });
      var magmaTime = document.getElementById('magma-pool-time');
      if (magmaTime && magmaTime.value) {
         settings.magmaPoolLocalTime = magmaTime.value;
      }
      var magmaBuffer = document.getElementById('magma-pool-buffer');
      if (magmaBuffer) {
         settings.magmaPoolBufferMinutes = parseInt(magmaBuffer.value, 10) || 15;
      }
      var apiKey = document.getElementById('itemdb-api-key');
      if (apiKey) {
         settings.itemdbApiKey = apiKey.value.trim();
      }
      return settings;
   }

   function fallbackItemdbTargets() {
      return global.DailiesLinks.ITEMDB_LISTS.map(function (list) {
         return { list: list, item: null, error: 'loading' };
      });
   }

   function renderDailiesShell(settings, petName) {
      petName = petName || global.DailiesSettings.getMainPet();
      var mainEl = document.getElementById('dailies-links');
      var sidebarEl = document.getElementById('dailies-books');
      if (mainEl) {
         mainEl.innerHTML = renderMainGrid(settings, fallbackItemdbTargets(), petName);
      }
      if (sidebarEl) {
         sidebarEl.innerHTML = renderSidebar(settings, petName);
      }
      renderAlertCards(settings);
   }

   function refreshWishlists(settings) {
      var petName = global.DailiesSettings.getMainPet();
      return global.DailiesItemdb.loadListTargets(global.DailiesLinks.ITEMDB_LISTS, settings)
         .then(function (itemdbTargets) {
            var mainEl = document.getElementById('dailies-links');
            if (!mainEl) {
               return;
            }
            var existing = mainEl.querySelector('.dailies-wishlists-section');
            var fresh = renderWishlistsSection(itemdbTargets, petName);
            if (existing) {
               existing.outerHTML = fresh;
            }
         });
   }

   function renderDailiesPage(settings) {
      var petName = global.DailiesSettings.getMainPet();
      renderDailiesShell(settings, petName);
      return refreshWishlists(settings);
   }

   global.DailiesRender = {
      renderMainGrid: renderMainGrid,
      renderSidebar: renderSidebar,
      renderDailiesShell: renderDailiesShell,
      refreshWishlists: refreshWishlists,
      renderAlertCards: renderAlertCards,
      renderSettingsTray: renderSettingsTray,
      readSettingsFromTray: readSettingsFromTray,
      renderDailiesPage: renderDailiesPage,
      renderLinkTile: renderLinkTile
   };
})(window);
