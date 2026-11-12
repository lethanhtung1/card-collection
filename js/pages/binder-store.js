/* binder-store.js — kho binder dùng chung cho pack.html (ghi) và binder.html (đọc).
 * BẢN ĐÁM MÂY: cùng API đồng bộ như bản localStorage cũ (all / count / get / add / update / remove / name / setName / reload),
 * nhưng khi đã đăng nhập thì dữ liệu được đồng bộ lên Supabase (bảng binder_cards). Chưa đăng nhập / chưa cấu hình = lưu trên máy như cũ.
 *
 * Cách hoạt động: đọc luôn từ bộ nhớ đệm (nên giữ API đồng bộ, không phải sửa chỗ gọi), ghi thì cập nhật đệm ngay rồi
 * đẩy lên mây ngầm (tự thử lại khi mất mạng; thay đổi chưa đẩy được vẫn nằm trong localStorage, mở lại trang sẽ đẩy tiếp).
 *
 * Mỗi lá = 1 mục:
 *   id · g (id game) · gn (tên game) · c (mã lá) · n (tên) · i (ảnh) · a (ảnh dự phòng) · s/sn (mã/tên bộ) · no (số thẻ)
 *   r (độ hiếm gốc) · k (tier) · u (giá gốc USD, chưa nhân hệ số) · m (hệ số giá: lá lỗi × điểm chấm) · e (tên lỗi)
 *   co (PSA/TAG) · gr (điểm chấm) · t (thời điểm xé)
 *
 * Thêm so với bản cũ:
 *   BinderStore.ready            Promise — xong khi đã biết ai đang đăng nhập và kéo xong binder từ mây (binder.html nên chờ cái này)
 *   BinderStore.on('change', f)  gọi khi danh sách lá đổi (kể cả khi kéo từ mây về xong)
 *   BinderStore.on('status', f)  'local' | 'syncing' | 'synced' | 'offline' | 'error'
 *   BinderStore.flush()          đẩy hết thay đổi đang chờ lên mây (Promise)
 */
