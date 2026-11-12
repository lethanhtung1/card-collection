// pack.js — mô phỏng xé pack cho mọi series trong dự án.
// Trang này KHÔNG nạp script.js của web chính: chỉ tải dữ liệu của game đang chọn nên nhẹ.
// URL chia sẻ được:  pack.html?game=aot&set=SX04

const $ = s => document.querySelector(s);
const PACK_VERSION = '2026-11-10 · pack 1 kiểu, cắt tranh, logo TCGdex';
console.info('[pack] phiên bản:', PACK_VERSION);   // mở F12 > Console: thấy dòng này = đã chạy đúng file mới

// =========================================================
// 1. CẤU HÌNH PACK — chỉnh ở đây
// =========================================================
// Mỗi pack = danh sách [số_lá, {tier: tỉ_lệ}]. Tier theo độ hiếm (thấp -> cao):
//   common, uncommon, rare, holo, epic, legendary, showcase
// Đây là ƯỚC LƯỢNG theo cấu trúc pack phổ biến, không phải tỉ lệ chính thức.
const C = { common: 1 }, U = { uncommon: 1 };
const PACK_CONFIG = {
    pokemon:   [[4, C], [3, U], [2, { holo: .55, rare: .35, epic: .10 }],
                [1, { rare: .68, holo: .18, epic: .08, legendary: .035, showcase: .025 }]],
    onepiece:  [[3, C], [2, U], [1, { rare: .70, epic: .20, legendary: .07, showcase: .03 }]],
    yugioh:    [[7, C], [2, { rare: .74, epic: .18, showcase: .08 }]],
    riftbound: [[7, C], [3, U], [3, { rare: .80, epic: .17, showcase: .03 }],
                [1, { common: .60, uncommon: .30, rare: .10 }]],
    gundam:    [[7, C], [3, U], [2, { rare: .78, epic: .18, legendary: .04 }]],
    dbs:       [[6, C], [3, U], [2, { rare: .75, epic: .20, showcase: .05 }], [1, { uncommon: .5, rare: .5 }]],
    ws:        [[4, C], [2, U], [2, { rare: .62, epic: .30, showcase: .08 }]],   // Weiss Schwarz
    kayou:     [[5, { common: .60, uncommon: .20, rare: .12, epic: .06, legendary: .02 }]],
    _default:  [[5, C]]
};

// =========================================================
// 2. DANH SÁCH GAME + NGUỒN DỮ LIỆU
// =========================================================
// src: file = 1 file mảng thẻ; folder = data/<folder>/index.json + <set>.json; ygo = Yu-Gi-Oh!
const GAMES = [
    { id: 'pokemon',   name: 'Pokémon TCG',          icon: '⚡', c1: '#FFD43B', c2: '#F59F00', pack: 'pokemon',   crop: [2, 27],   src: { file: 'data/pokemon.json' } },
    { id: 'riftbound', name: 'Riftbound',            icon: '✦', c1: '#2DD4BF', c2: '#0F9F8F', pack: 'riftbound', src: { file: 'data/riftbound.json' } },
    { id: 'onepiece',  name: 'One Piece Card Game',  icon: '☠', c1: '#FF6B81', c2: '#E11D48', pack: 'onepiece',  src: { file: 'data/onepiece.json' } },
    { id: 'yugioh',    name: 'Yu-Gi-Oh!',            icon: '◈', c1: '#9B6BFF', c2: '#5B21B6', pack: 'yugioh',    crop: [1.9, 42], src: { ygo: true } },
    { id: 'gundam',    name: 'Gundam Card Game',     icon: '⬡', c1: '#5B8CFF', c2: '#1D4ED8', pack: 'gundam',    src: { file: 'data/gundam.json' } },
    { id: 'dbs',       name: 'Dragon Ball Super CG', icon: '❂', c1: '#FFA53D', c2: '#EA580C', pack: 'dbs',       src: { file: 'data/dragonball.json' } },
    { id: 'naruto',    name: 'Naruto (Kayou)',       icon: '◎', c1: '#FF9F1C', c2: '#E85D04', pack: 'kayou',     src: { folder: 'naruto' } },
    { id: 'aot',       name: 'Attack on Titan · WS', icon: '⚔', c1: '#4ADE80', c2: '#15803D', pack: 'ws',        src: { folder: 'aot' },      skipRarity: /^pr$/i },
    { id: 'overlord',  name: 'Overlord · WS',        icon: '♛', c1: '#A78BFA', c2: '#4C1D95', pack: 'ws',        src: { folder: 'overlord' }, skipRarity: /^pr$/i },
    { id: 'rascal',    name: 'Rascal Does Not Dream · WS', icon: '♥', c1: '#F9A8D4', c2: '#BE185D', pack: 'ws', src: { folder: 'rascal' }, skipRarity: /^pr$/i }
];
// Thêm game mới: 1 dòng ở GAMES (+ cấu hình pack ở PACK_CONFIG nếu cần).

// =========================================================
// 3. ĐỘ HIẾM
// =========================================================
const RARITY_SHORT = {
    c: 'common', uc: 'uncommon', u: 'uncommon', r: 'rare', sr: 'epic', l: 'legendary', lr: 'legendary',
    sec: 'showcase', scr: 'showcase', spr: 'showcase', sp: 'showcase', tr: 'showcase', alt: 'showcase',
    rr: 'epic', rrr: 'epic', ssp: 'showcase', ttr: 'showcase', pr: 'rare', cr: 'rare', cc: 'uncommon', td: 'common'
};
const TIERS = ['common', 'uncommon', 'rare', 'holo', 'epic', 'legendary', 'showcase'];
const TIER_COLOR = {
    common: '#94a3b8', uncommon: '#4ade80', rare: '#38bdf8', holo: '#a78bfa',
    epic: '#f472b6', legendary: '#fbbf24', showcase: '#fb923c'
};

// ---- TỈ LỆ XÉ PACK / CHẤM PSA / LÁ LỖI — chỉnh ở đây ----
// PULL_BOOST: nhân tỉ lệ các lá hiếm so với PACK_CONFIG gốc. 1 = giữ nguyên; càng cao càng dễ ra hit.
// Hệ số áp dụng luỹ tiến: Rare x1 · Holo xB · Epic xB² · Legendary xB³ · Showcase xB⁴ (B = PULL_BOOST).
const PULL_BOOST = 0.5;
// CARD_ODDS: làm TỪNG LÁ hiếm hơn trong cùng hạng độ hiếm. Trước đây mọi lá cùng hạng có xác suất bằng nhau nên hạng ít lá (vd bộ chỉ có vài lá showcase)
// thì 1 lá cứ lặp lại hoài. Giờ lá đắt và lá bạn đánh dấu sẽ khó ra hơn. Hệ số nhân < 1 = khó ra hơn (0.1 = hiếm gấp 10 lần lá thường cùng hạng).
// PACK_PRICES: GIÁ 1 PACK (USD). Dùng để tính lời/lỗ và điểm xếp hạng, và hiện trên khung chi tiết của từng bộ.
// Thứ tự ưu tiên (cái trước thắng): giá ADMIN đặt trên trang (lưu ở Supabase, mọi người cùng thấy)  >  "packPrice" trong index.json của bộ  >  bySet  >  byGame (nhân hệ số bộ cũ)  >  default.
// Chỉ tài khoản có profiles.role = 'admin' mới đổi được giá trên trang (cấu hình quyền ghi ở file admin-prices.sql).
const PACK_PRICES = {
    default: 4.5,
    byGame: {                       // GIÁ NIÊM YẾT (MSRP, USD) 1 pack của từng game, tra tháng 11/2026
        pokemon:   4.49,            // Mega Evolution / 30th Celebration: $4.49/pack
        riftbound: 4.99,            // Origins, Spiritforged: $4.99/pack
        onepiece:  4.99,            // booster OP / EB: $4.99 (premium PRB: $5.49)
        yugioh:    4.49,            // core booster TCG: $4.49 (một số pack đặc biệt $4.99–5.99)
        gundam:    4.99,            // GD01…: $4.99/pack
        dbs:       4.99,            // Fusion World: $4.99/pack
        naruto:    3.00,            // Kayou: ~$2–4.5/pack tuỳ bán lẻ (ước lượng)
        aot:       4.50,            // Weiss Schwarz EN: box ~$55–80 / 16 pack ≈ $3.5–5 (ước lượng)
        overlord:  4.50,
        rascal:    4.50
    },
    bySet: {                        // giá riêng cho 1 bộ nếu khác giá game (id bộ). Ví dụ: 'prb02': 5.49
        // 'prb02': 5.49
    }
};
// BỘ CŨ = PACK ĐẮT HƠN: giá game ở trên là giá pack MỚI. Bộ phát hành càng lâu thì giá nhân thêm theo bảng này (nội suy giữa các mốc).
// Chỉ áp cho giá lấy từ byGame/default; giá bạn đặt riêng (bySet, packPrice trong index.json, hoặc bấm ✎) thì giữ nguyên. Bộ không có ngày phát hành = không nhân.
const OLD_SET_PRICE = {
    enabled: true,
    curve: [[0, 1], [1.5, 1], [3, 1.6], [5, 2.5], [8, 5], [12, 10], [18, 25], [25, 60]],   // [số năm kể từ ngày phát hành, hệ số nhân]
    maxMult: 80
};
function oldSetMult(dateStr) {
    if (!OLD_SET_PRICE.enabled || !dateStr) return 1;
    const t = Date.parse(String(dateStr).replace(/\//g, '-'));
    if (!isFinite(t)) return 1;
    const age = (Date.now() - t) / 31557600000, c = OLD_SET_PRICE.curve;
    if (age <= c[0][0]) return c[0][1];
    for (let i = 1; i < c.length; i++) {
        if (age <= c[i][0]) {
            const [a0, m0] = c[i - 1], [a1, m1] = c[i], f = (age - a0) / (a1 - a0);
            return Math.min(OLD_SET_PRICE.maxMult, Math.exp(Math.log(m0) + f * (Math.log(m1) - Math.log(m0))));
        }
    }
    return Math.min(OLD_SET_PRICE.maxMult, c[c.length - 1][1]);
}
const SERVER_PRICES = {};                      // giá admin đặt, kéo từ bảng Supabase pack_prices: { "gameId|setId": giá }
const isAdmin = () => !!(window.Auth && window.Auth.isAdmin);
async function loadServerPrices() {
    if (!window.sb) return;
    try {
        const { data, error } = await window.sb.from('pack_prices').select('game,set_id,price');
        if (error) throw error;
        Object.keys(SERVER_PRICES).forEach(k => delete SERVER_PRICES[k]);
        (data || []).forEach(r => { if (Number(r.price) > 0) SERVER_PRICES[`${r.game}|${r.set_id}`] = Number(r.price); });
    } catch (e) { console.info('[pack] chưa đọc được bảng pack_prices (chưa tạo bảng?) -> dùng giá trong code:', e.message || e); }
}
const CARD_ODDS = {
    priceFloor: 2,          // lá giá thị trường ≤ mức này ($) giữ nguyên; đắt hơn thì bị giảm tỉ lệ
    priceExp: 0.7,          // độ mạnh của việc giảm theo giá. 0 = tắt. Với 0.7: $20 → ×0.20 · $100 → ×0.06 · $500 → ×0.02
    byName: {               // ĐÁNH DẤU LÁ HIẾM THEO TÊN (nguyên từ, không phân biệt hoa/thường; 'mew' không dính 'mewtwo')
        'mew': 0.15,
        // 'charizard': 0.2, 'pikachu': 0.5, 'mew ex': 0.1
    },
    byCode: {               // ĐÁNH DẤU THEO MÃ LÁ chính xác (cột code trong dữ liệu)
        // 'sv8-238': 0.05
    }
};
// GRADING — gửi chấm điểm kiểu rotodex: người chơi TỰ BẤM gửi chấm (PSA hoặc TAG), mất phí, mỗi lá chỉ chấm 1 lần.
//   Lá đủ điều kiện: tier từ `minTier` trở lên, HOẶC giá ≥ `minUsd`, HOẶC là lá lỗi. Điểm ra phụ thuộc ĐỘ LỆCH TÂM của từng lá (_ctr).
//   Điểm trung bình = base + span × chất lượng tâm (0..1); điểm thực tế dao động quanh đó theo độ lệch chuẩn sd.
//   mult = hệ số nhân giá theo điểm; TAG có nửa điểm nhưng slab bán thấp hơn PSA (tagMult).
const GRADING = {
    minTier: 'rare',
    minUsd: 3,            // lá giá thị trường từ mức này trở lên cũng được chấm, KHÔNG phụ thuộc phân loại độ hiếm
    fee: { PSA: 20, TAG: 15 },
    mult: { 10: 3, 9: 1.4, 8: 1, 7: .85, 6: .7, 5: .55 },
    tagMult: .8,
    // Điểm TB = base + span × chất lượng tâm. Hạ base/span để 9-10 hiếm, 8-7-6-5 phổ biến (lá tâm đẹp nhất TB ~7.5; lá lệch tâm ~5-6).
    // sd lớn = điểm dao động rộng hơn. Muốn dễ 9/10 hơn thì tăng base (mỗi +0.5 ≈ nhích đỉnh lên ~1 bậc).
    base: 5.0, span: 2.5, sd: 1.25
};
// ERRORS: mỗi lá (mọi độ hiếm) có `chance` bị lỗi; w = trọng số chọn loại lỗi, mult = hệ số nhân giá.
const ERRORS = {
    chance: .03,
    kinds: [
        { name: 'Lệch cắt', mult: 2, w: 4 },
        { name: 'Mất mực', mult: 2.5, w: 3 },
        { name: 'Lỗi in', mult: 3, w: 2 },
        { name: 'In ngược mặt', mult: 5, w: 1 }
    ]
};
const GRADE_NAME = { 10: 'GEM MT', 9: 'MINT', 8: 'NM-MT', 7: 'NM', 6: 'EX-MT', 5: 'EX' };
const gradeText = (g, co) => `${co || 'PSA'} ${g} · ${GRADE_NAME[Math.floor(g)] || 'EX'}`;
function pickW(pairs) {                                   // pairs: [[giá_trị, trọng_số], ...]
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [v, w] of pairs) { if ((r -= w) <= 0) return v; }
    return pairs[pairs.length - 1][0];
}

// ---- PHÂN LOẠI ĐỘ HIẾM: 3 lớp, KHÔNG phải liệt kê hết độ hiếm của từng game ----
//  (1) TIER_OVERRIDE : ngoại lệ theo game — chỉ ghi những chuỗi mà quy tắc chung hiểu sai (khóa = chữ thường)
//  (2) LEARNED       : tự học từ dữ liệu — chuỗi lạ/mơ hồ được xếp theo GIÁ trung vị so với các độ hiếm đã nhận chắc chắn
//  (3) tierByRules   : quy tắc chung (từ khóa dùng được cho mọi game: secret, leader, super, holo...)
const TIER_OVERRIDE = {
    pokemon: { 'ultra rare': 'epic', 'rare break': 'epic', 'promo': 'rare' }
    // yugioh: { 'short print': 'common' },  onepiece: { ... }  -> thêm khi thấy game nào xếp sai
};
const normR = r => String(r || '').toLowerCase().replace(/\s+/g, ' ').trim();

// trả về { tier, weak } hoặc null nếu hoàn toàn lạ. weak = chỉ đoán từ chữ "rare" (có thể nâng/hạ bằng giá)
function tierByRules(v) {
    const code = v.replace(/[^a-z]/g, '');
    if (RARITY_SHORT[code]) return { tier: RARITY_SHORT[code] };
    if (v === 'rare') return { tier: 'rare' };        // "Rare" trơn luôn là hạng rare (không để học theo giá đẩy lên showcase)
    if (/^sp\b|^sec\b|^sar\b|^ar\b|^sr\b|^ur\b|^hr\b/.test(v) ||
        /secret|hyper|illustration|ultra|radiant|amazing|shiny|ace spec|rainbow|gold|mega|crown|prism|showcase|special|treasure|manga|ultimate|ghost|starlight|collector|classic|parallel|sir|art rare|alternat|alt art/.test(v)) return { tier: 'showcase' };
    if (/leader|legend|vmax|vstar|prime/.test(v)) return { tier: 'legendary' };
    if (/double|epic|super|\bex\b|\bgx\b|\bv\b|rrr|rr|triple/.test(v)) return { tier: 'epic' };
    if (/holo|foil|reverse/.test(v)) return { tier: 'holo' };
    if (/uncommon|\buc\b|\bu\b/.test(v)) return { tier: 'uncommon' };
    if (/^common\b|\bc\b/.test(v)) return { tier: 'common' };
    if (/rare/.test(v)) return { tier: 'rare', weak: true };      // Futuristic Rare, Kaiju Rare, Platinum Rare...
    return null;
}

const RSTAT = {}, LEARN_SEEN = new Set();
let LEARNED = {};
const TIER_MEMO = new Map();
const curGameId = () => { try { return game.id; } catch (e) { return ''; } };

// học từ dữ liệu: gọi mỗi khi nạp xong 1 nhóm thẻ của game (tag = khóa chống tính trùng, vd 'pokemon|all')
function learnTiers(gameId, cards, tag) {
    if (tag) { if (LEARN_SEEN.has(tag)) return; LEARN_SEEN.add(tag); }
    const st = (RSTAT[gameId] ||= {});
    for (const c of cards) {
        const k = normR(c.rarity), b = (st[k] ||= { n: 0, p: [] }), u = usdOf(c);
        b.n++;
        if (u != null && u > 0 && b.p.length < 400) b.p.push(u);
    }
    const med = a => { if (!a.length) return null; const t = [...a].sort((x, y) => x - y); return t[t.length >> 1]; };
    const rows = Object.entries(st).map(([k, b]) => ({ k, m: med(b.p), r: tierByRules(k) }));
    const anchors = rows.filter(x => x.r && !x.r.weak && x.m != null);          // độ hiếm chắc chắn + có giá = mốc
    const out = {};
    if (anchors.length >= 3) for (const x of rows) {
        if ((x.r && !x.r.weak) || x.m == null) continue;
        const near = anchors.reduce((a, t) => Math.abs(Math.log(t.m / x.m)) < Math.abs(Math.log(a.m / x.m)) ? t : a);
        out[x.k] = x.r ? TIERS[Math.max(TIERS.indexOf('rare'), TIERS.indexOf(near.r.tier))] : near.r.tier;   // chuỗi "…rare" không bị hạ xuống dưới rare
    }
    LEARNED[gameId] = out;
    TIER_MEMO.clear();
}

function tierOf(rarity) {
    const gid = curGameId(), k = normR(rarity), mk_ = gid + '|' + k;
    let t = TIER_MEMO.get(mk_);
    if (!t) {
        t = (TIER_OVERRIDE[gid] || {})[k] || (LEARNED[gid] || {})[k] || (tierByRules(k) || { tier: 'rare' }).tier;   // lạ hoàn toàn + không có giá -> rare
        TIER_MEMO.set(mk_, t);
    }
    return t;
}

// =========================================================
// 4. TẢI DỮ LIỆU (chỉ game đang chọn)
// =========================================================
const cache = {};                       // url -> dữ liệu, tránh tải lại (pokemon.json rất lớn)
async function getJSON(url) {
    if (cache[url]) return cache[url];
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return (cache[url] = await res.json());
}
const asArray = d => Array.isArray(d) ? d : (d.cards || d.data || []);

// Chuẩn hóa mọi kiểu dữ liệu trong dự án về 1 dạng thẻ
function mk(c, game) {
    const setObj = c.set && typeof c.set === 'object' ? c.set : null;
    const img = c.images || {};
    const setId = String((setObj && (setObj.id || setObj.name)) || c.setCode || c.set || c.setName || c.cardSet || '');
    const setName = String((setObj && (setObj.name || setObj.id)) || c.cardSet || c.setName || c.setCode || c.set || '');
    const m = c.market || null;
    return {
        code: String(c.cardCode || c.code || c.id || c.cardNo || c.number || c.cardNumber || ''),
        name: c.fullName || c.name || 'Unknown',
        number: c.cardNumber || c.number || c.cardNo || '',
        rarity: String(c.rarity || 'Unknown'),
        image: c.imageUrl || img.large || img.small || (typeof c.image === 'string' ? c.image : ''),
        imageAlt: c.imageAlt || '',
        market: m,
        setId, setName,
        releaseDate: c.releaseDate || '',
        series: String(c.series || (setObj && setObj.series) || ''),
        logo: String(c.setLogo || c.logo || (setObj && ((setObj.images && setObj.images.logo) || setObj.logo)) || ''),
        symbol: String(c.setSymbol || (setObj && ((setObj.images && setObj.images.symbol) || setObj.symbol)) || ''),
        _game: game
    };
}

const YGO_API = 'https://db.ygoprodeck.com/api/v7';

// ---- LỌC BỘ THIẾU DỮ LIỆU (ảnh / giá) ----
// Bộ nào có quá nhiều thẻ không có ảnh (hoặc không có giá) sẽ bị ẩn khỏi danh sách; thẻ không ảnh trong bộ còn lại bị loại khỏi pack.
const QUALITY = {
    enabled: true,
    minImage: .9,     // bộ phải có ảnh >= 90% số thẻ, thấp hơn -> ẩn bộ
    minPrice: .5,     // ... và có giá >= 50% số thẻ (chỉ áp dụng cho game CÓ dữ liệu giá; game không có giá thì bỏ qua tiêu chí này)
    minCards: 5,      // bộ có ít hơn bấy nhiêu thẻ dùng được (có ảnh) -> ẩn
    scanAhead: 3      // game tải từng bộ riêng: tải ngầm trước ±3 bộ lân cận để ẩn bộ lỗi trước khi người dùng lướt tới (0 = tắt)
};
const hasImg = c => !!c.image;
function judge(n, img, pr, priceGame) {
    let reason = '';
    if (img < QUALITY.minCards) reason = `chỉ có ${img} thẻ có ảnh`;
    else if (img / n < QUALITY.minImage) reason = `chỉ ${img}/${n} thẻ có ảnh`;
    else if (priceGame && pr / n < QUALITY.minPrice) reason = `chỉ ${pr}/${n} thẻ có giá`;
    return { ok: !reason, n, img, pr, reason };
}
// lọc danh sách bộ theo số liệu có sẵn (s._img = số thẻ có ảnh, s._pr = số thẻ có giá; bộ nào chưa biết thì để nguyên, lọc sau khi tải)
function dropBad(sets, g) {
    if (!QUALITY.enabled) return sets;
    if (sets.some(x => x._pr != null)) g._hasPrice = sets.some(x => x._pr > 0);
    const good = sets.filter(x => x._img == null || judge(x.count, x._img, x._pr ?? 0, g._hasPrice).ok);
    if (!good.length) { console.warn(`[pack] ${g.id}: mọi bộ đều thiếu dữ liệu -> giữ nguyên, không lọc`); return sets; }
    if (good.length < sets.length) console.info(`[pack] ${g.id}: ẩn ${sets.length - good.length}/${sets.length} bộ thiếu ảnh/giá`);
    return good;
}

async function loadSets(g) {
    if (g.src.file) {
        const all = asArray(await getJSON(g.src.file)).map(c => mk(c, g.id));
        learnTiers(g.id, all, g.id + '|all');           // học độ hiếm từ giá (trước khi chọn hình bìa)
        const by = new Map();
        all.forEach(c => {
            if (!c.setId) return;
            if (!by.has(c.setId)) by.set(c.setId, { id: c.setId, name: c.setName, count: 0, date: c.releaseDate, hero: '', logo: '', symbol: '', series: c.series || '', _hs: -1, _img: 0, _pr: 0 });
            const o = by.get(c.setId);
            o.count++;
            if (hasImg(c)) o._img++;
            if (usdOf(c) != null) o._pr++;
            const sc = TIERS.indexOf(tierOf(c.rarity)) * 1e6 + (usdOf(c) || 0);   // lá hiếm + đắt nhất làm hình bìa pack
            if (c.image && sc > o._hs) { o._hs = sc; o.hero = c.image; }
            if (!o.logo && c.logo) o.logo = c.logo;
            if (!o.symbol && c.symbol) o.symbol = c.symbol;
        });
        let sets = dropBad([...by.values()], g);
        if (!sets.length) sets = [{ id: '', name: 'Tất cả thẻ', count: all.length, date: '' }];
        return sets.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.name.localeCompare(b.name));
    }
    if (g.src.folder) {
        const idx = await getJSON(`data/${g.src.folder}/index.json`);
        // (tùy chọn) index.json có thể ghi sẵn "imageCount" / "priceCount" cho từng bộ -> lọc được ngay, khỏi tải thử
        return dropBad((idx.sets || []).map(s => ({
            id: s.id, name: `${s.name}${s.abbreviation ? ` (${s.abbreviation})` : ''}`, count: s.count, date: s.published || '',
            packPrice: s.packPrice ?? null, logo: s.logo || s.logoUrl || '', symbol: s.symbol || s.symbolUrl || '', _img: s.imageCount ?? null, _pr: s.priceCount ?? null
        })), g);
    }
    if (g.src.ygo) {
        try {
            const idx = await getJSON('data/yugioh/index.json');
            if (Array.isArray(idx.sets) && idx.sets.length) {
                g.ygoMode = 'file';
                return dropBad(idx.sets.map(s => ({ id: s.id, name: s.name || s.id, count: s.count, date: s.published || s.tcg_date || '', packPrice: s.packPrice ?? null, _img: s.imageCount ?? null, _pr: s.priceCount ?? null })), g);
            }
        } catch (e) { /* chưa có file -> dùng API */ }
        g.ygoMode = 'api';
        const sets = await getJSON(`${YGO_API}/cardsets.php`);
        return sets.map(s => ({ id: s.set_name, name: `${s.set_name} (${s.set_code})`, count: s.num_of_cards, date: s.tcg_date || '' }))
            .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }
    return [];
}

