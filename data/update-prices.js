/**
 * Lấy giá thật từ TCGCSV (bản sao hằng ngày của dữ liệu TCGplayer, miễn phí, không cần API key)
 * rồi ghi ra prices.json để dùng với nút "Import Market Prices".
 *
 * Chạy (cần Node 18+), từ bất kỳ thư mục nào:
 *   node update-prices.js
 *
 * Chỉ cần sửa khối CONFIG bên dưới một lần.
 */
const fs = require('fs');
const path = require('path');

// ===================== CONFIG =====================
const CONFIG = {
    // Đường dẫn tới cards.json. Tương đối với thư mục chứa file script này,
    // hoặc dùng đường dẫn tuyệt đối, ví dụ 'D:/riftbound/cards.json'
    cardsFile: './riftbound.json',

    // Nơi ghi prices.json
    outputFile: './prices.json',

    // null = tự lấy tỉ giá USD -> VND trên mạng, lỗi thì dùng fallbackRate
    usdToVnd: null,
    fallbackRate: 25500
};
// ==================================================

const resolve = p => path.resolve(__dirname, p);
const CARDS_FILE = resolve(CONFIG.cardsFile);
const OUTPUT_FILE = resolve(CONFIG.outputFile);

async function getRate() {
    if (CONFIG.usdToVnd) return CONFIG.usdToVnd;
    try {
        const r = await fetch('https://open.er-api.com/v6/latest/USD');
        const rate = (await r.json()).rates?.VND;
        if (rate) { console.log('Tỉ giá USD/VND:', rate); return rate; }
    } catch (e) { /* dùng giá trị dự phòng */ }
    console.log('Không lấy được tỉ giá, dùng', CONFIG.fallbackRate);
    return CONFIG.fallbackRate;
}

