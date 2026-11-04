/**
 * Tạo data/gundam.json và data/dragonball.json (thẻ + giá TCGplayer) từ TCGCSV.
 * LƯU Ý: TCGCSV là danh sách SẢN PHẨM của chợ, không phải nguồn thẻ gốc. Script gộp mỗi số thẻ thành 1 dòng
 * (bản thường), nhưng ảnh vẫn là ảnh của TCGplayer. Khi có nguồn thẻ gốc tốt hơn thì nên thay.
 * (bản sao hằng ngày của dữ liệu TCGplayer, miễn phí, không cần API key).
 *
 * Chạy (cần Node 18+), đặt file này trong thư mục data/ như update-onepiece.js:
 *   node update-tcgcsv.js            -> làm cả Gundam và Dragon Ball
 *   node update-tcgcsv.js gundam     -> chỉ Gundam
 *   node update-tcgcsv.js dbs        -> chỉ Dragon Ball
 *
 * Lần đầu nên đọc dòng "Các trường của 1 thẻ mẫu" trong log: nếu thiếu cost/power/ap/hp...
 * thì thêm tên trường đó vào hàm pick(...) bên dưới.
 */
const fs = require('fs');
const path = require('path');

// ===================== CONFIG =====================
const GAMES = {
    gundam: {
        tcg: 'gundam',
        outputFile: './gundam.json',
        category: /gundam/i,                       // tìm theo tên category trên TCGCSV
    },
    dbs: {
        tcg: 'dbs',
        outputFile: './dragonball.json',
        // Dragon Ball có 2 category: Fusion World (mới) và Super Card Game / Masters (cũ).
        // Mặc định lấy Fusion World. Muốn bản cũ thì đổi thành /dragon\s*ball\s*super\s*(ccg|card game)/i
        category: /dragon\s*ball.*fusion/i,
    }
};
const DEBUG = true;                                // in tên các trường của thẻ đầu tiên
// ==================================================