async function loadCards(g, setId) {
    let list;
    if (g.src.file) {
        list = asArray(await getJSON(g.src.file)).map(c => mk(c, g.id)).filter(c => !setId || c.setId === setId);
    } else if (g.src.folder) {
        list = asArray(await getJSON(`data/${g.src.folder}/${encodeURIComponent(setId)}.json`)).map(c => mk(c, g.id));
    } else if (g.src.ygo && g.ygoMode === 'file') {
        list = asArray(await getJSON(`data/yugioh/${encodeURIComponent(setId)}.json`)).map(c => mk(c, g.id));
    } else if (g.src.ygo) {
        const data = await getJSON(`${YGO_API}/cardinfo.php?cardset=${encodeURIComponent(setId)}`);
        list = (data.data || []).flatMap(c => {
            const gp = (c.card_prices || [])[0] || {};
            const usd = parseFloat(gp.tcgplayer_price) || null;
            return (c.card_sets || []).filter(s => s.set_name === setId).map(s => ({
                code: `${s.set_code}|${c.id}|${s.set_rarity}`, name: c.name, number: s.set_code,
                rarity: s.set_rarity || 'Common', image: ((c.card_images || [])[0] || {}).image_url || '',
                market: usd ? { usd, eur: null } : null, setId, setName: setId, _game: g.id
            }));
        });
    }
    const out = list.filter(c => c.code && !(g.skipRarity && g.skipRarity.test(c.rarity)));
    const priced = out.filter(c => usdOf(c) != null).length;
    if (priced) g._hasPrice = true;
    const q = judge(out.length, out.filter(hasImg).length, priced, g._hasPrice);
    const res = QUALITY.enabled ? out.filter(hasImg) : out;     // thẻ không ảnh không bao giờ rơi vào pack
    res._q = QUALITY.enabled ? q : { ok: true, n: out.length, img: out.length, pr: priced, reason: '' };
    return res;
}

// =========================================================
// 5. TẠO PACK
// =========================================================
function weightedTier(weights) {
    const entries = Object.entries(weights);
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [t, w] of entries) { if ((r -= w) <= 0) return t; }
    return entries[entries.length - 1][0];
}

// Nếu bộ này không có tier được chọn, lấy tier gần nhất (ưu tiên thấp hơn)
function nearestTier(pool, tier) {
    const i = TIERS.indexOf(tier);
    for (let d = 0; d < TIERS.length; d++) {
        for (const j of [i - d, i + d]) {
            if (j >= 0 && j < TIERS.length && pool[TIERS[j]] && pool[TIERS[j]].length) return TIERS[j];
        }
    }
    return null;
}

// tăng tỉ lệ lá hiếm (xem PULL_BOOST); slot chỉ có 1 tier thì không đổi gì
function boostWeights(w) {
    const o = {};
    for (const [t, v] of Object.entries(w)) o[t] = v * Math.pow(PULL_BOOST, Math.max(0, TIERS.indexOf(t) - 2));
    return o;
}
const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
// trả về BẢN SAO của lá (không sửa lá gốc trong kho): _err = loại lỗi, _errMult/_mult = hệ số giá,
// _ctr = độ lệch tâm [mặt trước, mặt sau] (số lớn = lệch nhiều, vd 51 nghĩa là 51/49); _grade/_co = điểm + hãng sau khi người chơi gửi chấm
function decorate(card) {
    const c = Object.assign({}, card);
    let mult = 1;
    c._ctr = [50 + Math.min(20, Math.round(Math.abs(gauss()) * 4)), 50 + Math.min(25, Math.round(Math.abs(gauss()) * 6))];
    if (Math.random() < ERRORS.chance) {
        const k = pickW(ERRORS.kinds.map(x => [x, x.w]));
        c._err = k.name; mult *= k.mult;
        if (k.name === 'Lệch cắt') c._ctr[0] = Math.min(70, c._ctr[0] + 12);      // lệch cắt thì tâm cũng tệ
    }
    c._errMult = c._mult = mult;
    return c;
}

const ODDS_W = new WeakMap(), ODDS_NAME = Object.entries(CARD_ODDS.byName).map(([k, m]) => [' ' + k.toLowerCase().trim() + ' ', m]);
function cardWeight(c) {
    let w = ODDS_W.get(c);
    if (w != null) return w;
    w = 1;
    const u = usdOf(c);
    if (CARD_ODDS.priceExp > 0 && u != null && u > CARD_ODDS.priceFloor) w *= Math.pow(CARD_ODDS.priceFloor / u, CARD_ODDS.priceExp);
    if (ODDS_NAME.length) { const nm = ' ' + norm(c.name) + ' '; for (const [k, m] of ODDS_NAME) if (nm.includes(k)) w *= m; }
    const mc = CARD_ODDS.byCode[c.code]; if (mc != null) w *= mc;
    w = Math.max(w, 0.001);
    ODDS_W.set(c, w);
    return w;
}
function pickCard(list) {                                   // chọn 1 lá trong hạng theo trọng số (lá đắt / lá đánh dấu khó ra hơn)
    if (list.length === 1) return list[0];
    const ws = list.map(cardWeight);
    let r = Math.random() * ws.reduce((a, b) => a + b, 0);
    for (let i = 0; i < list.length; i++) { if ((r -= ws[i]) <= 0) return list[i]; }
    return list[list.length - 1];
}

const GOD_PACK_ODDS = 0.001;    // tỉ lệ GOD PACK mỗi pack (0.001 = 1/1000): cả pack toàn lá hiếm nhất
const BOX_PACKS = 36;           // 1 hộp = 36 pack: xé từng pack (như thường) hoặc xé nhanh hết số pack còn lại
let box = null, boxRefresh = () => {};            // box = { left, setId, started } khi đang mở hộp

// ---- HỘP ×36: mỗi lần mở hộp phải chờ BOX_COOLDOWN_MS mới mở lại được. Xé lẻ từng pack thì KHÔNG giới hạn. ----
// Thời gian chờ bắt đầu tính từ pack đầu tiên xé trong hộp. Lưu ở localStorage nên chỉ là giới hạn phía trình duyệt.
const BOX_COOLDOWN_MS = 5 * 60 * 1000;
const BOX_CD_KEY = 'pack_box_cd_v1';
const boxMsLeft = () => { const t = +readLS(BOX_CD_KEY, 0) || 0, now = Date.now(); return t > 0 && t <= now ? Math.max(0, t + BOX_COOLDOWN_MS - now) : 0; };
const fmtMs = ms => { const t = Math.ceil(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const startBoxCooldown = () => { writeLS(BOX_CD_KEY, Date.now()); updateQuota(); };
function updateQuota() {
    const el = $('#packQuota'); if (!el) return;
    const ms = boxMsLeft();
    el.textContent = ms ? `📦 Hộp ×${BOX_PACKS} mở lại sau ${fmtMs(ms)} · xé lẻ không giới hạn` : `📦 Hộp ×${BOX_PACKS} đã sẵn sàng · xé lẻ không giới hạn`;
    el.classList.toggle('cool', ms > 0);
}
setInterval(() => { updateQuota(); if (view === 'stage' && !box) boxRefresh(); }, 1000);   // mỗi giây: đồng hồ đếm ngược + chữ trên nút hộp
const boxSort = (a, b) => TIERS.indexOf(tierOf(b.rarity)) - TIERS.indexOf(tierOf(a.rarity)) || (usdOf(b) ?? 0) - (usdOf(a) ?? 0);   // lá hiếm/đắt lên đầu
function godToast() {
    const d = document.createElement('div'); d.textContent = '🌟 GOD PACK! 🌟';
    d.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:130;padding:16px 28px;border-radius:16px;font:900 28px system-ui,sans-serif;color:#2a1700;background:linear-gradient(#fff3b0,#ffcb05);box-shadow:0 0 60px #ffcb05cc,0 16px 40px #000a;pointer-events:none';
    document.body.append(d); setTimeout(() => d.remove(), 4500);
}
function godPack(pool, config) {            // toàn bộ lá lấy từ các hạng cao nhất (epic trở lên; bộ không có thì lấy 2 hạng cao nhất)
    const n = config.reduce((s, [c]) => s + c, 0), have = TIERS.filter(t => pool[t] && pool[t].length);
    const hi = have.filter(t => TIERS.indexOf(t) >= TIERS.indexOf('epic'));
    const list = (hi.length ? hi : have.slice(-2)).flatMap(t => pool[t]);
    if (!list.length) return null;
    const out = [], seen = new Set();
    for (let i = 0; i < n; i++) {
        let c = null;
        for (let k = 0; k < 8 && !c; k++) { const cand = pickCard(list); if (!seen.has(cand.code) || k === 7) c = cand; }
        seen.add(c.code); out.push(decorate(c));
    }
    out.sort((a, b) => TIERS.indexOf(tierOf(a.rarity)) - TIERS.indexOf(tierOf(b.rarity)) || (usdOf(a) ?? 0) - (usdOf(b) ?? 0));
    out._god = true; return out;
}

function generatePack(cards, packKey) {
    const config = PACK_CONFIG[packKey] || PACK_CONFIG._default;
    const pool = {};
    cards.forEach(c => (pool[tierOf(c.rarity)] ||= []).push(c));
    if (Math.random() < GOD_PACK_ODDS) { const gp = godPack(pool, config); if (gp) return gp; }

    const out = [], seen = new Set();
    for (const [count, weights] of config) {
        for (let n = 0; n < count; n++) {
            let pick = null;
            for (let tries = 0; tries < 8 && !pick; tries++) {
                const tier = nearestTier(pool, weightedTier(boostWeights(weights)));
                if (!tier) return out;
                const cand = pickCard(pool[tier]);
                if (!seen.has(cand.code) || tries === 7) pick = cand;
            }
            seen.add(pick.code);
            out.push(decorate(pick));
        }
    }
    // Lá hiếm nhất lật cuối cùng cho hồi hộp
    return out.sort((a, b) => TIERS.indexOf(tierOf(a.rarity)) - TIERS.indexOf(tierOf(b.rarity)) || (usdOf(a) ?? 0) - (usdOf(b) ?? 0));
}

// =========================================================
// 6. GIÁ
// =========================================================
const fx = { VND: 25500, EUR: 0.92 };
fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json()).then(d => {
    if (d.rates) { fx.VND = d.rates.VND || fx.VND; fx.EUR = d.rates.EUR || fx.EUR; }
}).catch(() => {});
const usdOf = c => {
    const m = c.market;
    if (!m) return null;
    const base = m.usd ?? (m.eur != null ? m.eur / fx.EUR : null);
    return base == null ? null : base * (c._mult || 1);      // _mult: hệ số do chấm PSA / lá lỗi
};
const money = (v, cur) => cur === 'VND'
    ? new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v)
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);

// =========================================================
// 7. GIAO DIỆN
// =========================================================
const IMG_FALLBACKS = ['high.webp', 'low.png', 'low.webp'];
const placeholder = card => Object.assign(document.createElement('div'), { className: 'ph', textContent: 'Chưa có ảnh · ' + card.name });

function imgEl(card, lazy) {
    if (!card.image) return placeholder(card);
    const img = new Image();
    img.alt = card.name;
    if (lazy) img.loading = 'lazy';
    img.src = card.image;
    img.onerror = () => {
        const tried = Number(img.dataset.try || 0);
        if (tried < IMG_FALLBACKS.length && /\/(high|low)\.(png|webp)$/.test(img.src)) {
            img.dataset.try = tried + 1;
            img.src = img.src.replace(/\/(high|low)\.(png|webp)$/, '/' + IMG_FALLBACKS[tried]);
            return;
        }
        if (card.imageAlt && !img.dataset.alt) { img.dataset.alt = '1'; img.src = card.imageAlt; return; }   // ảnh dự phòng
        img.replaceWith(placeholder(card));
    };
    return img;
}

