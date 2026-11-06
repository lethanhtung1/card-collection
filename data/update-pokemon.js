/**
 * Tạo pokemon.json (thẻ Pokémon TCG + giá). Giá/dữ liệu từ TCGCSV (TCGplayer);
 * ẢNH lấy từ database sạch: TCGdex, rồi pokemon-tcg-data (GitHub) — KHÔNG dùng ảnh người bán chụp của TCGplayer.
 *
 * Chạy (cần Node 18+):
 *   node update-pokemon.js                          # tất cả các bộ
 *   node update-pokemon.js "galarian gallery"       # chỉ bộ có tên/mã chứa chữ này
 */
const fs = require('fs');
const path = require('path');

// ===================== CONFIG =====================
const CONFIG = {
    outputFile: './pokemon.json',
    priceMode: 'average',            // 'average' | 'median'
    variantMode: 'base',             // 'base' | 'average' | 'keep'
    imageSources: ['tcgdex', 'pokemontcg'],
    tcgdexImageFile: 'high.png',     // 'high.png' hoặc 'high.webp'
    allowTcgplayerImage: false,
    subTypePriority: ['Normal', 'Holofoil', 'Reverse Holofoil', '1st Edition Holofoil', '1st Edition Normal', 'Unlimited Holofoil', 'Unlimited'],
    excludeSets: [],
    dropCardsWithoutImage: false,
    useImageCache: true,
    onlySets: process.argv.slice(2),
    debug: true
};
// ==================================================

const OUTPUT_FILE = path.resolve(__dirname, CONFIG.outputFile);
const BASE = 'https://tcgcsv.com/tcgplayer';
const TCGDEX = 'https://api.tcgdex.net/v2/en';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => {
    await sleep(250);
    const r = await fetch(url, { headers: { 'User-Agent': 'CheckPrice/1.0' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return (await r.json()).results;
};
const getJson = async (url, tries = 5) => {
    for (let i = 1; ; i++) {
        await sleep(i === 1 ? 200 : 1500 * (i - 1));
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'CheckPrice/1.0' } });
            if (r.ok) return r.json();
            if (![429, 500, 502, 503, 504].includes(r.status) || i >= tries) throw new Error(`${r.status} ${url}`);
        } catch (e) {
            if (i >= tries || /^\d{3} /.test(e.message)) throw e;
        }
    }
};

// cache ảnh trên đĩa
const CACHE_FILE = path.resolve(__dirname, '.pokemon-image-cache.json');
const CACHE_TTL = 7 * 24 * 3600 * 1000;
let imgCache = {}, cacheWrites = 0;
try { if (CONFIG.useImageCache) imgCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) { imgCache = {}; }
const flushCache = () => { if (CONFIG.useImageCache) try { fs.writeFileSync(CACHE_FILE, JSON.stringify(imgCache)); } catch (e) {} };
async function cachedMap(cacheKey, loader) {
    const c = imgCache[cacheKey];
    if (CONFIG.useImageCache && c && Date.now() - c.time < CACHE_TTL) return new Map(c.entries);
    const m = await loader();                                   // lỗi thì ném ra, KHÔNG lưu cache
    if (!m.size) return m;                                      // rỗng cũng KHÔNG lưu cache (tránh khóa bộ 7 ngày)
    imgCache[cacheKey] = { time: Date.now(), entries: [...m] };
    if (++cacheWrites % 10 === 0) flushCache();
    return m;
}

const key = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = html => String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const median = a => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const round2 = n => Math.round(n * 100) / 100;
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const stripNumberSuffix = name => String(name)
    .replace(/\s+-\s+[A-Za-z]*\d+[A-Za-z]*(\s*\/\s*[A-Za-z]*\d+[A-Za-z]*)?\s*$/, '')
    .replace(/\s+/g, ' ').trim();
const splitLabels = name => {
    const labels = [...name.matchAll(/\(([^)]*)\)/g)].map(m => m[1].trim()).filter(Boolean);
    const baseName = name.replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    return { baseName, labels };
};

const cardNumber = raw => String(raw || '').split('/')[0].trim();
const normNum = s => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]*)0+(\d)/, '$1$2');

const pickPrice = pr => {
    for (const t of CONFIG.subTypePriority) if (pr[t] != null && pr[t] > 0) return pr[t];
    return Object.values(pr).find(x => x != null && x > 0) ?? null;
};

