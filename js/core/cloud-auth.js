/* cloud-auth.js — đăng nhập / đăng ký (Supabase Auth) + đồng bộ tiến độ + bảng xếp hạng cho pack.html.
 * Nạp SAU supabase-config.js và binder-store.js, TRƯỚC pack.js.
 *
 *   Auth.require(lý_do)   Promise<boolean> — đã đăng nhập thì true ngay; chưa thì hiện khung đăng nhập/đăng ký, true khi xong, false khi người chơi đóng khung
 *   Auth.user             người dùng hiện tại (hoặc null)
 *   Auth.signOut()        đẩy hết dữ liệu lên mây rồi đăng xuất
 *   Auth.openLeaderboard()  mở bảng xếp hạng
 *   Auth.onChange(f)      f(user) gọi khi đăng nhập / đăng xuất
 *   PlayerSync.push()     gọi sau khi pack.js ghi thống kê / thành tích (tự gộp, đẩy sau ~1.5 giây)
 * Sự kiện window 'pack:state' bắn khi tiến độ kéo từ mây về xong (pack.js nghe để vẽ lại nút thành tích).
 */
(function (root) {
    const sb = root.sb || null, cfg = root.SB_CONFIG || {};
    let user = null, guestOk = false, mode = 'in', busy = false, checking = true, adminFlag = false;
    const waiters = [], watchers = [];
    let readyResolve; const ready = new Promise(r => { readyResolve = r; });

    // =====================================================================
    // 1. ĐỒNG BỘ TIẾN ĐỘ (thống kê / thành tích / bộ sưu tập đang nằm trong localStorage của pack.js)
    // =====================================================================
    const LS = { stats: 'pack_stats_v1', ach: 'pack_achievements_v1', coll: 'pack_collection_v1', who: 'pack_state_uid' };
    const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
    const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* đầy bộ nhớ */ } };
    let pushT = 0, lastOk = true;

    // gộp tiến độ ở máy với tiến độ trên mây: bên nào xé nhiều pack hơn thắng; thành tích lấy hợp (giữ mốc mở khoá sớm nhất); bộ sưu tập lấy max từng lá
    function mergeState(local, remote) {
        const ls = local.stats || {}, rs = remote.stats || {};
        const stats = (rs.packs || 0) >= (ls.packs || 0) ? rs : ls;
        const la = local.ach || {}, ra = remote.ach || {};
        const score = a => (a.graded || 0) + Object.keys(a.unlocked || {}).length;
        const win = score(ra) >= score(la) ? ra : la, lose = win === ra ? la : ra;
        const unlocked = Object.assign({}, lose.unlocked, win.unlocked);
        Object.keys(unlocked).forEach(k => { const a = (la.unlocked || {})[k], b = (ra.unlocked || {})[k]; if (a && b) unlocked[k] = Math.min(a, b); });
        const ach = Object.assign({}, lose, win, { unlocked });
        const coll = Object.assign({}, local.coll, remote.coll);
        Object.keys(coll).forEach(k => { coll[k] = Math.max((local.coll || {})[k] || 0, (remote.coll || {})[k] || 0); });
        return { stats, ach, coll };
    }
    async function pullState(u) {
        const prev = localStorage.getItem(LS.who);
        if (prev && prev !== u.id) [LS.stats, LS.ach, LS.coll].forEach(k => localStorage.removeItem(k));   // máy dùng chung: bỏ tiến độ của người trước
        localStorage.setItem(LS.who, u.id);
        const { data, error } = await sb.from('player_state').select('stats,achievements,collection').eq('user_id', u.id).maybeSingle();
        if (error) throw error;
        const m = mergeState({ stats: rd(LS.stats, {}), ach: rd(LS.ach, {}), coll: rd(LS.coll, {}) },
            data ? { stats: data.stats, ach: data.achievements, coll: data.collection } : {});
        wr(LS.stats, m.stats); wr(LS.ach, m.ach); wr(LS.coll, m.coll);
        root.dispatchEvent(new CustomEvent('pack:state'));
        await pushNow();
    }
    async function pushNow() {
        clearTimeout(pushT);
        if (!sb || !user) return;
        const stats = rd(LS.stats, {});
        const { error } = await sb.from('player_state').upsert({
            user_id: user.id, stats, achievements: rd(LS.ach, {}), collection: rd(LS.coll, {}),
            score: Number(stats.net) || 0, packs: Number(stats.packs) || 0, updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        lastOk = !error;
        if (error) { console.warn('[cloud] đẩy tiến độ lỗi:', error.message); PlayerSync.push(10000); }
    }
    const PlayerSync = {
        push(ms) { if (!sb || !user) return; clearTimeout(pushT); pushT = setTimeout(pushNow, ms == null ? 1500 : ms); },
        pushNow,
        async leaderboard(n) { if (!sb) return []; const { data, error } = await sb.rpc('get_leaderboard', { lim: n || 50 }); if (error) throw error; return data || []; }
    };
    root.PlayerSync = PlayerSync;

    // =====================================================================
    // 2. GIAO DIỆN
    // =====================================================================
    const css = document.createElement('style');
    css.textContent = `
.au-back{position:fixed;inset:0;z-index:90;background:#000c;display:grid;place-items:center;padding:16px;overflow:auto}
.au-box{position:relative;width:min(100%,400px);background:linear-gradient(160deg,#16213f,#0b1226);border:1px solid var(--line,#25304f);border-radius:18px;padding:22px 20px 18px;box-shadow:0 20px 50px #000a;text-align:center}
.au-x{position:absolute;top:10px;right:10px;width:32px;height:32px;padding:0;border-radius:50%}
.au-logo{font-size:34px;line-height:1}
.au-title{margin:6px 0 2px;font-size:20px}
.au-sub{margin:0 0 12px;color:var(--muted,#8a97b5);font-size:13px;line-height:1.4}
.au-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px}
.au-tabs button{padding:8px;border-radius:10px;font-weight:700}
.au-tabs button.on{background:linear-gradient(135deg,var(--g1,#FFD43B),var(--g2,#F59F00));color:#14213D;border-color:transparent}
.au-form{display:grid;gap:8px;text-align:left}
.au-form label{font-size:12px;color:var(--muted,#8a97b5)}
.au-form input{width:100%;background:#0b1226;color:var(--text,#e8edf9);border:1px solid var(--line,#25304f);border-radius:10px;padding:11px 12px;font-size:15px}
.au-form input:focus{outline:none;border-color:var(--g1,#FFD43B)}
.au-msg{min-height:18px;font-size:12.5px;line-height:1.4;text-align:center}
.au-msg.err{color:#fb7185}.au-msg.ok{color:#4ade80}
.au-go{padding:12px;font-size:15px;font-weight:800;border-radius:12px}
.au-link{background:none;border:0;color:var(--muted,#8a97b5);font-size:12.5px;text-decoration:underline;padding:6px;cursor:pointer}
.au-or{margin:10px 0 6px;color:var(--muted,#8a97b5);font-size:12px}
.au-google{width:100%;padding:10px;border-radius:12px;font-weight:700}
.au-chip{position:relative}
.au-chip>button{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.au-pop{position:absolute;right:0;top:calc(100% + 8px);z-index:85;width:min(88vw,270px);background:var(--panel,#121b33);border:1px solid var(--line,#25304f);border-radius:14px;padding:12px;box-shadow:0 14px 34px #000a;text-align:left}
.au-pop small{display:block;color:var(--muted,#8a97b5);font-size:12px;margin-bottom:8px;word-break:break-all}
.au-pop .au-st{font-size:12px;margin:8px 0;color:var(--muted,#8a97b5)}
.au-pop .row2{display:flex;gap:6px;margin-bottom:8px}.au-pop .row2 input{flex:1;min-width:0;background:#0b1226;color:var(--text,#e8edf9);border:1px solid var(--line,#25304f);border-radius:8px;padding:7px 9px;font-size:13px}
.au-pop button{width:100%;margin-top:4px}.au-pop .row2 button{width:auto;margin:0}
.au-lb{width:min(100%,460px);text-align:left}
.au-lb h3{margin:0 0 10px;text-align:center}
.au-lb ol{list-style:none;margin:0;padding:0;max-height:60vh;overflow:auto;display:grid;gap:6px}
.au-lb li{display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;padding:8px 10px;background:#0b1226;border:1px solid var(--line,#25304f);border-radius:10px;font-size:14px}
.au-lb li b{color:var(--g1,#FFD43B)}.au-lb li small{display:block;color:var(--muted,#8a97b5);font-size:11px}
.au-lb li.me{border-color:var(--g1,#FFD43B)}`;
    document.head.append(css);

    function h(tag, props, ...kids) {
        const el = document.createElement(tag);
        Object.entries(props || {}).forEach(([k, v]) => { if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v); });
        kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
        return el;
    }
    const VI_ERR = [
        [/Invalid login credentials/i, 'Sai email hoặc mật khẩu'],
        [/Email not confirmed/i, 'Email chưa được xác nhận — hãy bấm link trong email mình đã gửi'],
        [/already registered|already been registered/i, 'Email này đã đăng ký rồi — hãy chuyển sang Đăng nhập'],
        [/at least \d+ characters|weak password|Password should/i, 'Mật khẩu quá yếu — dùng tối thiểu 8 ký tự'],
        [/rate limit|too many|security purposes/i, 'Thử quá nhiều lần, đợi vài phút rồi thử lại'],
        [/invalid.*email|Unable to validate email/i, 'Email không hợp lệ'],
        [/Failed to fetch|network|NetworkError/i, 'Mất kết nối mạng, thử lại nhé']
    ];
    const viErr = m => { const s = String(m || ''); const hit = VI_ERR.find(([re]) => re.test(s)); return hit ? hit[1] : 'Có lỗi: ' + s; };

    // ---- khung đăng nhập / đăng ký ----
    let back = null;
    function closeModal(result) { if (back) { back.remove(); back = null; } if (result !== undefined) waiters.splice(0).forEach(r => r(result)); }

    function openModal(m, why) {
        if (back) back.remove();
        mode = m; busy = false;
        const msgEl = h('div', { class: 'au-msg', role: 'alert' });
        const say = (t, kind) => { msgEl.textContent = t || ''; msgEl.className = 'au-msg' + (kind ? ' ' + kind : ''); };
        const name = h('input', { type: 'text', maxlength: '24', autocomplete: 'nickname', placeholder: 'Tên hiển thị (2–24 ký tự)' });
        const email = h('input', { type: 'email', autocomplete: 'email', placeholder: 'email@vidu.com', inputmode: 'email' });
        const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Mật khẩu (tối thiểu 8 ký tự)' });
        const go = h('button', { type: 'submit', class: 'primary au-go' });
        const title = h('h3', { class: 'au-title' }), sub = h('p', { class: 'au-sub' });
        const tIn = h('button', { type: 'button' }, 'Đăng nhập'), tUp = h('button', { type: 'button' }, 'Đăng ký');
        const tabs = h('div', { class: 'au-tabs' }, tIn, tUp);
        const lName = h('label', {}, 'Tên hiển thị', name), lEmail = h('label', {}, 'Email', email), lPw = h('label', {}, 'Mật khẩu', pw);
        const forgot = h('button', { type: 'button', class: 'au-link' }, 'Quên mật khẩu?');
        const extra = h('div', {});

        function paint() {
            const up = mode === 'up', rec = mode === 'recover', rst = mode === 'reset';
            tIn.className = mode === 'in' ? 'on' : ''; tUp.className = up ? 'on' : '';
            tabs.style.display = rec || rst ? 'none' : '';
            lName.style.display = up ? '' : 'none';
            lEmail.style.display = rec ? 'none' : '';
            lPw.style.display = rst ? 'none' : '';
            lPw.firstChild.textContent = rec ? 'Mật khẩu mới' : 'Mật khẩu';
            pw.autocomplete = mode === 'in' ? 'current-password' : 'new-password';
            forgot.style.display = mode === 'in' ? '' : 'none';
            title.textContent = rec ? 'Đặt mật khẩu mới' : rst ? 'Quên mật khẩu' : up ? 'Tạo tài khoản' : 'Đăng nhập để xé pack';
            sub.textContent = rec ? 'Nhập mật khẩu mới cho tài khoản của bạn.'
                : rst ? 'Nhập email, mình gửi link đặt lại mật khẩu.'
                : (why || 'Thẻ bạn xé được sẽ lưu vào binder và theo bạn trên mọi thiết bị.');
            go.textContent = rec ? 'Lưu mật khẩu mới' : rst ? 'Gửi link đặt lại' : up ? 'Đăng ký' : 'Đăng nhập';
            say('');
        }
        tIn.onclick = () => { mode = 'in'; paint(); };
        tUp.onclick = () => { mode = 'up'; paint(); };
        forgot.onclick = () => { mode = 'reset'; paint(); };

        const form = h('form', { class: 'au-form', novalidate: '' }, lName, lEmail, lPw, msgEl, go);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            if (busy) return;
            const em = email.value.trim(), p = pw.value, nm = name.value.trim();
            if (mode !== 'recover' && !/^\S+@\S+\.\S+$/.test(em)) return say('Email không hợp lệ');
            if (mode === 'up' && (nm.length < 2 || nm.length > 24)) return say('Tên hiển thị cần 2–24 ký tự');
            if (mode === 'in' && !p) return say('Nhập mật khẩu');
            if ((mode === 'up' || mode === 'recover') && p.length < 8) return say('Mật khẩu tối thiểu 8 ký tự');
            busy = true; go.disabled = true; say('Đang xử lý…');
            try {
                if (mode === 'in') {
                    const { error } = await sb.auth.signInWithPassword({ email: em, password: p });
                    if (error) throw error;                                    // thành công -> onAuthStateChange đóng khung
                } else if (mode === 'up') {
                    const { data, error } = await sb.auth.signUp({ email: em, password: p, options: { data: { name: nm }, emailRedirectTo: cfg.redirectTo } });
                    if (error) throw error;
                    if (data.user && data.user.identities && data.user.identities.length === 0) throw new Error('already registered');
                    if (!data.session) { mode = 'in'; paint(); say('Đã gửi email xác nhận tới ' + em + '. Bấm link trong email rồi quay lại đăng nhập nhé.', 'ok'); }
                } else if (mode === 'reset') {
                    const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: cfg.redirectTo });
                    if (error) throw error;
                    say('Đã gửi link đặt lại mật khẩu tới ' + em + ' (kiểm tra cả thư rác).', 'ok');
                } else if (mode === 'recover') {
                    const { error } = await sb.auth.updateUser({ password: p });
                    if (error) throw error;
                    say('Đã đổi mật khẩu!', 'ok'); setTimeout(() => closeModal(user ? true : undefined), 900);
                }
            } catch (err) { say(viErr(err && err.message)); }
            busy = false; go.disabled = false;
        });

        if (cfg.google) {
            extra.append(h('div', { class: 'au-or' }, '— hoặc —'),
                h('button', { type: 'button', class: 'au-google', onclick: async () => {
                    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: cfg.redirectTo } });
                    if (error) say(viErr(error.message));
                } }, 'Đăng nhập bằng Google'));
        }
        if (cfg.allowGuest) extra.append(h('div', {}, h('button', { type: 'button', class: 'au-link', onclick: () => { guestOk = true; closeModal(true); } }, 'Chơi thử, không lưu')));

        const box = h('div', { class: 'au-box' },
            h('button', { type: 'button', class: 'au-x', 'aria-label': 'Đóng', onclick: () => closeModal(false) }, '✕'),
            h('div', { class: 'au-logo' }, '🎴'), title, sub, tabs, form, forgot, extra);
        back = h('div', { class: 'au-back', role: 'dialog', 'aria-modal': 'true' }, box);
        back.addEventListener('mousedown', e => { if (e.target === back) closeModal(false); });
        document.body.append(back);
        paint();
        setTimeout(() => (mode === 'recover' ? pw : email).focus(), 30);
    }

    // ---- bảng xếp hạng ----
    async function openLeaderboard() {
        if (!sb) return;
        const list = h('ol', {}, h('li', {}, '', 'Đang tải…', ''));
        const box = h('div', { class: 'au-box au-lb' }, h('button', { type: 'button', class: 'au-x', 'aria-label': 'Đóng', onclick: () => ov.remove() }, '✕'), h('h3', {}, '🏆 Bảng xếp hạng'), list);
        const ov = h('div', { class: 'au-back', role: 'dialog' }, box);
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
        document.body.append(ov);
        try {
            const rows = await PlayerSync.leaderboard(50);
            const myName = root.BinderStore ? root.BinderStore.name() : '';
            list.replaceChildren(...(rows.length ? rows.map((r, i) => {
                const li = h('li', { class: user && myName && r.display_name === myName ? 'me' : '' },
                    h('b', {}, '#' + (i + 1)), h('span', {}, r.display_name, h('small', {}, r.packs + ' pack')),
                    h('b', { style: 'color:' + (r.score >= 0 ? '#4ade80' : '#fb7185') }, (r.score >= 0 ? '+$' : '−$') + Math.abs(r.score).toLocaleString('en-US', { maximumFractionDigits: 2 })));
                return li;
            }) : [h('li', {}, '', 'Chưa có ai trên bảng — hãy xé pack đầu tiên!', '')]));
        } catch (e) { list.replaceChildren(h('li', {}, '', 'Không tải được bảng xếp hạng: ' + viErr(e.message), '')); }
    }

    // ---- nút tài khoản trên thanh header ----
    const ST = { local: '☁ Chưa đồng bộ', syncing: '⟳ Đang đồng bộ…', synced: '☁ Đã lưu lên mây', offline: '⚠ Mất mạng — sẽ đồng bộ sau', error: '⚠ Lỗi đồng bộ, đang thử lại' };
    let chip = null, pop = null;
    const displayName = () => (root.BinderStore && root.BinderStore.name()) || (user && ((user.user_metadata || {}).name || (user.email || '').split('@')[0])) || '';
    function closePop() { if (pop) { pop.remove(); pop = null; } }
    function renderChip() {
        if (!sb) return;
        if (!chip) {
            chip = h('div', { class: 'au-chip' });
            const header = document.querySelector('header');
            if (header) header.append(chip); else { chip.style.cssText = 'position:fixed;top:10px;right:10px;z-index:60'; document.body.append(chip); }
            document.addEventListener('click', e => { if (pop && !chip.contains(e.target)) closePop(); });
        }
        closePop();
        chip.replaceChildren(checking && !user ? h('button', { type: 'button', disabled: '' }, '⏳ …') : user
            ? h('button', { type: 'button', onclick: togglePop }, '👤 ' + displayName())
            : h('button', { type: 'button', class: 'primary', onclick: () => openModal('in') }, 'Đăng nhập'));
    }
    function togglePop() {
        if (pop) return closePop();
        const stEl = h('div', { class: 'au-st' }, ST[root.BinderStore ? root.BinderStore.status() : 'local']);
        const nameIn = h('input', { type: 'text', maxlength: '24', value: displayName(), 'aria-label': 'Tên hiển thị' });
        pop = h('div', { class: 'au-pop' }, h('small', {}, user.email || ''),
            h('div', { class: 'row2' }, nameIn, h('button', { type: 'button', onclick: () => { if (root.BinderStore) { root.BinderStore.setName(nameIn.value); renderChip(); } } }, 'Lưu')),
            stEl,
            h('button', { type: 'button', onclick: () => { closePop(); openLeaderboard(); } }, '🏆 Bảng xếp hạng'),
            h('button', { type: 'button', onclick: () => { closePop(); Auth.signOut(); } }, 'Đăng xuất'));
        chip.append(pop);
        if (root.BinderStore) { const off = root.BinderStore.on('status', s => { if (!pop) return off(); stEl.textContent = ST[s] || s; }); }
    }

    // =====================================================================
    // 3. AUTH
    // =====================================================================
    async function loadRole(u) {                                      // đọc quyền (profiles.role) của tài khoản đang đăng nhập
        adminFlag = false;
        try {
            const { data, error } = await sb.from('profiles').select('role').eq('id', u.id).maybeSingle();
            if (error) throw error;
            adminFlag = !!(data && data.role === 'admin');
        } catch (e) { console.warn('[cloud] không đọc được role (bảng profiles có cột role chưa?):', e.message || e); }
        console.info('[auth] quyền:', adminFlag ? 'ADMIN' : 'người chơi');
        if (user && user.id === u.id) watchers.forEach(f => { try { f(user); } catch (err) { console.error(err); } });
    }
    function onSession(session, ev) {
        if (ev === 'PASSWORD_RECOVERY') { user = session && session.user; openModal('recover'); return; }
        if (session && session.user) {
            const changed = !user || user.id !== session.user.id;
            user = session.user;
            if (changed) {
                pullState(user).catch(e => console.warn('[cloud] kéo tiến độ lỗi:', e.message || e));
                loadRole(user);
                watchers.forEach(f => { try { f(user); } catch (e) { console.error(e); } });
            }
            if (back && mode !== 'recover') closeModal(true);
            renderChip();
        } else if (ev === 'SIGNED_OUT') {
            user = null; guestOk = false; adminFlag = false;
            if (lastOk) [LS.stats, LS.ach, LS.coll, LS.who].forEach(k => localStorage.removeItem(k));   // máy dùng chung: không để tiến độ người trước lại
            root.dispatchEvent(new CustomEvent('pack:state'));
            watchers.forEach(f => { try { f(null); } catch (e) { console.error(e); } });
            renderChip();
        }
    }

    const Auth = {
        get user() { return user; },
        get isAdmin() { return !!(user && adminFlag); },          // theo cột role trong bảng profiles ('admin' / 'user')
        ready,
        require(why) {
            if (!sb || !cfg.requireLogin) return Promise.resolve(true);
            return ready.then(() => {
                if (user || guestOk) return true;
                return new Promise(res => { waiters.push(res); openModal('in', why); });
            });
        },
        async signOut() {
            if (!sb) return;
            try { await pushNow(); if (root.BinderStore) await root.BinderStore.flush(); } catch (e) { /* vẫn cho đăng xuất */ }
            await sb.auth.signOut();
        },
        openModal, openLeaderboard,
        canLeaderboard: !!sb,
        onChange(f) { watchers.push(f); }
    };
    root.Auth = Auth;

    async function init() {
        if (!sb) { readyResolve(); return; }
        renderChip();
        sb.auth.onAuthStateChange((ev, session) => { setTimeout(() => onSession(session, ev), 0); });   // hoãn sang tick sau: tránh treo khi gọi Supabase trong callback
        try {
            const { data } = await sb.auth.getSession();
            console.info('[auth] phiên đăng nhập:', data && data.session ? data.session.user.email : 'KHÔNG CÓ', '| origin:', location.origin, '| khoá lưu:', localStorage.getItem('pack_sb_auth') ? 'có' : 'không có');
            if (data && data.session) onSession(data.session, 'INITIAL_SESSION');
        } catch (e) { console.warn('[cloud] không đọc được phiên đăng nhập', e); }
        checking = false; renderChip();
        readyResolve();
        if (root.BinderStore) { root.BinderStore.on('change', () => { if (chip && user && !pop) renderChip(); }); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);