// nhãn nhỏ gắn lên ảnh lá bài: điểm PSA + loại lỗi
function tagEls(c) {
    const out = [];
    if (c._grade) { const e = document.createElement('span'); e.className = 'slab-tag' + (c._grade >= 9 ? ' ghi' : ''); e.textContent = (c._co || 'PSA') + ' ' + c._grade; out.push(e); }
    if (c._err) { const e = document.createElement('span'); e.className = 'err-tag'; e.textContent = '⚠ ' + c._err; out.push(e); }
    return out;
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// ---- trạng thái ----
let game = GAMES[0], allSets = [], list = [], cur = 0, series = 'all', query = '';
let setId = '', cards = [], cardsFor = '', hits = [], pack = [], idx = 0;
let loadToken = 0, selTimer = 0, view = 'status', dragMoved = false;
const cardStore = new Map();     // "game|set" -> thẻ đã tải
const cfEls = new Map();         // set.id -> phần tử trong băng chuyền

// ---- thông tin bộ: mã, series, tên gọn ----
const codeOf = s => {
    const id = String(s.id);
    if (/^[A-Za-z0-9._-]{1,10}$/.test(id) && /\d/.test(id)) return id;               // SWSH03, OP01...
    const m = /\(([A-Za-z0-9._-]{2,10})\)\s*$/.exec(s.name || '');                     // "Tên bộ (LOB)"
    return m ? m[1] : id;
};
const rawSeries = s => { const m = /^[A-Za-z]+/.exec(codeOf(s)); return m ? m[0].toUpperCase().slice(0, 6) : 'KHÁC'; };
const shortName = s => String(s.name || '')
    .replace(/\s*\([A-Za-z0-9._-]{2,10}\)\s*$/, '')
    .replace(/^[A-Za-z0-9.]*\d[A-Za-z0-9.]*:\s*/, '')
    .replace(/^(SM|XY|BW|HGSS|DP|EX|SV|SWSH|ME)\s*[-:]\s*/i, '').trim() || String(s.name || s.id);
const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const hueOf = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return (h % 90) - 45; };

