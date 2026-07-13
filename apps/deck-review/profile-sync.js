(function (global) {
   'use strict';

   var DB_NAME = 'rayenz-hub-profiles';
   var STORE_NAME = 'handles';
   var HANDLE_KEY = 'profiles-dir';
   var LIST_FIELDS = {
      protected_cards: 'protected_cards',
      blocked_cards: 'blocked_cards'
   };

   function isMobileDevice() {
      return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
   }

   function canWriteProfiles() {
      return typeof window.showDirectoryPicker === 'function' && !isMobileDevice();
   }

   function openDb() {
      return new Promise(function (resolve, reject) {
         var req = indexedDB.open(DB_NAME, 1);
         req.onerror = function () { reject(req.error); };
         req.onupgradeneeded = function () {
            req.result.createObjectStore(STORE_NAME);
         };
         req.onsuccess = function () { resolve(req.result); };
      });
   }

   function idbGet(key) {
      return openDb().then(function (db) {
         return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readonly');
            var req = tx.objectStore(STORE_NAME).get(key);
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error); };
         });
      });
   }

   function idbSet(key, value) {
      return openDb().then(function (db) {
         return new Promise(function (resolve, reject) {
            var tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).put(value, key);
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
         });
      });
   }

   function verifyPermission(handle, mode) {
      if (!handle || !handle.queryPermission) {
         return Promise.resolve(false);
      }
      return handle.queryPermission({ mode: mode }).then(function (state) {
         if (state === 'granted') {
            return true;
         }
         if (state === 'prompt' && handle.requestPermission) {
            return handle.requestPermission({ mode: mode }).then(function (s) {
               return s === 'granted';
            });
         }
         return false;
      });
   }

   function getProfilesDir() {
      return idbGet(HANDLE_KEY).then(function (handle) {
         if (!handle) {
            return null;
         }
         return verifyPermission(handle, 'readwrite').then(function (ok) {
            return ok ? handle : null;
         });
      });
   }

   function connectProfilesDir() {
      if (!canWriteProfiles()) {
         return Promise.reject(new Error('Profile updates require desktop Chrome on PC.'));
      }
      return window.showDirectoryPicker({ id: 'rayenz-mtg-profiles', mode: 'readwrite' })
         .then(function (handle) {
            return idbSet(HANDLE_KEY, handle).then(function () {
               return handle;
            });
         });
   }

   function parseYamlList(text, fieldName) {
      var lines = text.split(/\r?\n/);
      var items = [];
      var inSection = false;

      for (var i = 0; i < lines.length; i++) {
         var line = lines[i];
         if (/^[^\s#]/.test(line) && !line.startsWith('-')) {
            inSection = line.trim() === fieldName + ':';
            continue;
         }
         if (inSection) {
            if (/^[^\s#-]/.test(line)) {
               break;
            }
            var match = line.match(/^\s*-\s+(.+?)\s*$/);
            if (match) {
               items.push(match[1].replace(/^["']|["']$/g, ''));
            }
         }
      }
      return items;
   }

   function listHasItem(items, name) {
      return items.some(function (item) { return item === name; });
   }

   function appendToYamlList(text, fieldName, cardName) {
      var items = parseYamlList(text, fieldName);
      if (listHasItem(items, cardName)) {
         return { text: text, changed: false };
      }

      var lines = text.split(/\r?\n/);
      var sectionIndex = -1;
      var insertAt = -1;

      for (var i = 0; i < lines.length; i++) {
         if (lines[i].trim() === fieldName + ':') {
            sectionIndex = i;
            insertAt = i + 1;
            for (var j = i + 1; j < lines.length; j++) {
               if (/^\s*-\s+/.test(lines[j])) {
                  insertAt = j + 1;
               } else if (/^[^\s#-]/.test(lines[j])) {
                  break;
               }
            }
            break;
         }
      }

      var entry = '  - ' + cardName;
      if (sectionIndex >= 0) {
         lines.splice(insertAt, 0, entry);
      } else {
         var anchor = -1;
         var anchors = ['archidekt_swaps:', 'constraints:', 'roles:', 'notes:'];
         for (var a = 0; a < anchors.length; a++) {
            for (var k = 0; k < lines.length; k++) {
               if (lines[k].trim() === anchors[a]) {
                  anchor = k;
                  break;
               }
            }
            if (anchor >= 0) {
               break;
            }
         }
         var block = [fieldName + ':', entry];
         if (anchor >= 0) {
            lines.splice(anchor, 0, '', block[0], block[1]);
         } else {
            if (lines.length && lines[lines.length - 1] !== '') {
               lines.push('');
            }
            lines.push(block[0], block[1]);
         }
      }

      var out = lines.join('\n');
      if (!out.endsWith('\n')) {
         out += '\n';
      }
      return { text: out, changed: true };
   }

   function readProfileFile(handle, deckId) {
      return handle.getFileHandle(deckId + '.yaml').then(function (fileHandle) {
         return fileHandle.getFile();
      }).then(function (file) {
         return file.text();
      });
   }

   function writeProfileFile(handle, deckId, text) {
      return handle.getFileHandle(deckId + '.yaml', { create: false }).then(function (fileHandle) {
         return fileHandle.createWritable();
      }).then(function (writable) {
         return writable.write(text).then(function () {
            return writable.close();
         });
      });
   }

   function appendToProfileList(deckId, field, cardName) {
      var yamlField = LIST_FIELDS[field] || field;
      if (!yamlField || !cardName) {
         return Promise.reject(new Error('Missing deck, field, or card name.'));
      }

      return getProfilesDir().then(function (handle) {
         if (!handle) {
            return connectProfilesDir();
         }
         return handle;
      }).then(function (handle) {
         return readProfileFile(handle, deckId).then(function (text) {
            var result = appendToYamlList(text, yamlField, cardName);
            if (!result.changed) {
               return { field: yamlField, cardName: cardName, changed: false };
            }
            return writeProfileFile(handle, deckId, result.text).then(function () {
               return { field: yamlField, cardName: cardName, changed: true };
            });
         });
      });
   }

   function readProfileYamlFromDir(deckId) {
      return getProfilesDir().then(function (handle) {
         if (!handle) {
            return null;
         }
         return readProfileFile(handle, deckId);
      });
   }

   function readProfileYaml(deckId) {
      if (global.HubApiClient && global.HubApiClient.getConfig().enabled) {
         return global.HubApiClient.pullProfileYaml(deckId).then(function (yaml) {
            if (yaml) {
               return yaml;
            }
            return readProfileYamlFromDir(deckId);
         }).catch(function () {
            return readProfileYamlFromDir(deckId);
         });
      }
      return readProfileYamlFromDir(deckId);
   }

   function isConnected() {
      return getProfilesDir().then(function (h) { return !!h; });
   }

   global.ProfileSync = {
      canWriteProfiles: canWriteProfiles,
      connectProfilesDir: connectProfilesDir,
      getProfilesDir: getProfilesDir,
      isConnected: isConnected,
      appendToProfileList: appendToProfileList,
      readProfileYaml: readProfileYaml,
      parseYamlList: parseYamlList,
      LIST_FIELDS: LIST_FIELDS
   };
})(window);