(function (root) {
    const GUEST_KEY = 'pack_binder_v1';                       // khoá cũ: chế độ khách + nguồn để chuyển lên tài khoản
    const CACHE_KEY = id => 'pack_binder_cloud_v1:' + id;      // bộ nhớ đệm riêng cho từng tài khoản
    const sb = root.sb || null;                               // client Supabase (supabase-config.js); null = chưa cấu hình

    let db = { v: 1, name: '', cards: [] };
    let me = null;                                            // id người dùng đang đăng nhập; null = khách
    let dirty = { up: {}, del: {}, nm: null };                // thay đổi chưa đẩy lên mây
    let status = 'local', flushP = null, flushTimer = 0, retry = 0, emitQueued = false;
    const listeners = { change: [], status: [] };
    let readyResolve; const ready = new Promise(r => { readyResolve = r; });

    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const readJSON = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
    const clean = o => { Object.keys(o).forEach(k => (o[k] === undefined || o[k] === null || o[k] === '') && delete o[k]); return o; };
    const storeKey = () => (me ? CACHE_KEY(me) : GUEST_KEY);
    const dirtyKey = () => 'pack_binder_dirty_v1:' + me;
    function mark(id) { delete dirty.del[id]; dirty.up[id] = (typeof dirty.up[id] === 'number' ? dirty.up[id] : 0) + 1; }
    const hasDirty = () => Object.keys(dirty.up).length || Object.keys(dirty.del).length || dirty.nm !== null;

    function emit(type, v) { listeners[type].forEach(f => { try { f(v); } catch (e) { console.error(e); } }); }
    function emitChange() { if (emitQueued) return; emitQueued = true; Promise.resolve().then(() => { emitQueued = false; emit('change'); }); }   // gộp nhiều lần add() liên tiếp
    function setStatus(s) { if (s !== status) { status = s; emit('status', s); } }

    function loadLocal() {
        const d = readJSON(storeKey(), null);
        db = d && Array.isArray(d.cards) ? d : { v: 1, name: '', cards: [] };
        dirty = me ? Object.assign({ up: {}, del: {}, nm: null }, readJSON(dirtyKey(), {})) : { up: {}, del: {}, nm: null };
    }

    // đầy bộ nhớ (~5 MB) thì bỏ bớt lá thường chưa chấm, ĐÃ có trên mây (chỉ bỏ khỏi đệm máy, không xoá trên mây) rồi thử lại
    function persist() {
        for (let tries = 0; tries < 10; tries++) {
            try {
                localStorage.setItem(storeKey(), JSON.stringify(db));
                if (me) localStorage.setItem(dirtyKey(), JSON.stringify(dirty));
                return true;
            } catch (e) {
                if (!me) { console.warn('[binder] đầy bộ nhớ máy — chế độ khách không có bản trên mây nên KHÔNG tự xoá lá nào. Hãy đăng nhập để lưu lên mây.'); return false; }
                const before = db.cards.length;
                let drop = Math.max(50, Math.ceil(before * 0.05));
                db.cards = db.cards.filter(c => !(drop > 0 && !c.gr && !dirty.up[c.id] && (c.k === 'common' || c.k === 'uncommon') && drop-- > 0));
                if (db.cards.length === before) return false;
                emitChange();
            }
        }
        return false;
    }

    // ---- ánh xạ mục <-> dòng bảng binder_cards ----
    const toRow = e => ({
        user_id: me, client_id: e.id, game: e.g, game_name: e.gn || null, code: e.c, name: e.n, image: e.i || null, image_alt: e.a || null,
        set_id: e.s || null, set_name: e.sn || null, card_no: e.no != null && e.no !== '' ? String(e.no) : null, rarity: e.r || null, tier: e.k || null,
        usd: e.u ?? null, mult: e.m ?? 1, err: e.e || null, grader: e.co || null, grade: e.gr ?? null,
        pulled_at: new Date(e.t || Date.now()).toISOString()
    });
    const fromRow = r => clean({
        id: r.client_id, g: r.game, gn: r.game_name, c: r.code, n: r.name, i: r.image, a: r.image_alt, s: r.set_id, sn: r.set_name, no: r.card_no,
        r: r.rarity, k: r.tier, u: r.usd == null ? null : Number(r.usd), m: Number(r.mult) === 1 ? null : Number(r.mult), e: r.err,
        co: r.grader, gr: r.grade == null ? null : Number(r.grade), t: Date.parse(r.pulled_at)
    });

    // ---- đẩy lên mây ----
    function schedule(ms) { if (me && sb) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms == null ? 1200 : ms); } }

    function flush() { if (!flushP) flushP = doFlush().finally(() => { flushP = null; }); return flushP; }

    async function doFlush() {
        if (!me || !sb) return;
        if (!hasDirty()) { setStatus('synced'); return; }
        if (!navigator.onLine) { setStatus('offline'); return; }
        setStatus('syncing');
        const who = me;
        try {
            const ups = Object.keys(dirty.up), dels = Object.keys(dirty.del);
            const byId = new Map(db.cards.map(c => [c.id, c]));
            for (let i = 0; i < ups.length; i += 200) {
                const chunk = ups.slice(i, i + 200), vers = chunk.map(id => dirty.up[id]);   // nhớ phiên bản: sửa chen vào lúc đang đẩy thì giữ cờ
                const rows = chunk.map(id => byId.get(id)).filter(Boolean).map(toRow).filter(r => { const ok = r.game && r.code && r.name; if (!ok) console.warn('[binder] bỏ qua lá thiếu game/code/name:', r); return ok; });
                if (rows.length) { const { error } = await sb.from('binder_cards').upsert(rows, { onConflict: 'user_id,client_id' }); if (error) throw error; }
                if (who !== me) return;                                  // đổi tài khoản giữa chừng
                chunk.forEach((id, k) => { if (dirty.up[id] === vers[k]) delete dirty.up[id]; });
            }
            for (let i = 0; i < dels.length; i += 200) {
                const chunk = dels.slice(i, i + 200);
                const { error } = await sb.from('binder_cards').delete().eq('user_id', who).in('client_id', chunk);
                if (error) throw error;
                if (who !== me) return;
                chunk.forEach(id => delete dirty.del[id]);
            }
            if (dirty.nm !== null) {
                const nm = dirty.nm;
                const { error } = await sb.from('profiles').update({ display_name: nm }).eq('id', who);
                if (error) throw error;
                if (dirty.nm === nm) dirty.nm = null;
            }
            retry = 0; setStatus('synced');
        } catch (e) {
            console.warn('[binder] đồng bộ lỗi, sẽ thử lại:', e && e.message || e);
            retry++; setStatus(navigator.onLine ? 'error' : 'offline');
            schedule(Math.min(60000, 2000 * Math.pow(2, retry)));
        } finally {
            persist();
            if (me === who && status === 'synced' && hasDirty()) schedule(300);   // có thay đổi mới chen vào lúc đang đẩy
        }
    }

    // ---- kéo từ mây về, gộp với phần chưa đẩy ----
    async function pull(who) {
        const rows = [];
        for (let from = 0; ; from += 1000) {
            const { data, error } = await sb.from('binder_cards').select('*').eq('user_id', who).order('pulled_at', { ascending: true }).order('id').range(from, from + 999);
            if (error) throw error;
            rows.push(...data);
            if (data.length < 1000) break;
        }
        if (who !== me) return;
        const localById = new Map(db.cards.map(c => [c.id, c]));
        const seen = new Set(), merged = [];
        for (const r of rows) {
            const e = fromRow(r); seen.add(e.id);
            if (dirty.del[e.id]) continue;                                 // đã xoá ở máy này nhưng chưa kịp đẩy
            const l = localById.get(e.id);
            if (l && l.b && !dirty.up[e.id]) e.b = l.b;                    // bảng mây chưa có cột binder -> giữ nơi xếp lá ở máy
            merged.push(dirty.up[e.id] ? (l || e) : e);                    // lá đang có thay đổi chưa đẩy: giữ bản ở máy
        }
        for (const c of db.cards) if (dirty.up[c.id] && !seen.has(c.id)) merged.push(c);   // lá mới chưa đẩy
        merged.sort((a, b) => (a.t || 0) - (b.t || 0));
        db.cards = merged;
        const { data: prof } = await sb.from('profiles').select('display_name').eq('id', who).maybeSingle();
        if (prof && dirty.nm === null) db.name = prof.display_name || '';
        persist(); emitChange();
    }

    // lá chơi khi chưa đăng nhập (khoá cũ) được chuyển vào tài khoản vừa đăng nhập
    function migrateGuest() {
        const g = readJSON(GUEST_KEY, null);
        if (!g || !Array.isArray(g.cards) || !g.cards.length) return;
        const have = new Set(db.cards.map(c => c.id));
        g.cards.forEach(c => { if (c && c.id && !have.has(c.id)) { db.cards.push(c); mark(c.id); } });
        if (g.name && !db.name) { db.name = g.name; dirty.nm = g.name; }
        if (persist()) localStorage.removeItem(GUEST_KEY);
    }

    async function bind(user) {
        if (me === user.id) return;
        if (me) unbind();                                           // đổi thẳng A -> B không qua SIGNED_OUT
        me = user.id; loadLocal(); migrateGuest(); emitChange();
        setStatus(navigator.onLine ? 'syncing' : 'offline');
        try { await pull(user.id); await flush(); }
        catch (e) { console.warn('[binder] kéo dữ liệu lỗi:', e && e.message || e); setStatus(navigator.onLine ? 'error' : 'offline'); schedule(5000); }
    }

    // đăng xuất: xoá bộ nhớ đệm của tài khoản khỏi máy (trừ khi còn thay đổi chưa đẩy kịp thì giữ lại để không mất)
    function unbind() {
        const prev = me;
        if (prev && !hasDirty()) { localStorage.removeItem(CACHE_KEY(prev)); localStorage.removeItem('pack_binder_dirty_v1:' + prev); }
        me = null; clearTimeout(flushTimer); loadLocal(); setStatus('local'); emitChange();
    }

    async function init() {
        loadLocal();
        if (!sb) { readyResolve(); return; }
        sb.auth.onAuthStateChange((ev, session) => {              // KHÔNG await supabase trực tiếp trong callback này (dễ bị treo) -> hoãn sang tick sau
            setTimeout(() => {
                if (session && session.user) bind(session.user);
                else if (ev === 'SIGNED_OUT') unbind();
            }, 0);
        });
        try {
            const { data } = await sb.auth.getSession();
            if (data && data.session) await bind(data.session.user);
        } catch (e) { console.warn('[binder] không đọc được phiên đăng nhập', e); }
        readyResolve();
    }

    root.addEventListener('online', () => schedule(300));
    root.addEventListener('storage', e => { if (e.key === storeKey()) { loadLocal(); emitChange(); } });   // tab khác vừa ghi
    root.addEventListener('pagehide', () => { if (me) { persist(); flush(); } });

    const BinderStore = root.BinderStore = {
        ready,
        reload() { loadLocal(); return db; },
        all() { return db.cards; },
        count() { return db.cards.length; },
        get(id) { return db.cards.find(c => c.id === id) || null; },
        add(entry) {
            // đã có id này trong máy -> cập nhật thay vì thêm bản thứ hai
            if (entry && entry.id && db.cards.some(c => c.id === entry.id)) { const { id, ...rest } = entry; BinderStore.update(id, rest); return id; }
            const e = clean(Object.assign({ id: uid(), t: Date.now() }, entry));
            db.cards.push(e);
            if (me) mark(e.id);
            persist(); emitChange(); schedule();
            return e.id;
        },
        addMany(entries) {                                        // thêm nhiều lá, chỉ ghi bộ nhớ / lên lịch đồng bộ 1 lần
            const ids = entries.map(entry => { const e = clean(Object.assign({ id: uid(), t: Date.now() }, entry)); db.cards.push(e); if (me) mark(e.id); return e.id; });
            persist(); emitChange(); schedule();
            return ids;
        },
        update(id, patch) {
            const e = db.cards.find(c => c.id === id);
            if (!e) return false;
            const p = Object.assign({}, patch); delete p.id;
            Object.keys(p).forEach(k => { if (p[k] === undefined) delete e[k]; else e[k] = p[k]; });   // undefined = xoá trường
            if (me) mark(id);
            const ok = persist(); emitChange(); schedule();
            return ok;
        },
        remove(ids) {
            const s = new Set([].concat(ids));
            db.cards = db.cards.filter(c => !s.has(c.id));
            if (me) s.forEach(id => { delete dirty.up[id]; dirty.del[id] = true; });
            const ok = persist(); emitChange(); schedule();
            return ok;
        },
        name() { return db.name || ''; },
        setName(n) {
            db.name = String(n || '').trim().slice(0, 24);
            if (me) dirty.nm = db.name;
            const ok = persist(); schedule(300);
            return ok;
        },
        on(type, f) { if (listeners[type]) listeners[type].push(f); return () => { listeners[type] = listeners[type].filter(x => x !== f); }; },
        status() { return status; },
        flush() { clearTimeout(flushTimer); return flush(); },
        isCloud() { return !!me; }
    };

    init();
})(window);