// ---- lá hit + cấu trúc pack ----
const rankOf = c => TIERS.indexOf(tierOf(c.rarity));
function hitsOf(list) {
    const sorted = list.filter(c => c.image)
        .sort((a, b) => (usdOf(b) ?? -1) - (usdOf(a) ?? -1) || rankOf(b) - rankOf(a));
    const top = sorted.filter(c => rankOf(c) >= TIERS.indexOf('epic'));
    return top.length >= 5 ? top : sorted.slice(0, Math.min(12, sorted.length));   // bộ ít thẻ hiếm -> lấy top theo giá
}
function packSummary(key) {
    const cfg = PACK_CONFIG[key] || PACK_CONFIG._default;
    const odds = Object.entries(cfg[cfg.length - 1][1]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { total: cfg.reduce((s, [n]) => s + n, 0), odds };
}

// ---- giao diện pack (dùng cho băng chuyền + màn xé) ----
// polygon răng cưa (sinh 1 lần, gắn vào :root) — cạnh trên/dưới như mép hàn của gói thật
const TEETH = 24, TOOTH = 1.5, TEAR_Y = 7.6;
const zig = (y0, amp, dir) => {            // dir=1: trái->phải, -1: phải->trái
    const pts = [];
    for (let i = 0; i <= TEETH; i++) {
        const x = dir === 1 ? i * 100 / TEETH : 100 - i * 100 / TEETH;
        pts.push(`${x.toFixed(2)}% ${(y0 + (i % 2 ? amp : 0)).toFixed(2)}%`);
    }
    return pts;
};
const tearEdge = dir => {                  // đường xé: lởm chởm ngẫu nhiên (cố định)
    const pts = [], n = 40;
    for (let i = 0; i <= n; i++) {
        const x = dir === 1 ? i * 100 / n : 100 - i * 100 / n;
        const j = Math.sin(i * 12.9898) * 43758.5453; const r = j - Math.floor(j);
        pts.push(`${x.toFixed(2)}% ${(TEAR_Y + r * 1.4).toFixed(2)}%`);
    }
    return pts;
};
(function initClips() {
    const top = zig(0, TOOTH, 1);
    const botPts = [];
    for (let i = 0; i <= TEETH; i++) botPts.push(`${(100 - i * 100 / TEETH).toFixed(2)}% ${(i % 2 ? 100 - TOOTH : 100).toFixed(2)}%`);
    const full = `polygon(${[...top, ...botPts].join(',')})`;
    const body = `polygon(${[...tearEdge(1), ...botPts].join(',')})`;
    const cap = `polygon(${[...top, ...tearEdge(-1)].join(',')})`;
    const st = document.documentElement.style;
    st.setProperty('--clip-full', full); st.setProperty('--clip-body', body); st.setProperty('--clip-cap', cap);
})();

// ---- giao diện pack (dùng cho băng chuyền + màn xé) ----
// stage=true: tách làm 2 phần (thân + nắp trên) để nắp bóc ra khi xé
// LOGO BỘ trên hình pack. Thứ tự: SET_LOGOS (ghi tay) > logo có sẵn trong dữ liệu > suy ra từ link ảnh thẻ của pokemontcg.io.
const SET_LOGOS = {                 // ghi tay nếu cần: id bộ -> { logo: 'link ảnh logo', symbol: 'link ảnh biểu tượng' }
    // 'PFL': { logo: 'https://.../logo.png', symbol: 'https://.../symbol.png' }
};
const PTCG_IMG = /^https?:\/\/images\.pokemontcg\.io\/([^/]+)\//i;                                   // images.pokemontcg.io/<bộ>/<số>.png
const TCGDEX_IMG = /^(https?:\/\/assets\.tcgdex\.net\/)([^/]+)\/([^/]+)\/([^/]+)\/[^/]+\/(?:low|high)\.\w+/i;   // assets.tcgdex.net/<ngôn ngữ>/<series>/<bộ>/<số>/high.png
const noLogoSeen = new Set();
function setArt(s) {
    const man = SET_LOGOS[s.id] || {}, hero = s.hero || '';
    let logo = man.logo || s.logo || '', symbol = man.symbol || s.symbol || '', m;
    if (!(logo && symbol)) {
        if ((m = TCGDEX_IMG.exec(hero))) {
            logo = logo || `${m[1]}${m[2]}/${m[3]}/${m[4]}/logo.png`;
            symbol = symbol || `${m[1]}univ/${m[3]}/${m[4]}/symbol.png`;
        } else if ((m = PTCG_IMG.exec(hero))) {
            logo = logo || `https://images.pokemontcg.io/${m[1]}/logo.png`;
            symbol = symbol || `https://images.pokemontcg.io/${m[1]}/symbol.png`;
        }
    }
    if (!logo && hero && !noLogoSeen.has(s.id)) { noLogoSeen.add(s.id); console.info('[pack] chưa suy ra được logo cho bộ', s.id, '— link ảnh bìa:', hero); }
    return { logo, symbol };
}
// VÙNG ARTWORK trên ảnh lá bài (tỉ lệ 0–1 của cả ảnh) để cắt bỏ chữ/khung bài, chỉ lấy tranh. Game không có ở đây dùng cách zoom cũ (game.crop).
const ART_BOX = {                                                // ước lượng vùng tranh của từng game; sai thì chỉnh số tại đây (hoặc thử nhanh bằng ?art=x1,x2,y1,y2 trên URL)
    pokemon:   { x: [.08, .92],  y: [.11, .54], ratio: 1.397 },   // ratio = cao/rộng của lá bài
    yugioh:    { x: [.115, .885], y: [.185, .70], ratio: 1.458 },
    onepiece:  { x: [.07, .93],  y: [.12, .55], ratio: 1.397 },
    gundam:    { x: [.07, .93],  y: [.10, .52], ratio: 1.397 },
    riftbound: { x: [.07, .93],  y: [.12, .51], ratio: 1.397 },
    dbs:       { x: [.07, .93],  y: [.12, .52], ratio: 1.397 },
    aot:       { x: [.07, .93],  y: [.08, .53], ratio: 1.397 },   // Weiss Schwarz (aot / overlord / rascal)
    overlord:  { x: [.07, .93],  y: [.08, .53], ratio: 1.397 },
    rascal:    { x: [.07, .93],  y: [.08, .53], ratio: 1.397 },
    naruto:    { x: [.04, .96],  y: [.04, .96], ratio: 1.397 }    // Kayou: gần như toàn tranh
};
const ART_DEFAULT = { x: [.07, .93], y: [.12, .54], ratio: 1.397 };   // game mới thêm mà chưa khai báo ở trên
const ART_H = 79;                                                // chiều cao khung tranh trên pack (cqw = % bề ngang pack)
function artStyle(g) {
    let b = ART_BOX[g.id] || ART_DEFAULT;
    const q = (new URLSearchParams(location.search).get('art') || '').split(',').map(Number);   // ?art=x1,x2,y1,y2 : thử nhanh vùng cắt cho game đang chọn
    if (q.length === 4 && q.every(n => n >= 0 && n <= 1) && q[0] < q[1] && q[2] < q[3]) b = { x: [q[0], q[1]], y: [q[2], q[3]], ratio: b.ratio };
    const aw = b.x[1] - b.x[0], ah = b.y[1] - b.y[0];
    const cw = Math.max(100 / aw, ART_H / (ah * b.ratio));       // bề ngang cả lá bài (cqw) để vùng tranh phủ kín khung
    const left = (100 - aw * cw) / 2 - b.x[0] * cw, top = (ART_H - ah * b.ratio * cw) / 2 - b.y[0] * b.ratio * cw;
    return `width:${cw.toFixed(1)}cqw;left:${left.toFixed(1)}cqw;top:${top.toFixed(1)}cqw`;
}
function packLayers(s, cls) {
    const [zs, zy] = game.crop || [1.5, 34];            // zoom + vị trí cắt artwork (chỉnh trong GAMES); CSS đã làm dịu bớt độ zoom
    const name = shortName(s), len = name.length;
    const fs = len > 24 ? 7.4 : len > 16 ? 9.2 : 11.5;  // tên dài thì chữ nhỏ lại (đơn vị cqw)
    const total = packSummary(game.pack).total, ar = setArt(s);
    const hue = Math.round(+hueOf(s.id) || 0);
    const hue2 = (hue + 45) % 360;                      // màu thứ 2 lệch khỏi màu chính (mọi pack cùng một kiểu, chỉ khác màu)
    const hero = s.hero ? String(s.hero) : '';
    // thử bản ảnh nét hơn (TCGdex low -> high, pokemontcg.io thường -> _hires); nếu lỗi thì quay về ảnh gốc
    let hi = hero.replace(/\/low\.(png|webp|jpe?g)(\?.*)?$/i, '/high.$1$2');
    if (/^https?:\/\/images\.pokemontcg\.io\//i.test(hero) && !/_hires\.png$/i.test(hero)) hi = hero.replace(/\.png$/i, '_hires.png');
    const box = artStyle(game);
    const art = `<div class="kp-art${hero ? '' : ' noimg'}${box ? ' boxed' : ''}">`
        + (hero ? `<img${box ? ` style="${box}"` : ''} src="${esc(hi)}" data-o="${hi !== hero ? esc(hero) : ''}" alt="" loading="lazy" draggable="false" onerror="if(this.dataset.o){this.src=this.dataset.o;this.dataset.o='';return}this.parentNode.classList.add('noimg');this.remove()">` : '')
        + `<div class="kp-icon">${esc(game.icon)}</div></div>`;
    // logo bộ (ảnh) thay cho chữ tên bộ; ảnh lỗi thì tự quay về chữ
    const logo = ar.logo ? `<img class="kp-logo" src="${esc(ar.logo)}" alt="${esc(name)}" loading="lazy" draggable="false" onerror="var t=this.closest('.kp-top');if(t)t.classList.remove('has-logo');this.remove()">` : '';
    const sym = ar.symbol ? `<img class="kp-sym" src="${esc(ar.symbol)}" alt="" loading="lazy" draggable="false" onerror="var i=this.parentNode&&this.parentNode.querySelector('i');if(i)i.hidden=false;this.remove()">` : '';
    return `<div class="pk${cls}" style="--h1:${hue}deg;--h2:${hue2}deg;--fs:${fs}cqw;--zs:${zs};--zy:${zy}%;--art:${hero ? `url('${esc(hi)}')` : 'none'}">`
        + `<div class="kp-bg"></div><div class="kp-pat"></div>${art}`
        + `<div class="kp-top${ar.logo ? ' has-logo' : ''}">${logo}<span class="kp-game">${esc(game.name)}</span><span class="kp-set" data-t="${esc(name)}"><b>${esc(name)}</b></span></div>`
        + `<div class="kp-band"><span class="kp-series">${esc(s.series || codeOf(s))}</span><span class="kp-bp">BOOSTER PACK</span>`
        + `<span class="kp-n">${sym}<i${ar.symbol ? ' hidden' : ''}>${esc(game.icon)}</i>${total} thẻ bài</span></div>`
        + `<div class="crimp top kp-c"></div><div class="crimp bot kp-c"></div>`
        + `<div class="pk-puff"></div><div class="pk-holo"></div><div class="pk-glare"></div><div class="pk-sweep"></div></div>`;
}
function packInner(s, stage) {
    if (!stage) return `<div class="pk-tilt">${packLayers(s, '')}</div>`;
    // màn xé: thân pack (đã bị cắt mép xé) + nắp trên bật lên quanh bản lề + đường xé + gợi ý ngón tay
    return `<div class="pk-tilt"><div class="tr" style="--tp:0;--td:1;--lift:0">`
        + `<div class="tr-body">${packLayers(s, '')}<span class="tr-peek"></span></div>`
        + `<div class="tr-strip">${packLayers(s, '')}</div>`
        + `<div class="tr-line"></div><div class="tr-guide" aria-hidden="true"><span class="tr-finger"></span></div>`
        + `</div></div>`;
}

// nghiêng 3D + holo theo con trỏ (chỉ pack giữa của băng chuyền và pack ở màn xé)
function initTilt() {
    let last = null;
    const clear = p => { if (!p) return; for (const [k, v] of [['--rx', '0deg'], ['--ry', '0deg'], ['--mx', 50], ['--my', 50], ['--hyp', 0]]) p.style.setProperty(k, v); };
    document.addEventListener('pointermove', e => {
        const host = e.target.closest && e.target.closest('.cf-item.center, .pack-wrap');
        const p = host && host.querySelector('.pack');
        if (last && last !== p) { clear(last); last = null; }
        if (!p) return;
        const r = p.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        p.style.setProperty('--mx', (x * 100).toFixed(1)); p.style.setProperty('--my', (y * 100).toFixed(1));
        p.style.setProperty('--ry', ((x - .5) * 18).toFixed(2) + 'deg'); p.style.setProperty('--rx', ((.5 - y) * 14).toFixed(2) + 'deg');
        p.style.setProperty('--hyp', Math.min(1, Math.hypot(x - .5, y - .5) * 2).toFixed(2));
        last = p;
    });
    document.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') { clear(last); last = null; } });
    document.addEventListener('pointerleave', () => { clear(last); last = null; });
}

function theme(g) {
    document.documentElement.style.setProperty('--g1', g.c1);
    document.documentElement.style.setProperty('--g2', g.c2);
    $('#backFace').textContent = g.icon;
}

function show(which) {
    view = which;
    document.documentElement.classList.toggle('tr-on', which === 'stage');
    document.documentElement.classList.toggle('sw-on', which === 'reveal');
    $('#picker').hidden = which !== 'select';
    $('#stage').hidden = which !== 'stage';
    $('#reveal').style.display = which === 'reveal' ? 'block' : 'none';
    $('#summary').style.display = which === 'summary' ? 'block' : 'none';
    $('#status').style.display = which === 'status' ? 'block' : 'none';
    $('#pickOther').hidden = which === 'select' || which === 'status';
}
function status(msg) { $('#status').textContent = msg; show('status'); }

function syncURL() {
    const q = new URLSearchParams({ game: game.id });
    if (setId) q.set('set', setId);
    history.replaceState(null, '', '?' + q);
}

// ---- chọn game -> danh sách bộ ----
async function pickGame(id, wantedSet) {
    const token = ++loadToken;
    game = GAMES.find(g => g.id === id) || GAMES[0];
    $('#game').value = game.id;
    theme(game);
    status(`Đang tải ${game.name}...`);
    let sets;
    try {
        sets = await loadSets(game);
    } catch (e) {
        console.warn(e);
        if (token === loadToken) status(`Chưa có dữ liệu cho ${game.name} (${e.message}). Hãy chạy script cập nhật dữ liệu của game này.`);
        return;
    }
    if (token !== loadToken) return;
    if (!sets.length) return status(`Chưa có bộ bài nào cho ${game.name}.`);

    allSets = sets; series = 'all'; query = ''; setId = ''; cards = []; cardsFor = ''; hits = [];
    $('#q').value = '';
    cfEls.clear(); $('#cfTrack').replaceChildren();
    buildChips();
    show('select');
    applyFilter(wantedSet);
}

function buildChips() {
    allSets.forEach(s => { s._raw = rawSeries(s); });
    const cnt = {};
    allSets.forEach(s => { cnt[s._raw] = (cnt[s._raw] || 0) + 1; });
    const real = Object.keys(cnt).filter(k => cnt[k] >= 2);                      // series chỉ có 1 bộ -> gộp vào "Khác"
    allSets.forEach(s => { s._series = real.includes(s._raw) ? s._raw : 'KHÁC'; });
    const per = {}, order = [];
    allSets.forEach(s => { per[s._series] = (per[s._series] || 0) + 1; if (!order.includes(s._series)) order.push(s._series); });
    order.sort((a, b) => (a === 'KHÁC') - (b === 'KHÁC'));
    const box = $('#chips');
    box.hidden = real.length < 2;
    box.innerHTML = [['all', 'Tất cả', allSets.length], ...order.map(k => [k, k === 'KHÁC' ? 'Khác' : k, per[k]])]
        .map(([k, label, n]) => `<button class="chip${k === series ? ' on' : ''}" data-s="${esc(k)}">${esc(label)} <small>${n}</small></button>`).join('');
}

function applyFilter(keepId) {
    const q = norm(query);
    list = allSets.filter(s => (series === 'all' || s._series === series) && (!q || norm(`${s.name} ${s.id}`).includes(q)));
    $('#cfEmpty').hidden = list.length > 0;
    $('#cf').hidden = !list.length;
    $('#scrubRow').hidden = list.length < 2;
    const i = keepId ? list.findIndex(s => s.id === keepId) : -1;
    go(i < 0 ? 0 : i);
}

// ---- băng chuyền ----
function makeItem(s) {
    const el = document.createElement('div');
    el.className = 'cf-item';
    el.setAttribute('role', 'button');
    el.innerHTML = `<div class="pack">${packInner(s)}</div>`;
    el.onclick = () => { if (dragMoved) return; const i = +el.dataset.i; i === cur ? openStage() : go(i); };
    return el;
}

function renderCarousel() {
    const track = $('#cfTrack'), want = new Set();
    for (let o = -3; o <= 3; o++) {
        const i = cur + o;
        if (i < 0 || i >= list.length) continue;
        const s = list[i];
        want.add(s.id);
        let el = cfEls.get(s.id);
        if (!el) { el = makeItem(s); cfEls.set(s.id, el); track.append(el); }
        el.dataset.i = i;
        el.style.setProperty('--o', o);
        el.style.setProperty('--ao', Math.abs(o));
        el.style.zIndex = 10 - Math.abs(o);
        el.classList.toggle('center', o === 0);
        el.setAttribute('aria-label', shortName(s));
    }
    for (const [id, el] of cfEls) if (!want.has(id)) { el.remove(); cfEls.delete(id); }
}

function refreshPackArt(s) {
    const el = cfEls.get(s.id);
    if (el) el.querySelector('.pack').innerHTML = packInner(s);
}

function go(i) {
    if (!list.length) { cur = 0; setId = ''; renderCarousel(); $('#detail').innerHTML = ''; $('#cfCount').textContent = ''; return; }
    cur = Math.max(0, Math.min(list.length - 1, i));
    renderCarousel();
    const s = list[cur];
    setId = s.id;
    $('#cfCount').textContent = `${cur + 1} / ${list.length}`;
    $('#scrub').max = list.length - 1;
    $('#scrub').value = cur;
    $('#cfPrev').disabled = cur === 0;
    $('#cfNext').disabled = cur === list.length - 1;
    syncURL();

    clearTimeout(selTimer);
    const cached = cardStore.get(`${game.id}|${s.id}`);
    if (cached) return applyCards(s, cached);
    cards = []; cardsFor = ''; hits = [];
    renderDetail(s);
    selTimer = setTimeout(() => loadSelected(s), 220);        // lướt nhanh qua nhiều pack thì chưa tải
}

async function loadSelected(s) {
    const token = ++loadToken;
    const g = game;
    try {
        const c = await loadCards(g, s.id);
        if (g !== game) return;
        if (QUALITY.enabled && !g.src.file && !c._q.ok) return pruneSet(s, c._q);   // bộ tải từng file: giờ mới biết thiếu dữ liệu -> ẩn luôn
        cardStore.set(`${g.id}|${s.id}`, c);
        if (token === loadToken && list[cur] === s) applyCards(s, c);
        scanNear();
    } catch (e) {
        console.warn(e);
        if (token === loadToken && list[cur] === s) renderDetail(s, e.message);
    }
}

// ẩn 1 bộ thiếu dữ liệu khỏi danh sách (đang xem bộ khác thì giữ nguyên vị trí hiện tại)
function pruneSet(s, q) {
    const i = allSets.indexOf(s);
    if (i < 0) return;
    console.info(`[pack] ẩn bộ "${s.name}" (${s.id}): ${q.reason}`);
    allSets.splice(i, 1);
    if (!allSets.length) return status(`Không còn bộ nào đủ dữ liệu cho ${game.name}.`);
    const curSet = list[cur];
    const keep = curSet === s ? (list[cur + 1] || list[cur - 1] || {}).id : curSet && curSet.id;
    buildChips();
    if (series !== 'all' && !allSets.some(x => x._series === series)) { series = 'all'; buildChips(); }
    cfEls.clear(); $('#cfTrack').replaceChildren();
    applyFilter(keep);
}

// tải ngầm các bộ lân cận để loại bộ lỗi trước khi người dùng lướt tới
let scanning = 0;
async function scanNear() {
    if (!QUALITY.enabled || !QUALITY.scanAhead || game.src.file) return;
    const g = game, my = ++scanning;
    for (let k = 1; k <= QUALITY.scanAhead; k++) {
        for (const j of [cur + k, cur - k]) {
            const s = list[j];
            if (!s || cardStore.has(`${g.id}|${s.id}`)) continue;
            try {
                const c = await loadCards(g, s.id);
                if (g !== game || my !== scanning) return;            // người dùng đã lướt đi chỗ khác -> dừng
                if (!c._q.ok) { pruneSet(s, c._q); return scanNear(); }
                cardStore.set(`${g.id}|${s.id}`, c);
            } catch (e) { /* bỏ qua: tới lúc chọn bộ đó sẽ báo lỗi */ }
        }
    }
}

function applyCards(s, c) {
    learnTiers(game.id, c, `${game.id}|${s.id}`);      // game nạp theo từng bộ: học thêm khi mở bộ mới
    cards = c; cardsFor = s.id; hits = hitsOf(c);
    if (!s.hero && hits[0]) { s.hero = hits[0].image; refreshPackArt(s); }
    renderDetail(s);
}

// ---- khung chi tiết: thông tin bộ + xem trước lá hit ----
function renderDetail(s, err) {
    const box = $('#detail');
    const loaded = cardsFor === s.id && cards.length;
    const d = fmtDate(s.date);
    const left = `<span class="tag">${esc(codeOf(s))}</span><h2>${esc(shortName(s))}</h2>`
        + `<div class="facts">${d ? `<span>📅 ${d}</span>` : ''}<span>🃏 ${s.count || cards.length || '?'} lá</span>${loaded ? `<span>💎 ${hits.length} lá hit</span>` : ''}`
        + (isAdmin()
            ? `<span id="editPrice" role="button" tabindex="0" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px" title="Giá 1 pack (${esc(packPriceInfo(s).src)}). Admin: bấm để đổi">💵 ${money(packPriceInfo(s).v, 'USD')}/pack ✎</span>`
            : `<span title="Giá 1 pack (${esc(packPriceInfo(s).src)})">💵 ${money(packPriceInfo(s).v, 'USD')}/pack</span>`) + `</div>`;

    if (!loaded) {
        const msg = err ? `Không tải được bộ này (${esc(err)}).` : (cardsFor === s.id ? 'Bộ này chưa có thẻ.' : 'Đang tải thẻ hit…');
        box.innerHTML = `<div class="d-left">${left}<div class="d-load">${msg}</div><div class="d-actions"><button class="primary big" disabled>🎴 Xé pack này</button></div></div><div class="d-right"></div>`;
        wirePrice(box, s);
        return;
    }

    const sum = packSummary(game.pack);
    const odds = sum.odds.map(([t, w]) => `<span class="o" style="--rc:${TIER_COLOR[t]}">${t} ${Math.round(w * 100)}%</span>`).join('');
    const counts = {};
    cards.forEach(c => { const t = tierOf(c.rarity); counts[t] = (counts[t] || 0) + 1; });
    const rar = TIERS.filter(t => counts[t]).reverse().slice(0, 6)
        .map(t => `<span class="o" style="--rc:${TIER_COLOR[t]}">${t} · ${counts[t]}</span>`).join('');

    const fan = hits.slice(0, 7), n = fan.length;
    const fanHTML = fan.map((c, i) => {
        const off = i - (n - 1) / 2, p = usdOf(c);
        return `<div class="fc" data-i="${i}" style="--rc:${TIER_COLOR[tierOf(c.rarity)]};--r:${(off * 5).toFixed(1)}deg;--y:${(off * off * 1.5).toFixed(1)}px">`
            + `<span class="fc-img"></span>${p != null ? `<small>${money(p, 'USD')}</small>` : ''}</div>`;
    }).join('');

    box.innerHTML = `<div class="d-left">${left}`
        + `<div class="row"><b>Pack ${sum.total} lá</b> · slot hiếm nhất (ước lượng): ${odds}</div>`
        + `<div class="row"><b>Trong bộ:</b> ${rar}</div>`
        + `<div class="d-actions"><button class="primary big" id="goTear">🎴 Xé pack này</button>`
        + `<button id="allHits">Xem tất cả lá hit (${hits.length})</button></div></div>`
        + `<div class="d-right"><div class="fan-title">✨ Lá hit đáng giá trong bộ</div><div class="fan">${fanHTML}</div>`
        + `<div class="fan-note">Xếp theo giá thị trường · bấm vào lá bài để phóng to</div></div>`;
    box.querySelectorAll('.fc').forEach(el => el.querySelector('.fc-img').replaceWith(imgEl(fan[+el.dataset.i], true)));
    wirePrice(box, s);
}
function repaintDetail() { try { if (list && list[cur]) renderDetail(list[cur]); } catch (e) { /* chưa sẵn sàng */ } }
loadServerPrices().then(repaintDetail);
if (window.Auth && Auth.onChange) Auth.onChange(repaintDetail);       // đăng nhập/đăng xuất -> hiện/ẩn quyền admin
function wirePrice(box, s) {
    const el = box.querySelector('#editPrice'); if (!el) return;
    const go = () => editPackPrice(s, () => renderDetail(s));
    el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
}

function openHits() {
    const s = list[cur];
    if (!s || !hits.length) return;
    $('#hitsTitle').textContent = `Lá hit · ${shortName(s)} (${hits.length})`;
    $('#hitsGrid').replaceChildren(...hits.slice(0, 120).map(c => {
        const d = document.createElement('div');
        d.className = 'mini';
        d.style.setProperty('--rc', TIER_COLOR[tierOf(c.rarity)]);
        d.append(imgEl(c, true));
        const sm = document.createElement('small'), p = usdOf(c);
        sm.textContent = `${c.name}${p != null ? ' · ' + money(p, 'USD') : ''}`;
        d.append(sm);
        d.onclick = () => zoom(c);
        return d;
    }));
    $('#hitsModal').style.display = 'block';
}

// ---- màn xé pack ----
async function openStage() {
    const s = list[cur];
    if (!s || cardsFor !== s.id || !cards.length) return;
    // phải đăng nhập / đăng ký mới được xé (bật/tắt trong supabase-config.js: requireLogin). Chưa cấu hình Supabase thì bỏ qua bước này.
    if (window.Auth && !(await Auth.require('Đăng nhập hoặc đăng ký để xé pack — thẻ bạn xé sẽ được lưu vào binder.'))) return;
    if (window.Wallet && !(await Wallet.gate())) return;                       // nợ quá hạn mức -> khoá xé pack
    if (list[cur] !== s || cardsFor !== s.id || !cards.length) return;      // trong lúc đăng nhập người chơi đã đổi sang bộ khác
    $('#stagePack').innerHTML = packInner(s, true);
    $('#stageCap').innerHTML = `Bạn đang xé: ${esc(shortName(s))}<small class="tr-hint">Vuốt ngang qua mép trên để xé pack</small>`;
    show('stage');
    tearReset();                                   // đặt lại trạng thái xé (sau khi đã hiện để đo được bề rộng pack)
    boxRefresh(); updateQuota();
    $('#packWrap').focus({ preventScroll: true });
}
const backToPicker = () => { box = null; show('select'); };

// ---- xé pack: vuốt ngang qua mép trên ----
// Kéo bám tay (có làm mượt), nắp pack bật lên quanh bản lề, quá ngưỡng thì tự xé nốt,
// vuốt nhanh là xé luôn, chưa đủ thì pack tự trả về. Chạm nhẹ chỉ rung nhắc vuốt.
const TEAR = {
    dist: .75,        // kéo bằng bấy nhiêu × bề rộng pack = xé hết (nhỏ hơn = nhạy hơn)
    commit: .6,       // đang giữ tay mà kéo quá ngưỡng này (0..1) -> tự xé nốt
    release: .28,     // thả tay ở ngưỡng này trở lên -> xé nốt; thấp hơn -> trả về
    flick: .55,       // tốc độ vuốt (px/ms) vượt mức này -> xé luôn dù mới kéo ngắn
    tapTears: false   // true = chạm 1 cái là xé luôn (kiểu cũ)
};

(function injectTearCSS() {
    const st = document.createElement('style');
    st.textContent = `
html.tr-on, html.tr-on body { touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; }
.tr { position: absolute; inset: 0; --ty: 8.3%; --pw: 250px; rotate: calc(var(--td) * var(--tp) * 2.2deg); }
.tr.is-nudge { animation: tr-nudge .42s ease-in-out; }
.tr-body, .tr-strip { position: absolute; inset: 0; }
.tr-body > .pk, .tr-strip > .pk { position: absolute; inset: 0; width: 100%; height: 100%; }
.tr-body { clip-path: var(--clip-body); }
.tr-strip {
    z-index: 2; clip-path: var(--clip-cap); will-change: transform;
    transform-origin: calc(50% + var(--td) * 50%) var(--ty);
    transform: translateY(calc(var(--tp) * -8px - var(--lift) * 12px))
               rotate(calc(var(--td) * (var(--tp) * var(--tp) * 24deg + var(--lift) * 9deg)));
}
.tr-line {
    position: absolute; z-index: 3; left: 0; right: 0; top: calc(var(--ty) - 2px); height: 4px; border-radius: 2px;
    pointer-events: none; background: linear-gradient(#fff, #cfd4de); box-shadow: 0 0 8px rgba(255,255,255,.85);
    transform-origin: calc(50% - var(--td) * 50%) 50%; transform: scaleX(var(--tp)); will-change: transform;
}
.tr-peek {
    position: absolute; z-index: 1; left: 7%; right: 7%; top: calc(var(--ty) + .3%); height: 2.2%; border-radius: 1px; pointer-events: none;
    background: repeating-linear-gradient(90deg, #f6f6f8 0 2px, #cfd3dc 2px 3px);
    transform-origin: calc(50% - var(--td) * 50%) 0; transform: scaleX(var(--tp)); opacity: calc(var(--tp) * 1.4);
}
.tr-guide { position: absolute; z-index: 4; left: 5%; right: 5%; top: calc(var(--ty) - 1px); pointer-events: none;
    border-top: 2px dashed rgba(255,255,255,.8); opacity: calc(1 - var(--tp) * 3); }
.tr.is-drag .tr-guide { opacity: 0; }
.tr-finger {
    position: absolute; top: -15px; left: 0; width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,.92);
    box-shadow: 0 0 0 6px rgba(255,255,255,.25), 0 4px 10px rgba(0,0,0,.4); animation: tr-finger 1.8s ease-in-out infinite;
}
.tr.is-torn .tr-strip {
    transform: translate(calc(var(--td) * var(--pw) * .72), calc(var(--pw) * -1.15)) rotate(calc(var(--td) * 55deg));
    opacity: 0; transition: transform .7s cubic-bezier(.25,.7,.35,1), opacity .7s;
}
.tr.is-torn .tr-line { opacity: 0; transition: opacity .3s; }
.tr.is-torn .tr-body { animation: tr-bodyout .5s ease-in .5s forwards; }
.tr-hint { display: block; margin-top: 4px; opacity: .85; font-size: .85em; animation: tr-blink 1.6s ease-in-out infinite; }
.tr-quick { display: block; margin: 14px auto 0; padding: 9px 18px; border-radius: 999px; font: inherit; font-weight: 600; cursor: pointer;
    color: inherit; background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.28); }
.tr-quick.is-hidden { visibility: hidden; }
.pack-quota { display: block; margin: 10px auto 0; text-align: center; font-size: 12.5px; font-weight: 600; opacity: .9; }
.pack-quota.cool { color: #fdba74; }
.tr-box.is-cool { opacity: .55; }
@keyframes tr-finger { 0% { opacity: 0; transform: translateX(0) scale(.9); } 15% { opacity: 1; transform: translateX(0) scale(1); }
    75% { opacity: 1; } 100% { transform: translateX(calc(var(--pw) * .82)) scale(1); opacity: 0; } }
@keyframes tr-nudge { 0%, 100% { transform: translateX(0) rotate(0); } 25% { transform: translateX(-6px) rotate(-1.4deg); }
    50% { transform: translateX(6px) rotate(1.4deg); } 75% { transform: translateX(-3px) rotate(-.6deg); } }
@keyframes tr-bodyout { to { opacity: 0; transform: translateY(-4%) scale(1.05); } }
@keyframes tr-blink { 50% { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .tr-finger, .tr-hint { animation: none; } }`;
    document.head.append(st);
})();

let tearReset = () => {};
function initTear() {
    const w = $('#packWrap');
    let tr = null, g = null, raf = 0, last = 0, epoch = 0;
    let tp = 0, target = 0, lift = 0, liftT = 0, td = 1, committed = false;   // tp = tiến độ đang hiển thị (đã làm mượt), target = tiến độ theo tay
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* bỏ qua */ } };

    const quick = Object.assign(document.createElement('button'), { type: 'button', className: 'tr-quick', textContent: 'Xé nhanh' });
    $('#stage').append(quick);
    const boxBtn = Object.assign(document.createElement('button'), { type: 'button', className: 'tr-box', textContent: `📦 Xé hộp ×${BOX_PACKS} (nhanh)` });
    $('#stage').append(boxBtn);
    $('#stage').append(Object.assign(document.createElement('div'), { id: 'packQuota', className: 'pack-quota' }));
    boxRefresh = () => {
        const s = list[cur]; if (box && (!s || box.setId !== s.id)) box = null;      // đổi sang bộ khác = bỏ hộp đang mở
        boxBtn.textContent = box ? `⚡ Xé nhanh hết hộp (còn ${box.left} pack)` : (boxMsLeft() ? `⏳ Hộp ×${BOX_PACKS} · chờ ${fmtMs(boxMsLeft())}` : `📦 Mở hộp ×${BOX_PACKS} pack`);
        boxBtn.classList.toggle('is-cool', !box && boxMsLeft() > 0);
        const cap = $('#stageCap'), old = cap.querySelector('.box-left'); if (old) old.remove();
        if (box) cap.insertAdjacentHTML('beforeend', `<small class="box-left">📦 Hộp ×${BOX_PACKS} · còn ${box.left} pack — xé từng pack hoặc xé nhanh hết</small>`);
    };

    function paint() {
        tr.style.setProperty('--tp', tp.toFixed(4));
        tr.style.setProperty('--td', td);
        tr.style.setProperty('--lift', lift.toFixed(4));
    }
    function loop(now) {                          // tp đuổi theo target theo hàm mũ -> mượt, không phụ thuộc FPS
        const dt = Math.min(48, now - last); last = now;
        const k = 1 - Math.exp(-dt / (committed ? 70 : g ? 40 : 90));
        tp += (target - tp) * k;
        lift += (liftT - lift) * k;
        paint();
        if (Math.abs(target - tp) < .0015 && Math.abs(liftT - lift) < .0015) { tp = target; lift = liftT; paint(); raf = 0; return; }
        raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

    function nudge() {
        tr.classList.remove('is-nudge'); void tr.offsetWidth; tr.classList.add('is-nudge'); vib(8);
        setTimeout(() => tr && tr.classList.remove('is-nudge'), 450);
    }

    function commit() {
        if (committed || view !== 'stage' || !tr) return;
        committed = true; g = null;
        target = 1; liftT = Math.max(liftT, .05);
        tr.classList.remove('is-drag', 'is-nudge'); tr.classList.add('is-torn');
        quick.classList.add('is-hidden'); boxBtn.classList.add('is-hidden');
        vib([12, 40, 24]);
        kick();
        pack = generatePack(cards, game.pack);
        if (box && !box.started) { box.started = true; startBoxCooldown(); }
        if (box && --box.left <= 0) box = null;                    // xé từng pack trong hộp
        if (pack._god) godToast();
        savePackToBinder();
        pack.forEach(c => { if (c.image) new Image().src = c.image; });   // tải trước ảnh
        const my = epoch;
        setTimeout(() => { if (my === epoch && view === 'stage') startReveal(); }, 1000);
    }

    function commitBoxRest() {                    // xé nhanh toàn bộ pack còn lại của hộp: bỏ qua màn lật từng lá, ra thẳng bảng kết quả
        if (committed || view !== 'stage' || !tr) return;
        committed = true; g = null; target = 1; liftT = Math.max(liftT, .05);
        tr.classList.remove('is-drag', 'is-nudge'); tr.classList.add('is-torn');
        quick.classList.add('is-hidden'); boxBtn.classList.add('is-hidden');
        vib([12, 40, 24]); kick();
        const n = box ? box.left : BOX_PACKS, subs = Array.from({ length: n }, () => generatePack(cards, game.pack));
        if (!box || !box.started) startBoxCooldown();
        box = null;
        pack = subs.flat().sort(boxSort); pack._subs = subs; pack._god = subs.some(s => s._god);      // lá hiếm nhất lên đầu
        savePackToBinder();
        if (pack._god) godToast();
        sumDone = false; sumNewHTML = '';
        const my = epoch;
        setTimeout(() => { if (my === epoch && view === 'stage') showSummary(); }, 900);
    }

    document.addEventListener('pointerdown', e => {
        if (view !== 'stage' || committed || g || !e.isPrimary) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('button, select, a, input, label')) return;
        tr = $('#stagePack .tr'); if (!tr) return;
        g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, pw: tr.offsetWidth || 250, dir: 0, moved: 0, s: [{ x: e.clientX, t: performance.now() }] };
        tr.style.setProperty('--pw', g.pw + 'px');
        tr.classList.remove('is-nudge'); tr.classList.add('is-drag');
        kick();
    });

    window.addEventListener('pointermove', e => {
        if (!g || e.pointerId !== g.id || committed) return;
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        g.s.push({ x: e.clientX, t: performance.now() }); if (g.s.length > 8) g.s.shift();
        g.moved = Math.max(g.moved, Math.hypot(dx, dy));
        if (!g.dir || (Math.sign(dx) !== g.dir && Math.abs(dx) > 8 && tp < .03)) {   // khóa hướng vuốt (đổi ý ngay lúc đầu thì cho đổi hướng)
            if (Math.abs(dx) < 8) return;
            g.dir = td = Math.sign(dx);
        }
        target = clamp(dx * g.dir / (g.pw * TEAR.dist), 0, 1);
        liftT = clamp(-dy / g.pw, -.15, .25);      // kéo hơi lên trên thì nắp bật cao hơn
        kick();
        if (target >= TEAR.commit) commit();
    });

    const release = e => {
        if (!g || e.pointerId !== g.id) return;
        const gg = g; g = null;
        if (committed) return;
        tr.classList.remove('is-drag');
        const a = gg.s[0], b = gg.s[gg.s.length - 1];
        const v = b.t > a.t ? (b.x - a.x) * gg.dir / (b.t - a.t) : 0;     // vận tốc cuối (px/ms) theo hướng xé
        if (gg.moved < 6) {                                                 // chỉ chạm
            if (TEAR.tapTears && e.type === 'pointerup') return commit();
            nudge();
        } else if (e.type === 'pointerup' && (target >= TEAR.release || (v > TEAR.flick && target > .1))) {
            return commit();
        }
        target = 0; liftT = 0; kick();                                      // chưa đủ -> trả về
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);

    quick.onclick = commit; boxBtn.onclick = () => { if (committed) return; if (!box) { if (boxMsLeft() > 0) { rsToast(`Hộp ×${BOX_PACKS} mở lại sau ${fmtMs(boxMsLeft())} — xé lẻ từng pack thì không giới hạn.`); return; } box = { left: BOX_PACKS, setId: (list[cur] || {}).id }; boxRefresh(); } else commitBoxRest(); };
    w.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(); } });

    tearReset = () => {                           // gọi mỗi lần mở màn xé
        epoch++; cancelAnimationFrame(raf); raf = 0;
        g = null; committed = false; tp = target = lift = liftT = 0; td = 1;
        tr = $('#stagePack .tr');
        quick.classList.remove('is-hidden'); boxBtn.classList.remove('is-hidden');
        if (tr) tr.style.setProperty('--pw', tr.offsetWidth + 'px');
    };
}

