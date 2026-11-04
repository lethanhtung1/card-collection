/**
 * Soi các bản in của một lá Yu-Gi-Oh! trong data/yugioh/*.json
 * Chạy trong thư mục data:   node check-yugioh.js 26LP-EN002
 * Có thể gõ một phần tên thay cho số thẻ:   node check-yugioh.js faimena
 */
const fs = require('fs');
const path = require('path');

const q = String(process.argv[2] || '').toLowerCase();
if (!q) { console.log('Cách dùng: node check-yugioh.js <số thẻ hoặc tên>'); process.exit(1); }

const dir = path.resolve(__dirname, 'yugioh');
if (!fs.existsSync(dir)) { console.log('Chưa có thư mục data/yugioh, hãy chạy node update-yugioh.js trước.'); process.exit(1); }

const rows = [];
for (const f of fs.readdirSync(dir)) {
    if (f === 'index.json' || !f.endsWith('.json')) continue;
    for (const c of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) {
        if (String(c.number).toLowerCase() === q || String(c.name).toLowerCase().includes(q) || String(c.number).toLowerCase().includes(q)) {
            rows.push({ file: f, code: c.code, name: c.name, number: c.number, rarity: c.rarity,
                        tags: c.tags.join(' | '), usd: c.market ? c.market.usd : null, image: c.image });
        }
    }
}
console.log(`Tìm thấy ${rows.length} dòng:`);
rows.forEach(r => console.log(`${r.file}  ${r.code}\n    ${r.name} · ${r.number} · ${r.rarity} · tags=[${r.tags}] · $${r.usd}\n    ${r.image}`));

// Cảnh báo nếu có hai dòng giống hệt về số thẻ + độ hiếm + tags
const seen = {};
rows.forEach(r => { const k = [r.number, r.rarity, r.tags].join('~'); (seen[k] ||= []).push(r.code); });
Object.entries(seen).filter(([, v]) => v.length > 1).forEach(([k, v]) =>
    console.log('\nGiống nhau về số thẻ + độ hiếm + tags (khác productId):', k, '->', v.join(', ')));