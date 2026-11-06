/**
 * Tạo data/naruto/*.json từ trang chính thức của KAYOU
 * (https://www.kayouofficial.com/en-US/ip-collections -> từng "Series" -> LIST OF CARDS).
 *
 * Mỗi series = 1 bộ (1 file), mỗi ô trong "LIST OF CARDS" = 1 thẻ:
 *  - tên thẻ  : lấy từ alt của ảnh (ví dụ "Naruto Uzumaki", "Rumi")
 *  - độ hiếm  : tiêu đề nhóm (CR, ZR, UR, SSR, ... kèm tên đầy đủ "Super Secret Rare")
 *  - số thẻ   : KAYOU KHÔNG ghi số thẻ trên web -> tự đánh số theo thứ tự trên trang:
 *               <MÃ ĐỘ HIẾM>-001, 002, ...  (khớp cách PriceCharting đánh số KPDH Classic)
 *  - ảnh      : link ảnh chính thức (không tải về, chỉ lưu link)
 *  - GIÁ      : web KAYOU không có giá -> market = null (cần nguồn giá khác)
 *
 * Chạy (cần Node 18+), đặt file này trong thư mục data/ cạnh update-yugioh.js:
 *   node update-kayou.js
 *
 * Thêm series mới: dán link trang series vào SEEDS bên dưới (hoặc để DISCOVER tự dò link).
 * Nếu trang chỉ ra nội dung bằng JavaScript (script báo "0 thẻ"): mở trang series trong trình duyệt,
 * Ctrl+S lưu thành  data/kayou-html/<mã series>.html  (vd series-5zdty4vj.html) rồi chạy lại.
 */
const fs = require('fs');
const path = require('path');

// ===================== CONFIG =====================
const BASE = 'https://www.kayouofficial.com';
const SEEDS = [
    `${BASE}/en-US/series/series-0nyket49`,
    `${BASE}/en-US/series/series-md6xr8u7`,
    `${BASE}/en-US/series/series-8idoe481`,
    `${BASE}/en-US/series/series-ldbindyv`,
    `${BASE}/en-US/series/series-cv8e3pgi`,
    `${BASE}/en-US/series/series-jj9iw6u0`,
    `${BASE}/en-US/series/series-5zdty4vj`,
    // dán thêm link series mới vào đây khi KAYOU ra bộ mới
];
const DISCOVER = true;                         // tự dò thêm link series từ trang IP & Collections
const DISCOVER_FROM = [`${BASE}/en-US/ip-collections`];
const MAX_PAGES = 120;
const LINK_RE = /\/en-US\/(?:series|ip-collections)\/[A-Za-z0-9_-]+/gi;   // series + trang từng IP
const DELAY_MS = 500;
const HTML_DIR = path.resolve(__dirname, './kayou-html');   // nơi để file HTML lưu tay (dự phòng)

// IP nào được giữ lại (so khớp với phần giữa của <title>: "Series | IP | KAYOU")
const IPS = [
    { match: /^naruto$/i, tcg: 'naruto', folder: 'naruto' }
];
// Tên đầy đủ của mã độ hiếm, dùng khi trang chỉ ghi mã (vd "UR (12)"). Mã chưa có ở đây thì giữ nguyên mã.
const RARITY_NAMES = {
    R: 'Rare', SR: 'Super Rare', SSR: 'Super Secret Rare', UR: 'Ultra Rare',
    PTR: 'Platinum Rare', PU: 'Parallel Universe', MR: 'Miracle Rare',
    BP: 'Brush Rare', SP: 'Special', SE: 'Scenario-E'
};
// ==================================================

const sleep = ms => new Promise(r => setTimeout(r, ms));
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'set';
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };

function decode(s) {
    return String(s)
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
        .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}
const clean = s => decode(s).replace(/\s+/g, ' ').trim();

async function getText(url) {
    let err;
    for (let i = 0; i < 3; i++) {
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'CheckPrice/1.0', 'Accept-Language': 'en-US,en;q=0.9' } });
            if (!r.ok) throw new Error(`${r.status} ${url}`);
            return await r.text();
        } catch (e) { err = e; await sleep(800 * (i + 1)); }
    }
    throw err;
}

// ---------- lấy link ảnh từ thẻ <img> (hỗ trợ lazy-load và /_next/image) ----------
function attr(tag, name) {
    const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
    return m ? decode(m[2] ?? m[3]) : '';
}
function imgSrc(tag) {
    let src = attr(tag, 'src');
    if (!src || src.startsWith('data:')) src = attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-original');
    if (!src || src.startsWith('data:')) src = (attr(tag, 'srcset').split(',')[0] || '').trim().split(/\s+/)[0];
    if (!src) return '';
    const nx = src.match(/[?&]url=([^&]+)/);
    if (/\/_next\/image/.test(src) && nx) src = decodeURIComponent(nx[1]);
    if (src.startsWith('//')) src = 'https:' + src;
    else if (src.startsWith('/')) src = BASE + src;
    return src;
}
const isCardImage = src => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(src);

