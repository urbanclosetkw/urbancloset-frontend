/* ─────────────────────────────────────────────
   currency.js — UrbanCloset currency switcher
   Load AFTER config.js on every page that shows prices.

   Public API
   ──────────
   Currency.get()        → 'KWD' or 'USD'
   Currency.set('USD')   → saves to localStorage, fires 'currencyChanged' event
   Currency.format(kwd)  → formatted string e.g. 'KWD 380.000' or '$1235.00'
   Currency.RATE         → conversion rate (1 KWD = X USD)
───────────────────────────────────────────── */

var Currency = (function () {
  var RATE = 3.25; // 1 KWD = 3.25 USD

  var current = localStorage.getItem('uc_currency') || 'KWD';

  function get() {
    return current;
  }

  function set(c) {
    current = (c === 'USD') ? 'USD' : 'KWD';
    localStorage.setItem('uc_currency', current);
    document.dispatchEvent(new Event('currencyChanged'));
  }

  function format(kwdPrice) {
    var n = parseFloat(kwdPrice);
    if (isNaN(n)) return '';
    if (current === 'USD') {
      return '$' + (n * RATE).toFixed(2);
    }
    return 'KWD ' + n.toFixed(3);
  }

  return {
    get:    get,
    set:    set,
    format: format,
    RATE:   RATE
  };
})();
