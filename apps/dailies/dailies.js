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
               var WISHING_MAX = 7;
               var WISHING_DELAY_MS = 400;
               var WISHING_WISH_KEY = 'rayenz-wishing-well-wish';
               var WISHING_DONATION_KEY = 'rayenz-wishing-well-donation';
               var WISHING_PERIOD_KEY = 'rayenz-wishing-well-period';

               function getNstDate() {
                  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
               }

               function getWishingPeriodKey() {
                  var nst = getNstDate();
                  var y = nst.getFullYear();
                  var m = nst.getMonth();
                  var d = nst.getDate();
                  var hour = nst.getHours();
                  var slot;

                  if (hour >= 8 && hour < 20) {
                     slot = 'day';
                  } else {
                     slot = 'night';
                     if (hour < 8) {
                        var prev = new Date(nst);
                        prev.setDate(prev.getDate() - 1);
                        y = prev.getFullYear();
                        m = prev.getMonth();
                        d = prev.getDate();
                     }
                  }

                  return y + '-' + m + '-' + d + '-' + slot;
               }

               function parseWishCount(html) {
                  var match = html.match(/Wish Count:\s*(\d+)/i);
                  if (match) {
                     return parseInt(match[1], 10);
                  }
                  if (/process_wishing|Make a Wish/i.test(html)) {
                     return WISHING_MAX;
                  }
                  return null;
               }

               function parseWishingForm(html) {
                  var doc = new DOMParser().parseFromString(html, 'text/html');
                  var form = doc.querySelector('form[action*="process_wishing"]');
                  if (!form) return null;

                  var data = {};
                  var fields = form.querySelectorAll('input[name], select[name], textarea[name]');
                  for (var i = 0; i < fields.length; i++) {
                     var field = fields[i];
                     if (field.type === 'submit' || field.type === 'button') {
                        if (field.name) {
                           data[field.name] = field.value;
                        }
                        continue;
                     }
                     if (field.type === 'radio' || field.type === 'checkbox') {
                        if (field.checked) {
                           data[field.name] = field.value;
                        }
                        continue;
                     }
                     data[field.name] = field.value;
                  }

                  return data;
               }

               function isWishingPostSuccess(response, beforeCount) {
                  var html = response.text || '';
                  var url = response.url || '';

                  if (/Thanks for your donation|Thank you for your donation/i.test(html)) {
                     return true;
                  }
                  if (/[?&]thanks=/i.test(url)) {
                     return true;
                  }

                  var afterCount = parseWishCount(html);
                  if (afterCount !== null && beforeCount !== null && afterCount > beforeCount) {
                     return true;
                  }

                  return false;
               }

               function parseWishingError(html) {
                  if (/do not have enough/i.test(html)) {
                     return 'Not enough Neopoints for that donation.';
                  }
                  if (/must donate at least 21|minimum of 21/i.test(html)) {
                     return 'Donation must be at least 21 NP.';
                  }
                  if (/already made|seven wishes|7 wishes|no more wishes/i.test(html)) {
                     return 'Already submitted the maximum wishes for this period.';
                  }
                  if (/Oops|error|invalid/i.test(html) && html.length < 5000) {
                     var plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                     if (plain.length > 0 && plain.length < 200) {
                        return plain;
                     }
                  }
                  return null;
               }

               function buildWishingPayload(formData, wishText, donation) {
                  var payload = Object.assign({}, formData, {
                     donation: String(donation),
                     wish: wishText
                  });
                  if ('amount' in formData) {
                     payload.amount = String(donation);
                  }
                  return payload;
               }

               function encodeForm(data) {
                  return Object.keys(data).map(function (key) {
                     return encodeURIComponent(key) + '=' + encodeURIComponent(data[key]);
                  }).join('&');
               }

               function saveWishingPreferences() {
                  var wishInput = document.getElementById('wishingwell-wish');
                  var donationInput = document.getElementById('wishingwell-donation');
                  if (wishInput && wishInput.value.trim()) {
                     localStorage.setItem(WISHING_WISH_KEY, wishInput.value.trim());
                  }
                  if (donationInput && donationInput.value) {
                     localStorage.setItem(WISHING_DONATION_KEY, donationInput.value);
                  }
               }

               function loadWishingPreferences() {
                  var wishInput = document.getElementById('wishingwell-wish');
                  var donationInput = document.getElementById('wishingwell-donation');
                  var savedWish = localStorage.getItem(WISHING_WISH_KEY);
                  var savedDonation = localStorage.getItem(WISHING_DONATION_KEY);
                  if (wishInput && savedWish) {
                     wishInput.value = savedWish;
                  }
                  if (donationInput && savedDonation) {
                     donationInput.value = savedDonation;
                  }
               }

               function markWishingPeriodComplete() {
                  localStorage.setItem(WISHING_PERIOD_KEY, getWishingPeriodKey());
               }

               function isWishingPeriodComplete() {
                  return localStorage.getItem(WISHING_PERIOD_KEY) === getWishingPeriodKey();
               }

               async function refreshWishingWellStatus() {
                  var statusEl = document.getElementById('wishingwell-status');
                  if (!statusEl) return;

                  if (isWishingPeriodComplete()) {
                     setStatus(statusEl, 'Ready.');
                     return;
                  }

                  try {
                     var html = await neopetsFetch(WISHING_PAGE_URL);
                     if (isLoginPage(html)) {
                        setStatus(statusEl, 'Log in at neopets.com to check wish status.', 'notice');
                        return;
                     }

                     var wishCount = parseWishCount(html);
                     if (wishCount === null) {
                        setStatus(statusEl, 'Ready.');
                        return;
                     }

                     if (wishCount >= WISHING_MAX) {
                        markWishingPeriodComplete();
                        setStatus(statusEl, 'Ready.');
                        return;
                     }

                     if (wishCount === 0) {
                        setStatus(statusEl, 'New wish period — you have not donated yet.', 'notice');
                     } else {
                        setStatus(statusEl, 'New wish period — only ' + wishCount + '/' + WISHING_MAX + ' wishes submitted.', 'notice');
                     }
                  } catch (err) {
                     setStatus(statusEl, 'Ready.');
                  }
               }

               async function runWishingWell() {
                  var runBtn = document.getElementById('wishingwell-run');
                  var statusEl = document.getElementById('wishingwell-status');
                  var wishInput = document.getElementById('wishingwell-wish');
                  var donationInput = document.getElementById('wishingwell-donation');
                  var progress = dailiesProgress();
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

                     var formData = parseWishingForm(pageHtml);
                     if (!formData) {
                        setStatus(statusEl, 'Could not read the Wishing Well form.', 'error');
                        hadError = true;
                        if (progress) {
                           progress.finish({ label: 'Could not read the Wishing Well form.', variant: 'error' });
                        }
                        return;
                     }

                     var wishCount = parseWishCount(pageHtml);
                     var remaining = WISHING_MAX;
                     var currentWishCount = wishCount;
                     if (wishCount !== null) {
                        remaining = Math.max(0, WISHING_MAX - wishCount);
                     }

                     if (remaining === 0) {
                        markWishingPeriodComplete();
                        setStatus(statusEl, 'Already submitted ' + WISHING_MAX + ' wishes this period.');
                        if (progress) {
                           progress.finish({ label: 'Already submitted ' + WISHING_MAX + ' wishes this period.' });
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
                        var payload = buildWishingPayload(formData, wishText, donation);
                        var response = await neopetsPost(WISHING_PROCESS_URL, encodeForm(payload));
                        var responseHtml = response.text || '';

                        if (isLoginPage(responseHtml)) {
                           setStatus(statusEl, 'Not logged in to Neopets. Log in at neopets.com and try again.', 'error');
                           hadError = true;
                           if (progress) {
                              progress.finish({ label: 'Not logged in to Neopets.', variant: 'error' });
                           }
                           break;
                        }

                        if (!isWishingPostSuccess(response, currentWishCount)) {
                           var errMsg = parseWishingError(responseHtml)
                              || 'Unexpected response from Wishing Well.';
                           if (!responseHtml.trim() && response.url) {
                              console.warn('Wishing Well response URL:', response.url);
                           }
                           setStatus(statusEl, errMsg, 'error');
                           hadError = true;
                           if (progress) {
                              progress.finish({ label: errMsg, variant: 'error' });
                           }
                           break;
                        }

                        processed++;

                        if (/Wish Count:/i.test(responseHtml)) {
                           formData = parseWishingForm(responseHtml) || formData;
                           currentWishCount = parseWishCount(responseHtml);
                        } else {
                           pageHtml = await neopetsFetch(WISHING_PAGE_URL);
                           formData = parseWishingForm(pageHtml) || formData;
                           currentWishCount = parseWishCount(pageHtml);
                        }

                        if (i < remaining - 1) {
                           await sleep(WISHING_DELAY_MS);
                        }
                     }

                     if (!hadError) {
                        var summary = processed + ' wish' + (processed === 1 ? '' : 'es') + ' processed.';
                        if (processed >= remaining) {
                           markWishingPeriodComplete();
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
                  if (!runBtn) return;

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
               initCoconutShyAutomation();
               initWishingWellAutomation();
               initDailiesPage();
            }

            window.__initDailiesApp = initDailiesApp;
})();