const BASE = 'https://tcgcsv.com/tcgplayer';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => {
    await sleep(250);                              // TCGCSV yêu cầu nghỉ giữa các request
    const r = await fetch(url, { headers: { 'User-Agent': 'CheckPrice/1.0' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return (await r.json()).results;
};

const key = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = html => String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
// Lấy giá trị của trường đầu tiên có trong ext (thử nhiều tên có thể có)
const pick = (ext, ...names) => {
    for (const n of names) if (ext[n] != null && ext[n] !== '') return ext[n];
    return '';
};

async function run(game) {
    const outFile = path.resolve(__dirname, game.outputFile);

    const cats = await get(`${BASE}/categories`);
    const matches = cats.filter(c => game.category.test(c.name));
    if (!matches.length) {
        console.log(`[${game.tcg}] Không tìm thấy category. Các category gần giống:`);
        cats.filter(c => /gundam|dragon/i.test(c.name))
            .forEach(c => console.log('   -', c.categoryId, c.name));
        throw new Error('Sửa regex "category" trong CONFIG cho khớp tên bên trên.');
    }
    const cat = matches[0];
    console.log(`[${game.tcg}] Category:`, cat.name, cat.categoryId,
        matches.length > 1 ? `(còn ${matches.length - 1} category khớp khác: ${matches.slice(1).map(c => c.name).join(' | ')})` : '');

    const groups = await get(`${BASE}/${cat.categoryId}/groups`);
    const out = [];
    let shownDebug = false, firstKeys = null;

    for (const g of groups) {
        const products = await get(`${BASE}/${cat.categoryId}/${g.groupId}/products`);
        let prices = [];
        try { prices = await get(`${BASE}/${cat.categoryId}/${g.groupId}/prices`); }
        catch (e) { /* nhóm chưa có giá thì bỏ qua */ }

        const priceOf = {};
        prices.forEach(p => { (priceOf[p.productId] ||= {})[p.subTypeName] = p.marketPrice; });

        let count = 0;
        const byNumber = new Map();      // số thẻ -> bản gốc + các bản biến thể (parallel, alt art...)
        for (const p of products) {
            const ext = {};
            (p.extendedData || []).forEach(e => { ext[key(e.name)] = e.value; });
            if (!firstKeys && Object.keys(ext).length) firstKeys = Object.keys(ext);

            const number = pick(ext, 'number', 'cardnumber', 'cardno');
            if (!number) continue;                 // bỏ sản phẩm sealed (booster, box...)

            if (DEBUG && !shownDebug) {
                console.log('Các trường của 1 thẻ mẫu:', Object.keys(ext).join(', '));
                shownDebug = true;
            }

            const pr = priceOf[p.productId] || {};
            const usd = pr.Normal ?? pr.Foil ?? Object.values(pr).find(x => x != null) ?? null;

            const variants = [...String(p.name).matchAll(/\(([^)]*)\)/g)]
                .map(m => m[1]).filter(v => !/^\d+$/.test(v) && v !== number);
            const color = String(pick(ext, 'color', 'colour')).split(/[\/;,]/).map(x => x.trim()).filter(Boolean).join(', ');
            const traits = String(pick(ext, 'trait', 'traits', 'feature', 'features', 'zone', 'link'))
                .split(/[;,]/).map(x => x.trim()).filter(Boolean);

            const card = {
                tcg: game.tcg,
                code: `${number}-${p.productId}`,                       // duy nhất, kể cả bản parallel
                name: String(p.name).replace(/\s*\([^)]*\)\s*$/g, '').trim() || p.name,
                set: String(g.groupId),
                setName: g.name,
                number,
                rarity: pick(ext, 'rarity') || 'Unspecified',
                domain: color,
                type: pick(ext, 'cardtype', 'type'),
                image: String(p.imageUrl || '').replace('_200w', '_400w'),
                artist: '',
                cost: pick(ext, 'cost', 'energycost', 'playcost'),
                level: pick(ext, 'level', 'lv'),
                ap: pick(ext, 'ap', 'attackpower'),
                hp: pick(ext, 'hp', 'hitpoints'),
                power: pick(ext, 'power', 'battlepower'),
                combo: pick(ext, 'combopower', 'combo', 'comboenergy'),
                energy: '', might: '',
                ability: clean(pick(ext, 'description', 'cardtext', 'effect', 'text', 'skill')),
                flavor: clean(pick(ext, 'flavortext', 'flavour')),
                tags: traits,
                market: usd == null ? null : {
                    usd, eur: null,
                    source: 'TCGplayer (qua TCGCSV) · ' + new Date().toISOString().slice(0, 10)
                }
            };

            // Mỗi số thẻ chỉ giữ MỘT dòng: ưu tiên bản ít chú thích nhất (bản thường), các bản khác ghi vào tags
            const prev = byNumber.get(number);
            if (!prev) {
                byNumber.set(number, { card, n: variants.length, variants: new Set(variants) });
            } else {
                variants.forEach(v => prev.variants.add(v));
                if (variants.length < prev.n) { prev.card = card; prev.n = variants.length; }
            }
        }

        for (const { card, variants } of byNumber.values()) {
            if (variants.size) card.tags = [...card.tags, 'Variants: ' + [...variants].join(', ')];
            out.push(card);
            count++;
        }
        console.log(`   ${g.name}: ${count} thẻ`);
    }

    if (!out.length) {
        console.log('Không lấy được thẻ nào. Các trường của sản phẩm đầu tiên:', firstKeys ? firstKeys.join(', ') : '(không có extendedData)');
        throw new Error('Không có trường "Number" nào, cần thêm tên trường số thẻ đúng vào pick(ext, "number", ...).');
    }

    fs.writeFileSync(outFile, JSON.stringify(out));
    const priced = out.filter(c => c.market).length;
    console.log(`Xong [${game.tcg}]: ${out.length} thẻ (${priced} có giá) -> ${outFile}\n`);
}

(async () => {
    const arg = process.argv[2];
    const list = arg ? [arg] : Object.keys(GAMES);
    for (const id of list) {
        if (!GAMES[id]) throw new Error(`Game không hợp lệ: ${id} (dùng: ${Object.keys(GAMES).join(', ')})`);
        try { await run(GAMES[id]); }
        catch (e) { console.error(`[${id}] Lỗi:`, e.message, '\n'); process.exitCode = 1; }
    }
})();