// ---- xem từng lá: XẤP THẺ, vuốt lá trên cùng văng đi theo HƯỚNG NÀO CŨNG ĐƯỢC (trái / phải / lên / xuống / chéo) ----
// Chỉ thấy lá trên cùng (mặt trước). Các lá dưới úp, lộ mép phía sau như xấp bài thật -> không biết trước lá kế tiếp.
// Giữ lá kéo ra từ từ thì thấy lá bên dưới lộ dần; kéo đủ xa hoặc vuốt nhanh thì lá văng đi, thả sớm thì lá tự về chỗ cũ.
// Chạm lá trên cùng hoặc nút "Xem kỹ" = phóng to. Văng lá cuối = vào màn kết quả.
const SWIPE = {
    commit: .38,    // kéo quá bấy nhiêu × bề rộng thẻ rồi thả = văng đi (nhỏ hơn = nhạy hơn)
    flick: .45,     // vuốt nhanh hơn (px/ms) = văng đi dù kéo ngắn
    tilt: 14,       // độ xoay của thẻ khi kéo (độ ứng với 1 bề rộng thẻ)
    stackX: 10,     // độ lệch ngang giữa các lá trong xấp (px)
    stackY: 8       // độ lệch dọc giữa các lá trong xấp (px)
};

(function injectSwipeCSS() {
    const st = document.createElement('style');
    st.textContent = `
html.sw-on #reveal { overflow: clip; }
html.sw-on, html.sw-on body { touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; overflow-x: hidden; }
.sw { --cw: min(64vw, 300px, 42vh); position: relative; width: 100%; max-width: 720px; height: calc(var(--cw) / .716 + 64px); margin: 0 auto; touch-action: none; }
.sw-card { position: absolute; left: 50%; top: calc(50% - 14px); width: var(--cw); aspect-ratio: 63 / 88; will-change: transform; cursor: grab; }
.sw-card.top:active { cursor: grabbing; }
.sw.dealing .sw-card { transition: transform .6s cubic-bezier(.2,.9,.25,1), opacity .45s; transition-delay: calc(var(--k) * 45ms); }
.sw-face { position: absolute; inset: 0; border-radius: 5%; overflow: hidden; box-shadow: 0 10px 24px rgba(0,0,0,.45); }
.sw-face::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; background: rgba(0,0,0,var(--dim, 0)); }
.sw-back { display: grid; place-items: center; font-size: calc(var(--cw) * .3); color: rgba(255,255,255,.22);
    border: 2px solid color-mix(in srgb, var(--g1) 50%, transparent);
    background: repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 2px, transparent 2px 9px), linear-gradient(160deg, #17306e, #0a1740); }
.sw-front { background: #0b0f1a; display: none; }
.sw-card.is-front .sw-front { display: block; }
.sw-card.is-front .sw-back { display: none; }
.sw-front img, .sw-front .ph { width: 100%; height: 100%; object-fit: contain; display: block; pointer-events: none; -webkit-user-drag: none; }
.sw-front .ph { display: grid; place-items: center; text-align: center; padding: 12px; font-size: 13px; color: #cbd5e1; background: #111827; }
.sw-card.top.hit .sw-front { box-shadow: 0 0 0 2px var(--rc), 0 0 28px color-mix(in srgb, var(--rc) 55%, transparent); }
.sw-hint { position: absolute; left: 0; right: 0; bottom: 0; text-align: center; font-size: .85em; opacity: .75; pointer-events: none; }`;

    document.head.append(st);
})();

let swEls = [], swSeen = [], swX = 0, swY = 0, swVx = 0, swVy = 0, swTX = 0, swTY = 0, swFlyX = 0, swFlyY = 0;
let swMode = 'idle', swRaf = 0, swLast = 0, swCw = 240, swReady = false, swEpoch = 0;     // swMode: idle | drag | back | fly
const swClamp = (v, a, b) => Math.min(b, Math.max(a, v));
const swVib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* bỏ qua */ } };

function swBuild() {
    const old = $('#sw'); if (old) old.remove();
    const root = document.createElement('div');
    root.id = 'sw'; root.className = 'sw';
    swEls = pack.map((card, i) => {
        const t = tierOf(card.rarity);
        const el = document.createElement('div');
        el.className = 'sw-card' + (TIERS.indexOf(t) >= 2 ? ' hit' : '');
        el.style.setProperty('--rc', TIER_COLOR[t]);
        el.style.setProperty('--k', i);
        el.innerHTML = `<div class="sw-face sw-back">${esc(game.icon)}</div><div class="sw-face sw-front"></div>`;
        el.querySelector('.sw-front').append(imgEl(card), ...tagEls(card));
        if (card._grade) el.classList.add('graded');
        root.append(el);
        return el;
    });
    const hint = document.createElement('div'); hint.className = 'sw-hint';
    hint.textContent = 'Vuốt lá theo hướng nào cũng được · giữ kéo từ từ để xem lá bên dưới';
    root.append(hint);
    $('#flip').style.display = 'none';              // bỏ mặt lật cũ, giữ nguyên phần tên / độ hiếm / nút bên dưới
    $('#flip').before(root);
    return root;
}

function swRender(pre) {
    const dist = Math.hypot(swX, swY), r = Math.min(1, dist / (swCw * .6));          // lá trên cùng bị kéo ra bao nhiêu -> xấp bên dưới dồn lên
    swEls.forEach((el, i) => {
        const d = i - idx;
        if (d < 0) { el.style.display = 'none'; return; }
        el.style.display = '';
        el.classList.toggle('is-front', d <= 1);                  // chỉ lá trên cùng + lá ngay dưới có mặt trước (lá dưới bị che hoàn toàn)
        el.classList.toggle('top', d === 0);
        let tx, ty, rot = 0, op, dim = 0;
        if (d === 0) {
            tx = swX; ty = swY; rot = swClamp(swX / swCw * SWIPE.tilt, -24, 24);
            op = dist > swCw * 1.1 ? swClamp(1 - (dist - swCw * 1.1) / (swCw * 1.1), 0, 1) : 1;
        } else {
            const e = Math.max(1, d - r);
            tx = (e - 1) * SWIPE.stackX; ty = (e - 1) * SWIPE.stackY;
            op = swClamp(5 - (d - r), 0, 1);
            dim = Math.min(.5, (e - 1) * .14);
        }
        el.style.transform = `translate(-50%,-50%) translate(${tx.toFixed(1)}px,${(ty + (pre ? 90 : 0)).toFixed(1)}px) rotate(${rot.toFixed(2)}deg)${pre ? ' scale(.6)' : ''}`;
        el.style.opacity = pre ? 0 : op.toFixed(2);
        el.style.zIndex = 100 - d;
        el.style.setProperty('--dim', dim.toFixed(2));
    });
}

function swMeta() {
    const c = pack[idx]; if (!c) return;
    const t = tierOf(c.rarity), n = pack.length;
    $('#cName').textContent = c.name + (c.number ? ` · ${c.number}` : '');
    const b = $('#cRar');
    b.style.display = ''; b.style.setProperty('--rc', TIER_COLOR[t]);
    b.textContent = c.rarity + (c._grade ? ' · ' + gradeText(c._grade, c._co) : '') + (c._err ? ' · ⚠ ' + c._err : '');
    const pr = usdOf(c);
    if (pr != null && (c._grade || c._err)) $('#cName').textContent += ` · ${money(pr, 'USD')}`;
    $('#cCount').textContent = `${idx + 1} / ${n}`;
    $('#next').textContent = idx === n - 1 ? 'Xem kết quả' : 'Lá tiếp ›';
}

function swMarkSeen() {                               // chấm tiến độ: lá nào đã tới lượt thì sáng lên
    const dot = $('#strip').children[idx];
    if (!dot) return;
    dot.classList.add('on'); dot.style.setProperty('--rc', TIER_COLOR[tierOf(pack[idx].rarity)]);
}

function swCelebrate(i) {                            // lá hiếm lộ ra: nổ hiệu ứng + rung (mỗi lá 1 lần)
    if (swSeen[i]) return; swSeen[i] = true;
    const t = tierOf(pack[i].rarity), r = TIERS.indexOf(t);
    const special = !!pack[i]._err;
    if (r < 2 && !special) return;
    const b = $('#burst');
    b.style.setProperty('--rc', special && r < 2 ? '#fbbf24' : TIER_COLOR[t]);
    b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
    swVib(r >= 4 ? [14, 40, 28] : [10, 30, 16]);
}

function swFinish() {                                 // lá trên cùng đã bay khỏi màn hình
    swMode = 'idle'; swX = swY = swVx = swVy = 0;
    idx++;
    if (idx >= pack.length) { swRender(); showSummary(); return; }
    swRender(); swMeta(); swMarkSeen(); swCelebrate(idx);
}

function swLoop(now) {
    const dt = Math.min(.032, (now - swLast) / 1000); swLast = now;
    let keep = true;
    if (swMode === 'drag') {                          // bám tay nhưng có làm mượt nhẹ
        const k = 1 - Math.exp(-dt / .022);
        swX += (swTX - swX) * k; swY += (swTY - swY) * k;
        keep = Math.abs(swTX - swX) > .3 || Math.abs(swTY - swY) > .3;
    } else if (swMode === 'back') {                   // thả sớm: lò xo kéo về chỗ cũ
        const k = 260, c = 2 * Math.sqrt(k) * .82;
        swVx += (-k * swX - c * swVx) * dt; swX += swVx * dt;
        swVy += (-k * swY - c * swVy) * dt; swY += swVy * dt;
        if (Math.abs(swX) < .4 && Math.abs(swVx) < 8 && Math.abs(swY) < .4 && Math.abs(swVy) < 8) { swX = swY = swVx = swVy = 0; swMode = 'idle'; keep = false; }
    } else if (swMode === 'fly') {                    // văng ra ngoài màn hình
        const k = 1 - Math.exp(-dt / .14);
        swX += (swFlyX - swX) * k; swY += (swFlyY - swY) * k;
        if (Math.hypot(swFlyX - swX, swFlyY - swY) < Math.hypot(swFlyX, swFlyY) * .1) { swRaf = 0; swFinish(); return; }
    } else keep = false;
    swRender();
    swRaf = keep ? requestAnimationFrame(swLoop) : 0;
}
const swKick = () => { if (!swRaf) { swLast = performance.now(); swRaf = requestAnimationFrame(swLoop); } };
const swMeasure = () => { swCw = (swEls[0] && swEls[0].offsetWidth) || 240; };

function swFling(dx, dy) {                            // văng lá trên cùng theo hướng (dx, dy)
    if (view !== 'reveal' || !swReady || swMode === 'fly' || idx >= pack.length) return;
    let m = Math.hypot(dx, dy);
    if (!m) { dx = 1; dy = 0; m = 1; }
    const R = Math.hypot(innerWidth, innerHeight) * .55 + swCw;
    swFlyX = dx / m * R; swFlyY = dy / m * R;
    swMode = 'fly'; swVib(6); swKick();
}
const swGo = i => swFling(i < idx ? -1 : 1, 0);       // phím mũi tên trái / phải
function advance() { swFling(1, -.15); }              // nút "Lá tiếp" / phím cách: văng chếch lên bên phải

function startReveal() {
    sumDone = false; sumNewHTML = '';
    idx = 0; swSeen = pack.map(() => false); swEpoch++;
    cancelAnimationFrame(swRaf); swRaf = 0; swMode = 'idle'; swReady = false;
    swX = swY = swVx = swVy = swTX = swTY = 0;
    $('#strip').innerHTML = pack.map(() => '<i></i>').join('');
    const root = swBuild();
    show('reveal');
    swMeasure(); swRender(true); swMeta();            // vị trí xuất phát: cả xấp nằm thấp + nhỏ + trong suốt
    void root.offsetWidth;
    root.classList.add('dealing'); swRender();        // rồi bay vào thành xấp (so le theo thứ tự)
    const my = swEpoch;
    setTimeout(() => { if (my === swEpoch) { root.classList.remove('dealing'); swReady = true; } }, 900);
    setTimeout(() => { if (my === swEpoch && view === 'reveal') { swMarkSeen(); swCelebrate(0); } }, 650);
}

function initSwipe() {
    const root = $('#reveal');
    if (!$('#zoomBtn')) {                             // nút "Xem kỹ" bên cạnh nút "Lá tiếp"
        const nx = $('#next'), zb = document.createElement('button');
        zb.id = 'zoomBtn'; zb.type = 'button'; zb.className = nx.className; zb.textContent = '🔍 Xem kỹ';
        zb.onclick = () => { if (pack[idx]) zoom(pack[idx]); };
        nx.before(zb);
    }
    let g = null;
    root.addEventListener('pointerdown', e => {
        if (view !== 'reveal' || g || !e.isPrimary || !swReady || swMode === 'fly' || idx >= pack.length) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('button, a, select, input, label')) return;
        g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ox: swX, oy: swY, moved: 0, s: [{ x: e.clientX, y: e.clientY, t: performance.now() }] };
        swMode = 'drag'; swTX = swX; swTY = swY; swVx = swVy = 0; swKick();
    });
    window.addEventListener('pointermove', e => {
        if (!g || e.pointerId !== g.id) return;
        const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
        g.moved = Math.max(g.moved, Math.hypot(dx, dy));
        g.s.push({ x: e.clientX, y: e.clientY, t: performance.now() }); if (g.s.length > 8) g.s.shift();
        swTX = g.ox + dx; swTY = g.oy + dy;           // kéo tự do theo cả 2 trục
        swKick();
    });
    const end = e => {
        if (!g || e.pointerId !== g.id) return;
        const gg = g; g = null;
        const up = e.type === 'pointerup';
        if (gg.moved < 6) {                           // chỉ chạm: phóng to lá trên cùng
            swMode = 'back'; swKick();
            if (up && e.target.closest && e.target.closest('.sw-card')) zoom(pack[idx]);
            return;
        }
        const a = gg.s[0], b = gg.s[gg.s.length - 1];
        const dt = Math.max(1, b.t - a.t), vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;   // px/ms
        const dist = Math.hypot(swTX, swTY);
        const far = dist > swCw * SWIPE.commit;
        const flick = Math.hypot(vx, vy) > SWIPE.flick && dist > swCw * .08;
        if (up && (far || flick)) { swX = swTX; swY = swTY; if (flick) swFling(vx, vy); else swFling(swTX, swTY); return; }
        swMode = 'back'; swVx = 0; swVy = 0; swKick();                        // chưa đủ: về chỗ cũ
    };
    window.addEventListener('keydown', e => {
        if (view !== 'reveal') return;
        if (e.key === 'ArrowUp') { e.preventDefault(); swFling(0, -1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); swFling(0, 1); }
    });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('resize', () => { if (view === 'reveal') { swMeasure(); swRender(); } });
}

