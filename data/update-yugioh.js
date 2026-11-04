/**
 * Tạo data/yugioh/index.json + data/yugioh/<bộ>.json (mỗi bộ một file nhỏ) từ YGOPRODeck.
 *
 * Đây là NGUỒN THẺ (như TCGdex của Pokémon), không phải danh sách bán hàng của chợ:
 *  - mỗi mã bộ (vd LOB-EN001) chỉ ra MỘT dòng, các độ hiếm gộp lại (hiện độ hiếm cao nhất, còn lại ghi trong tags)
 *  - ảnh chính thức, chất lượng đồng đều
 *  - giá chỉ là phần phụ: giá TCGplayer theo lá bài (không phân theo độ hiếm)
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

    // setName -> Map(key -> thẻ)
    const bySet = new Map();
    for (const c of all) {
        const gp = (c.card_prices || [])[0] || {};
        const usd = num(gp.tcgplayer_price), eur = num(gp.cardmarket_price);
        const isSpell = /spell/i.test(c.type), isTrap = /trap/i.test(c.type);
        const levelLabel = c.linkval != null ? 'Link' : /xyz/i.test(c.type) ? 'Rank' : 'Level';
        const img = (c.card_images || [])[0] || {};

        for (const p of (c.card_sets || [])) {
            if (!bySet.has(p.set_name)) bySet.set(p.set_name, new Map());
            const bucket = bySet.get(p.set_name);
            const key = `${p.set_code}|${c.id}`;

            let card = bucket.get(key);
            if (!card) {
                card = {
                    tcg: 'yugioh',
                    code: key,
                    name: c.name,
                    set: '',                                   // điền sau khi có id của bộ
                    setName: p.set_name,
                    number: p.set_code,
                    rarity: '',
                    rarities: new Set(),
                    domain: c.attribute || (isSpell ? 'SPELL' : isTrap ? 'TRAP' : ''),
                    type: [c.type, c.race].filter(Boolean).join(', '),
                    image: img[IMAGE_FIELD] || img.image_url || '',
                    artist: '',
                    atk: c.atk ?? '', def: c.def ?? '',
                    level: c.level ?? c.linkval ?? '', levelLabel,
                    energy: '', power: '', might: '',
                    ability: c.desc || '',
                    flavor: '',
                    archetype: c.archetype || '',
                    market: (usd != null || eur != null)
                        ? { usd, eur, source: 'YGOPRODeck (giá TCGplayer theo lá bài) · ' + new Date().toISOString().slice(0, 10) }
                        : null
                };
                bucket.set(key, card);
            }
            if (p.set_rarity) card.rarities.add(p.set_rarity);
        }
    }

    // Ghi file
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.readdirSync(OUT_DIR).filter(f => f.endsWith('.json')).forEach(f => fs.unlinkSync(path.join(OUT_DIR, f)));   // xóa file cũ

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
            const { rarities, archetype, ...rest } = card;
            return {
                ...rest,
                set: id,
                rarity: rars[0] || 'Unspecified',
                tags: [rars.length > 1 ? 'Rarities: ' + rars.join(', ') : '', archetype].filter(Boolean)
            };
        }).sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));

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
        JSON.stringify({ updated: new Date().toISOString().slice(0, 10), sets: index }));
    console.log(`Xong: ${index.length} bộ, ${total} thẻ -> ${OUT_DIR}`);
})().catch(e => { console.error(e.message); process.exit(1); });