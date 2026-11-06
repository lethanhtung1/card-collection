/**
 * Tạo data/yugioh/index.json + data/yugioh/<bộ>.json (mỗi bộ một file nhỏ) từ YGOPRODeck.
 *
 * Đây là NGUỒN THẺ (như TCGdex của Pokémon), không phải danh sách bán hàng của chợ:
 *  - MỖI LÁ BÀI CHỈ XUẤT HIỆN 1 LẦN TRONG MỖI BỘ (gộp theo id lá bài, không còn lá trùng):
 *      + các độ hiếm gộp lại (hiện độ hiếm cao nhất, còn lại ghi trong tags)
 *      + các mã in khác nhau gộp lại (hiện mã nhỏ nhất, còn lại ghi trong tags)
 *      + GIÁ = TRUNG BÌNH giá của tất cả các bản in của lá đó trong bộ
 *  - ảnh chính thức, chất lượng đồng đều
 *
 * Chạy (cần Node 18+), đặt file này trong thư mục data/ cạnh update-onepiece.js:
 *   node update-yugioh.js
 * Chỉ cần 2 request lớn nên xong trong vài chục giây. Chạy lại khi có bộ mới / muốn cập nhật giá.
 */
const fs = require('fs');
const path = require('path');

// ===================== CONFIG =====================
const OUT_DIR = path.resolve(__dirname, './yugioh');
const API = 'https://db.ygoprodeck.com/api/v7';
const IMAGE_FIELD = 'image_url';          // image_url (421x614) | image_url_small | image_url_cropped
// ==================================================

const getJSON = async url => {
    const r = await fetch(url, { headers: { 'User-Agent': 'CheckPrice/1.0' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
};

const num = v => { const n = parseFloat(v); return n > 0 ? n : null; };
const round2 = n => Math.round(n * 100) / 100;
const avg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const byNumber = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true });
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'set';

// Điểm độ hiếm để chọn độ hiếm cao nhất làm độ hiếm hiển thị
function rarityScore(r) {
    const v = String(r || '').toLowerCase();
    if (/starlight|ghost|ultimate|collector|quarter century|platinum|extra secret|premium gold/.test(v)) return 9;
    if (/prismatic|secret|gold/.test(v)) return 8;
    if (/ultra|parallel/.test(v)) return 6;
    if (/super|holofoil|shatterfoil|mosaic|starfoil/.test(v)) return 4;
    if (/rare/.test(v)) return 3;
    if (/short|common/.test(v)) return 1;
    return 2;
}

(async () => {
    console.log('Đang tải danh sách bộ...');
    const setList = await getJSON(`${API}/cardsets.php`);
    const setInfo = {};
    setList.forEach(s => { setInfo[s.set_name] = s; });

    console.log('Đang tải toàn bộ dữ liệu thẻ (một request lớn, đợi chút)...');
    const all = (await getJSON(`${API}/cardinfo.php`)).data || [];
    console.log(`Đã tải ${all.length} lá bài.`);

    // setName -> Map(id lá bài -> thẻ)   [mỗi lá bài chỉ 1 dòng trong mỗi bộ]
    const bySet = new Map();
    for (const c of all) {
        const gp = (c.card_prices || [])[0] || {};
        const usdCard = num(gp.tcgplayer_price), eurCard = num(gp.cardmarket_price);
        const isSpell = /spell/i.test(c.type), isTrap = /trap/i.test(c.type);
        const levelLabel = c.linkval != null ? 'Link' : /xyz/i.test(c.type) ? 'Rank' : 'Level';
        const img = (c.card_images || [])[0] || {};

        for (const p of (c.card_sets || [])) {
            if (!bySet.has(p.set_name)) bySet.set(p.set_name, new Map());
            const bucket = bySet.get(p.set_name);

            let card = bucket.get(c.id);
            if (!card) {
                card = {
                    cid: c.id,
                    tcg: 'yugioh',
                    code: '',                                  // điền sau: <mã nhỏ nhất>|<id>
                    name: c.name,
                    set: '',                                   // điền sau khi có id của bộ
                    setName: p.set_name,
                    number: '',                                // điền sau: mã in nhỏ nhất
                    rarity: '',
                    rarities: new Set(),
                    codes: new Set(),
                    prices: [],                                // giá từng bản in trong bộ -> lấy trung bình
                    usdCard, eurCard,                          // dự phòng: giá theo lá bài
                    domain: c.attribute || (isSpell ? 'SPELL' : isTrap ? 'TRAP' : ''),
                    type: [c.type, c.race].filter(Boolean).join(', '),
                    image: img[IMAGE_FIELD] || img.image_url || '',
                    artist: '',
                    atk: c.atk ?? '', def: c.def ?? '',
                    level: c.level ?? c.linkval ?? '', levelLabel,
                    energy: '', power: '', might: '',
                    ability: c.desc || '',
                    flavor: '',
                    archetype: c.archetype || ''
                };
                bucket.set(c.id, card);
            }
            if (p.set_rarity) card.rarities.add(p.set_rarity);
            if (p.set_code) card.codes.add(p.set_code);
            const sp = num(p.set_price);
            if (sp != null) card.prices.push(sp);
        }
    }

    // Ghi file
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json')).forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));   // xóa file cũ

    const today = new Date().toISOString().slice(0, 10);
    const used = new Set();
    const index = [];
    let total = 0;

    for (const [setName, bucket] of bySet) {
        let id = slug(setName), n = 2;
        while (used.has(id)) id = `${slug(setName)}-${n++}`;
        used.add(id);

        const info = setInfo[setName] || {};
        const list = [...bucket.values()].map(card => {
            const rars = [...card.rarities].sort((a, b) => rarityScore(b) - rarityScore(a));
            const codes = [...card.codes].sort(byNumber);
            const number = codes[0] || '';

            // giá: trung bình các bản in trong bộ; không có thì dùng giá theo lá bài
            const usd = card.prices.length ? round2(avg(card.prices)) : card.usdCard;
            const eur = card.eurCard;
            const priceNote = card.prices.length > 1
                ? `trung bình ${card.prices.length} bản in trong bộ`
                : 'giá theo lá bài';

            const { rarities, codes: _c, prices, usdCard, eurCard, archetype, cid, ...rest } = card;
            return {
                ...rest,
                code: `${number}|${cid}`,
                set: id,
                number,
                rarity: rars[0] || 'Unspecified',
                market: (usd != null || eur != null)
                    ? { usd, eur, source: `YGOPRODeck (${priceNote}) · ${today}` }
                    : null,
                tags: [
                    rars.length > 1 ? 'Rarities: ' + rars.join(', ') : '',
                    codes.length > 1 ? 'Mã in: ' + codes.join(', ') : '',
                    archetype
                ].filter(Boolean)
            };
        }).sort((a, b) => byNumber(a.number, b.number));

        fs.writeFileSync(path.join(OUT_DIR, `${id}.json`), JSON.stringify(list));
        index.push({
            id,
            name: setName,
            abbreviation: info.set_code || (list[0] ? String(list[0].number).split('-')[0] : ''),
            count: list.length,
            published: String(info.tcg_date || '').slice(0, 10)
        });
        total += list.length;
    }

    index.sort((a, b) => String(b.published).localeCompare(String(a.published)));      // bộ mới nhất lên đầu
    fs.writeFileSync(path.join(OUT_DIR, 'index.json'),
        JSON.stringify({ updated: today, sets: index }));
    console.log(`Xong: ${index.length} bộ, ${total} thẻ -> ${OUT_DIR}`);
})().catch(e => { console.error(e.message); process.exit(1); });