// ---- lưu pack vừa xé vào binder (BinderStore: lên Supabase khi đã đăng nhập, localStorage khi chưa) ----
// Trường theo binder-store.js: g/gn game · c mã lá · n tên · i/a ảnh · s/sn bộ · no số thẻ · r độ hiếm · k tier · u giá gốc USD · m hệ số giá · e lỗi
// (nếu pack.js của bạn đã tự gọi BinderStore.add ở chỗ khác thì xoá lời gọi savePackToBinder() trong commit() để khỏi lưu trùng)
function savePackToBinder() {
    if (!window.BinderStore) return;
    const todo = pack.filter(c => !c._bid);
    const rows = todo.map(c => {
        const mult = c._mult || 1, usd = usdOf(c);
        return { g: game.id, gn: game.name, c: c.code, n: c.name, i: c.image, a: c.imageAlt,
            s: c.setId, sn: c.setName, no: c.number, r: c.rarity, k: tierOf(c.rarity),
            u: usd == null ? undefined : +(usd / mult).toFixed(4), m: mult !== 1 ? mult : undefined, e: c._err };
    });
    if (BinderStore.addMany) BinderStore.addMany(rows).forEach((id, i) => { todo[i]._bid = id; });   // hộp 36 pack: ghi 1 lần thay vì 360 lần
    else rows.forEach((r, i) => { todo[i]._bid = BinderStore.add(r); });
}

// ---- tổng kết ----
const STATS_KEY = 'pack_stats_v1', COLL_KEY = 'pack_collection_v1';
function readLS(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
function writeLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } }

let sumNewHTML = '';
let activeGradeCard = null;
// ---- MÀN TỔNG KẾT: bố cục 2 cột (trái: kết quả + lá hit to nhất · phải: cả pack + chấm điểm) ----
const SUMMARY = {
                                   // (giá pack: xem PACK_PRICES ở đầu file)
    groupUrl: '',                  // link nhóm cộng đồng (Facebook/Zalo...). Để trống = ẩn banner "than thở"
    leaderboardUrl: ''             // link bảng xếp hạng. Để trống = ẩn
};
let challengeBeat = 0;             // ?beat=123.45 trên URL = lời thách đấu của bạn bè (phải xé ra hơn số này)
let currentCo = 'PSA';
let sumRes = { cost: 0, fees: 0, before: 0 };   // cost = giá pack, fees = phí chấm đã trả, before = điểm tích luỹ trước pack này

const dayKey = () => new Date().toLocaleDateString('en-CA');
const byValue = (a, b) => (usdOf(b) ?? 0) - (usdOf(a) ?? 0) || rankOf(b) - rankOf(a);
function packPriceInfo(s) {                      // -> { v: giá USD, src: nguồn giá }
    s = s || {};
    const pos = x => { x = Number(x); return x > 0 ? x : 0; };
    let v;
    if ((v = pos(SERVER_PRICES[`${game.id}|${s.id}`]))) return { v, src: 'admin đặt' };
    if ((v = pos(s.packPrice))) return { v, src: 'theo bộ' };
    if ((v = pos(PACK_PRICES.bySet[s.id]))) return { v, src: 'theo bộ' };
    const base = pos(PACK_PRICES.byGame[game.id]) || pos(PACK_PRICES.default) || 4.5, m = oldSetMult(s.date);
    const price = m > 1.05 ? (base * m >= 100 ? Math.round(base * m) : +(base * m).toFixed(2)) : base;
    const srcName = pos(PACK_PRICES.byGame[game.id]) ? 'theo game' : 'mặc định';
    return { v: price, src: m > 1.05 ? `${srcName} · bộ cũ ×${m < 10 ? m.toFixed(1) : Math.round(m)}` : srcName };
}
function packPriceOf() { return packPriceInfo(list[cur]).v; }
async function editPackPrice(s, done) {
    if (!isAdmin()) { alert('Chỉ admin mới đổi được giá pack.'); return; }
    if (!window.sb) { alert('Chưa cấu hình Supabase nên không lưu được giá.'); return; }
    const info = packPriceInfo(s);
    const raw = prompt(`Giá 1 pack "${shortName(s)}" (USD) — áp dụng cho MỌI người chơi.\nĐang dùng: ${info.v} (${info.src}).\nĐể trống = xoá giá admin, về giá gốc.`, info.v);
    if (raw === null) return;
    const txt = String(raw).trim(), n = parseFloat(txt.replace(',', '.')), key = `${game.id}|${s.id}`;
    try {
        if (!txt) {
            const { error } = await window.sb.from('pack_prices').delete().eq('game', game.id).eq('set_id', s.id);
            if (error) throw error;
            delete SERVER_PRICES[key];
        } else if (n > 0 && n < 100000) {
            const price = +n.toFixed(2);
            const { error } = await window.sb.from('pack_prices').upsert({ game: game.id, set_id: String(s.id), price, updated_at: new Date().toISOString() }, { onConflict: 'game,set_id' });
            if (error) throw error;
            SERVER_PRICES[key] = price;
        } else { alert('Giá không hợp lệ.'); return; }
    } catch (e) { alert('Không lưu được giá: ' + (e.message || e) + '\n(Bảng pack_prices đã tạo và tài khoản đã được cấp role admin chưa?)'); return; }
    if (done) done();
}

(function injectSummaryCSS() {
    const st = document.createElement('style');
    st.textContent = `
.rs { display: grid; grid-template-columns: minmax(0, .82fr) minmax(0, 1.18fr); gap: 18px; align-items: start; margin-top: 6px; text-align: left; }
.rs-left { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
.rs-kicker { font-size: 10.5px; font-weight: 800; letter-spacing: .2em; color: var(--g1); opacity: .9; }
.rs-title { margin: 0; font-size: clamp(26px, 4.2vw, 36px); line-height: 1.05; font-weight: 900; color: var(--g1);
    -webkit-text-stroke: 1.5px #7a4b00; paint-order: stroke fill; text-shadow: 0 3px 0 #7a4b00, 0 6px 14px #000a; }
.rs-score { width: 100%; border: 2px solid var(--line); border-radius: 16px; padding: 8px 10px 9px; background: #0d142b; }
.rs-score.neg { border-color: #ef4444; background: radial-gradient(120% 140% at 50% 0, #ef444428, #0b1226 70%); box-shadow: 0 0 18px #ef444433; }
.rs-score.pos { border-color: #22c55e; background: radial-gradient(120% 140% at 50% 0, #22c55e26, #0b1226 70%); box-shadow: 0 0 18px #22c55e33; }
.rs-score small { display: block; font-size: 10px; font-weight: 800; letter-spacing: .18em; color: var(--muted); }
.rs-score.neg small { color: #fca5a5; } .rs-score.pos small { color: #86efac; }
.rs-score > b { display: block; font-size: clamp(26px, 4vw, 34px); font-weight: 900; line-height: 1.1; }
.rs-score.neg > b { color: #ff6b81; } .rs-score.pos > b { color: #4ade80; }
.rs-score em { display: block; font-style: normal; font-size: 11.5px; color: var(--muted); margin-top: 2px; }
.rs-score em s { opacity: .7; } .rs-score em b { color: var(--text); }
.rs-quip { display: flex; align-items: flex-end; gap: 8px; width: 100%; text-align: left; }
.rs-mascot { flex: none; width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; background: linear-gradient(160deg, #16213f, #0b1226); border: 2px solid var(--line); }
.rs-quip p { margin: 0; padding: 8px 12px; border-radius: 14px 14px 14px 4px; background: #f1f5fb; color: #0a1020; font-size: 12.5px; line-height: 1.35; font-weight: 600; }
.rs-hero { position: relative; width: min(100%, 230px); aspect-ratio: 63 / 88; border-radius: 5%; cursor: zoom-in; background: #0b0f1a;
    box-shadow: 0 0 0 2px var(--rc), 0 0 34px color-mix(in srgb, var(--rc) 65%, transparent), 0 18px 30px #000b; }
.rs-img { position: absolute; inset: 0; overflow: hidden; border-radius: inherit; }
.rs-img img, .rs-img .ph { width: 100%; height: 100%; object-fit: contain; display: block; -webkit-user-drag: none; }
.rs-img .ph { font-size: 11px; padding: 6px; }
.rs-cap { font-size: 13px; color: var(--muted); } .rs-cap b { color: var(--text); }
.rs-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
.rs-th { position: relative; aspect-ratio: 63 / 88; border-radius: 6%; cursor: zoom-in; background: #0b0f1a; transition: transform .15s;
    box-shadow: 0 0 0 2px var(--rc), 0 0 10px color-mix(in srgb, var(--rc) 40%, transparent); }
.rs-th:hover { transform: translateY(-3px) scale(1.04); z-index: 2; }
.rs-th .slab-tag, .rs-th .err-tag { font-size: 8px; padding: 1px 4px; left: 3px; }
.rs-th .slab-tag { top: 3px; } .rs-th .err-tag { bottom: 3px; }
.rs-hero .slab-tag { top: 8px; left: 8px; } .rs-hero .err-tag { bottom: 8px; left: 8px; }
.rs-hint { text-align: center; font-size: 11.5px; color: var(--muted); margin: 8px 0 10px; }
.rs-stats { display: grid; grid-template-columns: repeat(3, 1fr); border: 1px solid var(--line); border-radius: 12px; background: #0d142b; overflow: hidden; }
.rs-stats > div { padding: 8px 6px; text-align: center; } .rs-stats > div + div { border-left: 1px solid var(--line); }
.rs-stats small { display: block; font-size: 10px; letter-spacing: .12em; color: var(--muted); font-weight: 700; }
.rs-stats b { display: block; font-size: clamp(15px, 2.4vw, 19px); font-weight: 900; }
.rs-fee { text-align: center; font-size: 11px; color: var(--muted); margin-top: 4px; }
.rs-life { text-align: center; font-size: 11.5px; color: var(--muted); margin: 8px 0 4px; }
.rs-banner { display: block; margin: 8px 0; padding: 9px 12px; border: 1px solid #2a75bb; border-radius: 12px; background: #0d1f3a; color: #9ecbff; font-weight: 700; font-size: 13px; text-align: center; text-decoration: none; }
.rs-today { text-align: center; font-size: 12px; color: var(--muted); margin: 4px 0 8px; } .rs-today a { color: var(--g1); font-weight: 700; text-decoration: none; }
.rs-bet { margin: 8px 0; padding: 8px 12px; border-radius: 12px; font-size: 12.5px; text-align: center; border: 1px solid var(--line); background: #0d142b; }
.rs-bet.win { border-color: #22c55e; color: #86efac; } .rs-bet.lose { border-color: #ef4444; color: #fca5a5; }
.rs-share { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 10px 12px; margin: 8px 0; border-radius: 12px; border: 1px solid #92400e; background: linear-gradient(160deg, #2a1a0c, #14101a); color: var(--text); }
.rs-share-ic { font-size: 22px; } .rs-share b { display: block; font-size: 13.5px; color: #fdba74; } .rs-share small { display: block; font-size: 11.5px; color: var(--muted); font-weight: 400; }
.rs-share-go { margin-left: auto; font-size: 18px; color: #fdba74; }
.rs-grade { margin-top: 10px; border: 1px solid var(--line); border-radius: 14px; background: linear-gradient(160deg, #16213f, #0b1226); padding: 12px; }
.rs-g-head { display: flex; align-items: center; gap: 10px; }
.rs-g-logo { flex: none; width: 34px; height: 34px; border-radius: 9px; background: #fff; color: #e11d48; border: 2px solid #f97316; display: grid; place-items: center; font-weight: 900; font-size: 11px; }
.rs-g-head b { display: block; font-size: 14px; } .rs-g-head small { display: block; color: var(--muted); font-size: 11px; line-height: 1.3; }
.rs-g-fee { margin-left: auto; font-weight: 900; color: #fdba74; white-space: nowrap; } .rs-g-fee i { font-style: normal; font-size: 11px; opacity: .7; margin-left: 2px; }
.rs-g-cos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
.rs-g-co { text-align: left; padding: 8px 10px; border-radius: 10px; line-height: 1.3; background: var(--panel); border: 1px solid var(--line); color: var(--text); cursor: pointer; }
.rs-g-co b { display: block; font-size: 14px; } .rs-g-co small { color: var(--muted); font-size: 11px; }
.rs-g-co.on { border-color: #f97316; background: #2a1612; }
.rs-g-bar { display: flex; gap: 2px; height: 8px; border-radius: 4px; overflow: hidden; } .rs-g-bar i { display: block; min-width: 3px; }
.rs-g-lbl { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 2px 10px; margin: 6px 0 10px; font-size: 11px; color: var(--muted); } .rs-g-lbl span { white-space: nowrap; }
.rs-gsel { display: flex; gap: 6px; overflow-x: auto; padding: 2px 0 8px; }
.rs-gsel button { position: relative; flex: none; width: 42px; padding: 0; border: 2px solid transparent; border-radius: 6px; overflow: hidden; background: #0c1426; aspect-ratio: 63 / 88; }
.rs-gsel button.on { border-color: #f97316; }
.rs-gsel .slab-tag, .rs-gsel .err-tag, .rs-g-th .err-tag, .rs-g-th .slab-tag { display: none; }
.rs-g-card { border: 1px solid var(--line); border-radius: 12px; background: #080e1e; padding: 10px; }
.rs-g-top { display: flex; gap: 10px; align-items: center; }
.rs-g-th { position: relative; width: 46px; flex: none; aspect-ratio: 63 / 88; border-radius: 5px; overflow: hidden; background: #0c1426; }
.rs-g-info { min-width: 0; } .rs-g-info > b { display: block; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rs-g-sub { font-size: 11.5px; color: var(--muted); margin-top: 1px; } .rs-g-sub b { color: var(--text); }
.rs-g-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 5px; }
.rs-g-chips span { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 999px; background: #3b2a10; color: #fde68a; border: 1px solid #92400e; }
.rs-g-bot { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 6px; margin-top: 10px; align-items: stretch; }
.rs-g-out { border: 1px solid var(--line); border-radius: 9px; padding: 6px 2px; text-align: center; background: #0b1226; }
.rs-g-out small { display: block; font-size: 10px; font-weight: 800; } .rs-g-out b { display: block; font-size: 13px; } .rs-g-out em { font-style: normal; font-size: 10.5px; font-weight: 700; }
.rs-g-go { padding: 0 14px; border: 0; border-radius: 10px; font-weight: 800; font-size: 13px; color: #fff; background: linear-gradient(135deg, #fb7185, #f97316); cursor: pointer; line-height: 1.25; }
.rs-g-go small { display: block; font-size: 10.5px; font-weight: 600; opacity: .9; }
.rs-g-note { color: var(--muted); font-size: 10.5px; line-height: 1.45; margin-top: 9px; }
.rs-g-none { margin-top: 10px; padding: 12px; border: 1px dashed var(--line); border-radius: 12px; color: var(--muted); font-size: 12px; text-align: center; }
.rs-saved { margin: 12px 0 8px; padding: 8px 12px; border: 1px solid #166534; border-radius: 10px; background: #0b2016; color: #86efac; font-size: 12.5px; text-align: center; }
.rs-foot { color: var(--muted); font-size: 10.5px; line-height: 1.5; margin: 0 0 12px; }
.rs-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.rs-actions .primary { flex: 1.6; min-width: 140px; } .rs-actions button:not(.primary) { flex: 1; min-width: 84px; }
.rs-gbtn { position: relative; border-color: #ef444466 !important; }
.rs-gbtn i { position: absolute; top: -7px; right: -5px; min-width: 18px; height: 18px; border-radius: 9px; background: #ef4444; color: #fff; font-style: normal; font-size: 11px; font-weight: 800; display: grid; place-items: center; padding: 0 4px; }
@media (max-width: 640px) { .rs { grid-template-columns: 1fr; } .rs-hero { width: min(60%, 210px); } }`;
    document.head.append(st);
})();

