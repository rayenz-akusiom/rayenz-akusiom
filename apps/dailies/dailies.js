(function () {
   'use strict';

               var __dailiesTimersStarted = false;
               var __dailiesSettingsGlobalsBound = false;
               var __dailiesBridgeBound = false;
               var __dailiesCloseSettings = null;
               var __dailiesBridgeHandler = null;

               var COCOSHY_URL = 'https://www.neopets.com/halloween/process_cocoshy.phtml?coconut=3';
               var MAX_THROWS = 20;
               var THROW_DELAY_MS = 400;

               function decodeParam(value) {
                  if (!value) return '';
                  return decodeURIComponent(value.replace(/\+/g, ' '));
               }

               function parseCocoShyResponse(text) {
                  var body = (text || '').trim();
                  var query = body;
                  var ampIndex = body.indexOf('points=');
                  if (ampIndex === -1 && body.indexOf('success=') !== -1) {
                     ampIndex = body.indexOf('success=');
                  }
                  if (ampIndex > 0) {
                     query = body.slice(ampIndex);
                  }
                  var params = new URLSearchParams(query);
                  return {
                     points: params.get('points'),
                     success: params.get('success'),
                     prizeId: params.get('prize_id'),
                     error: decodeParam(params.get('error')),
                     raw: body
                  };
               }

               function isLoginPage(text) {
                  return /Neopets Account|Log In With NeoPass|Two-Factor Authentication/i.test(text);
               }

               function sleep(ms) {
                  return new Promise(function (resolve) {
                     setTimeout(resolve, ms);
                  });
               }

               function neopetsFetch(url) {
                  if (typeof window.__neopetsFetch === 'function') {
                     return window.__neopetsFetch(url).then(function (response) {
                        return typeof response === 'string' ? response : response.text;
                     });
                  }
                  return Promise.reject(new Error('Userscript bridge not available. Install rayenz-dailies.user.js in Tampermonkey.'));
               }

               function neopetsPost(url, data) {
                  if (typeof window.__neopetsPost === 'function') {
                     return window.__neopetsPost(url, data).then(function (response) {
                        if (typeof response === 'string') {
                           return { text: response, url: '', status: 0 };
                        }
                        return response;
                     });
                  }
                  return Promise.reject(new Error('Userscript bridge not available. Install rayenz-dailies.user.js in Tampermonkey.'));
               }

               function setStatus(statusEl, message, className) {
                  statusEl.textContent = message;
                  statusEl.className = 'automated-status' + (className ? ' ' + className : '');
               }

               function dailiesProgress() {
                  return window.__dailiesProgress || null;
               }

               async function runCoconutShy() {
                  var runBtn = document.getElementById('cocoshy-run');
                  var statusEl = document.getElementById('cocoshy-status');
                  var progress = dailiesProgress();
                  var processed = 0;
                  var wonItem = null;
                  var hadError = false;

                  runBtn.disabled = true;
                  setStatus(statusEl, 'Running throws...');
                  if (progress) {
                     progress.start({ label: 'Running Coco Shy throws…' });
                  }

                  for (var throwNum = 1; throwNum <= MAX_THROWS; throwNum++) {
                     if (progress) {
                        progress.update({
                           current: throwNum,
                           total: MAX_THROWS,
                           label: 'Coco Shy throw ' + throwNum + '/' + MAX_THROWS + '…'
                        });
                     }
                     try {
                        var responseText = await neopetsFetch(COCOSHY_URL);

                        if (isLoginPage(responseText)) {
                           setStatus(statusEl, 'Not logged in to Neopets. Log in at neopets.com and try again.', 'error');
                           hadError = true;
                           if (progress) {
                              progress.finish({ label: 'Not logged in to Neopets.', variant: 'error' });
                           }
                           break;
                        }

                        var result = parseCocoShyResponse(responseText);

                        if (result.success === '0') {
                           break;
                        }

                        processed++;

                        if (result.prizeId || result.success === '4' || result.success === '5') {
                           wonItem = true;
                        }
                     } catch (err) {
                        setStatus(statusEl, err.message, 'error');
                        hadError = true;
                        if (progress) {
                           progress.finish({ label: err.message, variant: 'error' });
                        }
                        break;
                     }

                     if (throwNum < MAX_THROWS) {
                        await sleep(THROW_DELAY_MS);
                     }
                  }

                  if (!hadError) {
                     var summary = processed + ' throw' + (processed === 1 ? '' : 's') + ' processed.';
                     if (wonItem) {
                        summary += ' Item won!';
                        setStatus(statusEl, summary, 'win');
                     } else {
                        summary += ' No item won.';
                        setStatus(statusEl, summary);
                     }
                     if (progress) {
                        progress.finish({ label: summary, variant: wonItem ? 'success' : 'success' });
                     }
                  }

                  runBtn.disabled = false;
               }

               function initCoconutShyAutomation() {
                  var runBtn = document.getElementById('cocoshy-run');
                  if (!runBtn) return;
                  runBtn.addEventListener('click', runCoconutShy);
               }

               var WISHING_PAGE_URL = 'https://www.neopets.com/wishing.phtml';
               var WISHING_PROCESS_URL = 'https://www.neopets.com/process_wishing.phtml';
               var WISHING_DELAY_MS = 400;

               function wishingWell() {
                  return window.DailiesWishingWell;
               }

               function loadWishingPreferences() {
                  var ww = wishingWell();
                  if (!ww) {
                     return;
                  }
                  var state = ww.loadWishingWellState();
                  var wishInput = document.getElementById('wishingwell-wish');
                  var donationInput = document.getElementById('wishingwell-donation');
                  if (wishInput && state.wish) {
                     wishInput.value = state.wish;
                  }
                  if (donationInput && state.donation) {
                     donationInput.value = String(state.donation);
                  }
               }

               function saveWishingPreferences() {
                  var ww = wishingWell();
                  if (!ww) {
                     return;
                  }
                  var wishInput = document.getElementById('wishingwell-wish');
                  var donationInput = document.getElementById('wishingwell-donation');
                  ww.updateWishingPreferences(
                     wishInput ? wishInput.value.trim() : '',
                     donationInput ? parseInt(donationInput.value, 10) : null
                  );
               }

               async function refreshWishingWellStatus() {
                  var ww = wishingWell();
                  var statusEl = document.getElementById('wishingwell-status');
                  if (!ww || !statusEl) {
                     return;
                  }

                  if (ww.isWishingPeriodComplete()) {
                     setStatus(statusEl, 'Ready.');
                     return;
                  }

                  try {
                     var html = await neopetsFetch(WISHING_PAGE_URL);
                     if (isLoginPage(html)) {
                        setStatus(statusEl, 'Log in at neopets.com to check wish status.', 'notice');
                        return;
                     }

                     var wishCount = ww.parseWishCount(html);
                     var state = ww.loadWishingWellState();
                     if (wishCount !== null) {
                        state.lastWishCount = wishCount;
                        ww.saveWishingWellState(state);
                     }

                     if (wishCount === null) {
                        setStatus(statusEl, 'Ready.');
                        return;
                     }

                     if (wishCount >= ww.WISHING_MAX) {
                        ww.markWishingPeriodComplete(state);
                        setStatus(statusEl, 'Ready.');
                        return;
                     }

                     if (wishCount === 0) {
                        setStatus(statusEl, 'New wish period — you have not donated yet.', 'notice');
                     } else {
                        setStatus(statusEl, 'New wish period — only ' + wishCount + '/' + ww.WISHING_MAX + ' wishes submitted.', 'notice');
                     }
                  } catch (err) {
                     setStatus(statusEl, 'Ready.');
                  }
               }

               async function runWishingWell() {
                  var ww = wishingWell();
                  var runBtn = document.getElementById('wishingwell-run');
                  var statusEl = document.getElementById('wishingwell-status');
                  var wishInput = document.getElementById('wishingwell-wish');
                  var donationInput = document.getElementById('wishingwell-donation');
                  var progress = dailiesProgress();
                  if (!ww || !runBtn || !statusEl || !wishInput || !donationInput) {
                     return;
                  }

                  var wishText = wishInput.value.trim();
                  var donation = parseInt(donationInput.value, 10) || 21;

                  if (!wishText) {
                     setStatus(statusEl, 'Enter an item to wish for.', 'error');
                     return;
                  }

                  if (donation < 21) {
                     setStatus(statusEl, 'Donation must be at least 21 NP.', 'error');
                     return;
                  }

                  saveWishingPreferences();
                  runBtn.disabled = true;
                  setStatus(statusEl, 'Submitting wishes...');
                  if (progress) {
                     progress.start({ label: 'Submitting Wishing Well wishes…' });
                  }

                  var processed = 0;
                  var hadError = false;
                  var state = ww.loadWishingWellState();

                  try {
                     var pageHtml = await neopetsFetch(WISHING_PAGE_URL);
                     if (isLoginPage(pageHtml)) {
                        setStatus(statusEl, 'Not logged in to Neopets. Log in at neopets.com and try again.', 'error');
                        hadError = true;
                        if (progress) {
                           progress.finish({ label: 'Not logged in to Neopets.', variant: 'error' });
                        }
                        return;
                     }

                     var formData = ww.parseWishingForm(pageHtml);
                     if (!formData) {
                        setStatus(statusEl, 'Could not read the Wishing Well form.', 'error');
                        hadError = true;
                        if (progress) {
                           progress.finish({ label: 'Could not read the Wishing Well form.', variant: 'error' });
                        }
                        return;
                     }

                     var wishCount = ww.parseWishCount(pageHtml);
                     var remaining = ww.WISHING_MAX;
                     var currentWishCount = wishCount;
                     if (wishCount !== null) {
                        remaining = Math.max(0, ww.WISHING_MAX - wishCount);
                     }

                     if (remaining === 0) {
                        ww.markWishingPeriodComplete(state);
                        setStatus(statusEl, 'Already submitted ' + ww.WISHING_MAX + ' wishes this period.');
                        if (progress) {
                           progress.finish({ label: 'Already submitted ' + ww.WISHING_MAX + ' wishes this period.' });
                        }
                        return;
                     }

                     for (var i = 0; i < remaining; i++) {
                        if (progress) {
                           progress.update({
                              current: i + 1,
                              total: remaining,
                              label: 'Submitting wish ' + (i + 1) + '/' + remaining + '…'
                           });
                        }
                        var payload = ww.buildWishingPayload(formData, wishText, donation);
                        var response = await neopetsPost(WISHING_PROCESS_URL, ww.encodeForm(payload));
                        var responseHtml = response.text || '';

                        if (isLoginPage(responseHtml)) {
                           setStatus(statusEl, 'Not logged in to Neopets. Log in at neopets.com and try again.', 'error');
                           hadError = true;
                           if (progress) {
                              progress.finish({ label: 'Not logged in to Neopets.', variant: 'error' });
                           }
                           break;
                        }

                        var outcome = ww.evaluateWishingPost(response, currentWishCount);
                        state = ww.recordWishingOutcome(state, outcome);

                        if (!outcome.ok) {
                           if (!responseHtml.trim() && response.url) {
                              console.warn('Wishing Well response URL:', response.url);
                           }
                           setStatus(statusEl, outcome.error, 'error');
                           hadError = true;
                           if (progress) {
                              progress.finish({ label: outcome.error, variant: 'error' });
                           }
                           break;
                        }

                        processed++;

                        if (/Wish Count:/i.test(responseHtml)) {
                           formData = ww.parseWishingForm(responseHtml) || formData;
                           currentWishCount = outcome.wishCount;
                        } else {
                           pageHtml = await neopetsFetch(WISHING_PAGE_URL);
                           formData = ww.parseWishingForm(pageHtml) || formData;
                           currentWishCount = ww.parseWishCount(pageHtml);
                        }

                        if (i < remaining - 1) {
                           await sleep(WISHING_DELAY_MS);
                        }
                     }

                     if (!hadError) {
                        var summary = processed + ' wish' + (processed === 1 ? '' : 'es') + ' processed.';
                        if (processed >= remaining) {
                           ww.markWishingPeriodComplete(state);
                        }
                        setStatus(statusEl, summary);
                        if (progress) {
                           progress.finish({ label: summary });
                        }
                     }
                  } catch (err) {
                     setStatus(statusEl, err.message, 'error');
                     if (progress) {
                        progress.finish({ label: err.message, variant: 'error' });
                     }
                  }

                  runBtn.disabled = false;
               }

               function initWishingWellAutomation() {
                  var runBtn = document.getElementById('wishingwell-run');
                  var wishInput = document.getElementById('wishingwell-wish');
                  var donationInput = document.getElementById('wishingwell-donation');
                  if (!runBtn || !wishingWell()) {
                     return;
                  }

                  loadWishingPreferences();
                  runBtn.addEventListener('click', runWishingWell);
                  wishInput.addEventListener('change', saveWishingPreferences);
                  donationInput.addEventListener('change', saveWishingPreferences);
                  refreshWishingWellStatus();
               }

            function initCollapsibles() {
               document.querySelectorAll('#dailies-links .collapsible, #dailies-books .collapsible').forEach(function (btn) {
                  btn.addEventListener('click', function () {
                     var content = btn.nextElementSibling;
                     btn.classList.toggle('active');
                     if (content && content.classList.contains('collapsible-content')) {
                        content.classList.toggle('active');
                     }
                  });
               });
            }

               function initWishlistActions() {
                  if (window.__dailiesWishlistActionsBound) {
                     return;
                  }
                  window.__dailiesWishlistActionsBound = true;

                  function findWishlistList(listId) {
                     var currentSettings = DailiesSettings.loadSettings();
                     var wishlists = DailiesSettings.getWishlists(currentSettings);
                     return wishlists.find(function (w) { return w.id === listId; });
                  }

                  function readItemIidFromCard(card) {
                     var attr = card.getAttribute('data-item-iid');
                     if (attr == null || attr === '') {
                        return null;
                     }
                     var parsed = parseInt(attr, 10);
                     return isNaN(parsed) ? null : parsed;
                  }

                  function openWishlistMenuForCard(card, clientX, clientY, menuBtn) {
                     var listId = card.getAttribute('data-wishlist-id');
                     if (!listId || !window.DailiesItemdb || !window.DailiesRender) {
                        return;
                     }
                     var list = findWishlistList(listId);
                     if (!list) {
                        return;
                     }
                     var itemIid = readItemIidFromCard(card);
                     var itemName = card.getAttribute('data-item-name') || '';
                     var blacklisted = window.DailiesItemdb.getBlacklistedItemsForMenu(list);
                     DailiesRender.openWishlistContextMenu(clientX, clientY, listId, itemIid, itemName, blacklisted, menuBtn);
                  }

                  document.addEventListener('click', function (event) {
                     var menuBtn = event.target.closest('[data-wishlist-menu]');
                     if (menuBtn) {
                        event.preventDefault();
                        var mainCol = document.getElementById('dailies-links');
                        if (!mainCol || !mainCol.contains(menuBtn)) {
                           return;
                        }
                        var card = menuBtn.closest('.wishlist-card');
                        if (!card) {
                           return;
                        }
                        var menu = document.getElementById('wishlist-context-menu');
                        var isOpen = menu && !menu.hidden && menuBtn.getAttribute('aria-expanded') === 'true';
                        DailiesRender.closeWishlistContextMenu();
                        if (isOpen) {
                           return;
                        }
                        var rect = menuBtn.getBoundingClientRect();
                        openWishlistMenuForCard(card, rect.right, rect.bottom + 4, menuBtn);
                        return;
                     }

                     var menu = document.getElementById('wishlist-context-menu');
                     if (menu && !menu.hidden && !event.target.closest('#wishlist-context-menu')) {
                        DailiesRender.closeWishlistContextMenu();
                     }

                     var btn = event.target.closest('[data-wishlist-next]');
                     if (!btn) {
                        var blacklistBtn = event.target.closest('[data-wishlist-blacklist]');
                        if (blacklistBtn) {
                           event.preventDefault();
                           DailiesRender.closeWishlistContextMenu();
                           var listId = blacklistBtn.getAttribute('data-wishlist-id');
                           var itemIid = parseInt(blacklistBtn.getAttribute('data-item-iid'), 10);
                           var list = findWishlistList(listId);
                           if (list && window.DailiesItemdb && !isNaN(itemIid)) {
                              DailiesRender.refreshSingleWishlistCard(window.DailiesItemdb.addToBlacklist(list, itemIid));
                           }
                           return;
                        }
                        var unblacklistBtn = event.target.closest('[data-wishlist-unblacklist]');
                        if (unblacklistBtn) {
                           event.preventDefault();
                           DailiesRender.closeWishlistContextMenu();
                           var removeListId = unblacklistBtn.getAttribute('data-wishlist-id');
                           var removeIid = parseInt(unblacklistBtn.getAttribute('data-item-iid'), 10);
                           var removeList = findWishlistList(removeListId);
                           if (removeList && window.DailiesItemdb && !isNaN(removeIid)) {
                              DailiesRender.refreshSingleWishlistCard(window.DailiesItemdb.removeFromBlacklist(removeList, removeIid));
                           }
                           return;
                        }
                        return;
                     }
                     var mainCol = document.getElementById('dailies-links');
                     if (!mainCol || !mainCol.contains(btn)) {
                        return;
                     }
                     var listId = btn.getAttribute('data-wishlist-id');
                     var itemIid = parseInt(btn.getAttribute('data-item-iid'), 10);
                     if (!listId || isNaN(itemIid)) {
                        return;
                     }
                     var list = findWishlistList(listId);
                     if (!list || !window.DailiesItemdb) {
                        return;
                     }
                     var target = window.DailiesItemdb.skipCurrentItem(list, itemIid);
                     DailiesRender.refreshSingleWishlistCard(target);
                  });

                  document.addEventListener('contextmenu', function (event) {
                     var card = event.target.closest('.wishlist-card');
                     var mainCol = document.getElementById('dailies-links');
                     if (!card || !mainCol || !mainCol.contains(card)) {
                        return;
                     }
                     event.preventDefault();
                     var listId = card.getAttribute('data-wishlist-id');
                     if (!listId || !window.DailiesItemdb || !window.DailiesRender) {
                        return;
                     }
                     var list = findWishlistList(listId);
                     if (!list) {
                        return;
                     }
                     var itemIid = readItemIidFromCard(card);
                     var itemName = card.getAttribute('data-item-name') || '';
                     var blacklisted = window.DailiesItemdb.getBlacklistedItemsForMenu(list);
                     DailiesRender.openWishlistContextMenu(event.clientX, event.clientY, listId, itemIid, itemName, blacklisted, null);
                  });

                  document.addEventListener('keydown', function (event) {
                     if (event.key === 'Escape') {
                        DailiesRender.closeWishlistContextMenu();
                     }
                  });

                  document.addEventListener('scroll', function () {
                     DailiesRender.closeWishlistContextMenu();
                  }, true);
               }

            function initDailiesPage() {
               var settings = DailiesSettings.loadSettings();

               function applyMainPetFromSettings() {
                  var petName = DailiesSettings.getMainPet();
                  var slug = DailiesSettings.getMainPetSlug();
                  var headshotLink = document.getElementById('pet-headshot-link');
                  var headshotImg = document.getElementById('pet-headshot');
                  if (headshotLink) {
                     headshotLink.href = 'https://www.neopets.com/petlookup.phtml?pet=' + encodeURIComponent(petName);
                  }
                  if (headshotImg) {
                     headshotImg.src = slug
                        ? 'https://pets.neopets.com/cp/' + slug + '/4/1.png'
                        : 'https://pets.neopets.com/cpn/' + encodeURIComponent(petName) + '/1/4.png';
                     headshotImg.alt = petName;
                  }
                  document.querySelectorAll('.main-pet-link').forEach(function (link) {
                     var template = link.dataset.petHref;
                     if (template) {
                        link.href = template.replace('{pet}', encodeURIComponent(petName));
                     }
                  });
                  var petTile = document.querySelector('[data-link-id="main-pet"]');
                  if (petTile) {
                     var petLabel = petTile.querySelector('.main-pet-label');
                     if (petLabel) {
                        petLabel.textContent = petName;
                     }
                     var petImg = petTile.querySelector('img');
                     if (petImg) {
                        petImg.src = 'https://pets.neopets.com/cpn/' + encodeURIComponent(petName) + '/1/4.png';
                     }
                  }
                  var mainPetInput = document.getElementById('main-pet-name');
                  if (mainPetInput) {
                     mainPetInput.value = petName;
                  }
               }

               function scheduleTimedCards() {
                  DailiesRender.renderAlertCards(settings);
                  if (__dailiesTimersStarted) {
                     return;
                  }
                  __dailiesTimersStarted = true;
                  setInterval(function () {
                     DailiesRender.renderAlertCards(settings);
                  }, 60000);
                  (function waitForNstMidnight() {
                     setTimeout(function () {
                        DailiesRender.renderAlertCards(settings);
                        waitForNstMidnight();
                     }, DailiesTimed.msUntilNextNstMidnight());
                  })();
                  (function waitForNstHour() {
                     setTimeout(function () {
                        DailiesRender.renderAlertCards(settings);
                        waitForNstHour();
                     }, DailiesTimed.msUntilNextNstHour());
                  })();
                  (function waitForLocalMinute() {
                     setTimeout(function () {
                        DailiesRender.renderAlertCards(settings);
                        waitForLocalMinute();
                     }, DailiesTimed.msUntilNextLocalMinute());
                  })();
               }

               DailiesRender.renderSettingsTray(settings);
               DailiesRender.renderDailiesShell(settings);
               applyMainPetFromSettings();
               initCollapsibles();
               initCoconutShyAutomation();
               initWishingWellAutomation();
               initWishlistActions();
               DailiesRender.refreshWishlists(settings);
               scheduleTimedCards();

               (function initSiteSettings() {
                  var DEFAULT_PET = DailiesSettings.DEFAULT_PET;
                  var settingsOpen = document.getElementById('settings-open');
                  var settingsClose = document.getElementById('settings-close');
                  var settingsTray = document.getElementById('settings-tray');
                  var settingsBackdrop = document.getElementById('settings-backdrop');
                  var mainPetInput = document.getElementById('main-pet-name');
                  var slugRequestId = 0;
                  var petInputTimer = null;

                  function fetchNeopets(url) {
                     if (typeof window.__neopetsFetch === 'function') {
                        return window.__neopetsFetch(url).then(function (response) {
                           return typeof response === 'string' ? response : response.text;
                        });
                     }
                     return Promise.reject(new Error('Userscript bridge not available'));
                  }

                  function normalizePetName(name) {
                     return String(name || '').trim().replace(/\s+/g, '_');
                  }

                  function parsePetImageSlug(html) {
                     var match = String(html || '').match(/pets\.neopets\.com\/cp\/([a-z0-9]+)\//i);
                     return match ? match[1] : null;
                  }

                  function handlePetInputChange() {
                     var petName = normalizePetName(mainPetInput.value) || DEFAULT_PET;
                     mainPetInput.value = petName;
                     DailiesSettings.saveMainPet(petName, null);
                     applyMainPetFromSettings();
                     refreshPetSlug(petName);
                  }

                  function refreshPetSlug(petName) {
                     var normalized = normalizePetName(petName);
                     if (!normalized) {
                        return Promise.resolve(null);
                     }
                     var requestId = ++slugRequestId;
                     return fetchNeopets('https://www.neopets.com/petlookup.phtml?pet=' + encodeURIComponent(normalized))
                        .then(function (html) {
                           if (requestId !== slugRequestId) {
                              return null;
                           }
                           var slug = parsePetImageSlug(html);
                           if (slug) {
                              DailiesSettings.saveMainPet(normalized, slug);
                              applyMainPetFromSettings();
                           }
                           return slug;
                        })
                        .catch(function () { return null; });
                  }

                  function openSettings() {
                     settingsTray.classList.add('open');
                     settingsTray.setAttribute('aria-hidden', 'false');
                     settingsBackdrop.hidden = false;
                  }

                  function closeSettings() {
                     settingsTray.classList.remove('open');
                     settingsTray.setAttribute('aria-hidden', 'true');
                     settingsBackdrop.hidden = true;
                  }

                  if (settingsOpen) {
                     settingsOpen.addEventListener('click', openSettings);
                  }
                  if (settingsClose) {
                     settingsClose.addEventListener('click', closeSettings);
                  }
                  if (settingsBackdrop) {
                     settingsBackdrop.addEventListener('click', closeSettings);
                  }

                  __dailiesCloseSettings = closeSettings;
                  if (!__dailiesSettingsGlobalsBound) {
                     __dailiesSettingsGlobalsBound = true;
                     document.addEventListener('keydown', function (event) {
                        var tray = document.getElementById('settings-tray');
                        if (event.key === 'Escape' && tray && tray.classList.contains('open') && __dailiesCloseSettings) {
                           __dailiesCloseSettings();
                        }
                     });
                  }

                  var saveBtn = document.getElementById('settings-save');
                  if (saveBtn) {
                     saveBtn.addEventListener('click', function () {
                        settings = DailiesRender.readSettingsFromTray(settings);
                        DailiesSettings.saveSettings(settings);
                        DailiesRender.renderDailiesShell(settings);
                        applyMainPetFromSettings();
                        initCollapsibles();
                        initCoconutShyAutomation();
                        initWishingWellAutomation();
                        DailiesRender.refreshWishlists(settings);
                        DailiesRender.renderAlertCards(settings);
                        closeSettings();
                     });
                  }

                  if (mainPetInput) {
                     mainPetInput.addEventListener('input', function () {
                        clearTimeout(petInputTimer);
                        petInputTimer = setTimeout(handlePetInputChange, 400);
                     });
                     mainPetInput.addEventListener('change', handlePetInputChange);
                  }

                  function onBridgeReady() {
                     var petName = normalizePetName(mainPetInput && mainPetInput.value) || DEFAULT_PET;
                     refreshPetSlug(petName);
                  }

                  __dailiesBridgeHandler = onBridgeReady;
                  if (typeof window.__neopetsFetch === 'function') {
                     onBridgeReady();
                  }
                  else if (!__dailiesBridgeBound) {
                     __dailiesBridgeBound = true;
                     document.addEventListener('neopets-dailies-ready', function () {
                        if (__dailiesBridgeHandler) {
                           __dailiesBridgeHandler();
                        }
                     });
                  }
               })();
            }

            function initDailiesApp() {
               function start() {
                  initCoconutShyAutomation();
                  initWishingWellAutomation();
                  initDailiesPage();
               }
               if (window.HubApiClient && window.HubApiClient.syncDailiesSettingsFromApi) {
                  window.HubApiClient.syncDailiesSettingsFromApi(DailiesSettings.loadSettings).then(start).catch(start);
               } else {
                  start();
               }
            }

            window.__initDailiesApp = initDailiesApp;
})();