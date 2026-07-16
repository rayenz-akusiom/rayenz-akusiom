(function (global) {
    'use strict';

global.StringUtils = {
    toUriEncodedKebabCase: toUriEncodedKebabCase,
    toKebabCase: toKebabCase,
    escapeHtml: escapeHtml,
    svgDataUri: svgDataUri
}

function svgDataUri(svg) {
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
 }

function escapeHtml(str) {
    return String(str || '')
       .replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;');
 }


function toUriEncodedKebabCase(str) {
    return encodeURIComponent(toKebabCase(str));
}

function toKebabCase(str) {
    if (!str) return '';
    
    return str
      .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
      .map(word => word.toLowerCase())
      .join('-');
  }
})(this);