function summaryTitle(best) {
    const r = rankOf(best);
    if (r >= 5) return 'Thần Tài gõ cửa!';
    if (r === 4) return 'Hit đẹp đấy!';
    if (r === 3) return 'Ra hàng rồi!';
    if (r === 2) return 'Có quà nho nhỏ';
    return 'Pack trắng tay';
}
function summaryQuip(net, blank, hasPrice) {
    if (!hasPrice) return blank ? 'Pack này toàn lá thường. Thôi xé tiếp cho đỡ buồn.' : 'Game này chưa có dữ liệu giá nên chưa tính được lời lỗ.';
    const a = money(Math.abs(net), 'USD'), cost = sumRes.cost;
    if (net >= cost * 3) return `Lời ${a}! Hôm nay đi mua trà sữa mời cả nhóm.`;
    if (net > 0) return `Lời ${a}. Hôm nay là ngày của bạn.`;
    if (blank) return `Trắng tay, mất ${a}. Pack này chỉ có sự trong trẻo.`;
    if (net > -cost * .15) return `Hoà hoà vốn, mất có ${a}. Coi như chưa có gì xảy ra.`;
    if (net > -cost * .6) return `${a} bay màu. Chưa đến nỗi, xé tiếp gỡ lại.`;
    return `${a} đi tong. Ví giờ nhẹ như lông vũ.`;
}
function rsToast(msg) {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
    const t = document.createElement('div'); t.className = 'toast';
    t.innerHTML = `<span class="t-ic">🔗</span><div><b>${esc(msg)}</b></div>`;
    box.append(t); setTimeout(() => t.classList.add('out'), 2400); setTimeout(() => t.remove(), 2900);
}
async function shareChallenge(value) {                    // "Ra kèo": gửi link thách bạn bè xé đúng pack này
    const q = new URLSearchParams({ game: game.id }), s = list[cur];
    if (s && s.id) q.set('set', s.id);
    q.set('beat', value.toFixed(2));
    const url = `${location.origin}${location.pathname}?${q}`;
    const text = `Mình xé ${s ? shortName(s) : game.name} ra ${money(value, 'USD')} — dám xé hơn mình không?`;
    try { if (navigator.share) { await navigator.share({ title: 'Thách xé pack', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(`${text}\n${url}`); rsToast('Đã chép link thách đấu — dán cho bạn bè nhé'); } catch (e) { rsToast(url); }
}
const pctTxt = p => p < .005 ? '<1%' : p < .1 ? (p * 100).toFixed(1) + '%' : Math.round(p * 100) + '%';

function renderSummary() {
    const st = readLS(STATS_KEY, {});
    const priced = pack.filter(c => usdOf(c) != null), hasPrice = priced.length > 0;
    const value = priced.reduce((s, c) => s + usdOf(c), 0);
    const { cost, fees } = sumRes;
    const net = value - cost - fees, after = sumRes.before + net, pos = net >= 0;
    const best = [...pack].sort(byValue)[0] || pack[0];
    const blank = pack.every(c => rankOf(c) < 2);
    const gradeable = pack.filter(canGrade).sort(byValue);
    if (!activeGradeCard || !pack.includes(activeGradeCard) || !canGrade(activeGradeCard)) activeGradeCard = gradeable[0] || null;
    const today = (st.days || {})[dayKey()] || 0;
    const collN = Object.values(readLS(COLL_KEY, {})).reduce((s, n) => s + n, 0);
    const bi = pack.indexOf(best), rcOf = c => TIER_COLOR[tierOf(c.rarity)];

    // ----- cột trái -----
    const left = `<div class="rs-left">
        <div class="rs-kicker">KẾT QUẢ ${pack._subs && pack._subs.length > 1 ? pack._subs.length + ' PACK' : 'PACK'}</div>
        <h2 class="rs-title">${esc(summaryTitle(best))}</h2>
        ${hasPrice
            ? `<div class="rs-score ${pos ? 'pos' : 'neg'}"><small>${pos ? 'CỘNG ĐIỂM' : 'TRỪ ĐIỂM'}</small><b>${sgn(net)}</b><em>Điểm <s>${money(sumRes.before, 'USD')}</s> → <b>${money(after, 'USD')}</b></em></div>`
            : `<div class="rs-score"><small>ĐIỂM</small><b>—</b><em>Game này chưa có dữ liệu giá</em></div>`}
        <div class="rs-quip"><span class="rs-mascot">🦉</span><p>${esc(summaryQuip(net, blank, hasPrice))}</p></div>
        <div class="rs-hero" style="--rc:${rcOf(best)}" data-zoom="${bi}"><div class="rs-img" data-i="${bi}"></div></div>
        <div class="rs-cap"><b>${esc(best.name)}</b> · ${esc(best.rarity)}${usdOf(best) != null ? ` · <span class="pos">${money(usdOf(best), 'USD')}</span>` : ''}</div>
    </div>`;

    // ----- khối chấm điểm -----
    let grade = '';
    if (activeGradeCard) {
        const c = activeGradeCard, ci = pack.indexOf(c), raw = usdOf(c), fee = GRADING.fee[currentCo], dist = gradeDist(c, currentCo);
        const [f, b] = c._ctr || [50, 50];
        const ev = raw == null ? null : dist.reduce((s, [g, p]) => s + p * raw * gradeMult(g, currentCo), 0) - raw - fee;
        const bar = dist.map(([g, p]) => `<i style="flex:${Math.max(p, .004).toFixed(4)};background:${gradeColor(g)}"></i>`).join('');
        const lbl = dist.map(([g, p]) => `<span><b style="color:${gradeColor(g)}">${g}</b> ${pctTxt(p)}</span>`).join('');
        const outs = dist.slice(0, 3).map(([g]) => {
            const val = raw == null ? null : raw * gradeMult(g, currentCo), d = val == null ? null : val - raw - fee;
            return `<div class="rs-g-out"><small style="color:${gradeColor(g)}">${currentCo} ${g}</small>`
                + (val == null ? `<b>×${gradeMult(g, currentCo).toFixed(2)}</b>` : `<b>${money(val, 'USD')}</b><em class="${d >= 0 ? 'pos' : 'neg'}">${sgn(d)}</em>`) + '</div>';
        }).join('');
        const chips = [];
        if (ev != null) chips.push(ev >= 0 ? `🍀 Kèo thơm ${sgn(ev)}` : `⚡ Hên xui ${sgn(ev)}`);
        chips.push(`💎 ${currentCo} 10 · ${pctTxt(dist[0][1])}`);
        if (c._err) chips.push(`⚠ ${esc(c._err)}`);
        const sel = gradeable.length > 1
            ? `<div class="rs-gsel">${gradeable.map(x => `<button type="button" data-pick="${pack.indexOf(x)}" class="${x === c ? 'on' : ''}" style="--rc:${rcOf(x)}"><div class="rs-img" data-i="${pack.indexOf(x)}"></div></button>`).join('')}</div>` : '';
        grade = `<div class="rs-grade">
            <div class="rs-g-head"><span class="rs-g-logo">${currentCo}</span><div><b>Gửi chấm điểm</b><small>Một lá chỉ chấm một lần — chọn PSA hoặc TAG · lá đã chấm vẫn giữ được</small></div><span class="rs-g-fee">${money(fee, 'USD')}<i>/lá</i></span></div>
            <div class="rs-g-cos">
                <button type="button" class="rs-g-co${currentCo === 'PSA' ? ' on' : ''}" data-co="PSA"><b>PSA</b><small>${money(GRADING.fee.PSA, 'USD')} · điểm nguyên · giá slab cao nhất</small></button>
                <button type="button" class="rs-g-co${currentCo === 'TAG' ? ' on' : ''}" data-co="TAG"><b>TAG</b><small>${money(GRADING.fee.TAG, 'USD')} · phí rẻ · có nửa điểm</small></button>
            </div>
            <div class="rs-g-bar">${bar}</div><div class="rs-g-lbl">${lbl}</div>
            ${sel}
            <div class="rs-g-card">
                <div class="rs-g-top"><div class="rs-g-th"><div class="rs-img" data-i="${ci}"></div></div>
                    <div class="rs-g-info"><b>${esc(c.name)}</b>
                        <div class="rs-g-sub">${raw != null ? `Đang <b>${money(raw, 'USD')}</b> · ` : ''}Lề ${f}/${100 - f} · ${b}/${100 - b}</div>
                        <div class="rs-g-chips">${chips.map(x => `<span>${x}</span>`).join('')}</div></div></div>
                <div class="rs-g-bot">${outs}<button type="button" class="rs-g-go" id="rsGo">Chấm ${currentCo}<small>${money(fee, 'USD')}</small></button></div>
            </div>
            <div class="rs-g-note">${raw == null ? 'Game này chưa có dữ liệu giá nên chỉ hiện hệ số nhân. ' : ''}Điểm phụ thuộc độ lệch tâm của từng lá · hệ số giá slab do trang tự đặt, chỉ để chơi (không phải giá thật) · lời/lỗ đã trừ phí chấm.</div>
        </div>`;
    } else {
        grade = `<div class="rs-g-none">Pack này chưa có lá nào đủ điều kiện chấm (độ hiếm ${esc(GRADING.minTier)} trở lên, hoặc giá từ ${money(GRADING.minUsd, 'USD')}, hoặc lá lỗi).</div>`;
    }

    // ----- cột phải -----
    const grid = pack.map((c, i) => `<div class="rs-th" style="--rc:${rcOf(c)}" data-zoom="${i}"><div class="rs-img" data-i="${i}"></div></div>`).join('');
    const stats = hasPrice ? `<div class="rs-stats">
            <div><small>GIÁ PACK</small><b>${money(cost, 'USD')}</b></div>
            <div><small>XÉ RA</small><b>${money(value, 'USD')}</b></div>
            <div><small>${pos ? 'LỜI' : 'LỖ'}</small><b class="${pos ? 'pos' : 'neg'}">${sgn(net)}</b></div></div>
        ${fees ? `<div class="rs-fee">đã gồm phí chấm ${money(fees, 'USD')}</div>` : ''}` : '';
    const life = `Đã xé ${st.packs || 0} pack · trắng tay ${st.blanks || 0} lần${st.jackpots ? ` · ${st.jackpots} lần trúng đậm` : ''}`;
    const banner = SUMMARY.groupUrl && hasPrice && !pos
        ? `<a class="rs-banner" href="${esc(SUMMARY.groupUrl)}" target="_blank" rel="noopener">Lỗ ${money(-net, 'USD')}? Vào nhóm than thở cùng anh em ›</a>` : '';
    const todayRow = hasPrice
        ? `<div class="rs-today">Điểm hôm nay <b class="${today >= 0 ? 'pos' : 'neg'}">${sgn(today)}</b>${SUMMARY.leaderboardUrl ? ` · <a href="${esc(SUMMARY.leaderboardUrl)}" target="_blank" rel="noopener">Xem bảng xếp hạng ›</a>` : (window.Auth && Auth.canLeaderboard ? ` · <a href="#" id="rsLb">Xem bảng xếp hạng ›</a>` : '')}</div>` : '';
    const bet = challengeBeat > 0 && hasPrice
        ? `<div class="rs-bet ${value > challengeBeat ? 'win' : 'lose'}">🎯 Kèo bạn bè: phải xé ra hơn ${money(challengeBeat, 'USD')} — bạn được ${money(value, 'USD')} → <b>${value > challengeBeat ? 'THẮNG KÈO!' : 'Thua kèo'}</b></div>` : '';
    const share = hasPrice ? `<button type="button" class="rs-share" id="rsShare"><span class="rs-share-ic">🤝</span><span><b>Ra kèo · thách bạn bè xé pack này</b><small>Ai xé ra hơn ${money(value, 'USD')} là thắng — gửi link cho bạn bè</small></span><span class="rs-share-go">↗</span></button>` : '';
    const so = packSummary(game.pack).odds.map(([t, w]) => `${t} ${Math.round(w * 100)}%`).join(' · ');

    const right = `<div class="rs-right">
        <div class="rs-grid">${grid}</div>
        <div class="rs-hint">Chạm vào lá bài để xem kỹ</div>
        ${stats}${bet}
        <div class="rs-life">${life}</div>
        ${banner}${todayRow}${share}
        ${grade}
        ${sumNewHTML ? `<div class="sum-stats" style="margin-top:12px">${sumNewHTML}</div>` : ''}
        <div class="rs-saved">✓ Đã lưu pack vào bộ sưu tập · ${collN} lá</div>
        <p class="rs-foot">Tỉ lệ ước lượng cho slot hiếm nhất: ${so}. Giá lá lấy từ nguồn giá của dữ liệu; pack tính ${money(cost, 'USD')} do trang tự đặt. Chỉ để giải trí — không phải tỉ lệ hay giá chính thức của hãng.</p>
        <div class="rs-actions">
            <button id="again2" class="primary big">Xé thêm 1 pack ✦</button>
            <button id="rsGrade" type="button" class="rs-gbtn">🏅 Chấm${gradeable.length ? `<i>${gradeable.length}</i>` : ''}</button>
            <button id="pickOther2">Đóng</button>
        </div>
    </div>`;

    const root = $('#summary');
    root.innerHTML = `<div class="rs">${left}${right}</div>`;
    const gridEl = root.querySelector('.rs-grid'), SHOW_TOP = 20;       // hộp nhiều lá: chỉ hiện 20 lá đầu (hiếm/đắt nhất), còn lại bấm "Xem thêm"
    if (gridEl && gridEl.children.length > SHOW_TOP) {
        const extra = [...gridEl.children].slice(SHOW_TOP); extra.forEach(el => { el.hidden = true; });
        const more = Object.assign(document.createElement('button'), { type: 'button', className: 'rs-more', textContent: `Xem thêm ${extra.length} lá còn lại ▾` });
        more.onclick = () => { const open = extra[0].hidden; extra.forEach(el => { el.hidden = !open; }); more.textContent = open ? 'Thu gọn ▴' : `Xem thêm ${extra.length} lá còn lại ▾`; };
        gridEl.after(more);
    }
    root.querySelectorAll('.rs-img').forEach(el => { const c = pack[+el.dataset.i]; if (c) el.append(imgEl(c), ...tagEls(c)); });
    root.querySelectorAll('[data-zoom]').forEach(el => { el.onclick = () => { const c = pack[+el.dataset.zoom]; if (c && c.image) zoom(c); }; });
    root.querySelectorAll('.rs-g-co').forEach(b => { b.onclick = () => { currentCo = b.dataset.co; renderSummary(); }; });
    root.querySelectorAll('[data-pick]').forEach(b => { b.onclick = () => { activeGradeCard = pack[+b.dataset.pick]; renderSummary(); }; });
    const go = $('#rsGo'); if (go) go.onclick = () => openGrade(activeGradeCard, currentCo);
    $('#rsGrade').onclick = () => { if (activeGradeCard) openGrade(activeGradeCard, currentCo); else rsToast('Pack này chưa có lá nào đủ điều kiện chấm'); };
    const sh = $('#rsShare'); if (sh) sh.onclick = () => shareChallenge(value);
    const lb = $('#rsLb'); if (lb) lb.onclick = e => { e.preventDefault(); Auth.openLeaderboard(); };
    $('#again2').onclick = openStage;
    $('#pickOther2').onclick = backToPicker;
}

function showSummary() {
    // sumDone: "Lật tất cả" và lá cuối cùng đều gọi showSummary -> chỉ ghi thống kê + thành tích 1 lần cho mỗi pack
    const fresh = !sumDone; sumDone = true;
    if (fresh) {
        const counts = {};
        pack.forEach(c => { const t = tierOf(c.rarity); counts[t] = (counts[t] || 0) + 1; });
        const priced = pack.filter(c => usdOf(c) != null);
        const total = priced.reduce((s, c) => s + usdOf(c), 0);
        const st = readLS(STATS_KEY, { packs: 0, value: 0 }), coll = readLS(COLL_KEY, {});
        const subs = pack._subs || [pack], nPk = subs.length, cost = priced.length ? packPriceOf() * nPk : 0, net0 = priced.length ? total - cost : 0;
        const dk = dayKey(), before = st.net || 0;
        st.packs += nPk; st.value += total;
        st.cost = (st.cost || 0) + cost; st.net = before + net0;                 // điểm xếp hạng = lời/lỗ tích luỹ
        st.days = st.days || {}; st.days[dk] = (st.days[dk] || 0) + net0;
        Object.keys(st.days).sort().slice(0, -30).forEach(k => delete st.days[k]);
        const nBlank = subs.filter(s => s.every(c => rankOf(c) < 2)).length, nJack = subs.filter(s => s.some(c => rankOf(c) >= 5)).length, nGod = subs.filter(s => s._god).length;
        if (nBlank) st.blanks = (st.blanks || 0) + nBlank;
        if (nJack) st.jackpots = (st.jackpots || 0) + nJack;
        if (nGod) st.gods = (st.gods || 0) + nGod;
        writeLS(STATS_KEY, st);
        if (window.Wallet) Wallet.refresh();
        sumRes = { cost, fees: 0, before };
        pack.forEach(c => { const k = `${game.id}|${c.code}`; coll[k] = (coll[k] || 0) + 1; });
        writeLS(COLL_KEY, coll);
        const topCard = priced.length ? priced.reduce((a, c) => usdOf(c) > usdOf(a) ? c : a) : null;
        const got = recordAchievements({ counts, total, topCard, blank: nBlank > 0, errors: pack.filter(c => c._err).length }, st, coll);
        if (got.length) { sumNewHTML += achChips(got); toastAch(got); }
        if (nPk > 1) sumNewHTML = `<span class="ach-new">📦 Hộp ×${nPk}: ${nBlank} pack trắng · ${nJack} jackpot${nGod ? ' · 🌟 ' + nGod + ' GOD PACK' : ''}</span>` + sumNewHTML;
        else if (nGod) sumNewHTML = '<span class="ach-new">🌟 GOD PACK!</span>' + sumNewHTML;
        refreshAchBtn();
        if (window.PlayerSync) PlayerSync.push();                                // thống kê / thành tích / bộ sưu tập -> Supabase
    }
    renderSummary();
    show('summary');
}

// ---- gửi chấm điểm (PSA / TAG) ----
function erf(x) {
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + .3275911 * x);
    return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x));
}
const Phi = z => .5 * (1 + erf(z / Math.SQRT2));
const sgn = v => (v >= 0 ? '+' : '−') + money(Math.abs(v), 'USD');
// Lá chưa chấm + (đủ độ hiếm, hoặc đủ giá, hoặc là lá lỗi) -> phân loại độ hiếm sai cũng không làm mất nút chấm
const canGrade = c => !c._grade && (rankOf(c) >= TIERS.indexOf(GRADING.minTier) || (usdOf(c) ?? 0) >= GRADING.minUsd || !!c._err);
const ctrQual = c => { const [f, b] = c._ctr || [50, 50]; return Math.max(0, Math.min(1, 1 - ((f - 50) / 20 * .6 + (b - 50) / 25 * .4))); };
const gradeMu = c => GRADING.base + GRADING.span * ctrQual(c);
// phân bố điểm [[điểm, xác suất], ...] từ cao xuống thấp; PSA bước 1, TAG bước 0.5 (đỉnh 10 khó hơn vì cần ≥ 9.75)
function gradeDist(c, co) {
    const step = co === 'TAG' ? .5 : 1, h = step / 2, mu = gradeMu(c), sd = GRADING.sd, out = [];
    for (let g = 10; g >= 5; g -= step) {
        const hi = g >= 10 ? 1 : Phi((g + h - mu) / sd), lo = g <= 5 ? 0 : Phi((g - h - mu) / sd);
        out.push([g, hi - lo]);
    }
    return out;
}
function gradeMult(g, co) {
    const m = GRADING.mult, lo = Math.floor(g), hi = Math.ceil(g);
    const v = lo === hi ? m[lo] : m[lo] + (m[hi] - m[lo]) * (g - lo);
    return v * (co === 'TAG' ? GRADING.tagMult : 1);
}
function rollGrade(c, co) {
    const step = co === 'TAG' ? .5 : 1, x = gradeMu(c) + GRADING.sd * gauss();
    return Math.min(10, Math.max(5, Math.round(x / step) * step));
}
function applyGrade(c, co, g) {
    c._co = co; c._grade = g; c._mult = (c._errMult || 1) * gradeMult(g, co);
    if (c._bid && window.BinderStore) BinderStore.update(c._bid, { co, gr: g, m: c._mult !== 1 ? c._mult : undefined });   // ghi điểm chấm + hệ số giá vào binder
}
const gradeColor = g => { const f = Math.floor(g); return f >= 10 ? '#fde047' : f === 9 ? '#86efac' : f === 8 ? '#7dd3fc' : f === 7 ? '#a5b4fc' : f === 6 ? '#d1d5db' : '#9ca3af'; };

let gState = null;
function openGrade(c, co) { gState = { c, co: co || 'PSA', busy: false }; renderGrade(); $('#gradeModal').style.display = 'block'; }
const closeGrade = () => { $('#gradeModal').style.display = 'none'; };

