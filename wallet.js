/* wallet.js — ví của người chơi, tính từ tiến độ đã đồng bộ lên Supabase (pack_stats_v1) nên MỖI TÀI KHOẢN có ví riêng.
 *   ví = 500$ khởi điểm + adj (bán lá +, phí chấm −) − cost (tổng giá các pack đã xé)
 * Xé pack được phép âm ví (nợ). Nợ chạm -500.000$ thì KHOÁ xé pack (cờ lock lưu cùng tiến độ, đồng bộ lên Supabase).
 * Khoá chỉ mở khi trả hết nợ (ví >= 0$). Người chơi TỰ QUYẾT cách trả:
 *   ① tự chọn lá nào để bán (Bộ sưu tập) cho tới khi ví >= 0$, hoặc
 *   ② tự nguyện PHÁ SẢN (Wallet.bankrupt): nộp TOÀN BỘ lá cho sàn đấu giá (auction.js) để người chơi khác đấu giá, nợ được xoá (ví về 0$).
 * Không còn tự động thu hồi lá: hệ thống không bao giờ lấy lá của người chơi nếu họ không bấm phá sản.
 * Nạp SAU binder-store.js, TRƯỚC pack.js / script của binder. (auction.js nạp sau wallet.js; không có auction.js thì chưa phá sản được.) */