// ---------- phân tích 1 trang series ----------
function parsePage(html) {
    const links = [...new Set(html.match(LINK_RE) || [])];

    const title = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
    const tp = title.split('|').map(s => s.trim());
    const seriesName = tp[0] || '';
    const ipName = tp.length >= 3 ? tp[tp.length - 2] : '';

    // tách thành chuỗi token theo thứ tự xuất hiện: chữ hoặc ảnh
    const tokens = [];
    const re = /<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<!--[\s\S]*?-->|<img\b[^>]*>|<[^>]+>|[^<]+/gi;
    for (const m of html.matchAll(re)) {
        const t = m[0];
        if (/^<img\b/i.test(t)) tokens.push({ img: true, alt: clean(attr(t, 'alt')), src: imgSrc(t) });
        else if (t[0] !== '<') { const x = clean(t); if (x) tokens.push({ text: x }); }
    }
    const T = i => (tokens[i] && tokens[i].text) || '';

    // tiêu đề nhóm, chỉ xét giữa "LIST OF CARDS" và "WHERE TO BUY". Các dạng gặp:
    //   SSR | Super Secret Rare | 08                          (tên đầy đủ + số thứ tự nhóm)
    //   CR | Creative Rare | Fantastical Chronicle... | 01    (thêm dòng mô tả giữa tên và số)
    //   UR | ( | 12 | )   (bảng tóm tắt: chỉ mã + số thẻ; React tách "(", "12", ")" thành 3 mảnh chữ)
    // Bảng tóm tắt không chứa ảnh nhưng cho số thẻ từng nhóm -> dùng để đối chiếu.
    const listAt = tokens.findIndex(t => t.text && /^list of cards$/i.test(t.text));
    let endAt = tokens.findIndex((t, i) => i > listAt && t.text && /^where to buy$/i.test(t.text));
    if (endAt < 0) endAt = tokens.length;
    const heads = new Map();     // vị trí token -> { name, skip, count }
    for (let i = Math.max(listAt, 0); i + 1 < endAt; i++) {
        if (!/^[A-Z]{1,5}$/.test(T(i))) continue;
        let j = i + 1, name = '';
        const isWord = x => /[A-Za-z]{3,}/.test(x);
        if (isWord(T(j))) {
            name = T(j++);
            for (let e = 0; e < 2 && isWord(T(j)); e++) j++;      // bỏ qua dòng mô tả phụ
        }
        let nums = 0, count = null;
        for (; /^[()]$|^\(?\d{1,3}\)?$/.test(T(j)); j++) {
            const d = T(j).match(/\d+/);
            if (!d) continue;
            nums++;
            if (T(j).startsWith('(') || T(j - 1) === '(') count = +d[0];   // "(12)" = số thẻ của nhóm
        }
        if (nums) heads.set(i, { name: name || RARITY_NAMES[T(i)] || T(i), skip: j - i - 1, count });
    }

    // các nhóm độ hiếm: [MÃ] [Tên đầy đủ] [số nhóm 01] rồi tới các ảnh
    const sections = [];
    let cur = null, started = false;
    for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        if (tk.text !== undefined) {
            const h = heads.get(i);
            if (h) {
                cur = { code: tk.text, name: h.name, count: h.count, images: [] };
                sections.push(cur);
                started = true;
                i += h.skip;            // bỏ qua tên đầy đủ và số thứ tự
                continue;
            }
            if (started && /^where to buy$/i.test(tk.text)) { cur = null; started = false; }
            continue;
        }
        if (cur && tk.src && isCardImage(tk.src)) cur.images.push({ alt: tk.alt, src: tk.src });
    }

    const after = label => {
        const i = tokens.findIndex(t => t.text && t.text.toLowerCase() === label.toLowerCase());
        return i >= 0 ? T(i + 1) : '';
    };
    return {
        title, seriesName, ipName, links, sections,
        meta: { product: after('Product Name'), model: after('Model'), release: after('Release Date'), packaging: after('Packaging Specs') }
    };
}

function releaseToDate(s) {
    const m = String(s).toLowerCase().match(/([a-z]+)\s+(\d{4})/);
    return m && MONTHS[m[1]] ? `${m[2]}-${String(MONTHS[m[1]]).padStart(2, '0')}` : '';
}