function renderGrade() {
    const { c, co } = gState, raw = usdOf(c), fee = GRADING.fee[co], dist = gradeDist(c, co);
    const [f, b] = c._ctr || [50, 50];
    const ev = raw == null ? null : dist.reduce((s, [g, p]) => s + p * raw * gradeMult(g, co), 0) - raw - fee;
    const bar = dist.map(([g, p]) => `<i style="flex:${Math.max(p, .004).toFixed(4)};background:${gradeColor(g)}"></i>`).join('');
    const lbl = dist.map(([g, p]) => `<span><b style="color:${gradeColor(g)}">${g}</b> ${Math.round(p * 100)}%</span>`).join('');
    const out = dist.slice(0, 3).map(([g]) => {
        const val = raw == null ? null : raw * gradeMult(g, co), d = val == null ? null : val - raw - fee;
        return `<div><small style="color:${gradeColor(g)}">${co} ${g}</small>`
            + (val == null ? `<b>×${gradeMult(g, co).toFixed(2)}</b>` : `<b>${money(val, 'USD')}</b><em class="${d >= 0 ? 'pos' : 'neg'}">${sgn(d)}</em>`) + '</div>';
    }).join('');
    const chips = [];
    if (ev != null) chips.push(ev >= 0 ? `🍀 Kèo thơm ${sgn(ev)}` : `🎲 Hên xui ${sgn(ev)}`);
    chips.push(`💎 ${co} 10 · ${(dist[0][1] * 100).toFixed(1)}%`);
    if (c._err) chips.push(`⚠ ${esc(c._err)}`);
    $('#gradeBody').innerHTML = `<div class="g-in">
        <div class="g-head"><div class="g-logo">${co}</div><div><b>Gửi chấm điểm</b><small>Mỗi lá chỉ chấm một lần — chọn PSA hoặc TAG</small></div><button class="g-x" data-close>✕</button></div>
        <div class="g-cos">
            <button class="g-co${co === 'PSA' ? ' on' : ''}" data-co="PSA"><b>PSA</b><small>${money(GRADING.fee.PSA, 'USD')} · điểm nguyên · giá slab cao nhất</small></button>
            <button class="g-co${co === 'TAG' ? ' on' : ''}" data-co="TAG"><b>TAG</b><small>${money(GRADING.fee.TAG, 'USD')} · phí rẻ · có nửa điểm</small></button>
        </div>
        <div class="g-bar">${bar}</div><div class="g-lbl">${lbl}</div>
        <div class="g-card"><div class="g-th" id="gTh"></div><div style="min-width:0">
            <b>${esc(c.name)}</b>
            <div class="g-sub">${raw != null ? `Đang <b>${money(raw, 'USD')}</b> · ` : ''}Lề ${f}/${100 - f} · ${b}/${100 - b}</div>
            <div class="g-chips">${chips.map(x => `<span>${x}</span>`).join('')}</div>
        </div></div>
        <div class="g-out">${out}</div>
        <button class="g-go" data-go>Chấm ${co} <small>${money(fee, 'USD')}</small></button>
        <div class="g-note">${raw == null ? 'Game này chưa có dữ liệu giá nên chỉ hiện hệ số nhân. ' : ''}Điểm phụ thuộc độ lệch tâm của từng lá · hệ số giá slab do trang tự đặt, chỉ để chơi (không phải giá thật) · lời/lỗ đã trừ phí chấm</div>
    </div>`;
    $('#gTh').append(imgEl(c));
}

function doGrade() {
    if (!gState || gState.busy) return;
    gState.busy = true;
    const { c, co } = gState, fee = GRADING.fee[co], before = usdOf(c);
    if (window.Wallet && Wallet.bal() < fee) { gState.busy = false; Wallet.notify(`Không đủ tiền chấm: cần ${Wallet.fmt(fee)}, ví còn ${Wallet.fmt(Wallet.bal())}. Bán bớt lá ở Bộ sưu tập.`); return; }
    $('#gradeBody').innerHTML = `<div class="g-wait"><div class="g-spin"></div><b>Đang gửi ${co} chấm điểm…</b><small>Kiểm tra lề · góc · cạnh · bề mặt</small></div>`;
    setTimeout(() => {
        const g = rollGrade(c, co);
        applyGrade(c, co, g);
        const after = usdOf(c), priced = before != null && after != null;
        const net = priced ? after - before - fee : -fee;
        {                                                     // cộng chênh giá vào tổng giá trị; trừ phí chấm vào điểm tích luỹ
            const st = readLS(STATS_KEY, { packs: 0, value: 0 }), d = (priced ? after - before : 0) - fee, dk = dayKey();
            if (priced) st.value += after - before;
            st.net = (st.net || 0) + d; st.days = st.days || {}; st.days[dk] = (st.days[dk] || 0) + d;
            st.adj = Math.round(((st.adj || 0) - fee) * 100) / 100;        // phí chấm trừ vào ví
            writeLS(STATS_KEY, st); if (window.Wallet) Wallet.refresh();
            sumRes.fees += fee;
        }
        achOnGrade(c, fee, priced ? net : 0);
        if (window.PlayerSync) PlayerSync.push();
        $('#gradeBody').innerHTML = `<div class="g-res${g >= 9 ? ' hi' : ''}">
            <small class="g-sub">${co} đã chấm xong</small>
            <div class="g-big" style="color:${gradeColor(g)}">${co} ${g}</div>
            <div class="g-sub">${esc(gradeText(g, co).split(' · ')[1] || '')} · ${esc(c.name)}</div>
            ${priced ? `<div class="g-sub">Giá lá: ${money(before, 'USD')} → <b>${money(after, 'USD')}</b></div>
            <div class="g-big2 ${net >= 0 ? 'pos' : 'neg'}">${sgn(net)} <small>sau phí ${money(fee, 'USD')}</small></div>` : `<div class="g-sub">Phí chấm ${money(fee, 'USD')}</div>`}
            <button class="primary big" data-close style="margin-top:14px">Đóng</button>
        </div>`;
        renderSummary();
    }, 1300);
}

function initGrade() {
    const m = $('#gradeModal');
    m.onclick = e => {
        if (e.target === m || e.target.closest('[data-close]')) return closeGrade();
        const co = e.target.closest('[data-co]');
        if (co && gState && !gState.busy) { gState.co = co.dataset.co; renderGrade(); return; }
        if (e.target.closest('[data-go]')) doGrade();
    };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGrade(); });
}

// ---- thành tích người chơi (lưu localStorage, bền qua các lần mở trang) ----
// Thêm/sửa thành tích: chỉnh ACH_DEFS. Mỗi mục: val(S) = tiến độ hiện tại, goal = mốc mở khoá.
// Chỉ cần ĐỔI id khi muốn coi là thành tích mới; id cũ đã mở khoá vẫn được giữ.
let sumDone = false;
const ACH_KEY = 'pack_achievements_v1';
const ACH_DEFS = [
    { id: 'p1',     icon: '🎴', name: 'Tay mơ xé pack',      desc: 'Xé pack đầu tiên',                              goal: 1,    val: S => S.packs },
    { id: 'p10',    icon: '📦', name: 'Nghiện nhẹ',           desc: 'Xé 10 pack',                                    goal: 10,   val: S => S.packs },
    { id: 'p50',    icon: '🔥', name: 'Cày pack',             desc: 'Xé 50 pack',                                    goal: 50,   val: S => S.packs },
    { id: 'p100',   icon: '💯', name: 'Con nghiện chính hiệu', desc: 'Xé 100 pack',                                  goal: 100,  val: S => S.packs },
    { id: 'p500',   icon: '👑', name: 'Huyền thoại xé pack',  desc: 'Xé 500 pack',                                   goal: 500,  val: S => S.packs },
    { id: 'holo',   icon: '🌈', name: 'Lấp lánh',             desc: 'Ra lá Holo đầu tiên',                           goal: 1,    val: S => S.tiers.holo || 0 },
    { id: 'epic',   icon: '💗', name: 'Hàng xịn',             desc: 'Ra lá Epic đầu tiên',                           goal: 1,    val: S => S.tiers.epic || 0 },
    { id: 'legend', icon: '🌟', name: 'Chân mệnh thiên tử',   desc: 'Ra lá Legendary đầu tiên',                      goal: 1,    val: S => S.tiers.legendary || 0 },
    { id: 'show',   icon: '🔶', name: 'Showcase!',            desc: 'Ra lá Showcase đầu tiên',                       goal: 1,    val: S => S.tiers.showcase || 0 },
    { id: 'double', icon: '💥', name: 'Pack nổ',              desc: 'Một pack có từ 2 lá Epic trở lên',              goal: 2,    val: S => S.epicMax },
    { id: 'blank',  icon: '🫥', name: 'Pack trắng',           desc: 'Một pack không có lá nào từ Rare trở lên',      goal: 1,    val: S => S.blank },
    { id: 'gr1',    icon: '🧊', name: 'Nhập môn slab',        desc: 'Gửi chấm lá đầu tiên (PSA hoặc TAG)',                  goal: 1,    val: S => S.graded },
    { id: 'psa10',  icon: '💎', name: 'Gem Mint',             desc: 'Chấm ra điểm 10 (PSA hoặc TAG)',                                  goal: 1,    val: S => S.tens },
    { id: 'err1',   icon: '🧩', name: 'Lá lỗi!',              desc: 'Ra lá lỗi đầu tiên',                            goal: 1,    val: S => S.errors },
    { id: 'err5',   icon: '🔍', name: 'Thợ săn lá lỗi',       desc: 'Ra 5 lá lỗi',                                   goal: 5,    val: S => S.errors },
    { id: 'card50', icon: '💰', name: 'Trúng số',             desc: 'Một lá đơn trị giá từ $50',                     goal: 50,   val: S => S.bestCard ? S.bestCard.usd : 0, usd: true },
    { id: 'pack100', icon: '🏺', name: 'Pack vàng',           desc: 'Một pack có tổng giá trị từ $100',              goal: 100,  val: S => S.bestPack, usd: true },
    { id: 'val1k',  icon: '🏦', name: 'Triệu phú tập sự',     desc: 'Tổng giá trị đã xé từ $1,000',                  goal: 1000, val: S => S.value, usd: true },
    { id: 'coll50', icon: '📚', name: 'Sưu tầm gia',          desc: '50 lá khác nhau trong bộ sưu tập',              goal: 50,   val: S => S.coll },
    { id: 'coll200', icon: '🗃️', name: 'Thủ thư thẻ bài',     desc: '200 lá khác nhau trong bộ sưu tập',             goal: 200,  val: S => S.coll },
    { id: 'game3',  icon: '🧭', name: 'Khách vãng lai',       desc: 'Xé pack ở 3 game khác nhau',                    goal: 3,    val: S => S.gameCount },
    { id: 'gameAll', icon: '🪐', name: 'Du hành đa vũ trụ',   desc: 'Xé pack ở tất cả các game',                     goal: GAMES.length, val: S => S.gameCount }
];

const achBlank = () => ({ unlocked: {}, games: {}, tiers: {}, epicMax: 0, blank: 0, bestCard: null, bestPack: 0 });
function achLoad() {
    const a = Object.assign(achBlank(), readLS(ACH_KEY, {}));
    ['unlocked', 'games', 'tiers'].forEach(k => { if (!a[k] || typeof a[k] !== 'object') a[k] = {}; });
    return a;
}
// gom mọi số liệu cần cho val(S) từ dữ liệu đã lưu
function achSnapshot(a, st, coll) {
    return {
        packs: st.packs || 0, value: st.value || 0, coll: Object.keys(coll).length,
        gameCount: Object.keys(a.games).length, tiers: a.tiers, epicMax: a.epicMax || 0,
        blank: a.blank || 0, bestCard: a.bestCard, bestPack: a.bestPack || 0,
        graded: a.graded || 0, tens: a.tens || 0, errors: a.errors || 0
    };
}
const achChips = list => list.map(d => `<span class="ach-new">${d.icon} Mở khoá: <b>${esc(d.name)}</b></span>`).join('');
function achUnlock(a, st, coll) {
    const S = achSnapshot(a, st, coll), now = Date.now(), got = [];
    ACH_DEFS.forEach(d => {
        if (!a.unlocked[d.id] && d.val(S) >= d.goal) { a.unlocked[d.id] = now; got.push(d); }
    });
    return got;
}
// gọi 1 lần cho mỗi pack vừa xé xong; trả về danh sách thành tích vừa mở khoá
function recordAchievements(info, st, coll) {
    const a = achLoad();
    a.games[game.id] = (a.games[game.id] || 0) + 1;
    Object.entries(info.counts).forEach(([t, n]) => { a.tiers[t] = (a.tiers[t] || 0) + n; });
    const epicPlus = TIERS.reduce((s, t, i) => s + (i >= TIERS.indexOf('epic') ? (info.counts[t] || 0) : 0), 0);
    a.epicMax = Math.max(a.epicMax || 0, epicPlus);
    if (info.blank) a.blank = (a.blank || 0) + 1;
    a.errors = (a.errors || 0) + (info.errors || 0);
    a.bestPack = Math.max(a.bestPack || 0, info.total || 0);
    if (info.topCard && usdOf(info.topCard) > ((a.bestCard && a.bestCard.usd) || 0))
        a.bestCard = { name: info.topCard.name, usd: usdOf(info.topCard), game: game.id };
    const got = achUnlock(a, st, coll);
    writeLS(ACH_KEY, a);
    return got;
}
// gọi mỗi lần người chơi chấm xong 1 lá
function achOnGrade(c, fee, net) {
    const a = achLoad();
    a.graded = (a.graded || 0) + 1;
    if (c._grade === 10) a.tens = (a.tens || 0) + 1;
    a.gradeFee = (a.gradeFee || 0) + fee;
    a.gradeNet = (a.gradeNet || 0) + net;
    const got = achUnlock(a, readLS(STATS_KEY, { packs: 0, value: 0 }), readLS(COLL_KEY, {}));
    writeLS(ACH_KEY, a);
    if (got.length) { sumNewHTML += achChips(got); toastAch(got); }
    refreshAchBtn();
}

function toastAch(list) {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.append(box); }
    list.forEach((d, i) => setTimeout(() => {
        const t = document.createElement('div');
        t.className = 'toast';
        t.innerHTML = `<span class="t-ic">${d.icon}</span><span><small>Thành tích mới</small><b>${esc(d.name)}</b><em>${esc(d.desc)}</em></span>`;
        box.append(t);
        setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 4500);
    }, i * 700));
}

function refreshAchBtn() {
    const a = achLoad(), n = ACH_DEFS.filter(d => a.unlocked[d.id]).length;
    $('#achCount').textContent = `${n}/${ACH_DEFS.length}`;
}
function renderAch() {
    const a = achLoad(), S = achSnapshot(a, readLS(STATS_KEY, { packs: 0, value: 0 }), readLS(COLL_KEY, {}));
    const fmt = (d, v) => d.usd ? money(v, 'USD') : String(Math.floor(v));
    const done = ACH_DEFS.filter(d => a.unlocked[d.id]).length;
    $('#achTitle').textContent = `🏆 Thành tích · ${done}/${ACH_DEFS.length}`;
    const extra = [];
    if (a.bestCard) extra.push(`<span>💎 Lá đắt nhất: <b>${esc(a.bestCard.name)}</b> (${money(a.bestCard.usd, 'USD')})</span>`);
    if (a.graded) extra.push(`<span>🏅 Đã chấm: <b>${a.graded}</b> lá · lời/lỗ sau phí: <b>${sgn(a.gradeNet || 0)}</b></span>`);
    if (a.bestPack) extra.push(`<span>🏺 Pack đắt nhất: <b>${money(a.bestPack, 'USD')}</b></span>`);
    $('#achSum').innerHTML = `<span>📦 Đã xé: <b>${S.packs}</b> pack</span><span>📚 Bộ sưu tập: <b>${S.coll}</b> lá</span>` + extra.join('');
    $('#achGrid').innerHTML = ACH_DEFS.map(d => {
        const ts = a.unlocked[d.id], v = Math.min(d.val(S), d.goal), pct = Math.round(v / d.goal * 100);
        return `<div class="ach${ts ? ' got' : ''}"><div class="a-ic">${ts ? d.icon : '🔒'}</div><div class="a-tx"><b>${esc(d.name)}</b><small>${esc(d.desc)}</small>`
            + (ts ? `<em>Mở khoá ${new Date(ts).toLocaleDateString('vi-VN')}</em>`
                  : `<div class="a-bar"><i style="width:${pct}%"></i></div><em>${fmt(d, v)} / ${fmt(d, d.goal)}</em>`)
            + `</div></div>`;
    }).join('');
}
function initAch() {
    const m = $('#achModal');
    $('#achBtn').onclick = () => { renderAch(); m.style.display = 'block'; };
    m.onclick = e => { if (e.target === m || e.target.closest('#achClose')) m.style.display = 'none'; };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') m.style.display = 'none'; });
    refreshAchBtn();
}

function zoom(card) {
    const z = $('#zoom');
    const im = z.querySelector('img');
    im.src = card.image; im.alt = card.name;
    z.style.display = 'grid';
}

// =========================================================
// 8. KHỞI ĐỘNG
// =========================================================
function initCarousel() {
    const cf = $('#cf');
    let d = null;
    cf.addEventListener('pointerdown', e => {
        if (e.target.closest('.cf-arrow')) return;
        d = { x: e.clientX, cur }; dragMoved = false;
    });
    window.addEventListener('pointermove', e => {
        if (!d) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 8) dragMoved = true;
        if (dragMoved) go(d.cur - Math.round(dx / (parseFloat(getComputedStyle(cf).getPropertyValue('--step')) || 120)));
    });
    const up = () => { d = null; setTimeout(() => { dragMoved = false; }, 60); };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    $('#cfPrev').onclick = () => go(cur - 1);
    $('#cfNext').onclick = () => go(cur + 1);
    $('#scrub').oninput = e => go(+e.target.value);
}

function init() {
    $('#game').innerHTML = GAMES.map(g => `<option value="${g.id}">${esc(g.icon)} ${esc(g.name)}</option>`).join('');
    $('#game').onchange = e => pickGame(e.target.value);
    $('#chips').onclick = e => {
        const b = e.target.closest('.chip');
        if (!b) return;
        series = b.dataset.s;
        $('#chips').querySelectorAll('.chip').forEach(x => x.classList.toggle('on', x === b));
        applyFilter(setId);
    };
    $('#q').oninput = e => { query = e.target.value; applyFilter(setId); };
    $('#detail').onclick = e => {
        if (e.target.closest('#goTear')) return openStage();
        if (e.target.closest('#allHits')) return openHits();
        const f = e.target.closest('.fc');
        if (f) zoom(hits[+f.dataset.i]);
    };
    $('#pickOther').onclick = backToPicker;
    $('#pickOther2').onclick = backToPicker;
    $('#again2').onclick = openStage;
    $('#next').onclick = advance;
    $('#all').onclick = showSummary;
    $('#zoom').onclick = () => { $('#zoom').style.display = 'none'; };
    $('#hitsModal').onclick = e => { if (e.target.id === 'hitsModal' || e.target.closest('#hitsClose')) $('#hitsModal').style.display = 'none'; };
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') { $('#zoom').style.display = 'none'; $('#hitsModal').style.display = 'none'; }
        const idle = document.activeElement === document.body;
        if (view === 'select' && idle && $('#zoom').style.display !== 'grid' && $('#hitsModal').style.display !== 'block') {
            if (e.key === 'ArrowLeft') go(cur - 1);
            else if (e.key === 'ArrowRight') go(cur + 1);
            else if (e.key === 'Enter') openStage();
        }
        if (view === 'reveal' && (e.key === ' ' || e.key === 'ArrowRight')) { e.preventDefault(); advance(); }
        if (view === 'reveal' && e.key === 'ArrowLeft') { e.preventDefault(); swGo(idx - 1); }
    });
    initTear(); initTilt(); initSwipe();
    initCarousel();
    initAch();
    initGrade();
    window.addEventListener('pack:state', () => refreshAchBtn());     // cloud-auth.js bắn khi kéo tiến độ từ Supabase về

    const q = new URLSearchParams(location.search);
    challengeBeat = Number(q.get('beat')) || 0;
    pickGame(q.get('game') || GAMES[0].id, q.get('set') || '');
}
init();