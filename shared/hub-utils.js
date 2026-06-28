(function (global) {
   'use strict';

   function escapeHtml(str) {
      return String(str || '')
         .replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;');
   }

   function bridgeAvailable() {
      return typeof global.RayenzArchidektBridge !== 'undefined' && global.RayenzArchidektBridge.isAvailable;
   }

   function bridgeApplyAvailable() {
      var bridge = global.RayenzArchidektBridge;
      return !!(bridge && bridge.isAvailable && typeof bridge.stageApply === 'function');
   }

   function optionKey(opt) {
      return [opt.name, opt.set_code || '', opt.collector_number || ''].join('|');
   }

   function sleep(ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
   }

   function scryfallImageFromId(scryfallId) {
      if (!scryfallId) {
         return '';
      }
      return 'https://api.scryfall.com/cards/' + scryfallId + '?format=image&version=normal';
   }

   function scryfallImageFromPrinting(setCode, collectorNumber) {
      if (!setCode || !collectorNumber) {
         return '';
      }
      return 'https://api.scryfall.com/cards/' + encodeURIComponent(String(setCode).toLowerCase()) + '/' +
         encodeURIComponent(String(collectorNumber)) + '?format=image&version=normal';
   }

   function scryfallImageFromName(name) {
      if (!name) {
         return '';
      }
      return 'https://api.scryfall.com/cards/named?exact=' +
         encodeURIComponent(name) + '&format=image&version=normal';
   }

   function ensureCss(href, attrName) {
      if (document.querySelector('link[' + attrName + ']')) {
         return;
      }
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute(attrName, '1');
      document.head.appendChild(link);
   }

   global.HubUtils = {
      escapeHtml: escapeHtml,
      bridgeAvailable: bridgeAvailable,
      bridgeApplyAvailable: bridgeApplyAvailable,
      optionKey: optionKey,
      sleep: sleep,
      scryfallImageFromId: scryfallImageFromId,
      scryfallImageFromPrinting: scryfallImageFromPrinting,
      scryfallImageFromName: scryfallImageFromName,
      ensureCss: ensureCss
   };
})(window);
