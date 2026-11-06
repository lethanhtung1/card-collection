// update-ws.js — tạo data/<game>/index.json + data/<game>/<set>.json từ https://en.ws-tcg.com/cardlist/
// Chạy:  node update-ws.js                 (cả 3 game)
//        node update-ws.js --only=aot      (1 game)
//        node update-ws.js --overlord=123  (chỉ định ID title nếu script không tự tìm được)
// Cần Node 18+ (có fetch sẵn). Không cần cài thư viện.

const fs = require('fs');
const path = require('path');

const BASE = 'https://en.ws-tcg.com';
const DELAY = 400; // ms giữa các request, đừng hạ thấp quá để tránh làm quá tải site

// folder phải khớp FILE_GAMES trong script.js
const GAMES = {
    aot:      { title: 115,  match: /attack on titan/i },
    rascal:   { title: 145,  match: /rascal does not dream/i },
    overlord: { title: null, match: /overlord/i }          // tự tìm ID trong trang cardlist
};

// Tên bộ đã biết chắc; bộ chưa có trong bảng sẽ hiện bằng mã bộ (vd. SX04)
const SET_NAMES = {
    'AOT/SX04': 'Attack On Titan: Final Season',
    'SBY/W114': 'Rascal Does Not Dream Series'
};

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
}));

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (card price checker)' } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    await sleep(DELAY);
    return res.text();
}

const decode = s => s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const text = html => decode(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Tự tìm ID title (vd. Overlord) từ trang cardlist
async function discoverTitleId(match) {
    const html = await get(`${BASE}/cardlist/`);
    for (const re of [
        /<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/g,
        /title=(\d+)[^>]*>([^<]+)</g
    ]) {
        for (const m of html.matchAll(re)) {
            if (match.test(decode(m[2]))) return Number(m[1]);
        }
    }
    return null;
}

// Tách danh sách <li> chứa thẻ (có link ?cardno=)
function splitItems(html) {
    return [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
        .map(m => m[1])
        .filter(h => /cardno=/.test(h));
}
const cardnoOf = h => {
    const m = h.match(/cardno=([^&"']+)/);
    return m ? decodeURIComponent(decode(m[1])) : '';
};

function parseTextItem(h) {
    const code = cardnoOf(h);
    const t = text(h);
    const get1 = re => (t.match(re) || [])[1] || '';
    const name = get1(new RegExp('^(.*?)\\s+' + code.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + '\\s')) || t.split(' Card Type')[0];
    const type = get1(/Card Type\s+(\S+)/);
    const rarity = get1(/Rarity\s+(\S+)/);
    const level = get1(/Level\s+(\S+)/);
    const cost = get1(/Cost\s+(\S+)/);
    const power = get1(/Power\s+(\S+)/);
    const ability = t.replace(/^.*?\bSoul\b/, '').replace(/\s*View more\s*$/, '').trim();

    // Màu thường là ảnh: lấy từ tên file/alt (red, blue, green, yellow)
    const colorSrc = (h.match(/(?:src|alt)="[^"]*\b(red|blue|green|yellow|purple|colorless)\b[^"]*"/i) || [])[1] || '';
    const color = colorSrc ? colorSrc[0].toUpperCase() + colorSrc.slice(1).toLowerCase() : '';

    const dash = v => (v === '-' ? '' : v);
    return {
        code, name: name.trim(), type, rarity,
        level: dash(level), cost: dash(cost), power: dash(power),
        color, ability
    };
}

function parseImageItem(h) {
    const img = (h.match(/<img[^>]*\bsrc="([^"]+)"/) || [])[1] || '';
    return { code: cardnoOf(h), image: img.startsWith('http') ? img : img ? BASE + img : '' };
}

// Mã bộ: "AOT/SX04-001SSP" -> "AOT/SX04"; "AOT/BRO2022-01" -> "AOT/BRO2022"
const setKeyOf = code => (code.match(/^([^-]+)-/) || [])[1] || code;
const setIdOf = key => key.split('/').pop();

async function scrapeGame(folder, titleId) {
    const byCode = new Map();
    for (let page = 1; page <= 200; page++) {
        const q = `${BASE}/cardlist/searchresults/?title=${titleId}&sort=new&page=${page}`;
        const [textHtml, imgHtml] = await Promise.all([
            get(`${q}&view=text`), get(`${q}&view=image`)
        ]);
        const items = splitItems(textHtml).map(parseTextItem).filter(c => c.code);
        const images = new Map(splitItems(imgHtml).map(parseImageItem).map(i => [i.code, i.image]));

        const before = byCode.size;
        for (const c of items) if (!byCode.has(c.code)) byCode.set(c.code, { ...c, image: images.get(c.code) || '' });
        process.stdout.write(`\r  ${folder}: trang ${page}, ${byCode.size} thẻ   `);

        if (!items.length) break;
        if (byCode.size === before) {
            console.warn(`\n  ⚠ Trang ${page} không có thẻ mới — có thể tham số phân trang khác "&page=N". Dừng ở ${byCode.size} thẻ.`);
            break;
        }
    }
    console.log();
    return [...byCode.values()];
}

async function buildGame(folder) {
    const g = GAMES[folder];
    let titleId = args[folder] ? Number(args[folder]) : g.title;
    if (!titleId) titleId = await discoverTitleId(g.match);
    if (!titleId) {
        console.error(`✗ ${folder}: không tìm được ID title. Mở en.ws-tcg.com/cardlist, chọn title, lấy số sau "title=" rồi chạy: node update-ws.js --${folder}=ID`);
        return;
    }
    console.log(`▶ ${folder} (title=${titleId})`);

    const list = await scrapeGame(folder, titleId);
    const sets = new Map();     // giữ thứ tự xuất hiện (mới -> cũ)
    for (const c of list) {
        const key = setKeyOf(c.code);
        const id = setIdOf(key);
        if (!sets.has(id)) sets.set(id, { id, key, name: SET_NAMES[key] || id, cards: [] });
        const set = sets.get(id);
        set.cards.push({
            tcg: folder,
            code: c.code,
            name: c.name,
            set: id,
            setName: set.name,
            number: c.code,
            rarity: c.rarity || 'Unknown',
            domain: c.color,
            type: c.type,
            image: c.image,
            artist: '',
            level: c.level,
            cost: c.cost,
            power: c.power,
            ability: c.ability,
            flavor: '',
            market: null,
            tags: []
        });
    }

    const dir = path.join('data', folder);
    fs.mkdirSync(dir, { recursive: true });
    for (const s of sets.values()) {
        fs.writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(s.cards));
    }
    fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({
        updated: new Date().toISOString(),
        sets: [...sets.values()].map(s => ({
            id: s.id, name: s.name, abbreviation: s.key.split('/')[0], count: s.cards.length, published: ''
        }))
    }, null, 1));
    console.log(`✓ ${folder}: ${list.length} thẻ, ${sets.size} bộ -> data/${folder}/`);
}

(async () => {
    const only = args.only ? String(args.only).split(',') : Object.keys(GAMES);
    for (const folder of only) {
        if (!GAMES[folder]) { console.error(`Game không hợp lệ: ${folder}`); continue; }
        try { await buildGame(folder); }
        catch (e) { console.error(`✗ ${folder}:`, e.message); }
    }
})();