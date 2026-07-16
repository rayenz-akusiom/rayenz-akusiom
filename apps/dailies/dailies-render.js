(function (global) {
   'use strict';

   var escapeHtml = global.HubUtils ? global.HubUtils.escapeHtml : function (s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
   };

   var SHOP_WIZARD_ICON = 'https://images.neopets.com/shopkeepers/shopwizard.gif';
   var ITEMDB_ICON = 'https://itemdb.com.br/favicon.ico';
   var SDB_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAECklEQVRYhe1WS08jRxD+qj2PHQ8gbLB5SgaBQKDkyokDXPIbOOcX5RJFSi45RcovyCESIocoOawQSHhxQDwMEg/j4CEz4/FO90zlwIzXsMbrELTaw35SH2ZUVd/XVdVdDXzGZ3yKIKKPxwUAlmVNFAqFNcMwviwUChfZbPZ8b2/vLTP/PTg4eCuE8E9OTlgpxQDeAmgBYAB6EkcCiADESUzu4NASO5H8l8nitoCZmZmv19fXf3AcR0xNTcUDAwOy1WqBmZtE9I+U0t/Z2ckwc2wYhgOgngTIJiR+IirqEMAJ6SsANgADgALgE5F/c3PzZ7lc/lYTQmB6enpI3AOGYYhsNmtalgUAJoAcEWF2dhZhGMJ1Xei6DsMwwNy50f4QBAFM04RlWROVSuVHjYig67qdGjBze6WI4xhSSjSbTRQKBTSbTRSLRdi23ZWkG+I4xvX1NUzThFIKvu8PEVFWS0j1pxyFEDg6OsLW1haICBsbG1heXka5XEYURdD1J10fwPM85PN5LCwsYHt7G47jCACkJTsNezm7rotarYZMJgOlFEZHR5HP53F4eAjbtj9YCqUUTNPEysoKhBCpvQYgozEzWq2WSo9eFEXvBZBSPiBhZmQyGQwPD2NwcPCDAlJ/ImqXN5vNGpOTk5rGzFBKRUTUNngKhmHAMIwHQh73Szc8tmFmWJYlJicnNQ0AiOjJQjIz5ufnsbq6CiJCsVh8Vvd3gWDmjJZ85HsJyOVyKJVKcF0XQoiXIG8LSKMN9bLsTHUcx/+bOSl1JggCU+D+5tL6cSKirk36TBhRFL1KM9Azr8lJQRAEL0UOABkARkr85PgTQqBarWJzcxPlcrndgGlG/svqIkBPU99z/jqOg0ajAeDdPSGlhOd5iOO4r4tICIEoiqBp7WoLAFpfAjoDKaXQaDQwMTGBpaWlvt8OjUYDR0dHKJVKqQ8BoFRAz9bWNA1DQ0PI5XJoNBoYGRnB3Nxc33MAAEqlEqrVKvb39+G6bjsTGgAKw9BMd/L4mDEzSqUS1tbWwMw4PT2FlBKVSqVv8hREhHq9DsdxMD4+HgNQqQArbZRuAgYGBmBZFoiIdV2PPc9rF11KSVEUpd9xstLXkcL9oAuT7wwR2SMjI7bnebdhGNbTEnTtIiJCEAS4u7ur6rr+i+/7f4Rh6CYEDAC7u7u4uLgAEXHyX3WsEO9eSwr3T7McgGFmdqWU+10vICKCUgp3d3e1s7Ozn46Pj78/PT39y/O893qln2HUC10FuK7bvLy8/LVSqXxzfHz8++3trXw2Qz8CmJnDMIRSimu12ptarfbd69evfz4/P6+/xN3fCwSAbNv+amxs7IvFxcXg4ODgt6urqze+77/IzO0byYv4o3J+EvgX4yIhYBP/dWUAAAAASUVORK5CYII=';

   function renderWishlistActionIcon(tag, attrs, iconSrc) {
      var defaults = { class: 'wishlist-action-btn' };
      if (tag === 'button') {
         defaults.type = 'button';
      } else if (tag === 'a') {
         defaults.target = '_blank';
         defaults.rel = 'noopener';
      }
      var merged = Object.assign({}, defaults, attrs || {});
      var html = '<' + tag;
      Object.keys(merged).forEach(function (key) {
         html += ' ' + key + '="' + escapeHtml(merged[key]) + '"';
      });
      html += '><img src="' + escapeHtml(iconSrc) + '" alt="" referrerpolicy="no-referrer"></' + tag + '>';
      return html;
   }

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

   function renderMainPetSidebarTile(link, petName) {
      var hasPet = !!(petName && String(petName).trim());
      var label = hasPet ? String(petName).trim() : 'Main Pet';
      var tileClass = 'daily-tile sidebar-tile pet-edit-host' + (hasPet ? '' : ' pet-tile--empty');
      var html = '<div class="' + tileClass + '" data-link-id="main-pet">';
      if (hasPet) {
         var url = buildPetHref(link.petHref, petName);
         var img = 'https://pets.neopets.com/cpn/' + encodeURIComponent(petName) + '/1/4.png';
         html += '<a href="' + escapeHtml(url) + '" target="_blank" class="main-pet-link" data-pet-href="' +
            escapeHtml(link.petHref || '') + '">';
         html += '<img src="' + escapeHtml(img) + '" alt="" referrerpolicy="no-referrer">';
         html += '</a>';
         html += '<a href="' + escapeHtml(url) + '" target="_blank" class="main-pet-label main-pet-link" data-pet-href="' +
            escapeHtml(link.petHref || '') + '">' + escapeHtml(label) + '</a>';
      } else {
         html += '<span class="pet-tile-placeholder" aria-hidden="true"></span>';
         html += '<span class="main-pet-label pet-tile-nameplate">' + escapeHtml(label) + '</span>';
      }
      html += '<button type="button" class="pet-edit-btn" aria-label="Edit main pet" title="Edit main pet">&#9998;</button>';
      html += '</div>';
      return html;
   }

   function formatNpPrice(value) {
      if (value == null || value === Infinity || isNaN(value)) {
         return null;
      }
      return Number(value).toLocaleString('en-US') + ' NP';
   }

   function sswUrlForWishlistItem(item) {
      if (item.shopWizardUrl) {
         return item.shopWizardUrl;
      }
      return 'https://www.neopets.com/shops/wizard.phtml?string=' + encodeURIComponent(item.name);
   }

   function sdbUrlForWishlistItem(item){
      return 'https://www.neopets.com/safetydeposit.phtml?obj_name=' + encodeURIComponent(item.name) + '&category=0';
   }

   function renderWishlistCardHeader(list, cachedAt, menuContext) {
      menuContext = menuContext || {};
      var html = '<div class="wishlist-card-header">';
      if (list.img) {
         html += '<img class="wishlist-card-list-icon" src="' + escapeHtml(list.img) + '" alt="" referrerpolicy="no-referrer">';
      }
      html += '<div class="wishlist-card-header-text">';
      html += '<a class="wishlist-card-title" href="' + escapeHtml(list.listUrl) + '" target="_blank">' + escapeHtml(list.label) + '</a>';
      if (cachedAt) {
         html += '<span class="wishlist-cache-hint">' + escapeHtml(formatWishlistCacheAge(cachedAt)) + '</span>';
      }
      html += '</div>';
      var menuAttrs = {
         class: 'wishlist-action-btn wishlist-card-menu-btn',
         'data-wishlist-menu': '',
         'data-wishlist-id': list.id,
         title: 'Wishlist options',
         'aria-label': 'Wishlist options',
         'aria-expanded': 'false',
         'aria-haspopup': 'true'
      };
      if (menuContext.itemIid != null && menuContext.itemIid !== '') {
         menuAttrs['data-item-iid'] = String(menuContext.itemIid);
      }
      if (menuContext.itemName) {
         menuAttrs['data-item-name'] = menuContext.itemName;
      }
      html += renderWishlistActionIcon('button', menuAttrs, global.NeopetsIcons.WISHLIST_MENU_ICON);
      html += '</div>';
      return html;
   }

   function renderWishlistFallbackMessage(target) {
      if (target.error === 'loading') {
         return 'Loading…';
      }
      if (target.error === 'no-bridge') {
         return 'Install the Rayenz Dailies userscript to load wishlists';
      }
      if (target.error === 'waiting-for-cache') {
         return 'Wishlist not cached yet — will fetch on a later visit';
      }
      if (target.error && target.error.indexOf('session expired') !== -1) {
         return target.error;
      }
      if (target.error) {
         return target.error;
      }
      return 'No tradeable items found';
   }

   function formatWishlistCacheAge(cachedAt) {
      if (!cachedAt || !global.DailiesItemdb || !global.DailiesItemdb.formatCacheAgeMs) {
         return '';
      }
      var age = global.DailiesItemdb.formatCacheAgeMs(Date.now() - cachedAt);
      return age ? 'Cached ' + age + ' ago' : '';
   }

   function renderWishlistCard(target) {
      var list = target.list;
      var html = '<article class="wishlist-card" data-wishlist-id="' + escapeHtml(list.id) + '"';
      if (target.item) {
         html += ' data-item-iid="' + escapeHtml(String(target.item.itemIid != null ? target.item.itemIid : '')) + '"';
         html += ' data-item-name="' + escapeHtml(target.item.name || '') + '"';
      }
      html += '>';
      var menuContext = {};
      if (target.item) {
         menuContext.itemIid = target.item.itemIid != null ? target.item.itemIid : '';
         menuContext.itemName = target.item.name || '';
      }
      html += renderWishlistCardHeader(list, target.cachedAt, menuContext);
      if (!target.item) {
         html += '<div class="wishlist-card-body wishlist-card-body--fallback">';
         html += '<p class="wishlist-card-message">' + escapeHtml(renderWishlistFallbackMessage(target)) + '</p>';
         html += '</div>';
      } else {
         var item = target.item;
         var sswUrl = sswUrlForWishlistItem(item);
         var hideUrl = global.DailiesItemdb.itemdbUrlForWishlistItem(item);
         var sdbUrl = sdbUrlForWishlistItem(item);
         var price = item.priceNp != null ? formatNpPrice(item.priceNp) : null;
         var itemIid = item.itemIid != null ? item.itemIid : '';
         html += '<div class="wishlist-card-body">';
         html += '<a class="wishlist-card-item-image" href="' + escapeHtml(sswUrl) + '" target="_blank" title="Shop Wizard: ' + escapeHtml(item.name) + '">';
         html += '<img src="' + escapeHtml(item.image || list.img) + '" alt="" referrerpolicy="no-referrer">';
         html += '</a>';
         html += '<div class="wishlist-card-item-text">';
         html += '<div class="wishlist-card-item-name">' + escapeHtml(item.name) + '</div>';
         if (item.description) {
            html += '<div class="wishlist-card-item-desc">' + escapeHtml(item.description) + '</div>';
         }
         html += '<div class="wishlist-card-actions">';
         html += renderWishlistActionIcon('button', {
            'data-wishlist-next': '',
            'data-wishlist-id': list.id,
            'data-item-iid': String(itemIid),
            title: 'Next item',
            'aria-label': 'Next item'
         }, global.NeopetsIcons.WISHLIST_NEXT_ICON);
         html += renderWishlistActionIcon('a', {
            href: sswUrl,
            title: 'Shop Wizard: ' + item.name,
            'aria-label': 'Shop Wizard: ' + item.name
         }, SHOP_WIZARD_ICON);
         html += renderWishlistActionIcon('a', {
            href: hideUrl,
            title: 'Hide on ItemDB',
            'aria-label': 'Hide on ItemDB'
         }, ITEMDB_ICON);
         html += renderWishlistActionIcon('a', {
            href: hideUrl,
            title: 'Find in SDB',
            'aria-label': 'Find in SDB'
         }, SDB_ICON);
         html += '</div>';
         html += '</div>';
         if (price) {
            html += '<div class="wishlist-card-price">' + escapeHtml(price) + '</div>';
         }
         html += '</div>';
      }
      html += '</article>';
      return html;
   }

   function refreshSingleWishlistCard(target) {
      var card = document.querySelector('.wishlist-card[data-wishlist-id="' + target.list.id + '"]');
      if (card) {
         card.outerHTML = renderWishlistCard(target);
      }
   }

   function ensureWishlistContextMenu() {
      var menu = document.getElementById('wishlist-context-menu');
      if (menu) {
         return menu;
      }
      menu = document.createElement('div');
      menu.id = 'wishlist-context-menu';
      menu.className = 'wishlist-context-menu';
      menu.hidden = true;
      document.body.appendChild(menu);
      return menu;
   }

   function clearWishlistMenuButtonState() {
      document.querySelectorAll('[data-wishlist-menu][aria-expanded="true"]').forEach(function (btn) {
         btn.setAttribute('aria-expanded', 'false');
      });
   }

   function closeWishlistContextMenu() {
      var menu = document.getElementById('wishlist-context-menu');
      if (menu) {
         menu.hidden = true;
         menu.innerHTML = '';
      }
      clearWishlistMenuButtonState();
   }

   function clampWishlistContextMenuPosition(menu, left, top) {
      var pad = 8;
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      var rect = menu.getBoundingClientRect();
      var x = left;
      var y = top;
      if (rect.right > window.innerWidth - pad) {
         x = Math.max(pad, window.innerWidth - rect.width - pad);
      }
      if (rect.bottom > window.innerHeight - pad) {
         y = Math.max(pad, window.innerHeight - rect.height - pad);
      }
      if (x < pad) {
         x = pad;
      }
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
   }

   function openWishlistContextMenu(clientX, clientY, listId, itemIid, itemName, blacklistedItems, menuBtn) {
      var menu = ensureWishlistContextMenu();
      clearWishlistMenuButtonState();
      var html = '';
      if (itemIid != null && !isNaN(itemIid)) {
         html += '<button type="button" class="wishlist-context-menu-item" data-wishlist-blacklist data-wishlist-id="' +
            escapeHtml(listId) + '" data-item-iid="' + escapeHtml(String(itemIid)) + '">Blacklist "' +
            escapeHtml(itemName || ('Item ' + itemIid)) + '"</button>';
      }
      if (blacklistedItems && blacklistedItems.length) {
         html += '<div class="wishlist-context-menu-heading">Remove from blacklist</div>';
         blacklistedItems.forEach(function (entry) {
            html += '<button type="button" class="wishlist-context-menu-item wishlist-context-menu-item-remove" data-wishlist-unblacklist data-wishlist-id="' +
               escapeHtml(listId) + '" data-item-iid="' + escapeHtml(String(entry.itemIid)) + '">Remove "' +
               escapeHtml(entry.name) + '"</button>';
         });
      }
      if (!html) {
         menu.hidden = true;
         menu.innerHTML = '';
         return;
      }
      menu.innerHTML = html;
      menu.hidden = false;
      var left = clientX;
      var top = clientY;
      if (menuBtn) {
         var anchor = menuBtn.getBoundingClientRect();
         left = anchor.right - menu.offsetWidth;
         top = anchor.bottom + 4;
      }
      clampWishlistContextMenuPosition(menu, left, top);
      if (menuBtn) {
         menuBtn.setAttribute('aria-expanded', 'true');
      }
   }

   /* Wishlist targets come from DailiesItemdb.loadListTargets; this module only renders. */
   function renderWishlistsSection(targets) {
      targets = targets || [];
      var cards = targets.map(function (target) {
         return renderWishlistCard(target);
      }).join('');
      var emptyNote = targets.length === 0
         ? '<p class="wishlist-empty-note">No wishlists configured. Add some in settings.</p>'
         : '';
      return (
         '<section class="dailies-wishlists-section">' +
         '<h2 class="dailies-section-heading">Wishlists</h2>' +
         '<div class="wishlist-cards">' + cards + emptyNote + '</div>' +
         '</section>'
      );
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

   function renderMainGrid(settings, itemdbTargets, petName) {
      return (
         renderWishlistsSection(itemdbTargets) +
         renderDailiesSection(settings, petName) +
         renderAutomatedSection()
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
         html += '<div class="dailies-sidebar-pet">';
         html += renderMainPetSidebarTile(mainPet, petName);
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

   function renderWishlistSettingsRow(wishlist, index) {
      return (
         '<div class="wishlist-settings-row" data-wishlist-index="' + index + '">' +
         '<div class="wishlist-settings-row-actions">' +
         '<button type="button" class="wishlist-move-up" title="Move up" aria-label="Move up">↑</button>' +
         '<button type="button" class="wishlist-move-down" title="Move down" aria-label="Move down">↓</button>' +
         '<button type="button" class="wishlist-remove" title="Remove" aria-label="Remove">×</button>' +
         '</div>' +
         '<label class="wishlist-settings-field">Label' +
         '<input type="text" class="wishlist-label" value="' + escapeHtml(wishlist.label || '') + '" autocomplete="off">' +
         '</label>' +
         '<label class="wishlist-settings-field">ItemDB list URL' +
         '<input type="url" class="wishlist-list-url" value="' + escapeHtml(wishlist.listUrl || '') + '" autocomplete="off" placeholder="https://itemdb.com.br/lists/user/slug">' +
         '</label>' +
         '<label class="wishlist-settings-field">Icon URL' +
         '<input type="url" class="wishlist-img" value="' + escapeHtml(wishlist.img || '') + '" autocomplete="off" placeholder="https://images.neopets.com/items/...">' +
         '</label>' +
         '</div>'
      );
   }

   function renderWishlistSettingsRows(wishlists) {
      return (wishlists || []).map(function (wishlist, index) {
         return renderWishlistSettingsRow(wishlist, index);
      }).join('');
   }

   function readWishlistRowsFromDom() {
      var rows = document.querySelectorAll('.wishlist-settings-row');
      return Array.prototype.map.call(rows, function (row) {
         var label = row.querySelector('.wishlist-label');
         var listUrl = row.querySelector('.wishlist-list-url');
         var img = row.querySelector('.wishlist-img');
         return {
            label: label ? label.value.trim() : '',
            listUrl: listUrl ? listUrl.value.trim() : '',
            img: img ? img.value.trim() : ''
         };
      });
   }

   function readWishlistsFromTray() {
      var DS = global.DailiesSettings;
      var rows = document.querySelectorAll('.wishlist-settings-row');
      var wishlists = [];
      rows.forEach(function (row) {
         var label = row.querySelector('.wishlist-label');
         var listUrl = row.querySelector('.wishlist-list-url');
         var img = row.querySelector('.wishlist-img');
         var entry = DS.normalizeWishlist({
            label: label ? label.value.trim() : '',
            listUrl: listUrl ? listUrl.value.trim() : '',
            img: img ? img.value.trim() : ''
         }, wishlists.length);
         if (entry.listUrl && entry.slug) {
            wishlists.push(entry);
         }
      });
      return wishlists;
   }

   function refreshWishlistSettingsRows(wishlists) {
      var container = document.getElementById('wishlist-settings-rows');
      if (container) {
         container.innerHTML = renderWishlistSettingsRows(wishlists);
      }
   }

   function bindWishlistSettingsEvents() {
      var container = document.getElementById('wishlist-settings-rows');
      if (!container || container.getAttribute('data-bound') === '1') {
         return;
      }
      container.setAttribute('data-bound', '1');

      var addBtn = document.getElementById('wishlist-add');
      if (addBtn) {
         addBtn.addEventListener('click', function () {
            var current = readWishlistRowsFromDom();
            current.push({ label: '', listUrl: '', img: '' });
            refreshWishlistSettingsRows(current);
         });
      }

      var resetBtn = document.getElementById('wishlist-reset-defaults');
      if (resetBtn) {
         resetBtn.addEventListener('click', function () {
            refreshWishlistSettingsRows(global.DailiesSettings.DEFAULT_WISHLISTS.map(function (w) {
               return Object.assign({}, w);
            }));
         });
      }

      container.addEventListener('click', function (event) {
         var btn = event.target.closest('button');
         if (!btn || !container.contains(btn)) {
            return;
         }
         var row = btn.closest('.wishlist-settings-row');
         if (!row) {
            return;
         }
         var current = readWishlistRowsFromDom();
         var index = Array.prototype.indexOf.call(container.querySelectorAll('.wishlist-settings-row'), row);
         if (btn.classList.contains('wishlist-remove')) {
            current.splice(index, 1);
            refreshWishlistSettingsRows(current);
            return;
         }
         if (btn.classList.contains('wishlist-move-up') && index > 0) {
            var prev = current[index - 1];
            current[index - 1] = current[index];
            current[index] = prev;
            refreshWishlistSettingsRows(current);
            return;
         }
         if (btn.classList.contains('wishlist-move-down') && index < current.length - 1) {
            var next = current[index + 1];
            current[index + 1] = current[index];
            current[index] = next;
            refreshWishlistSettingsRows(current);
         }
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

      var wishlists = global.DailiesSettings.getWishlists(settings);
      html += '<div class="settings-field settings-wishlists-field">';
      html += '<span class="settings-label">Wishlists</span>';
      html += '<p class="settings-hint">Uses your ItemDB login via the userscript. Visit itemdb.com.br if lists stop loading. Verbose console logs: set <code>localStorage.dailies-itemdb-debug</code> to <code>"1"</code> and refresh.</p>';
      html += '<div id="wishlist-settings-rows" class="wishlist-settings-rows">' + renderWishlistSettingsRows(wishlists) + '</div>';
      html += '<div class="wishlist-settings-actions">';
      html += '<button type="button" id="wishlist-add" class="wishlist-settings-btn">Add wishlist</button>';
      html += '<button type="button" id="wishlist-reset-defaults" class="wishlist-settings-btn wishlist-settings-btn-secondary">Reset to defaults</button>';
      html += '</div></div>';

      html += '<button type="button" id="settings-save" class="settings-save">Save settings</button>';

      var body = document.querySelector('.settings-tray-body');
      if (body) {
         body.innerHTML = html;
      }
      bindWishlistSettingsEvents();
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
      settings.wishlists = readWishlistsFromTray();
      return settings;
   }

   function fallbackItemdbTargets(settings) {
      return global.DailiesSettings.getWishlists(settings).map(function (list) {
         return { list: list, item: null, error: 'loading' };
      });
   }

   function renderDailiesShell(settings, petName) {
      petName = petName || global.DailiesSettings.getMainPet();
      var mainEl = document.getElementById('dailies-links');
      var sidebarEl = document.getElementById('dailies-books');
      if (mainEl) {
         mainEl.innerHTML = renderMainGrid(settings, fallbackItemdbTargets(settings), petName);
      }
      if (sidebarEl) {
         sidebarEl.innerHTML = renderSidebar(settings, petName);
      }
      renderAlertCards(settings);
   }

   function refreshWishlists(settings) {
      var wishlists = global.DailiesSettings.getWishlists(settings);
      return global.DailiesItemdb.loadListTargets(wishlists, settings)
         .then(function (itemdbTargets) {
            var mainEl = document.getElementById('dailies-links');
            if (!mainEl) {
               return;
            }
            var existing = mainEl.querySelector('.dailies-wishlists-section');
            var fresh = renderWishlistsSection(itemdbTargets);
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
      renderLinkTile: renderLinkTile,
      renderMainPetSidebarTile: renderMainPetSidebarTile,
      renderWishlistCard: renderWishlistCard,
      renderWishlistsSection: renderWishlistsSection,
      refreshSingleWishlistCard: refreshSingleWishlistCard,
      openWishlistContextMenu: openWishlistContextMenu,
      closeWishlistContextMenu: closeWishlistContextMenu,
      formatNpPrice: formatNpPrice
   };
})(window);
