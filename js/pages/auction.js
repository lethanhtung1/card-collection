/* auction.js — sàn đấu giá cho các lá bị thu hồi khi người chơi tự nguyện phá sản (Wallet.bankrupt).
 *
 * Cần: đã chạy auction.sql trong Supabase, và nạp file này SAU wallet.js / binder-store.js.
 *
 * LUẬT (server auction.sql quyết định, file này chỉ hiển thị + gọi RPC):
 *   - Giá khởi điểm = 50% giá thị trường
 *   - Mỗi lô mở 1 tiếng
 *   - Hết 1 tiếng không ai đặt -> bán luôn (chốt lô)
 *   - Có người đặt giá: sau 5 phút không ai trả cao hơn -> người trả cao nhất thắng
 *   - Lá từ rare trở lên: hiện thông báo góc phải "Có lá hiếm đang chờ bạn đấu giá"
 *
 * KẾT NỐI SUPABASE: file này cần 1 supabase client đã đăng nhập (cùng client mà binder-store.js đang dùng). Hãy gọi 1 lần:
 *     Auction.init(supabaseClient)
 * (hoặc đặt window.AuctionClient = supabaseClient trước khi nạp file; nó cũng tự thử window.supabaseClient, window.sb, BinderStore.client).
 *
 * API:
 *   Auction.available()                 -> đã có client chưa
 *   Auction.listConfiscated(cards)      -> đưa các lá lên sàn, trả về mảng id lô   (Wallet.bankrupt gọi hàm này)
 *   Auction.cancelLots(ids)             -> hoàn tác (chỉ trong 5 phút, chưa ai đặt giá)
 *   Auction.mount(el) / Auction.unmount() -> dựng / gỡ giao diện sàn đấu giá trong 1 phần tử
 *   Auction.watch(on)                   -> bật/tắt theo dõi nền để nhận thông báo lá hiếm (init tự bật)
 *   Auction.count()                     -> số lô đang mở (đã tải)
 *
 * SỰ KIỆN: khi bấm "Đấu giá ngay" trên thông báo, window phát 'auction:open' (detail.lots = mảng id lô)
 *   -> trang chính nghe sự kiện này để chuyển sang tab/màn hình Sàn đấu giá.
 */
