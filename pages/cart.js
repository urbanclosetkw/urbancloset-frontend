/* ─────────────────────────────────────────────
   cart.js  —  UrbanCloset unified cart service
   Place this file in frontend/pages/ alongside
   config.js. Load it AFTER config.js on every
   page that uses the cart.

   Public API
   ──────────
   Cart.get()              → array of cart items
   Cart.add(product)       → Promise
   Cart.remove(productId)  → Promise
   Cart.clear()            → void  (local only)
   Cart.count()            → number
   Cart.updateBadge()      → void
   Cart.mergeOnLogin()     → Promise  (call right after login)
   Cart.clearOnLogout()    → void     (call on logout)
───────────────────────────────────────────── */

var Cart = (function () {
  var STORAGE_KEY = 'uc_cart';

  /* ── helpers ── */
  function getToken() {
    return localStorage.getItem('uc_token');
  }

  function authHeader() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    };
  }

  /* ── local storage ── */
function localGet() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(data) ? data : [];
    }
    catch (e) { return []; }
  }
  function localSave(cart) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  }

  /* ── public: get ── */
 async function get() {
  var token = getToken();
  if (token) {
    try {
      var res = await fetch(API_URL + '/cart', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (res.ok) {
        var items = await res.json();
        localSave(items); // keep local in sync
        return items;
      }
    } catch (e) {}
  }
  return localGet(); // fallback for guests
}

  /* ── public: count ── */
  function count() {
    return localGet().reduce(function (s, i) { return s + (i.qty || 1); }, 0);
  }

  /* ── public: updateBadge ── */
  function updateBadge() {
    var n = count();
    ['cartBadge', 'cartDrawerCount'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.textContent = n;
    });
  }

  /* ── public: add ── */
  async function add(product) {
    // 1. Update localStorage immediately
    var cart     = localGet();
    var existing = cart.find(function (i) { return String(i.id) === String(product.id); });
    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      cart.push(Object.assign({}, product, { qty: 1 }));
    }
    localSave(cart);
    updateBadge();

    // 2. If logged in, sync to DB (server increments qty if item already exists)
    var token = getToken();
    if (token) {
      try {
        await fetch(API_URL + '/cart', {
          method: 'POST',
          headers: authHeader(),
          body: JSON.stringify({
            product_id: product.id,
            qty: 1
          })
        });
      } catch (e) { /* localStorage remains the fallback */ }
    }
  }

  /* ── public: remove ── */
  async function remove(productId) {
    // 1. Remove from localStorage immediately
    localSave(localGet().filter(function (i) {
      return String(i.id) !== String(productId);
    }));
    updateBadge();

    // 2. If logged in, remove from DB
    var token = getToken();
    if (token) {
      try {
        await fetch(API_URL + '/cart/' + productId, {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });
      } catch (e) {}
    }
  }

  /* ── public: updateQty ──
     Set the quantity of an existing cart item. If qty drops to 0
     or below, the item is removed instead.
  ── */
  async function updateQty(productId, qty) {
    qty = parseInt(qty, 10);
    if (isNaN(qty) || qty <= 0) {
      return remove(productId);
    }

    // 1. Update localStorage immediately
    var cart = localGet();
    var item = cart.find(function (i) { return String(i.id) === String(productId); });
    if (!item) return;
    item.qty = qty;
    localSave(cart);
    updateBadge();

    // 2. If logged in, sync to DB
    var token = getToken();
    if (token) {
      try {
        await fetch(API_URL + '/cart/' + productId, {
          method: 'PUT',
          headers: authHeader(),
          body: JSON.stringify({ qty: qty })
        });
      } catch (e) {}
    }
  }

  /* ── public: clear (wipes localStorage AND DB cart) ── */
  async function clear() {
    localStorage.removeItem(STORAGE_KEY);
    updateBadge();

    var token = getToken();
    if (token) {
      try {
        await fetch(API_URL + '/cart', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + token }
        });
      } catch (e) {}
    }
  }

  /* ── mini-cart hover popover (auto-attaches to #cartBadge on every page) ── */