(function (root) {
    const CFG = { startCash: 500, debtLimit: 500000, sellRate: 0.9 };
    const KEY = 'pack_stats_v1';
    const r2 = v => Math.round(v * 100) / 100;
    const rd = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
    const wr = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch (e) { return false; } };
    const fmt = v => (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sellOf = c => r2((c.u == null ? 0 : c.u * (c.m || 1)) * CFG.sellRate);
    try { localStorage.removeItem('pack_wallet_v1'); } catch (e) { /* ví cũ lưu theo máy -> bỏ */ }

    const locked = () => !!rd().lock;
    function updateLock() {                                   // bật khi nợ chạm hạn mức, chỉ tắt khi ví >= 0
        const s = rd(), b = r2(CFG.startCash + (s.adj || 0) - (s.cost || 0));
        if (!s.lock && b <= -CFG.debtLimit) { s.lock = true; wr(s); }
        else if (s.lock && b >= 0) { delete s.lock; wr(s); }
    }
    const bal = () => { const s = rd(); return r2(CFG.startCash + (s.adj || 0) - (s.cost || 0)); };

    function notify(text) {
        let t = document.getElementById('wlToast');
        if (!t) {
            t = document.createElement('div'); t.id = 'wlToast';
            t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:120;max-width:min(92vw,460px);padding:12px 16px;border-radius:12px;background:#2a1216;border:1px solid #ef4444;color:#fecaca;font:600 13.5px/1.45 system-ui,sans-serif;box-shadow:0 12px 30px #000c;text-align:center';
            document.body.append(t);
        }
        t.textContent = text; t.style.display = 'block';
        clearTimeout(notify.t); notify.t = setTimeout(() => { t.style.display = 'none'; }, 7000);
    }

    function refresh() {
        const p = document.getElementById('wlPill'); if (!p) return;
        updateLock();
        const b = bal(); p.textContent = (locked() ? '🔒 ' : '') + 'Ví ' + fmt(b);
        p.style.color = b < 0 ? '#fca5a5' : '#ffe27a'; p.style.borderColor = b < 0 ? '#ef444466' : '#ffcb0538';
        p.title = locked() ? 'Đang khoá xé pack — phải trả hết nợ (bán lá) hoặc tự nguyện phá sản' : 'Tiền mặt. Xé pack trừ vào ví, được nợ tới −' + fmt(CFG.debtLimit).replace('$', '$');
    }
    function add(v) {
        const s = rd(); s.adj = r2((s.adj || 0) + v); wr(s);
        updateLock(); refresh(); if (root.PlayerSync) root.PlayerSync.push();
        return bal();
    }

    // ---- phá sản: do NGƯỜI CHƠI chủ động bấm, không bao giờ tự chạy ----
    const canBankrupt = () => bal() < 0;
    const storeReady = async () => {
        if (root.BinderStore && root.BinderStore.ready) await root.BinderStore.ready;
        const BS = root.BinderStore;
        const bad = !BS || (BS.isCloud && (!BS.isCloud() || BS.status() === 'error' || BS.status() === 'offline'));
        return bad ? null : BS;
    };
    // thông tin để hiện trước khi người chơi quyết định
    async function bankruptInfo() {
        const BS = await storeReady(); if (!BS) return null;
        const cards = BS.all();
        return { debt: -bal(), count: cards.length, worth: r2(cards.reduce((s, c) => s + sellOf(c), 0)) };
    }
    // kết quả: { ok, debt, count, lots, worth } hoặc { ok:false, reason: 'no-debt' | 'sync' | 'auction' | 'error' }
    async function bankrupt() {
        if (!canBankrupt()) return { ok: false, reason: 'no-debt' };
        const BS = await storeReady(); if (!BS) return { ok: false, reason: 'sync' };
        const b = bal(), cards = BS.all().map(c => ({ ...c })), worth = r2(cards.reduce((s, c) => s + sellOf(c), 0));
        let lotIds = [];
        if (cards.length && !(root.Auction && root.Auction.available())) return { ok: false, reason: 'auction-off' };   // sàn chưa sẵn sàng thì KHÔNG phá sản, tránh làm mất lá
        if (cards.length && root.Auction && root.Auction.available()) {
            try { lotIds = await root.Auction.listConfiscated(cards); }          // đưa lên sàn TRƯỚC; lỗi thì dừng, chưa động vào lá nào
            catch (e) { return { ok: false, reason: 'auction', error: e }; }
        }
        try { BS.remove(cards.map(c => c.id)); }
        catch (e) { if (lotIds.length && root.Auction) { try { await root.Auction.cancelLots(lotIds); } catch (e2) { /* bỏ qua */ } } return { ok: false, reason: 'error', error: e }; }
        add(-b);                                                  // ví về 0$ và tự mở khoá
        try { await BS.flush(); } catch (e) { /* sẽ tự đẩy lại */ }
        root.dispatchEvent(new Event('pack:state'));
        return { ok: true, debt: -b, count: cards.length, lots: lotIds.length, worth };
    }

    // hộp thoại cho người chơi chọn: tự bán lá hay phá sản
    function openDebtDialog() {
        if (document.getElementById('wlDlg')) return;
        const b = bal(); if (b >= 0) return notify('Bạn không nợ — ví đang ' + fmt(b) + '.');
        const o = document.createElement('div'); o.id = 'wlDlg';
        o.style.cssText = 'position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:16px;background:#000d;font:14px/1.5 system-ui,sans-serif;overflow:auto';
        const optCss = 'border:1px solid #ffffff22;border-radius:12px;padding:12px;display:grid;gap:8px;background:#ffffff08';
        const btnCss = 'font:700 13px system-ui,sans-serif;padding:9px 14px;border-radius:10px;border:0;cursor:pointer';
        o.innerHTML = `<div style="width:100%;max-width:460px;border-radius:16px;padding:18px;background:#0c172b;border:1px solid #ffcb0538;color:#f3f6fb;display:grid;gap:12px;box-shadow:0 30px 60px #000c">
            <div style="font:800 18px system-ui,sans-serif">💸 Bạn đang nợ ${fmt(-b)}</div>
            <div style="color:#a7b3c7;font-size:13px">Hạn mức nợ ${fmt(CFG.debtLimit)}. ${locked() ? '🔒 Xé pack đang bị khoá cho tới khi ví ≥ $0.' : 'Chạm hạn mức thì xé pack sẽ bị khoá.'} Lá bài của bạn <b style="color:#f3f6fb">chỉ bị lấy khi chính bạn bấm phá sản</b>.</div>
            <div style="${optCss}"><b>① Tự bán lá để trả nợ</b><span style="color:#a7b3c7;font-size:12.5px">Vào Bộ sưu tập, tự chọn lá nào bán, lá nào giữ (nhận ${Math.round(CFG.sellRate * 100)}% giá). Ví về ≥ $0 là được mở khoá.</span>
                <button id="wlGo" style="${btnCss};background:linear-gradient(#ffe27a,#ffcb05);color:#2a1700">Mở Bộ sưu tập</button></div>
            <div style="${optCss};border-color:#ef444455"><b style="color:#fca5a5">② Phá sản — nộp hết lá, xoá nợ</b>
                <span id="wlInfo" style="color:#a7b3c7;font-size:12.5px">Đang đọc binder…</span>
                <label style="font-size:12.5px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="wlOk"> Tôi hiểu và tự quyết định, không hoàn lại được</label>
                <button id="wlBk" disabled style="${btnCss};background:#7f1d1d;color:#fff;opacity:.45">Phá sản</button></div>
            <button id="wlClose" style="${btnCss};background:#ffffff14;color:#f3f6fb">Để sau</button></div>`;
        document.body.append(o);
        const q = s => o.querySelector(s), close = () => o.remove();
        bankruptInfo().then(i => {
            q('#wlInfo').innerHTML = !i ? 'Binder chưa đồng bộ xong — thử lại sau ít giây.'
                : `Nộp <b style="color:#f3f6fb">toàn bộ ${i.count} lá</b> (bán được khoảng ${fmt(i.worth)}) ${root.Auction && root.Auction.available() ? 'lên <b style="color:#f3f6fb">sàn đấu giá</b> cho người chơi khác' : '(sàn đấu giá chưa sẵn sàng — tạm thời chưa phá sản được)'}. Nợ ${fmt(i.debt)} được xoá, ví về $0, mở khoá xé pack.`;
        });
        q('#wlOk').onchange = e => { q('#wlBk').disabled = !e.target.checked; q('#wlBk').style.opacity = e.target.checked ? 1 : .45; };
        q('#wlClose').onclick = close; o.onclick = e => { if (e.target === o) close(); };
        q('#wlGo').onclick = () => { close(); if (/binder\.html$/i.test(location.pathname)) root.dispatchEvent(new Event('wallet:sell')); else location.href = 'binder.html'; };
        q('#wlBk').onclick = async () => {
            q('#wlBk').disabled = true; q('#wlBk').textContent = 'Đang xử lý…';
            const r = await bankrupt();
            if (r.ok) { close(); notify(`Đã phá sản: xoá nợ ${fmt(r.debt)}, nộp ${r.count} lá${r.lots ? ` (${r.lots} lô lên sàn đấu giá)` : ''}. Ví về $0 — bạn xé lại được.`); }
            else { q('#wlBk').disabled = false; q('#wlBk').textContent = 'Phá sản'; notify(r.reason === 'sync' ? 'Binder chưa đồng bộ xong — thử lại sau ít giây.' : r.reason === 'auction-off' ? 'Sàn đấu giá chưa sẵn sàng nên chưa phá sản được, lá của bạn vẫn nguyên. Thử lại sau.' : r.reason === 'auction' ? 'Chưa đưa được lá lên sàn đấu giá nên chưa động vào lá nào của bạn. Thử lại sau.' : 'Phá sản không thành công, lá của bạn vẫn nguyên.'); }
        };
    }

    // gọi trước khi mở pack: true = được xé. Bị khoá thì KHÔNG tự lấy lá, chỉ mở hộp thoại cho người chơi chọn.
    async function gate() {
        updateLock();
        if (!locked()) return true;
        root.dispatchEvent(new CustomEvent('wallet:debt', { detail: { bal: bal() } }));
        openDebtDialog();
        return false;
    }

    function mount() {
        const ach = document.getElementById('achBtn');            // chỉ ở trang xé pack; trang binder tự có ô ví
        if (!ach || document.getElementById('wlPill')) return;
        const p = document.createElement('span'); p.id = 'wlPill';
        p.style.cssText = 'font:700 13px system-ui,sans-serif;padding:7px 12px;border-radius:99px;border:1px solid #ffcb0538;background:#121b33;white-space:nowrap';
        p.style.cursor = 'pointer'; p.onclick = () => { if (bal() < 0) openDebtDialog(); };
        ach.before(p); refresh();
    }
    root.addEventListener('pack:state', refresh);
    document.addEventListener('DOMContentLoaded', mount);
    root.Wallet = { cfg: CFG, bal, add, fmt, gate, refresh, notify, sellOf, locked, canBankrupt, bankruptInfo, bankrupt, openDebtDialog };
})(window);