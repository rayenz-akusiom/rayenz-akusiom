(function (global) {
   'use strict';

   var DR = global.DeckReview;
   var state = DR.state;

   var getDeckById = DR.getDeckById;
   var getPrintValue = DR.getPrintValue;
   var readCutSelection = DR.readCutSelection;

   function listHasName(list, name) {
      return (list || []).some(function (item) { return item === name; });
   }

   function uniqueNames() {
      var seen = {};
      var names = [];
      for (var i = 0; i < arguments.length; i++) {
         (arguments[i] || []).forEach(function (name) {
            if (name && !seen[name]) {
               seen[name] = true;
               names.push(name);
            }
         });
      }
      return names;
   }

   function getDeckPreferences(deck) {
      var base = deck.profile_preferences || {};
      var runtime = state.deckPrefs[deck.deck_id] || {};
      return {
         blocked_cards: uniqueNames(base.blocked_cards, runtime.blocked_cards),
         protected_cards: uniqueNames(base.protected_cards, runtime.protected_cards)
      };
   }

   function addRuntimePreference(deckId, field, cardName) {
      if (!cardName) {
         return;
      }
      if (!state.deckPrefs[deckId]) {
         state.deckPrefs[deckId] = { blocked_cards: [], protected_cards: [] };
      }
      var list = state.deckPrefs[deckId][field] || [];
      if (!listHasName(list, cardName)) {
         list.push(cardName);
         state.deckPrefs[deckId][field] = list;
      }
   }

   function isSuggestionFiltered(suggestion, prefs) {
      if (!suggestion || !prefs) {
         return false;
      }
      if (suggestion.card && suggestion.card.name && listHasName(prefs.blocked_cards, suggestion.card.name)) {
         return true;
      }
      return (suggestion.replaces || []).some(function (r) {
         return r.name && listHasName(prefs.protected_cards, r.name);
      });
   }

   function setProfileStatus(msg) {
      state.profileStatus = msg || '';
      if (state.ui.profileStatusEl) {
         state.ui.profileStatusEl.textContent = state.profileStatus;
         state.ui.profileStatusEl.hidden = !state.profileStatus;
      }
   }

   function renderProfilesNav() {
      if (!state.ui.profilesSection) {
         return;
      }
      var canWrite = global.ProfileSync && ProfileSync.canWriteProfiles();
      var canConnectFolder = global.ProfileSync && ProfileSync.canWriteProfilesViaDirectory
         ? ProfileSync.canWriteProfilesViaDirectory()
         : canWrite;
      state.ui.profilesSection.hidden = !state.data;

      if (state.ui.connectProfilesBtn) {
         state.ui.connectProfilesBtn.hidden = !canConnectFolder;
         state.ui.connectProfilesBtn.disabled = !canConnectFolder || state.profilesConnected;
         state.ui.connectProfilesBtn.textContent = state.profilesConnected
            ? 'Profiles folder connected'
            : 'Connect profiles folder';
      }

      if (state.ui.tabletProfilesNote) {
         state.ui.tabletProfilesNote.hidden = canWrite;
      }

      var deck = state.activeDeckId ? getDeckById(state.activeDeckId) : null;
      if (deck && state.ui.prefCountsEl) {
         var prefs = getDeckPreferences(deck);
         state.ui.prefCountsEl.textContent =
            prefs.blocked_cards.length + ' blocked · ' + prefs.protected_cards.length + ' protected';
      } else if (state.ui.prefCountsEl) {
         state.ui.prefCountsEl.textContent = '';
      }
   }

   function updateProfilesConnectionStatus() {
      if (!global.ProfileSync) {
         state.profilesConnected = false;
         renderProfilesNav();
         return Promise.resolve();
      }
      return ProfileSync.isConnected().then(function (connected) {
         state.profilesConnected = connected;
         renderProfilesNav();
      });
   }

   function selectedInCardName(cardEl, suggestion) {
      var printId = getPrintValue(cardEl);
      var prints = (cardEl && cardEl._drPrints) ||
         state.printCache[(suggestion.card.name || '').toLowerCase()] || [];
      var print = prints.find(function (p) { return p.id === printId; });
      return (print && print.name) || suggestion.card.name;
   }

   function neverSuggestAgain(deck, suggestion, side, cardEl, advance) {
      if (!global.ProfileSync || !ProfileSync.canWriteProfiles()) {
         setProfileStatus('Profile updates require a configured Hub API or desktop Chrome on PC.');
         return;
      }

      var field = side === 'in' ? 'blocked_cards' : 'protected_cards';
      var cardName = side === 'in'
         ? selectedInCardName(cardEl, suggestion)
         : readCutSelection(cardEl).name;

      if (!cardName) {
         setProfileStatus('Select a card first.');
         return;
      }

      var btn = (cardEl || document).querySelector(side === 'in' ? '[data-dr-never-in]' : '[data-dr-never-out]');
      if (btn) {
         btn.disabled = true;
      }

      ProfileSync.appendToProfileList(deck.deck_id, field, cardName)
         .then(function (result) {
            addRuntimePreference(deck.deck_id, field, cardName);
            var verb = result.changed ? 'Added' : 'Already listed';
            setProfileStatus(verb + ' ' + cardName + ' in ' + field.replace('_', ' ') + '.');
            state.profilesConnected = true;
            renderProfilesNav();
            DR.recordSuggestionDecision(deck, suggestion, 'skipped', cardEl, advance !== false);
         })
         .catch(function (err) {
            setProfileStatus(err.message || String(err));
            if (btn) {
               btn.disabled = false;
            }
         });
   }

   DR.getDeckPreferences = getDeckPreferences;
   DR.addRuntimePreference = addRuntimePreference;
   DR.isSuggestionFiltered = isSuggestionFiltered;
   DR.setProfileStatus = setProfileStatus;
   DR.renderProfilesNav = renderProfilesNav;
   DR.updateProfilesConnectionStatus = updateProfilesConnectionStatus;
   DR.neverSuggestAgain = neverSuggestAgain;
})(window);