(function () {
  function init() {
    var badge = document.getElementById('cartBadge');
    if (!badge) return;
    var anchor = badge.parentElement; // the span wrapping the icon + badge (already position:relative)
    if (!anchor || anchor.querySelector('.mini-cart-popover')) return;

    var style = document.createElement('style');
    style.textContent =
      '.mini-cart-popover{display:none;position:absolute;top:28px;right:-10px;width:260px;' +
      'background:#fff;border:1px solid rgba(184,147,106,0.25);border-radius:6px;' +
      'box-shadow:0 8px 24px rgba(36,26,15,0.15);padding:14px;z-index:50;text-align:left;' +
      'font-family:"DM Sans",sans-serif;cursor:default;}' +
      '.mini-cart-popover.open{display:block;}' +
      '.mini-cart-popover .mc-item{display:flex;justify-content:space-between;gap:8px;' +
      'font-size:12px;color:#241a0f;padding:6px 0;border-bottom:1px solid rgba(184,147,106,0.12);}' +
      '.mini-cart-popover .mc-empty{font-size:12px;color:#7a6a5a;text-align:center;padding:8px 0;}' +
      '.mini-cart-popover .mc-btn{display:block;width:100%;text-align:center;background:#8B5E4A;' +
      'color:#fff;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:9px;' +
      'border-radius:3px;margin-top:8px;text-decoration:none;}';
    document.head.appendChild(style);

    var popover = document.createElement('div');
    popover.className = 'mini-cart-popover';
    anchor.appendChild(popover);
    popover.addEventListener('click', function (e) { e.stopPropagation(); }); // don't trigger anchor's onclick

    var hideTimer;
    anchor.addEventListener('mouseenter', async function () {
      clearTimeout(hideTimer);
      var items = await Cart.get();
      if (!items.length) {
        popover.innerHTML = '<div class="mc-empty">Your cart is empty</div>';
      } else {
        popover.innerHTML = items.map(function (i) {
          var price = (typeof Currency !== 'undefined') ? Currency.format(i.price) : i.price;
          return '<div class="mc-item"><span>' + (i.name || '') + ' × ' + (i.qty || 1) + '</span><span>' + price + '</span></div>';
        }).join('') + '<a href="cart.html" class="mc-btn">Go to Cart</a>';
      }
      popover.classList.add('open');
    });
    anchor.addEventListener('mouseleave', function () {
      hideTimer = setTimeout(function () { popover.classList.remove('open'); }, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

  /* ── public: mergeOnLogin ──
     Call this immediately after a successful login.
     Pulls the DB cart, merges any localStorage items into it
     (combining quantities, no duplicates), then saves merged
     result both to DB and localStorage.
  ── */
  async function mergeOnLogin() {
    var token = getToken();
    if (!token) return;

    try {
      // Fetch server cart
      var res = await fetch(API_URL + '/cart', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return;
      var serverItems = await res.json(); // full product objects with qty

      // Start with server items as the base
      var merged = serverItems.slice();

      // Fold in any localStorage items
      var localItems = localGet();
      for (var i = 0; i < localItems.length; i++) {
        var li = localItems[i];
        var inMerged = merged.find(function (m) {
          return String(m.id) === String(li.id);
        });
        if (inMerged) {
          // Combine quantities
          inMerged.qty = (inMerged.qty || 1) + (li.qty || 1);
          // Sync combined qty to DB
          try {
            await fetch(API_URL + '/cart/' + li.id, {
              method: 'PUT',
              headers: authHeader(),
              body: JSON.stringify({ qty: inMerged.qty })
            });
          } catch (e) {}
        } else {
          // New item — push to DB and merged array
          merged.push(Object.assign({}, li));
          try {
            await fetch(API_URL + '/cart', {
              method: 'POST',
              headers: authHeader(),
              body: JSON.stringify({ product_id: li.id, qty: li.qty || 1 })
            });
          } catch (e) {}
        }
      }

      // Save merged result to localStorage
      localSave(merged);
      updateBadge();

    } catch (e) {
      /* If server unreachable, keep localStorage as-is */
    }
  }

  /* ── public: clearOnLogout ── */
  function clearOnLogout() {
    // Local-only wipe — do NOT delete the server-side cart on logout
    localStorage.removeItem(STORAGE_KEY);
    updateBadge();
  }

  return {
    get:            get,
    add:            add,
    remove:         remove,
    updateQty:      updateQty,
    clear:          clear,
    count:          count,
    updateBadge:    updateBadge,
    mergeOnLogin:   mergeOnLogin,
    clearOnLogout:  clearOnLogout
  };
})();