const matchesSet = g => {
    const nm = `${g.name} ${g.abbreviation || ''}`.toLowerCase();
    if (CONFIG.excludeSets.some(x => nm.includes(String(x).toLowerCase()))) return false;
    if (!CONFIG.onlySets.length) return true;
    return CONFIG.onlySets.some(s => nm.includes(String(s).toLowerCase()));
};

// ---------- NGUỒN ẢNH SẠCH ----------
const PTCG_RAW = 'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master';
const normName = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const dezero = x => String(x).toLowerCase().replace(/([a-z])0+(\d)/g, '$1$2');
const stripSetCode = n => String(n)
    .replace(/^[A-Za-z0-9.]*\d[A-Za-z0-9.]*:\s*/, '')
    .replace(/^(SM|XY|BW|HGSS|DP|EX|SV|SWSH|ME)\s*-\s*/i, '')
    .replace(/^(SM|XY|BW|HGSS|DP|EX|SV|SWSH|ME)\s*:\s*/i, '');   // "SV: Scarlet & Violet 151" -> "Scarlet & Violet 151"

const ALIAS_IDS = {
    smbaseset: 'sm1', xybaseset: 'xy1', bwbaseset: 'bw1',
    xypromos: 'xyp', smpromos: 'smp', blackandwhitepromos: 'bwp', hgsspromos: 'hsp',
    swshswordandshieldpromocards: 'swshp', svscarletandvioletpromocards: 'svp'
};

function matchSet(list, g, idOf, nameOf, codeOf = () => '') {
    const abbr = String(g.abbreviation || '').toLowerCase();
    const full = normName(g.name), short = normName(stripSetCode(g.name));
    const alias = ALIAS_IDS[full];
    const ids = new Set([abbr, dezero(abbr)].filter(Boolean));
    const compat = s => { const n = normName(nameOf(s)); return n.length >= 3 && (full.includes(n) || n.includes(short)); };
    const idHit = s => ids.has(String(idOf(s)).toLowerCase()) || ids.has(dezero(idOf(s)))
        || (codeOf(s) && ids.has(String(codeOf(s)).toLowerCase()));
    const longest = arr => arr.sort((a, b) => normName(nameOf(b)).length - normName(nameOf(a)).length)[0];

    return (alias && list.find(s => String(idOf(s)).toLowerCase() === alias))
        || list.find(s => normName(nameOf(s)) === full)
        || list.find(s => normName(nameOf(s)) === short)
        || list.find(s => idHit(s) && compat(s))
        || longest(list.filter(s => { const n = normName(nameOf(s)); return n.length >= 6 && full.includes(n); }))
        // tên ngắn (vd "151") nằm ở CUỐI tên TCGplayer ("...Violet 151")
        || longest(list.filter(s => { const n = normName(nameOf(s)); return n.length >= 3 && short.endsWith(n); }))
        || null;
}

const IMAGE_SOURCES = {
    tcgdex: {
        sets: null,
        async imagesFor(g) {
            if (!this.sets) this.sets = await getJson(`${TCGDEX}/sets`);
            const s = matchSet(this.sets, g, x => x.id, x => x.name);
            if (!s) return null;
            return cachedMap(`tcgdex:v2:${CONFIG.tcgdexImageFile}:${s.id}`, async () => {
                const d = await getJson(`${TCGDEX}/sets/${s.id}`);
                const m = new Map();
                (d.cards || []).forEach(c => { if (c.image) m.set(normNum(c.localId), `${c.image}/${CONFIG.tcgdexImageFile}`); });
                return m;
            });
        }
    },
    pokemontcg: {
        sets: null,
        async imagesFor(g) {
            if (!this.sets) this.sets = await getJson(`${PTCG_RAW}/sets/en.json`);
            const s = matchSet(this.sets, g, x => x.id, x => x.name, x => x.ptcgoCode);
            if (!s) return null;
            return cachedMap(`pokemontcg:v2:${s.id}`, async () => {
                const list = await getJson(`${PTCG_RAW}/cards/en/${s.id}.json`);
                const m = new Map();
                list.forEach(c => { const u = c.images && (c.images.large || c.images.small); if (u) m.set(normNum(c.number), u); });
                return m;
            });
        }
    }
};