// Bản in đặc biệt: bỏ qua khi ghép giá cho bản thường
const SPECIAL = /alternate|alt art|signature|showcase|overnumbered|metal|promo/i;
const BASE = 'https://tcgcsv.com/tcgplayer';
// TCGCSV yêu cầu User-Agent rõ ràng (thiếu sẽ bị 401) và nghỉ ~0.25s giữa các request
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => {
    await sleep(250);
    const r = await fetch(url, { headers: { 'User-Agent': 'RiftboundMarket/1.0' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return (await r.json()).results;
};

// Chuẩn hóa phần số thẻ: bỏ số 0 đầu, viết thường. "027a"->"27a", "r01"->"r1", "sp1-005"->"sp1-5"
const normNum = t => String(t).toLowerCase().replace(/\d+/g, d => String(Number(d)));

// "rad-sp1-005" -> { abbr: 'RAD', rest: 'sp1-5' } (chấp nhận mọi dạng: 027a, r01, t04, sp1-005...)
const parseCode = code => {
    const m = String(code).match(/^([A-Za-z0-9]+)-(.+)$/);
    return m ? { abbr: m[1].toUpperCase(), rest: normNum(m[2].split('/')[0].trim()) } : null;
};

// Số thẻ gốc, bỏ hậu tố: "27a" -> "27", "27-298" -> "27", "sp1-5" -> "sp1-5"
const baseOf = rest => { const m = rest.match(/^(\d+)/); return m ? m[1] : rest.replace(/[a-z]+$/, ''); };
// Phần đầu dạng số+chữ: "27a-298" -> "27a"
const leadExact = rest => (rest.match(/^\d+[a-z]*/) || [rest])[0];

// Tên để so khớp: bỏ phần trong ngoặc và đuôi " - ...", chỉ giữ chữ + số
const normName = n => String(n).toLowerCase()
    .replace(/\(.*?\)/g, '').replace(/\s-\s.*$/, '').replace(/[^a-z0-9]/g, '');

// Lấy giá: ưu tiên Normal, không có thì Foil, rồi tới loại bất kỳ
const pickPrice = pr => pr.Normal ?? pr.Foil ?? Object.values(pr).find(x => x != null) ?? null;

(async () => {
    if (!fs.existsSync(CARDS_FILE)) {
        throw new Error('Không thấy file thẻ tại: ' + CARDS_FILE + '\nSửa CONFIG.cardsFile ở đầu file.');
    }
    const USD_VND = await getRate();

    // 1. danh sách thẻ của bạn
    const raw = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.cards || []);
    const mine = list
        .map(c => ({
            code: c.cardCode || c.code || c.id,
            name: c.fullName || c.name || '',
            rarity: c.rarity || ''
        }))
        .filter(c => c.code);

    // 2. tìm category Riftbound
    const cats = await get(`${BASE}/categories`);
    const cat = cats.find(c => /riftbound/i.test(c.name));
    if (!cat) throw new Error('Không tìm thấy category Riftbound trên TCGCSV');
    console.log('Category:', cat.name, cat.categoryId);

    // 3. mỗi bộ (group): lấy sản phẩm + giá, lập chỉ mục theo số thẻ và theo tên
    const groups = await get(`${BASE}/${cat.categoryId}/groups`);
    const exact = {};      // "OGN-27a" -> sản phẩm
    const byBase = {};     // "OGN-27"  -> [các bản in]
    const byName = {};     // "RAD|fury rune" -> [các bản in]
    const abbrs = new Set();

    for (const g of groups) {
        const abbr = (g.abbreviation || '').toUpperCase();
        if (!abbr) continue;
        abbrs.add(abbr);
        const products = await get(`${BASE}/${cat.categoryId}/${g.groupId}/products`);
        const prices = await get(`${BASE}/${cat.categoryId}/${g.groupId}/prices`);
        const priceOf = {};
        prices.forEach(p => { (priceOf[p.productId] ||= {})[p.subTypeName] = p.marketPrice; });

        for (const p of products) {
            const num = (p.extendedData || []).find(e => e.name === 'Number');
            if (!num) continue;                                // bỏ sản phẩm sealed
            const pr = priceOf[p.productId] || {};
            const item = {
                price: pickPrice(pr),
                foil: pr.Foil ?? null,
                url: p.url,
                special: SPECIAL.test(p.name),
                name: p.name
            };
            const rest = normNum(String(num.value).split('/')[0].trim());   // "027a/298" -> "27a"
            exact[`${abbr}-${rest}`] = item;
            (byBase[`${abbr}-${baseOf(rest)}`] ||= []).push(item);
            (byName[`${abbr}|${normName(p.name)}`] ||= []).push(item);
        }
        console.log('  ', g.name, abbr);
    }

    // 4. ghép: số thẻ đúng hẳn -> số thẻ gốc (bỏ hậu tố) -> theo tên
    const out = {};
    const missing = [];
    const how = { exact: 0, base: 0, name: 0 };
    const withPrice = arr => (arr || []).filter(x => x.price != null);

    for (const c of mine) {
        const k = parseCode(c.code);
        let item = null, via = '', reason = '';

        if (!k) {
            reason = 'mã thẻ không đúng dạng BỘ-SỐ';
        } else if (!abbrs.has(k.abbr)) {
            reason = `TCGplayer không có bộ "${k.abbr}"`;
        } else {
            const wantSpecial = /showcase|alt|signature|overnumbered/i.test(c.rarity);
            const prefer = arr => {
                const c2 = withPrice(arr);
                return c2.find(x => x.special === wantSpecial) || c2[0] || null;
            };

            const e = exact[`${k.abbr}-${k.rest}`] || exact[`${k.abbr}-${leadExact(k.rest)}`];
            if (e && e.price != null) { item = e; via = 'exact'; }

            if (!item) {
                item = prefer(byBase[`${k.abbr}-${baseOf(k.rest)}`]);
                if (item) via = 'base';
            }
            if (!item) {
                item = prefer(byName[`${k.abbr}|${normName(c.name)}`]);
                if (item) via = 'name';
            }
            if (!item) {
                const seen = e || byBase[`${k.abbr}-${baseOf(k.rest)}`] || byName[`${k.abbr}|${normName(c.name)}`];
                reason = seen ? 'có trên TCGplayer nhưng chưa có giá' : 'không tìm thấy trên TCGplayer (có thể không bán riêng)';
            }
        }

        if (!item) { missing.push(`${c.code}\t${c.rarity}\t${c.name}\t${reason}`); continue; }
        how[via]++;
        out[c.code] = {
            usd: item.price,
            vnd: Math.round(item.price * USD_VND),
            usdFoil: item.foil,
            source: 'TCGplayer (qua TCGCSV) · ' + new Date().toISOString().slice(0, 10),
            url: item.url
        };
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out, null, 2));
    const missingFile = path.join(path.dirname(OUTPUT_FILE), 'missing-prices.txt');
    fs.writeFileSync(missingFile, ['code\trarity\tname\tlý do', ...missing].join('\n'));

    console.log(`Xong: ${Object.keys(out).length}/${mine.length} thẻ có giá -> ${OUTPUT_FILE}`);
    console.log(`   ghép theo số thẻ: ${how.exact}, theo số gốc: ${how.base}, theo tên: ${how.name}`);
    console.log(`Thẻ thiếu giá (${missing.length}) -> ${missingFile}`);
    const why = {};
    missing.forEach(m => { const r = m.split('\t')[3]; why[r] = (why[r] || 0) + 1; });
    Object.entries(why).forEach(([r, n]) => console.log(`   ${n} thẻ: ${r}`));
    console.log('Các mã bộ có trên TCGplayer:', [...abbrs].join(', '));
})().catch(e => { console.error(e.message); process.exit(1); });