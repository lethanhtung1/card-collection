/* leaderboard.js — trang Bảng xếp hạng. Cần: supabase-config.js, binder-store.js, cloud-auth.js (đã nạp trước file này). */
(function () {
    const $ = s => document.querySelector(s);
    const listEl = $('#lbList'), meEl = $('#lbMe'), msgEl = $('#lbMsg'), qEl = $('#lbQ'), updEl = $('#lbUpd'), refreshBtn = $('#lbRefresh');
    const LIMIT = 100, AUTO_MS = 60000;
    let rows = [], sortBy = 'score', loading = false;

    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    // dấu +/− chỉ ghép MỘT lần ở đây; số tiền luôn là số dương (Math.abs)
    const money = v => (v >= 0 ? '+$' : '−$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
    const medal = i => ['🥇', '🥈', '🥉'][i] || '#' + (i + 1);

    function myName() {
        const A = window.Auth, B = window.BinderStore;
        if (!A || !A.user) return '';
        return (B && B.name && B.name()) || (A.user.user_metadata || {}).name || (A.user.email || '').split('@')[0] || '';
    }
    function say(text, kind) { msgEl.textContent = text || ''; msgEl.className = 'lb-msg' + (kind ? ' ' + kind : ''); }

    function ranked() {                                  // xếp hạng theo tiêu chí đang chọn (xếp trước khi lọc tìm kiếm để thứ hạng không bị đổi)
        const key = sortBy === 'packs' ? 'packs' : 'score';
        return [...rows].sort((a, b) => b[key] - a[key]).map((r, i) => Object.assign({}, r, { rank: i + 1 }));
    }

    function render() {
        const all = ranked(), me = myName(), q = norm(qEl.value);
        const shown = q ? all.filter(r => norm(r.name).includes(q)) : all;

        // thẻ "thứ hạng của bạn"
        if (!window.Auth || !window.sb) meEl.hidden = true;
        else if (!Auth.user) {
            meEl.hidden = false; meEl.className = 'lb-me guest';
            meEl.innerHTML = '<span>Đăng nhập để xem thứ hạng của bạn</span><button type="button" class="primary" id="lbLogin">Đăng nhập</button>';
            $('#lbLogin').onclick = () => Auth.openModal('in', 'Đăng nhập để có tên trên bảng xếp hạng.');
        } else {
            const mine = all.find(r => me && r.name === me);
            meEl.hidden = false; meEl.className = 'lb-me';
            meEl.innerHTML = mine
                ? `<div class="rk">${medal(mine.rank - 1)}</div><div class="who"><b>${esc(mine.name)}</b><small>${mine.packs} pack đã xé</small></div><div class="sc ${mine.score >= 0 ? 'pos' : 'neg'}">${money(mine.score)}</div>`
                : `<div class="rk">—</div><div class="who"><b>${esc(me)}</b><small>Chưa có trong top ${LIMIT} — xé thêm pack nhé!</small></div>`;
        }

        if (!shown.length) { listEl.replaceChildren(); say(rows.length ? 'Không tìm thấy người chơi nào.' : 'Chưa có ai trên bảng — hãy xé pack đầu tiên!'); return; }
        say('');
        listEl.innerHTML = shown.map((r, i) => `<li class="lb-row${r.rank <= 3 ? ' top' + r.rank : ''}${me && r.name === me ? ' me' : ''}" style="animation-delay:${Math.min(i, 15) * 25}ms">`
            + `<div class="rk">${medal(r.rank - 1)}</div>`
            + `<div class="nm"><b>${esc(r.name)}</b><small>${r.packs} pack đã xé</small></div>`
            + `<div class="sc ${r.score >= 0 ? 'pos' : 'neg'}">${money(r.score)}</div></li>`).join('');
    }

    async function load(silent) {
        if (loading) return;
        loading = true; refreshBtn.classList.add('spin');
        if (!silent) { say(''); listEl.innerHTML = Array(8).fill('<li class="lb-sk"></li>').join(''); }
        try {
            if (window.Auth && Auth.ready) await Auth.ready;
            if (!window.sb || !window.PlayerSync) { listEl.replaceChildren(); say('Chưa cấu hình Supabase nên không có bảng xếp hạng.', 'err'); return; }
            const data = await PlayerSync.leaderboard(LIMIT);
            rows = data.map(r => ({ name: String(r.display_name || 'Ẩn danh'), packs: Number(r.packs) || 0, score: Number(r.score) || 0 }));
            render();
            updEl.textContent = 'Cập nhật lúc ' + new Date().toLocaleTimeString('vi-VN');
        } catch (e) {
            console.warn('[leaderboard]', e);
            if (!rows.length) { listEl.replaceChildren(); say('Không tải được bảng xếp hạng: ' + (e.message || e) + ' (hàm get_leaderboard trên Supabase đã tạo và cho phép đọc chưa?)', 'err'); }
        } finally { loading = false; refreshBtn.classList.remove('spin'); }
    }

    document.querySelectorAll('.lb-seg button').forEach(b => {
        b.onclick = () => { sortBy = b.dataset.sort; document.querySelectorAll('.lb-seg button').forEach(x => x.classList.toggle('on', x === b)); render(); };
    });
    qEl.oninput = render;
    refreshBtn.onclick = () => load();
    if (window.Auth && Auth.onChange) Auth.onChange(() => { if (rows.length) render(); load(true); });   // đăng nhập / đăng xuất -> vẽ lại thẻ của bạn
    setInterval(() => { if (!document.hidden) load(true); }, AUTO_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
    load();
})();