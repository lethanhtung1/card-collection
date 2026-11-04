/**
 * Tạo data/onepiece.json (thẻ One Piece Card Game + giá) từ TCGCSV
 * (bản sao hằng ngày của dữ liệu TCGplayer, miễn phí, không cần API key).
 *
 * Chạy (cần Node 18+):   node update-onepiece.js
 *
 * Mỗi BẢN IN KHÁC NHAU của một lá chỉ xuất hiện 1 lần:
 *   - bản thường, Parallel, Alternate Art, Manga Rare... là các thẻ riêng (như onepiece.gg)
 *   - cùng một bản in nhưng TCGplayer liệt kê nhiều lần (in lại ở bộ khác...) -> gộp 1, giá trung bình
 */
const fs = require('fs');
const path = require('path');

// ===================== CONFIG =====================
const CONFIG = {
    outputFile: './onepiece.json',   // tương đối với thư mục chứa script này
    priceMode: 'average',            // 'average' = trung bình | 'median' = trung vị
    // Ảnh bản thường: 'tcgplayer' = ảnh TCGplayer (luôn tải được, nhưng có thể dính chữ SAMPLE)
    //                 'official'  = ảnh gốc Bandai (sạch hơn nhưng nhiều lá không tải được -> "Chưa có ảnh")
    // Bản Parallel / Manga / Alt Art luôn dùng ảnh TCGplayer (đúng tranh của bản đó)
    baseImage: 'tcgplayer',
    debug: true,                     // in tên các trường của sản phẩm đầu tiên, để kiểm tra

    // --- CHỐNG TRÙNG ---
    // Nhãn "rác" không phân biệt bản in (tên bộ, reprint, foil...) -> bỏ khi so sánh.
    // Thêm regex vào đây nếu thấy còn nhãn lạ gây trùng (xem báo cáo cuối khi chạy).
    ignoreLabels: [
        /^(op|st|eb|prb|p|promo)[-\s]?\d*$/i,           // mã bộ: OP05, ST10, EB01, PRB01, P...
        /reprint|re-?release|foil|non-?foil|holo/i,
        /pre-?release|tournament|champion|winner|participant|top\s*\d+|finalist/i, // giữ lại nếu bạn muốn tách các bản giải đấu
        /\b(set|pack|box|case|vol\.?|volume)\b/i
    ],
    // Bất cứ nhãn nào chứa "manga" -> coi là 1 bản duy nhất "Manga" (bỏ Parallel/Alt Art đi kèm)
    collapseManga: true,
    // true = coi "Parallel" và "Alternate Art" là CÙNG một bản (gộp). Để false nếu 1 lá có nhiều tranh alt khác nhau.
    mergeParallelAndAltArt: false,
    // true = cùng 1 lá (cùng tên + cùng nội dung/effect/cost/power/màu/loại + cùng nhãn bản in)
    // nhưng nằm ở NHIỀU bộ / NHIỀU số thẻ khác nhau (reprint) -> gộp thành đúng 1 lá, giá trung bình.
    // Common hay thẻ nào cũng áp dụng. Đặt false nếu muốn mỗi số thẻ là 1 lá riêng.
    mergeReprints: true
};
// ==================================================