// ---------- chạy ----------
(async () => {
    const queue = [...SEEDS];
    const seen = new Set();
    const queued = new Set(SEEDS);
    const addLink = p => { const u = BASE + p; if (!queued.has(u)) { queued.add(u); queue.push(u); } };

    if (DISCOVER) {
        for (const u of DISCOVER_FROM) {
            try {
                const h = await getText(u);
                (h.match(LINK_RE) || []).forEach(addLink);
            } catch (e) { console.log(`(bỏ qua dò link ${u}: ${e.message})`); }
        }
    }

    // trang IP/series lưu tay từ trình duyệt (Ctrl+S, "hoàn chỉnh") -> lấy thêm link series trong đó
    if (fs.existsSync(HTML_DIR)) {
        for (const f of fs.readdirSync(HTML_DIR).filter(f => /\.html?$/i.test(f))) {
            (fs.readFileSync(path.join(HTML_DIR, f), 'utf8').match(LINK_RE) || []).forEach(addLink);
        }
    }

    console.log(`Dò được ${queue.length} link để duyệt (series + trang IP)`);
    const results = new Map();      // ip.folder -> [{ id, name, ... , cards }]
    let skipped = 0;

    while (queue.length && seen.size < MAX_PAGES) {
        const url = queue.shift();
        if (seen.has(url)) continue;
        seen.add(url);
        const sid = url.split('/').pop();

        let page;
        try { page = parsePage(await getText(url)); }
        catch (e) { console.log(`✗ ${sid}: ${e.message}`); continue; }

        const local = path.join(HTML_DIR, `${sid}.html`);
        if (!page.sections.some(s => s.images.length) && fs.existsSync(local)) {
            console.log(`  ${sid}: dùng file lưu tay ${path.relative(__dirname, local)}`);
            page = parsePage(fs.readFileSync(local, 'utf8'));
        }
        page.links.forEach(addLink);

        const ip = IPS.find(x => x.match.test(page.ipName));
        if (!ip) { if (url.includes('/series/')) skipped++; await sleep(DELAY_MS); continue; }

        const total = page.sections.reduce((n, s) => n + s.images.length, 0);
        if (!total) {
            console.log(`✗ ${page.title || sid}: không đọc được thẻ nào (trang có thể dựng bằng JavaScript). ` +
                `Hãy lưu trang thành ${path.relative(__dirname, local)} rồi chạy lại.`);
            await sleep(DELAY_MS); continue;
        }

        if (!results.has(ip.folder)) results.set(ip.folder, { ip, sets: [] });
        const bucket = results.get(ip.folder);
        let id = slug(page.seriesName || sid), n = 2;
        while (bucket.sets.some(s => s.id === id)) id = `${slug(page.seriesName)}-${n++}`;

        const used = new Set();
        const cards = [];
        for (const s of page.sections) {
            let k = 0;
            for (const im of s.images) {
                if (used.has(im.src)) continue;           // ảnh lặp (bản mobile/desktop) thì bỏ
                used.add(im.src);
                const num = `${s.code}-${String(++k).padStart(3, '0')}`;
                cards.push({
                    tcg: ip.tcg,
                    code: `${id}|${num}`,
                    name: im.alt || `${s.name} ${k}`,
                    set: id,
                    setName: page.seriesName,
                    number: num,
                    rarity: s.name,
                    domain: '', type: '',
                    image: im.src,
                    artist: '',
                    atk: '', def: '', level: '', levelLabel: '',
                    energy: '', power: '', might: '',
                    ability: '', flavor: '',
                    tags: [s.code],
                    market: null
                });
            }
        }

        for (const s of page.sections) {
            if (s.count == null) continue;
            const got = cards.filter(c => c.tags[0] === s.code).length;
            if (got !== s.count) console.log(`  ⚠ ${page.seriesName} ${s.code}: trang ghi ${s.count}, đọc được ${got}`);
        }

        bucket.sets.push({
            id,
            name: page.seriesName,
            abbreviation: page.meta.model || '',
            count: cards.length,
            published: releaseToDate(page.meta.release),
            cards
        });
        console.log(`✓ [${ip.tcg}] ${page.seriesName}: ${cards.length} thẻ`);
        const byRarity = {};
        cards.forEach(c => { byRarity[c.tags[0]] = (byRarity[c.tags[0]] || 0) + 1; });
        console.log('  độ hiếm: ' + Object.entries(byRarity).map(([r, n]) => `${r}×${n}`).join('  '));
        await sleep(DELAY_MS);
    }

    if (!results.size) { console.error('Không lấy được bộ nào.'); process.exit(1); }

    const today = new Date().toISOString().slice(0, 10);
    for (const [folder, { sets }] of results) {
        const dir = path.resolve(__dirname, './' + folder);
        fs.mkdirSync(dir, { recursive: true });

        // giữ lại các bộ cũ chưa chạy lại lần này
        let oldSets = [];
        try { oldSets = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).sets || []; } catch (e) {}
        const fresh = new Map(sets.map(s => [s.id, s]));
        const index = [...sets.map(({ cards, ...info }) => info), ...oldSets.filter(s => !fresh.has(s.id))];

        for (const s of sets) fs.writeFileSync(path.join(dir, `${s.id}.json`), JSON.stringify(s.cards));
        index.sort((a, b) => String(b.published).localeCompare(String(a.published)));
        fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ updated: today, sets: index }));
        console.log(`Xong ${folder}: ${index.length} bộ, ${sets.reduce((n, s) => n + s.cards.length, 0)} thẻ mới -> ${dir}`);
    }
    if (skipped) console.log(`(đã bỏ qua ${skipped} series của IP khác)`);
})().catch(e => { console.error(e.message); process.exit(1); });