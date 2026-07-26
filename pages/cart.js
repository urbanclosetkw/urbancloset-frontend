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
        var body = await res.json();
        // Server wraps payloads as { success, message, data }; unwrap it.
        var items = Array.isArray(body) ? body : (body.data || []);
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
      '.mini-cart-popover{display:none;position:absolute;top:28px;right:-10px;width:300px;' +
      'background:#fff;border:1px solid rgba(184,147,106,0.25);border-radius:6px;' +
      'box-shadow:0 8px 24px rgba(36,26,15,0.15);padding:14px;z-index:401;text-align:left;' +
      'font-family:"DM Sans",sans-serif;cursor:default;}' +
      '.mini-cart-popover.open{display:block;}' +
      '.mini-cart-popover .mc-title{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;' +
      'color:#7a6a5a;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;}' +
      '.mini-cart-popover .mc-close{display:none;cursor:pointer;font-size:14px;color:#7a6a5a;line-height:1;}' +
      '.mini-cart-popover .mc-list{max-height:280px;overflow-y:auto;margin:0 -14px;padding:0 14px;}' +
      '.mini-cart-popover .mc-item{display:flex;align-items:center;gap:10px;' +
      'padding:8px 0;border-bottom:1px solid rgba(184,147,106,0.12);}' +
      '.mini-cart-popover .mc-item:last-child{border-bottom:none;}' +
      '.mini-cart-popover .mc-img{width:44px;height:44px;border-radius:3px;overflow:hidden;' +
      'flex-shrink:0;background:#F0E8DE;display:flex;align-items:center;justify-content:center;}' +
      '.mini-cart-popover .mc-img img{width:100%;height:100%;object-fit:cover;}' +
      '.mini-cart-popover .mc-info{flex:1;min-width:0;}' +
      '.mini-cart-popover .mc-name{font-size:12px;color:#241a0f;line-height:1.3;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.mini-cart-popover .mc-qty{font-size:10.5px;color:#7a6a5a;margin-top:2px;}' +
      '.mini-cart-popover .mc-price{font-size:12px;color:#8B5E4A;font-weight:500;flex-shrink:0;}' +
      '.mini-cart-popover .mc-empty{font-size:12px;color:#7a6a5a;text-align:center;padding:16px 0;}' +
      '.mini-cart-popover .mc-total-row{display:flex;justify-content:space-between;align-items:center;' +
      'font-size:11px;color:#241a0f;padding-top:10px;margin-top:2px;border-top:1px solid rgba(184,147,106,0.18);}' +
      '.mini-cart-popover .mc-total-row strong{font-size:13px;}' +
      '.mini-cart-popover .mc-btn{display:block;width:100%;text-align:center;background:#8B5E4A;' +
      'color:#fff;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;padding:9px;' +
      'border-radius:3px;margin-top:10px;text-decoration:none;}' +
      /* Mobile: hover doesn't exist on touch, so the mini-cart becomes a
         full-width slide-down drawer from the top of the screen instead. */
      '.mc-drawer-overlay{display:none;position:fixed;inset:0;background:rgba(21,13,5,0.4);' +
      'z-index:400;opacity:0;transition:opacity 0.25s;}' +
      '.mc-drawer-overlay.open{display:block;opacity:1;}' +
      '@media (max-width:720px){' +
        '.mini-cart-popover{position:fixed;top:0;left:0;right:0;width:100%;' +
        'border-radius:0 0 10px 10px;transform:translateY(-100%);transition:transform 0.3s cubic-bezier(.4,0,.2,1);' +
        'display:block;visibility:hidden;padding:16px;max-height:80vh;overflow-y:auto;}' +
        '.mini-cart-popover.open{transform:translateY(0);visibility:visible;}' +
        '.mini-cart-popover .mc-close{display:block;}' +
      '}';
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.className = 'mc-drawer-overlay';
    document.body.appendChild(overlay);

    var popover = document.createElement('div');
    popover.className = 'mini-cart-popover';
    anchor.appendChild(popover);
    popover.addEventListener('click', function (e) { e.stopPropagation(); }); // don't trigger anchor's onclick

    function isMobile() {
      return window.matchMedia('(max-width: 720px)').matches;
    }

    function openDrawer() {
      popover.classList.add('open');
      if (isMobile()) overlay.classList.add('open');
    }
    function closeDrawer() {
      popover.classList.remove('open');
      overlay.classList.remove('open');
    }

    overlay.addEventListener('click', closeDrawer);

    function bagPlaceholderSVG() {
      return '<svg viewBox="0 0 60 55" width="24" fill="none"><rect x="5" y="18" width="50" height="34" rx="3" fill="#A48374" opacity="0.4"/><path d="M18 18 C18 8 42 8 42 18" stroke="#A48374" stroke-width="3" fill="none" opacity="0.5"/></svg>';
    }

    async function renderPopoverContents() {
      var items = await Cart.get();
      var closeBtn = '<span class="mc-close" onclick="this.closest(\'.mini-cart-popover\').dispatchEvent(new Event(\'mc-close-tap\'))">✕</span>';
      if (!items.length) {
        popover.innerHTML = '<div class="mc-title">Cart' + closeBtn + '</div><div class="mc-empty">Your cart is empty</div>';
      } else {
        var total = items.reduce(function (s, i) { return s + (parseFloat(i.price || 0) * (i.qty || 1)); }, 0);
        var rows = items.map(function (i) {
          var price   = (typeof Currency !== 'undefined') ? Currency.format(i.price) : i.price;
          var imgHtml = i.image_url
            ? '<img src="' + i.image_url + '" alt="' + (i.name || '') + '">'
            : bagPlaceholderSVG();
          return '<div class="mc-item">' +
            '<div class="mc-img">' + imgHtml + '</div>' +
            '<div class="mc-info">' +
              '<div class="mc-name">' + (i.name || '') + '</div>' +
              '<div class="mc-qty">Qty ' + (i.qty || 1) + '</div>' +
            '</div>' +
            '<div class="mc-price">' + price + '</div>' +
          '</div>';
        }).join('');
        var totalFormatted = (typeof Currency !== 'undefined') ? Currency.format(total) : total;
        popover.innerHTML =
          '<div class="mc-title">Cart (' + items.length + ' item' + (items.length > 1 ? 's' : '') + ')' + closeBtn + '</div>' +
          '<div class="mc-list">' + rows + '</div>' +
          '<div class="mc-total-row"><span>Total</span><strong>' + totalFormatted + '</strong></div>' +
          '<a href="cart.html" class="mc-btn">View Cart</a>';
      }
      popover.addEventListener('mc-close-tap', closeDrawer);
    }

    var hideTimer;
    anchor.addEventListener('mouseenter', async function () {
      if (isMobile()) return; // no hover on touch devices
      clearTimeout(hideTimer);
      await renderPopoverContents();
      openDrawer();
    });
    anchor.addEventListener('mouseleave', function () {
      if (isMobile()) return;
      hideTimer = setTimeout(closeDrawer, 150);
    });

    // Mobile: first tap opens the drawer for a peek instead of leaving the
    // page immediately; tapping "View Cart" (or the icon again) proceeds.
    anchor.addEventListener('click', function (e) {
      if (!isMobile()) return; // desktop keeps its normal click-through navigation
      if (popover.classList.contains('open')) return; // already open — let the tap through (e.g. "View Cart")
      e.preventDefault();
      e.stopImmediatePropagation();
      renderPopoverContents().then(openDrawer);
    }, true);
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
      var body = await res.json();
      // Server wraps payloads as { success, message, data }; unwrap it.
      var serverItems = Array.isArray(body) ? body : (body.data || []); // full product objects with qty

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