const OUTPUT_FILE = path.resolve(__dirname, CONFIG.outputFile);
const BASE = 'https://tcgcsv.com/tcgplayer';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async url => {
    await sleep(250);                                    // TCGCSV yêu cầu nghỉ giữa các request
    const r = await fetch(url, { headers: { 'User-Agent': 'CheckPrice/1.0' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return (await r.json()).results;
};

const key = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = html => String(html || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();

const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const median = a => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const round2 = n => Math.round(n * 100) / 100;

// Nhãn bản in trong ngoặc: "Roronoa Zoro (001) (Parallel)" -> ['Parallel'] (bỏ "(001)" và mã thẻ)
const rawLabelsOf = name => [...String(name).matchAll(/\(([^)]*)\)/g)]
    .map(m => m[1].trim())
    .filter(v => v && !/^\d+$/.test(v) && !/^[A-Za-z]{1,5}\d*-\d+/.test(v));

// Chuẩn hóa nhãn để cùng 1 bản in luôn ra cùng 1 khóa:
//   "Manga Rare", "Manga", "Alternate Art) (Manga" ... -> ['Manga']
const labelsOf = name => {
    let labels = rawLabelsOf(name)
        .filter(l => !CONFIG.ignoreLabels.some(re => re.test(l)));

    if (CONFIG.collapseManga && labels.some(l => /manga/i.test(l))) return ['Manga'];

    labels = labels.map(l => {
        if (/^(parallel|alt(ernate)?\.?\s*art(work)?)$/i.test(l))
            return CONFIG.mergeParallelAndAltArt ? 'Parallel' : (/parallel/i.test(l) ? 'Parallel' : 'Alternate Art');
        if (/^sp$|special/i.test(l)) return 'SP';
        return l;
    });

    // bỏ trùng nhãn, giữ thứ tự ổn định
    return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
};

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Ảnh gốc của Bandai: .../images/cardlist/card/OP01-001.png
const officialImage = number => `https://en.onepiece-cardgame.com/images/cardlist/card/${number}.png`;

(async () => {
    const cats = await get(`${BASE}/categories`);
    const cat = cats.find(c => /one\s*piece/i.test(c.name));
    if (!cat) throw new Error('Không tìm thấy category One Piece trên TCGCSV');
    console.log('Category:', cat.name, cat.categoryId);

    const groups = await get(`${BASE}/${cat.categoryId}/groups`);

    // 1. thu thập, gom theo (SỐ THẺ + nhãn bản in đã chuẩn hóa)
    const byPrint = new Map();
    const infoOf = new Map();            // số thẻ -> thông tin chung (để bù trường còn thiếu)
    let total = 0, shownDebug = false;

    for (const g of groups) {
        const products = await get(`${BASE}/${cat.categoryId}/${g.groupId}/products`);
        const prices = await get(`${BASE}/${cat.categoryId}/${g.groupId}/prices`);
        const priceOf = {};
        prices.forEach(p => { (priceOf[p.productId] ||= {})[p.subTypeName] = p.marketPrice; });

        let count = 0;
        for (const p of products) {
            const ext = {};
            (p.extendedData || []).forEach(e => { ext[key(e.name)] = e.value; });
            const rawNumber = String(ext.number || '').trim();
            if (!rawNumber) continue;                     // bỏ sản phẩm sealed (booster, box...)
            // chuẩn hóa số thẻ: "OP05-074 (PRB01)" / "op05-074 " -> "OP05-074"
            const number = (rawNumber.match(/[A-Za-z]{1,5}\d*-\d{3}/) || [rawNumber])[0].toUpperCase();

            if (CONFIG.debug && !shownDebug) {
                console.log('Các trường của 1 thẻ mẫu:', Object.keys(ext).join(', '));
                shownDebug = true;
            }

            const pr = priceOf[p.productId] || {};
            const usd = pr.Normal ?? pr.Foil ?? Object.values(pr).find(x => x != null) ?? null;
            const abbr = String(g.abbreviation || '').toUpperCase();
            const labels = labelsOf(p.name);
            const labelKey = labels.map(l => l.toLowerCase()).join('+');
            const baseName = String(p.name).replace(/\s*\([^)]*\)/g, '').trim().toLowerCase();
            const abilityKey = clean(ext.description || ext.cardtext || ext.effect || ext.text)
                .toLowerCase().replace(/\s+/g, ' ');
            // bước 1: LUÔN gom theo (số thẻ + nhãn) -> cùng 1 lá ở nhiều bộ/listing (vd Kid Manga ở OP05 và PRB01) thành 1
            const printKey = `n|${number}|${labelKey}`;
            // bước 2 (sau vòng lặp): các nhóm khác số thẻ nhưng cùng nội dung -> gộp tiếp (reprint)
            const contentKey = abilityKey
                ? [baseName, labelKey, key(ext.color || ''), key(ext.cardtype || ext.type || ''),
                   ext.cost ?? '', ext.power ?? '', ext.life ?? '', abilityKey].join('|')
                : '';

            if (!byPrint.has(printKey)) byPrint.set(printKey, { labels, prints: [] });
            byPrint.get(printKey).prints.push({
                p, g, ext, usd, number, contentKey,
                home: abbr === number.split('-')[0].toUpperCase()     // nằm đúng bộ gốc của số thẻ
            });

            if (!infoOf.has(number)) infoOf.set(number, []);
            infoOf.get(number).push(ext);
            count++; total++;
        }
        console.log(`   ${g.name}: ${count} thẻ`);
    }

    // 1b. gộp reprint: các nhóm KHÁC số thẻ nhưng cùng nội dung + cùng nhãn -> 1 lá
    const finalGroups = new Map();
    for (const [k, grp] of byPrint) {
        const ck = (grp.prints.find(x => x.contentKey) || {}).contentKey;
        const mk = CONFIG.mergeReprints && ck ? 'c|' + ck : k;
        if (!finalGroups.has(mk)) finalGroups.set(mk, { labels: grp.labels, prints: [] });
        finalGroups.get(mk).prints.push(...grp.prints);
    }

    // 2. mỗi bản in -> đúng 1 thẻ
    const out = [];
    const usedCodes = new Set();

    for (const { labels, prints } of finalGroups.values()) {
        const base = prints.find(x => x.home) || prints[0];
        const number = base.number;                       // số thẻ chính = bản nằm đúng bộ gốc
        const allNumbers = [...new Set(prints.map(x => x.number))].sort();

        // trường thiếu thì mượn từ bản cùng in, rồi từ cùng số thẻ
        const field = name => {
            const v = base.ext[name];
            if (v !== undefined && v !== '') return v;
            const o = prints.find(x => x.ext[name] !== undefined && x.ext[name] !== '')
                || { ext: infoOf.get(number).find(e => e[name] !== undefined && e[name] !== '') || {} };
            return o.ext[name] !== undefined ? o.ext[name] : '';
        };

        const list = prints.map(x => x.usd).filter(v => v != null && v > 0);
        let usd = null;
        if (list.length) usd = round2(CONFIG.priceMode === 'median' ? median(list) : avg(list));

        const attribute = field('attribute');
        const color = String(field('color')).split(/[\/;,]/).map(x => x.trim()).filter(Boolean).join(', ');
        const isBase = labels.length === 0;

        const tcgImage = String(base.p.imageUrl || '').replace('_200w', '_400w');
        const image = (isBase && CONFIG.baseImage === 'official') || !tcgImage ? officialImage(number) : tcgImage;

        let code = isBase ? number : `${number}-${slug(labels.join('-'))}`;
        if (usedCodes.has(code)) code += '-' + base.p.productId;
        usedCodes.add(code);

        const baseName = String(base.p.name).replace(/\s*\([^)]*\)/g, '').trim();

        out.push({
            tcg: 'onepiece',
            code,
            name: baseName + labels.map(l => ` (${l})`).join(''),
            set: base.g.abbreviation || String(base.g.groupId),
            setName: base.g.name,
            number,
            rarity: field('rarity') || 'Unspecified',
            domain: color,
            type: field('cardtype') || field('type') || '',
            image,
            imageAlt: image === tcgImage ? '' : tcgImage,                   // dự phòng nếu ảnh gốc lỗi
            artist: '',
            cost: field('cost') ?? '',
            power: field('power') ?? '',
            life: field('life') ?? '',
            counter: field('counter') || field('counterplay') || '',
            attribute: attribute || '',
            energy: '', might: '',
            ability: clean(field('description') || field('cardtext') || field('effect') || field('text')),
            flavor: '',
            tags: [
                ...labels,
                prints.length > 1 ? `${prints.length} bản in gộp` : '',
                allNumbers.length > 1 ? 'Reprint: ' + allNumbers.join(', ') : '',
                attribute ? 'Attribute: ' + attribute : ''
            ].filter(Boolean),
            market: usd == null ? null : {
                usd, eur: null,
                source: `TCGplayer (qua TCGCSV) · ${CONFIG.priceMode === 'median' ? 'trung vị' : 'trung bình'} ${prints.length} bản · ` + new Date().toISOString().slice(0, 10)
            }
        });
    }

    // bản thường lên trước, rồi tới các bản đặc biệt
    out.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true })
        || (a.code === a.number ? -1 : b.code === b.number ? 1 : a.code.localeCompare(b.code)));
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out));

    const priced = out.filter(c => c.market).length;
    const special = out.filter(c => c.code !== c.number).length;
    console.log(`Xong: ${total} sản phẩm -> ${out.length} thẻ (${special} là bản Parallel/Manga/Alt Art..., ${priced} có giá) -> ${OUTPUT_FILE}`);

    // 3a. BÁO CÁO TRÙNG: cùng tên hiển thị mà còn nhiều dòng
    if (CONFIG.debug) {
        const byName = {};
        out.forEach(c => (byName[c.name] ||= []).push(`${c.code} [${c.set}]`));
        const same = Object.entries(byName).filter(([, v]) => v.length >= 2);
        console.log(`\nCòn ${same.length} tên xuất hiện >=2 lần (thường là các lá khác nhau cùng tên; nếu thấy trùng thật thì gửi lại đoạn này):`);
        same.slice(0, 40).forEach(([n, v]) => console.log(`  ${n}: ${v.join('  |  ')}`));
    }

    // 3. BÁO CÁO: số thẻ có từ 2 bản đặc biệt trở lên -> kiểm tra xem có phải trùng thật không
    if (CONFIG.debug) {
        const bySpecial = {};
        out.filter(c => c.code !== c.number).forEach(c => (bySpecial[c.number] ||= []).push(c.name));
        const multi = Object.entries(bySpecial).filter(([, v]) => v.length >= 2);
        console.log(`\nCó ${multi.length} số thẻ có >=2 bản đặc biệt (xem nếu tên nào nhìn giống nhau = còn trùng):`);
        multi.slice(0, 40).forEach(([n, v]) => console.log(`  ${n}: ${v.join('  |  ')}`));
    }
})().catch(e => { console.error(e.message); process.exit(1); });