(async () => {
    const cats = await get(`${BASE}/categories`);
    const cat = cats.find(c => /^pok[eé]mon$/i.test(String(c.name).trim()))
        || cats.find(c => c.categoryId === 3);
    if (!cat) throw new Error('Không tìm thấy category Pokemon trên TCGCSV');
    console.log('Category:', cat.name, cat.categoryId);

    const allGroups = await get(`${BASE}/${cat.categoryId}/groups`);
    const groups = allGroups.filter(matchesSet);
    console.log(`Bộ bài: ${groups.length}/${allGroups.length}` + (CONFIG.onlySets.length ? `  (lọc: ${CONFIG.onlySets.join(', ')})` : ''));
    if (!groups.length) throw new Error('Không có bộ nào khớp bộ lọc');

    const byCard = new Map();
    let total = 0, shownDebug = 0;

    for (const g of groups) {
        const products = await get(`${BASE}/${cat.categoryId}/${g.groupId}/products`);
        const prices = await get(`${BASE}/${cat.categoryId}/${g.groupId}/prices`);
        const priceOf = {};
        prices.forEach(p => { (priceOf[p.productId] ||= {})[p.subTypeName] = p.marketPrice; });

        let count = 0;
        for (const p of products) {
            const ext = {};
            (p.extendedData || []).forEach(e => { ext[key(e.name)] = e.value; });
            const number = cardNumber(ext.number);
            if (!number) continue;

            if (CONFIG.debug && shownDebug < 3) {
                console.log('Các trường của thẻ mẫu:', Object.keys(ext).join(', '));
                shownDebug++;
            }

            const { baseName, labels } = splitLabels(stripNumberSuffix(p.name));
            const labelKey = CONFIG.variantMode === 'keep' ? '|' + labels.map(l => l.toLowerCase()).sort().join('+') : '';
            const k = `${g.groupId}|${normNum(number)}|${baseName.toLowerCase()}${labelKey}`;
            if (!byCard.has(k)) byCard.set(k, { g, number, baseName, listings: [] });
            byCard.get(k).listings.push({ p, ext, labels, usd: pickPrice(priceOf[p.productId] || {}) });
            count++; total++;
        }
        console.log(`   ${g.name}: ${count} listing`);
    }

    const out = [];
    const usedCodes = new Set();
    const stat = { tcgplayer: 0, none: 0, merged: 0 };
    CONFIG.imageSources.forEach(n => stat[n] = 0);
    const noImageSets = new Map();
    const unmatchedSets = new Map();
    const errorSets = new Set();
    const imgBySet = new Map();

    for (const { g, number, baseName, listings } of byCard.values()) {
        const plain = listings.filter(x => !x.labels.length);
        const rep = CONFIG.variantMode === 'base' && plain.length ? plain : listings;
        const base = rep[0];
        const ext = base.ext;
        if (listings.length > 1) stat.merged += listings.length - 1;

        const field = (...names) => {
            for (const n of names) {
                const v = ext[n] ?? listings.map(x => x.ext[n]).find(x => x !== undefined && x !== '');
                if (v !== undefined && v !== '') return v;
            }
            return '';
        };

        const list = rep.map(x => x.usd).filter(v => v != null && v > 0);
        const usd = list.length ? round2(CONFIG.priceMode === 'median' ? median(list) : avg(list)) : null;

        const labelSets = new Set(rep.map(x => x.labels.map(l => l.toLowerCase()).sort().join('+')));
        const name = baseName + (labelSets.size === 1 ? base.labels.map(l => ` (${l})`).join('') : '');

        const cardType = String(field('cardtype', 'type')).trim();
        const stage = String(field('stage')).trim();
        const isTrainer = /trainer|supporter|item|stadium|tool/i.test(cardType);
        const isEnergy = /energy/i.test(cardType) && !stage;

        const lines = [];
        for (let i = 1; i <= 4; i++) { const a = field('attack' + i); if (a) lines.push(clean(a)); }
        const text = clean(field('cardtext', 'description', 'text', 'effect'));
        if (text) lines.push(text);
        const weak = field('weakness'), resist = field('resistance');

        const tcgImage = String(base.p.imageUrl || '').replace('_200w', '_400w')
            || `https://tcgplayer-cdn.tcgplayer.com/product/${base.p.productId}_400w.jpg`;
        let image = '', imageAlt = '';
        if (!imgBySet.has(g.groupId)) {
            const arr = [];
            let hadError = false;
            for (const sn of CONFIG.imageSources) {
                try { arr.push(await IMAGE_SOURCES[sn].imagesFor(g)); }
                catch (e) { console.warn(`   (${sn} lỗi cho bộ ${g.name}: ${e.message})`); arr.push(null); hadError = true; }
            }
            if (hadError) errorSets.add(g.name);
            else if (arr.every(m => !m)) unmatchedSets.set(g.name, g.abbreviation || '');
            imgBySet.set(g.groupId, arr);
        }
        const found = imgBySet.get(g.groupId)
            .map((m, i) => { const u = m && m.get(normNum(number)); return u ? { url: u, src: CONFIG.imageSources[i] } : null; })
            .filter(Boolean);
        if (found.length) {
            image = found[0].url;
            imageAlt = found[1] ? found[1].url : (CONFIG.allowTcgplayerImage ? tcgImage : '');
            stat[found[0].src]++;
        } else if (CONFIG.allowTcgplayerImage) {
            image = tcgImage; stat.tcgplayer++;
            noImageSets.set(g.name, (noImageSets.get(g.name) || 0) + 1);
        } else {
            stat.none++;
            noImageSets.set(g.name, (noImageSets.get(g.name) || 0) + 1);
        }

        if (CONFIG.dropCardsWithoutImage && !image) continue;

        const setCode = String(g.abbreviation || g.groupId);
        let code = `${setCode}-${number}`.replace(/\s+/g, '');
        if (usedCodes.has(code)) code += '-' + slug(baseName);
        if (usedCodes.has(code)) code += '-' + base.p.productId;
        usedCodes.add(code);

        out.push({
            tcg: 'pokemon',
            code,
            name,
            set: setCode,
            setName: g.name,
            releaseDate: g.publishedOn ? String(g.publishedOn).slice(0, 10) : '',
            number,
            rarity: field('rarity') || 'Unspecified',
            domain: isTrainer || isEnergy ? '' : cardType,
            type: isTrainer ? cardType : isEnergy ? 'Energy' : ['Pokémon', stage].filter(Boolean).join(', '),
            image,
            imageAlt,
            artist: '',
            hp: field('hp'),
            stage,
            retreat: field('retreatcost', 'retreat'),
            energy: '', power: '', might: '',
            ability: lines.join('\n'),
            flavor: '',
            tags: [
                listings.length > 1 ? `${listings.length} listing gộp` : '',
                weak ? 'Weakness: ' + weak : '',
                resist ? 'Resistance: ' + resist : ''
            ].filter(Boolean),
            market: usd == null ? null : {
                usd, eur: null,
                source: `TCGplayer (qua TCGCSV) · ${CONFIG.priceMode === 'median' ? 'trung vị' : 'trung bình'} ${rep.length} listing · ` + new Date().toISOString().slice(0, 10)
            }
        });
    }

    out.sort((a, b) => a.setName.localeCompare(b.setName, 'en')
        || a.number.localeCompare(b.number, 'en', { numeric: true })
        || a.name.localeCompare(b.name, 'en'));
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out));
    flushCache();

    const priced = out.filter(c => c.market).length;
    console.log(`Xong: ${total} listing -> ${out.length} thẻ (${priced} có giá, đã gộp ${stat.merged} listing trùng) -> ${OUTPUT_FILE}`);

    if (CONFIG.debug) {
        console.log('\nẢnh sạch: ' + CONFIG.imageSources.map(n => `${stat[n]} thẻ từ ${n}`).join(', ')
            + `, ${stat.none} thẻ chưa có ảnh` + (CONFIG.allowTcgplayerImage ? `, ${stat.tcgplayer} thẻ dùng ảnh TCGplayer` : ''));
        [...noImageSets].sort((a, b) => b[1] - a[1]).slice(0, 15)
            .forEach(([n, c]) => console.log(`   chưa có ảnh sạch: ${n} (${c} thẻ)`));
        if (unmatchedSets.size) {
            console.log(`\nBộ KHÔNG ghép được với database nào (${unmatchedSets.size}) — thêm vào ALIAS_IDS nếu là bộ bài thật:`);
            [...unmatchedSets].slice(0, 30).forEach(([n, a]) => console.log(`   ${n}  [mã: ${a}]`));
        }
        if (errorSets.size) console.log(`\nBộ bị lỗi server/mạng (${errorSets.size}) — chạy lại script, phần đã tra xong được lưu cache.`);
        const dupe = {};
        out.forEach(c => (dupe[c.setName + ' | ' + c.name] ||= []).push(c.number));
        const multi = Object.entries(dupe).filter(([, v]) => v.length >= 2);
        console.log(`\nCòn ${multi.length} (bộ + tên) xuất hiện >=2 lần:`);
        multi.slice(0, 30).forEach(([n, v]) => console.log(`  ${n}: số ${v.join(', ')}`));
    }
})().catch(e => { console.error(e.message); process.exit(1); });