(function (root) {
    'use strict';
    const CFG = {
        hours: 1,            // mỗi lô mở đấu giá 1 tiếng
        bidWindowMin: 5,     // có người đặt giá -> 5 phút không ai trả thêm thì chốt (server xử lý)
        startPct: 50,        // giá khởi điểm = 50% giá thị trường (server xử lý)
        pollMs: 15000, chunk: 250,
        watchMs: 30000,      // chu kỳ kiểm tra lá hiếm khi không mở tab đấu giá
        toastMs: 9000,       // thông báo lá hiếm tự đóng sau (ms)
        rareTiers: ['rare', 'holo', 'epic', 'legendary', 'showcase']   // "rare trở lên"
    };
    const E = { not_authenticated: 'Bạn cần đăng nhập.', lot_not_found: 'Lô này không còn nữa.', lot_closed: 'Lô đã kết thúc.', own_lot: 'Không đấu giá lá của chính mình.' };

    let sb = null, me = null, host = null, pollT = 0, tickT = 0, watchT = 0, busy = false, rendered = '';
    const S = { lots: [], won: [], filter: 'all', sort: 'end', note: '' };
    const W = () => root.Wallet;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const r2 = v => Math.round(v * 100) / 100;
    const fmt = v => W() ? W().fmt(v) : '$' + Number(v).toFixed(2);
    const TIER_COLOR = { common: '#94a3b8', uncommon: '#4ade80', rare: '#38bdf8', holo: '#a78bfa', epic: '#f472b6', legendary: '#fbbf24', showcase: '#fb923c' };
    const GRADE_NAME = { 10: 'GEM MT', 9: 'MINT', 8: 'NM-MT', 7: 'NM', 6: 'EX-MT', 5: 'EX' };

    // ---------- kết nối ----------
    function client() {
        if (sb) return sb;
        const c = root.AuctionClient || root.supabaseClient || root.sb || (root.BinderStore && (root.BinderStore.client || root.BinderStore.supabase)) || null;
        sb = c && typeof c.rpc === 'function' ? c : null;
        return sb;
    }
    const init = c => {
        sb = c && typeof c.rpc === 'function' ? c : sb; me = null;
        if (sb) watch(true);
        return !!sb;
    };
    const available = () => !!client();
    async function uid() {
        if (me) return me;
        const r = await client().auth.getUser();
        me = r && r.data && r.data.user ? r.data.user.id : null;
        return me;
    }
    async function rpc(name, args) {
        const { data, error } = await client().rpc(name, args || {});
        if (error) throw new Error(error.message || String(error));
        return data;
    }
    const errText = e => {
        const m = String(e && e.message || e), k = Object.keys(E).find(x => m.includes(x));
        if (k) return E[k];
        const low = m.match(/bid_too_low:?\s*([\d.]+)/);
        return low ? `Giá phải từ ${fmt(+low[1])} trở lên.` : m;
    };

    // ---------- phía người phá sản ----------
    async function listConfiscated(cards) {
        if (!client()) throw new Error('Chưa kết nối Supabase cho sàn đấu giá');
        const strip = c => { const o = { ...c }; delete o.id; delete o.b; delete o.ct; return o; };
        const ids = [];
        for (let i = 0; i < cards.length; i += CFG.chunk) {
            const rows = await rpc('auction_list_lots', { p_cards: cards.slice(i, i + CFG.chunk).map(strip), p_hours: CFG.hours });
            (rows || []).forEach(r => ids.push(r.lot_id));
        }
        return ids;
    }
    async function cancelLots(ids) { return ids.length ? rpc('auction_cancel_lots', { p_ids: ids }) : 0; }
    // ---------- admin (server kiểm tra quyền, cần chạy auction-admin.sql) ----------
    async function isAdmin() { if (!client()) return false; try { return !!(await rpc('auction_is_admin')); } catch (e) { return false; } }
    async function adminClear() { return rpc('auction_admin_clear'); }          // trả về số lô đã xoá

    // ---------- tiền + luật đặt giá ----------
    const needOf = l => l.current_bid == null ? +l.start_price : r2(+l.current_bid + Math.max(.5, r2(+l.current_bid * .05)));
    const committed = exceptId => S.lots.filter(l => l.current_bidder === me && l.id !== exceptId).reduce((s, l) => s + +l.current_bid, 0);   // tiền đang "giữ" cho các lô mình dẫn đầu
    const available$ = exceptId => (W() ? W().bal() : 0) - committed(exceptId);

    // ---------- tải dữ liệu ----------
    async function load() {
        const c = client(); if (!c || busy) return;
        busy = true;
        try {
            const u = await uid();
            await rpc('auction_settle_due');
            const [lots, won, mine] = await Promise.all([
                c.from('auction_lots').select('*').eq('status', 'open').order('ends_at', { ascending: true }).limit(300),
                u ? c.from('auction_lots').select('id,card,final_price').eq('winner_id', u).eq('status', 'sold').eq('claimed', false) : Promise.resolve({ data: [] }),
                u ? c.from('auction_bids').select('lot_id').eq('bidder', u).limit(1000) : Promise.resolve({ data: [] })
            ]);
            if (lots.error) throw new Error(lots.error.message);
            S.lots = lots.data || []; S.won = (won && won.data) || []; S.mineIds = new Set(((mine && mine.data) || []).map(r => r.lot_id)); S.note = '';
            checkRare(S.lots);
        } catch (e) { S.note = 'Không tải được sàn đấu giá: ' + errText(e); }
        busy = false; render(true);
    }

    async function bid(id) {
        const l = S.lots.find(x => x.id === id), inp = host && host.querySelector(`[data-amt="${id}"]`);
        if (!l || !inp) return;
        const amt = r2(parseFloat(inp.value));
        if (!(amt > 0)) return toast('Nhập số tiền hợp lệ.');
        if (amt < needOf(l)) return toast(`Giá phải từ ${fmt(needOf(l))} trở lên.`);
        if (amt > available$(id)) return toast(`Không đủ tiền: ví ${fmt(W().bal())}, đang giữ ${fmt(committed(id))} cho các lô khác.`);
        try { await rpc('auction_place_bid', { p_lot: id, p_amount: amt }); toast(`Đã đặt ${fmt(amt)} — bạn đang dẫn đầu.`); }
        catch (e) { toast(errText(e)); }
        load();
    }

    async function claim() {
        const BS = root.BinderStore;
        if (!BS) return toast('Chưa có binder để nhận lá.');
        try {
            const rows = await rpc('auction_claim_won');
            let cost = 0;
            for (const l of rows || []) {
                const card = { ...l.card }; delete card.id; card.t = Date.now();
                BS.add(card); W().add(-l.final_price); cost += +l.final_price;
            }
            try { if (BS.flush) await BS.flush(); } catch (e) { /* sẽ tự đẩy lại */ }
            root.dispatchEvent(new Event('pack:state'));
            toast((rows || []).length ? `Đã nhận ${rows.length} lá · trả ${fmt(cost)}.` : 'Chưa có lá nào để nhận.');
        } catch (e) { toast(errText(e)); }
        load();
    }

    // ---------- giao diện ----------
    function injectCss() {
        if (document.getElementById('auCss')) return;
        const s = document.createElement('style'); s.id = 'auCss';
        s.textContent = `
.au{display:grid;gap:12px;font-size:13px}
.au-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.au-top .sp{flex:1}
.au-chip,.au-sel{border:1px solid var(--brd,#ffffff17);background:var(--card,#0c172beb);color:inherit;border-radius:10px;padding:6px 12px;font:700 12px var(--f-display,system-ui);cursor:pointer}
.au-chip.on{border-color:var(--gold,#ffcb05);background:#ffcb0522;color:var(--gold2,#ffe27a)}
.au-note{padding:9px 12px;border-radius:10px;background:#ffffff0a;color:var(--muted,#a7b3c7);font-size:12.5px}
.au-win{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:11px 14px;border-radius:12px;border:1px solid #4ade8066;background:#4ade8014}
.au-win b{color:#86efac}
.au-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px}
.au-lot{display:grid;gap:6px;padding:9px;border-radius:12px;background:var(--card,#0c172beb);border:1px solid var(--brd,#ffffff17)}
.au-lot.lead{border-color:#4ade8088;box-shadow:0 0 14px #4ade8033}
.au-lot.out{border-color:#fb718588}
.au-img{position:relative;aspect-ratio:63/88;border-radius:6px;overflow:hidden;background:#1a2232;box-shadow:0 0 0 1.5px var(--aura,#94a3b8)}
.au-img img{position:absolute;inset:0;z-index:1;width:100%;height:100%;object-fit:cover;display:block}
.au-img .ph{position:absolute;inset:0;display:grid;place-items:center;padding:6px;font-size:10px;color:#7d8aa5;text-align:center}
.au-img i{position:absolute;z-index:2;left:5px;top:5px;font-style:normal;font:800 9px/14px system-ui;padding:0 6px;border-radius:99px;background:#fde047;color:#2a1700}
.au-lot b{font-size:12.5px;line-height:1.2;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.au-lot small{color:var(--muted,#a7b3c7);font-size:11px}
.au-px{display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px}
.au-px strong{font:800 16px var(--f-display,system-ui);color:var(--gold2,#ffe27a)}
.au-tm{font:700 11px system-ui;color:#fca5a5}
.au-tm.far{color:var(--muted,#a7b3c7)}
.au-bid{display:flex;gap:6px}
.au-bid input{min-width:0;flex:1;width:70px;background:#0008;color:inherit;border:1px solid var(--brd,#ffffff17);border-radius:8px;padding:6px 8px;font:inherit}
.au-bid button{border:0;border-radius:8px;padding:6px 10px;font:800 12px system-ui;background:linear-gradient(#ffe27a,#ffcb05);color:#2a1700;cursor:pointer}
.au-tag{font:800 10.5px system-ui;padding:2px 8px;border-radius:99px;justify-self:start}
.au-tag.lead{background:#4ade8033;color:#86efac}.au-tag.out{background:#fb718533;color:#fda4af}
#auToasts{position:fixed;top:16px;right:16px;z-index:99999;display:grid;gap:10px;width:min(320px,calc(100vw - 32px))}
.au-toast{position:relative;padding:12px 14px;border-radius:12px;background:#0c172bf5;color:#e8eefc;border:1px solid var(--aura,#38bdf8);box-shadow:0 0 18px color-mix(in srgb,var(--aura,#38bdf8) 40%,transparent),0 8px 24px #0008;animation:auIn .3s ease;font:13px system-ui}
.au-toast.out{opacity:0;transform:translateX(30px);transition:.25s}
.au-toast .t{font-weight:800;margin-bottom:4px}
.au-toast .d{color:#a7b3c7;margin-bottom:8px}
.au-toast .x{position:absolute;top:4px;right:8px;border:0;background:none;color:#a7b3c7;font-size:18px;cursor:pointer}
.au-toast .go{border:0;border-radius:8px;padding:6px 12px;font:800 12px system-ui;background:linear-gradient(#ffe27a,#ffcb05);color:#2a1700;cursor:pointer}
@keyframes auIn{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}
`;
        document.head.append(s);
    }
    const leftText = ms => {
        if (ms <= 0) return 'Đang chốt…';
        const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
        return d ? `${d}n ${h}g` : h ? `${h}g ${m}p` : `${m}p ${String(s % 60).padStart(2, '0')}s`;
    };
    function lotHTML(l) {
        const c = l.card || {}, mine = l.current_bidder === me, was = !mine && S.mineIds && S.mineIds.has(l.id);
        const src = c.i || c.a, need = needOf(l), left = new Date(l.ends_at).getTime() - Date.now();
        const slab = c.gr ? `<i>${esc(c.co || 'PSA')} ${c.gr}</i>` : '';
        return `<div class="au-lot${mine ? ' lead' : was ? ' out' : ''}" data-id="${l.id}" style="--aura:${TIER_COLOR[c.k] || '#94a3b8'}">
            <div class="au-img"><div class="ph">${esc(c.n || '')}</div>${src ? `<img loading="lazy" alt="" src="${esc(src)}" onerror="this.remove()">` : ''}${slab}</div>
            <b>${esc(c.n || '?')}</b>
            <small>${esc(c.sn || c.s || '')}${c.no ? ' · #' + esc(c.no) : ''} · ${esc(c.r || '')}${c.gr ? ' · ' + (GRADE_NAME[Math.floor(c.gr)] || '') : ''}</small>
            <small>Giá thị trường ${fmt(+l.market)}</small>
            <div class="au-px"><span>${l.current_bid == null ? 'Khởi điểm' : l.bid_count + ' lượt · hiện tại'}</span><strong>${fmt(l.current_bid == null ? +l.start_price : +l.current_bid)}</strong></div>
            <div class="au-tm${left > 3600e3 ? ' far' : ''}" data-end="${esc(l.ends_at)}">⏱ ${leftText(left)}</div>
            ${mine ? '<span class="au-tag lead">✓ Bạn đang dẫn đầu</span>' : was ? '<span class="au-tag out">Bạn bị vượt giá</span>' : ''}
            <div class="au-bid"><input type="number" min="0" step="0.01" data-amt="${l.id}" value="${need.toFixed(2)}" aria-label="Giá đặt"><button data-bid="${l.id}">Đặt giá</button></div>
        </div>`;
    }
    function render(force) {
        if (!host) return;
        injectCss();
        if (!client()) {
            host.innerHTML = '<div class="au"><div class="au-note">Sàn đấu giá chưa kết nối Supabase. Gọi <b>Auction.init(supabaseClient)</b> một lần khi trang khởi động (và đã chạy <b>auction.sql</b>).</div></div>';
            return;
        }
        let lots = S.lots.slice();
        if (S.filter === 'mine') lots = lots.filter(l => l.current_bidder === me);
        if (S.sort === 'end') lots.sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at));
        else if (S.sort === 'cheap') lots.sort((a, b) => +(a.current_bid ?? a.start_price) - +(b.current_bid ?? b.start_price));
        else if (S.sort === 'value') lots.sort((a, b) => +b.market - +a.market);
        const lead = S.lots.filter(l => l.current_bidder === me).length;
        const html = `<div class="au">
            ${S.won.length ? `<div class="au-win"><span>🏆 Bạn thắng <b>${S.won.length}</b> lô (${fmt(S.won.reduce((s, l) => s + +l.final_price, 0))})</span><button data-claim class="au-chip on">Nhận lá & thanh toán</button></div>` : ''}
            <div class="au-top"><button class="au-chip${S.filter === 'all' ? ' on' : ''}" data-f="all">Tất cả (${S.lots.length})</button><button class="au-chip${S.filter === 'mine' ? ' on' : ''}" data-f="mine">Tôi đang dẫn đầu (${lead})</button>
                <span class="sp"></span><span class="au-note" style="padding:5px 10px">Khả dụng ${fmt(available$())}</span>
                <select class="au-sel" data-sort aria-label="Sắp xếp"><option value="end"${S.sort === 'end' ? ' selected' : ''}>Sắp kết thúc</option><option value="cheap"${S.sort === 'cheap' ? ' selected' : ''}>Giá thấp</option><option value="value"${S.sort === 'value' ? ' selected' : ''}>Giá trị cao</option></select></div>
            <div class="au-note">Các lá do người chơi phá sản nộp lên. Mỗi lô mở đấu giá <b>${CFG.hours} tiếng</b>, giá khởi điểm bằng <b>${CFG.startPct}%</b> giá thị trường, mỗi lần tăng tối thiểu 5%. Có người đặt giá thì sau <b>${CFG.bidWindowMin} phút</b> không ai trả cao hơn, người trả cao nhất thắng lô. Hết ${CFG.hours} tiếng không ai đặt thì lô được bán luôn.${S.note ? '<br><b>' + esc(S.note) + '</b>' : ''}</div>
            <div class="au-grid">${lots.map(lotHTML).join('') || '<div class="au-note" style="grid-column:1/-1">Hiện chưa có lô nào đang đấu giá.</div>'}</div></div>`;
        if (!force && html === rendered) return;
        // giữ nguyên số đang gõ trong ô giá khi làm mới
        const keep = {}; host.querySelectorAll('[data-amt]').forEach(i => { if (document.activeElement === i) keep[i.dataset.amt] = [i.value, i.selectionStart]; });
        host.innerHTML = html; rendered = html;
        Object.entries(keep).forEach(([id, [v, pos]]) => { const i = host.querySelector(`[data-amt="${id}"]`); if (i) { i.value = v; i.focus(); try { i.setSelectionRange(pos, pos); } catch (e) { /* bỏ qua */ } } });
    }
    function toast(msg) { if (W() && W().notify) W().notify(msg); else alert(msg); }

    // ---------- thông báo lá hiếm (góc phải) ----------
    let seen = null;
    const seenKey = 'au_seen_rare';
    function loadSeen() {
        if (seen) return seen;
        try { seen = new Set(JSON.parse(localStorage.getItem(seenKey) || '[]')); } catch (e) { seen = new Set(); }
        return seen;
    }
    function saveSeen() { try { localStorage.setItem(seenKey, JSON.stringify([...seen].slice(-500))); } catch (e) { /* bỏ qua */ } }

    function showRareToast(lots) {
        injectCss();
        let stack = document.getElementById('auToasts');
        if (!stack) { stack = document.createElement('div'); stack.id = 'auToasts'; document.body.append(stack); }
        const first = lots[0].card || {}, more = lots.length - 1;
        const el = document.createElement('div');
        el.className = 'au-toast';
        el.style.setProperty('--aura', TIER_COLOR[first.k] || '#38bdf8');
        el.innerHTML = `<button class="x" aria-label="Đóng">×</button>
            <div class="t">💎 Có lá hiếm đang chờ bạn đấu giá!</div>
            <div class="d"><b>${esc(first.n || '?')}</b> · ${esc((first.k || '').toUpperCase())}${more > 0 ? ` và ${more} lá hiếm khác` : ''}</div>
            <button class="go">Đấu giá ngay</button>`;
        const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
        el.querySelector('.x').onclick = close;
        el.querySelector('.go').onclick = () => { root.dispatchEvent(new CustomEvent('auction:open', { detail: { lots: lots.map(l => l.id) } })); close(); };
        stack.append(el);
        setTimeout(close, CFG.toastMs);
    }

    function checkRare(lots) {
        const s = loadSeen(), R = new Set(CFG.rareTiers), before = s.size;
        const rare = lots.filter(l => R.has((l.card || {}).k));
        const fresh = rare.filter(l => !s.has(l.id) && l.current_bidder !== me && l.seller_id !== me);
        rare.forEach(l => s.add(l.id));
        if (s.size !== before) saveSeen();
        if (fresh.length) showRareToast(fresh);
    }

    // chạy nền để vẫn nhận thông báo khi đang không mở tab đấu giá
    function watch(on = true) {
        clearInterval(watchT); watchT = 0;
        if (!on || !client()) return;
        load();
        watchT = setInterval(() => { if (!host) load(); }, CFG.watchMs);
    }

    function onClick(e) {
        const b = e.target.closest('[data-bid]'), f = e.target.closest('[data-f]'), c = e.target.closest('[data-claim]');
        if (b) bid(b.dataset.bid); else if (f) { S.filter = f.dataset.f; render(true); } else if (c) claim();
    }
    function onChange(e) { if (e.target.matches('[data-sort]')) { S.sort = e.target.value; render(true); } }

    async function mount(el) {
        unmount(); host = el; host.addEventListener('click', onClick); host.addEventListener('change', onChange);
        if (client()) await uid();
        render(true); load();
        pollT = setInterval(load, CFG.pollMs);
        tickT = setInterval(() => { if (host) host.querySelectorAll('.au-tm[data-end]').forEach(t => { const ms = new Date(t.dataset.end) - Date.now(); t.textContent = '⏱ ' + leftText(ms); t.classList.toggle('far', ms > 3600e3); }); }, 1000);
    }
    function unmount() {
        clearInterval(pollT); clearInterval(tickT);
        if (host) { host.removeEventListener('click', onClick); host.removeEventListener('change', onChange); }
        host = null; rendered = '';
    }

    root.Auction = { cfg: CFG, init, available, listConfiscated, cancelLots, isAdmin, adminClear, mount, unmount, watch, reload: load, count: () => S.lots.length };
})(window);