const $ = selector => document.querySelector(selector);

let cards = [];
let prices = {};
let currency = 'both';
let page = 1;
const PAGE_SIZE = 20;

// --- 1. KHAI BÁO CÁC HÀM XỬ LÝ ĐỘ HIẾM LÊN ĐẦU TRÁNH LỖI ReferenceError ---
// Mã độ hiếm viết tắt (One Piece & các game để nguyên mã) -> slug
const RARITY_SHORT = {
    c: 'common',
    uc: 'uncommon', u: 'uncommon',
    r: 'rare',
    sr: 'epic',
    l: 'legendary', lr: 'legendary',
    sec: 'showcase', scr: 'showcase', spr: 'showcase',
    sp: 'showcase', tr: 'showcase', alt: 'showcase',
    // Weiss Schwarz
    rr: 'epic', rrr: 'epic', ssp: 'showcase', ttr: 'showcase',
    pr: 'rare', cr: 'rare', cc: 'uncommon', td: 'common'
};

function getRarityClass(rarity) {
    const v = String(rarity || '').toLowerCase();

    // Mã viết tắt: "SR", "SEC", "SP CARD", "SR-P"... (khớp nguyên mã, không dính chữ khác)
    const code = v.replace(/[^a-z]/g, '');
    if (RARITY_SHORT[code]) return RARITY_SHORT[code];
    if (/^sp\b/.test(v) || /^sec\b/.test(v)) return 'showcase';

    if (/secret|hyper|illustration|ultra|radiant|amazing|shiny|ace spec|rainbow|gold|mega|crown|prism|showcase|special|treasure|manga|ultimate|ghost|starlight|collector/.test(v)) return 'showcase';
    if (/holo|foil|reverse/.test(v)) return 'holo';
    if (/double|epic|super/.test(v)) return 'epic';
    if (/leader/.test(v)) return 'legendary';
    if (/legend/.test(v)) return 'legendary';
    if (/uncommon/.test(v)) return 'uncommon';
    if (/common/.test(v)) return 'common';
    if (/rare/.test(v)) return 'rare';
    return 'common';
}

// Thứ hạng để sắp xếp "Rarity" (cao -> thấp)
const RARITY_RANK = ['common', 'uncommon', 'rare', 'holo', 'epic', 'legendary', 'showcase'];
const rarityRank = r => RARITY_RANK.indexOf(getRarityClass(r));

function renderRarity(rarity) {
    const className = getRarityClass(rarity);
    return `
        <span class="rarity rarity-${className}">
            ${rarity || "Unknown"}
        </span>
    `;
}

// --- 2. CÁC HÀM CHUẨN HÓA & TIỀN TỆ ---
function normalizeCard(c) {
    return {
        code: c.cardCode || c.code || c.id || '',
        name: c.fullName || c.name || 'Unknown',
        set: c.setCode || c.set || '',
        setName: c.cardSet || c.setName || c.setCode || '',
        number: c.cardNumber || c.number || '',
        rarity: c.rarity || 'Unknown',
        domain: Array.isArray(c.domains)
            ? c.domains.join(', ')
            : (c.domain || ''),
        type: Array.isArray(c.cardTypeLabels)
            ? c.cardTypeLabels.join(', ')
            : (c.cardType || ''),
        image: c.imageUrl || c.image || '',
        artist: c.artist || '',
        energy: c.energy ?? '',
        power: c.power ?? '',
        might: c.might ?? '',
        ability: c.abilityEffective || c.abilityOriginal || '',
        flavor: c.flavorText || c.flavor || '',
        tags: Array.isArray(c.tags) ? c.tags : [],
    };
}

// Ảnh lỗi: thử lần lượt high.webp -> low.png -> low.webp, hết cách thì hiện ô "Chưa có ảnh"
const IMG_FALLBACKS = ['high.webp', 'low.png', 'low.webp'];

function cardImgError(img) {
    const tried = Number(img.dataset.try || 0);
    if (tried < IMG_FALLBACKS.length && /\/(high|low)\.(png|webp)$/.test(img.src)) {
        img.dataset.try = tried + 1;
        img.src = img.src.replace(/\/(high|low)\.(png|webp)$/, '/' + IMG_FALLBACKS[tried]);
        return;
    }
    const box = document.createElement('div');
    box.className = 'img-placeholder';
    box.style.cssText = 'display:grid;place-items:center;width:100%;aspect-ratio:744/1039;'
        + 'text-align:center;padding:12px;color:#7d8aa5;font-size:13px;'
        + 'background:linear-gradient(160deg,#16213a,#0c1426)';
    box.textContent = 'Chưa có ảnh · ' + (img.alt || '');
    img.replaceWith(box);
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;',
        '"': '&quot;', "'": '&#39;'
    })[c]);
}

function formatMoney(value, type) {
    if (value === undefined || value === null || value === '') {
        return 'Chưa có giá';
    }

    const number = Number(value);
    if (!Number.isFinite(number)) return 'Chưa có giá';

    if (type === 'VND') {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND',
            maximumFractionDigits: 0
        }).format(number);
    }

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(number);
}

// Giá Pokémon lấy từ TCGdex (nhúng sẵn trong từng lá) + tỉ giá để quy đổi
const embeddedPrices = {};
const fx = { VND: 25500, EUR: 0.92 };      // VND và EUR trên mỗi 1 USD (cập nhật khi tải được tỉ giá)

async function loadFx() {
    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        const data = await res.json();
        if (data.rates && data.rates.VND) fx.VND = data.rates.VND;
        if (data.rates && data.rates.EUR) fx.EUR = data.rates.EUR;
        render();
    } catch (e) { /* giữ tỉ giá mặc định */ }
}

// Lấy giá từ trường `pricing` của TCGdex: TCGplayer (USD) ưu tiên, không có thì Cardmarket (EUR)
function extractMarket(pricing) {
    if (!pricing) return null;

    let usd = null, variant = '', updated = '';
    const tp = pricing.tcgplayer;
    if (tp && typeof tp === 'object') {
        const list = Object.entries(tp).filter(([, v]) => v && typeof v === 'object' && v.marketPrice != null);
        const pick = list.find(([k]) => k === 'normal') || list.find(([k]) => k === 'holo') || list[0];
        if (pick) { usd = pick[1].marketPrice; variant = pick[0]; updated = tp.updated || ''; }
    }

    const cm = pricing.cardmarket;
    const eur = cm ? (cm.trend ?? cm.avg ?? null) : null;
    if (usd == null && eur == null) return null;

    return {
        usd, eur,
        source: usd != null
            ? `TCGplayer (${variant}) · ${String(updated).slice(0, 10)}`
            : `Cardmarket trend (EUR → USD) · ${String((cm && cm.updated) || '').slice(0, 10)}`
    };
}

function getPrice(code) {
    if (prices[code]) return prices[code];
    const m = embeddedPrices[code];
    if (!m) return {};
    const usd = m.usd ?? (m.eur != null ? m.eur / fx.EUR : null);
    return {
        usd,
        vnd: usd != null ? Math.round(usd * fx.VND) : null,
        eur: m.eur,
        source: m.source
    };
}

function priceHTML(card) {
    const p = getPrice(card.code);

    let html = '';

    if (currency === 'both' || currency === 'usd') {
        html += `<div class="price-row">
            <span>USD</span>
            <b>${formatMoney(p.usd, 'USD')}</b>
        </div>`;
    }

    if (currency === 'both' || currency === 'vnd') {
        html += `<div class="price-row">
            <span>VND</span>
            <b>${formatMoney(p.vnd, 'VND')}</b>
        </div>`;
    }

    return html;
}

function loadCards(data, save = true) {
    const list = Array.isArray(data)
        ? data
        : Array.isArray(data.cards)
            ? data.cards
            : [data];

    cards = list.map(normalizeCard).filter(c => c.code);

    if (save) {
        try { localStorage.setItem('riftbound_cards', JSON.stringify(data)); }
        catch (e) { /* Ignore */ }
    }

    buildFilters();
    page = 1;
    render();
}

function buildSelect(selector, values, label) {
    const el = $(selector);
    if (!el) return;
    const current = el.value;

    el.innerHTML = `<option value="all">${label}</option>`;

    [...new Set(values.filter(Boolean))].sort().forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        el.appendChild(option);
    });

    if ([...el.options].some(o => o.value === current)) {
        el.value = current;
    }
}

// Ô chọn bộ cho các game đọc từ file: value = mã bộ, chữ hiển thị = tên bộ
function buildSetSelect(label) {
    const el = $('#setFilter');
    if (!el) return;
    const current = el.value;
    const sets = new Map();
    cards.forEach(c => {
        const v = c.set || c.setName || c.setCode;
        if (v && !sets.has(v)) sets.set(v, c.setName || v);
    });
    el.innerHTML = `<option value="all">${label}</option>`;
    [...sets.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), undefined, { numeric: true }))
        .forEach(([value, text]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = text;
            el.appendChild(opt);
        });
    if ([...el.options].some(o => o.value === current)) el.value = current;
}

function buildFilters() {
    const isPokemon = currentGame === 'pokemon';
    const setDriven = currentGame === 'pokemon' || currentGame === 'yugioh' || currentGame in FILE_GAMES;
    const gameName = (TCG_GAMES.find(g => g.id === currentGame) || {}).name || '';
    if (ygoSearchEl) ygoSearchEl.style.display = currentGame === 'yugioh' ? '' : 'none';

    // 1. Pokémon / Yu-Gi-Oh! có danh sách bộ lấy từ API nên không ghi đè setFilter
    if (!setDriven) {
        buildSetSelect(`All ${gameName} Sets`);
    }

    // 2. Luôn luôn cập nhật lại danh sách Rarity, Domain, Type theo danh sách thẻ bài hiện tại của bộ đang xem
    buildSelect('#rarityFilter', cards.map(c => c.rarity), 'All Rarities');
    
    buildSelect(
        '#domainFilter',
        cards.flatMap(c => (c.domain ? c.domain.split(', ') : [])),
        isPokemon ? 'All Energy Types'
            : currentGame === 'yugioh' ? 'All Attributes'
            : (currentGame === 'gundam' || currentGame === 'dbs' || (FILE_GAMES[currentGame] && FILE_GAMES[currentGame].ws)) ? 'All Colors'
            : 'All Domains'
    );
    
    buildSelect(
        '#typeFilter',
        cards.flatMap(c => (c.type ? c.type.split(', ') : [])),
        'All Card Types'
    );
}

function getFilteredCards() {
    const search = $('#search').value.toLowerCase();

    const set = $('#setFilter').value;
    const rarity = $('#rarityFilter').value;
    const domain = $('#domainFilter').value;
    const type = $('#typeFilter').value;
    const sort = $('#sortFilter').value;

    let result = cards.filter(c => {
        const matchesSearch = [
            c.name, c.code, c.number, c.artist, c.setName
        ].join(' ').toLowerCase().includes(search);

        return matchesSearch
            && (set === 'all' || String(c.set || c.setName || c.setCode || '').toLowerCase() === set.toLowerCase())
            && (rarity === 'all' || c.rarity === rarity)
            && (domain === 'all' || c.domain.split(', ').includes(domain))
            && (type === 'all' || c.type.split(', ').includes(type));
    });

    result.sort((a, b) => {
        if (sort === 'rarity') {
            return rarityRank(b.rarity) - rarityRank(a.rarity);
        }

        if (sort === 'price-desc' || sort === 'price-asc') {
            const pa = Number(getPrice(a.code).usd ?? -1);
            const pb = Number(getPrice(b.code).usd ?? -1);
            return sort === 'price-desc' ? pb - pa : pa - pb;
        }

        return a.name.localeCompare(b.name)
            || String(a.number).localeCompare(String(b.number), undefined, { numeric: true })
            || rarityRank(b.rarity) - rarityRank(a.rarity);
    });

    return result;
}

// --- 4. RENDER LƯỚI THẺ BÀI ---
function render() {
    const result = getFilteredCards();
    const pages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));

    page = Math.min(page, pages);

    const start = (page - 1) * PAGE_SIZE;
    const visible = result.slice(start, start + PAGE_SIZE);

    $('#cardGrid').innerHTML = visible.map(card => {
        const raritySlug = getRarityClass(card.rarity);
        const isSpecialHolo = ['showcase', 'epic', 'holo'].includes(raritySlug);
        
        const extraClass = isSpecialHolo ? ' holo-card' : '';
        const rarityAttr = `data-rarity="${raritySlug}"`;

        return `
            <article class="card-item${extraClass}" ${rarityAttr} data-code="${escapeHTML(card.code)}">
                <div class="card-image">
                    ${card.image
                        ? `<img loading="lazy" referrerpolicy="no-referrer" src="${escapeHTML(card.image)}" alt="${escapeHTML(card.name)}" onerror="cardImgError(this)">`
                        : ''}
                    ${renderRarity(card.rarity)}
                </div>
                <div class="card-info">
                    <div class="card-name">${escapeHTML(card.name)}</div>
                    <div class="card-meta">
                        ${escapeHTML(card.setName)} · ${escapeHTML(card.number)}
                    </div>
                    <div class="card-prices">${priceHTML(card)}</div>
                </div>
            </article>
        `;
    }).join('');

    $('#emptyState').style.display =
        cards.length === 0 ? 'block' : 'none';

    $('#cardGrid').style.display =
        result.length === 0 ? 'none' : 'grid';

    $('#totalCards').textContent = cards.length;
    $('#totalSets').textContent =
        new Set(cards.map(c => c.set).filter(Boolean)).size;

    $('#pricedCards').textContent = cards.filter(c => {
        const p = getPrice(c.code);
        return p.usd != null || p.vnd != null;
    }).length;

    $('#resultCount').textContent = `${result.length} thẻ`;
    $('#pageInfo').textContent = `Trang ${page} / ${pages}`;

    $('#prevPage').disabled = page <= 1;
    $('#nextPage').disabled = page >= pages;
}

const COLLECTION_KEY = 'riftbound_collection';

function loadCollection() {
    try { return JSON.parse(localStorage.getItem(COLLECTION_KEY) || '{}'); }
    catch (e) { return {}; }
}

function saveCollection(data) {
    try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(data)); }
    catch (e) { console.error(e); }
}

function collectionHTML(code) {
    const c = loadCollection()[code] || {};
    return [['owned', 'Owned'], ['trade', 'For trade'], ['wish', 'Wishlist']]
        .map(([key, label]) => `
            <div class="coll-row coll-${key}">
                <span>${label}</span>
                <div class="stepper">
                    <button data-coll="${key}" data-step="-1" aria-label="Giảm ${label}">−</button>
                    <b>${c[key] || 0}</b>
                    <button data-coll="${key}" data-step="1" aria-label="Tăng ${label}">+</button>
                </div>
            </div>`).join('');
}

function statHTML(label, value) {
    if (value === '' || value === null || value === undefined) return '';
    return `<div class="stat-cell"><small>${label}</small><strong>${escapeHTML(value)}</strong></div>`;
}

function detailStats(card) {
    let row1, row2;
    if (card.tcg === 'pokemon') {
        row1 = [['HP', card.hp], ['Stage', card.stage], ['Retreat', card.retreat]];
        row2 = [['Element', card.domain], ['Type', card.type], ['Rarity', card.rarity]];
    } else if (card.tcg === 'onepiece') {
        row1 = [['Cost', card.cost], ['Power', card.power],
                card.life !== '' ? ['Life', card.life] : ['Counter', card.counter]];
        row2 = [['Color', card.domain], ['Type', card.type], ['Rarity', card.rarity]];
    } else if (card.tcg === 'yugioh') {
        row1 = [['ATK', card.atk], ['DEF', card.def], [card.levelLabel || 'Level', card.level]];
        row2 = [['Attribute', card.domain], ['Type', card.type], ['Rarity', card.rarity]];
    } else if (card.tcg === 'dbs') {
        row1 = [['Cost', card.cost], ['Power', card.power], ['Combo', card.combo]];
        row2 = [['Color', card.domain], ['Type', card.type], ['Rarity', card.rarity]];
    } else if (FILE_GAMES[card.tcg] && FILE_GAMES[card.tcg].ws) {
        row1 = [['Level', card.level], ['Cost', card.cost], ['Power', card.power]];
        row2 = [['Color', card.domain], ['Type', card.type], ['Rarity', card.rarity]];
    } else if (card.tcg === 'gundam') {
        row1 = [['Cost', card.cost], ['Level', card.level], ['AP / HP', card.ap !== '' || card.hp !== '' ? `${card.ap} / ${card.hp}` : '']];
        row2 = [['Color', card.domain], ['Type', card.type], ['Rarity', card.rarity]];
    } else {
        row1 = [['Energy', card.energy], ['Power', card.power], ['Might', card.might]];
        row2 = [['Domain', card.domain], ['Type', card.type], ['Rarity', card.rarity]];
    }
    const grid = r => `<div class="stat-grid stat-grid-3">${r.map(([l, v]) => statHTML(l, v)).join('')}</div>`;
    return grid(row1) + grid(row2);
}

// Nút mua trong chi tiết thẻ, áp dụng cho MỌI game:
//  - "Buy now": chỉ khi dữ liệu giá của thẻ có sẵn link (p.url)
//  - TCGplayer: link tìm theo tên thẻ (game nào cũng có)
//  - eBay: thêm cho game KAYOU, vì thẻ KAYOU chưa có nguồn giá
function buyLinksHTML(card, p) {
    const links = [];
    if (p.url) links.push(['Buy now', p.url]);
    links.push(['Tìm trên TCGplayer', 'https://www.tcgplayer.com/search/all/product?q=' + encodeURIComponent(card.name)]);
    if (FILE_GAMES[card.tcg]) links.push(['Tìm giá trên eBay', ebaySearchURL(card)]);
    return links.map(([label, url]) =>
        `<a class="buy-btn" href="${escapeHTML(url)}" target="_blank" rel="noopener">${label}</a>`).join('');
}

function showDetail(code) {
    const card = cards.find(c => c.code === code);
    if (!card) return;

    const p = getPrice(code);
    const slug = getRarityClass(card.rarity);
    const hasPrice = p.usd != null || p.vnd != null;

    $('#detailContent').innerHTML = `
        <div class="detail" data-code="${escapeHTML(card.code)}">
            <header class="detail-head">
                <span class="detail-gem rarity-${slug}">◆</span>
                <div>
                    <h2>${escapeHTML(['onepiece', 'yugioh'].includes(card.tcg) || FILE_GAMES[card.tcg] ? card.number : card.code)} ${escapeHTML(card.name)}</h2>
                    <p>${escapeHTML(card.type || 'Card')}</p>
                </div>
            </header>

            <div class="detail-body">
                <div class="detail-art">
                    <img referrerpolicy="no-referrer" src="${escapeHTML(card.image)}" alt="${escapeHTML(card.name)}" onerror="cardImgError(this)">
                    ${card.image
                        ? `<a class="zoom-btn" href="${escapeHTML(card.image)}" target="_blank" rel="noopener" aria-label="Xem ảnh gốc">⌕</a>`
                        : ''}
                </div>

                <div class="detail-main">
                    <div class="pill-row">
                        <span class="pill rarity-${slug}">${escapeHTML(card.rarity)}</span>
                    </div>
                    <p class="detail-set">${escapeHTML(card.number || card.code)} · <b>${escapeHTML(card.setName)}</b></p>

                    ${detailStats(card)}

                    <section class="detail-text">
                        <small>${card.tcg === 'pokemon' ? 'Chiêu thức &amp; nội dung' : card.tcg === 'yugioh' ? 'Nội dung thẻ' : 'Hiệu ứng'}</small>
                        <p style="white-space: pre-line">${escapeHTML(card.ability || 'No ability text.')}</p>
                    </section>

                    ${card.flavor ? `
                    <section class="detail-text">
                        <small>Mô tả</small>
                        <p class="flavor">${escapeHTML(card.flavor)}</p>
                    </section>` : ''}

                    ${card.tags.length ? `
                    <section class="detail-text">
                        <small>Thẻ gắn</small>
                        <div class="tag-row">
                            ${card.tags.map(t => `<span class="tag">${escapeHTML(t)}</span>`).join('')}
                        </div>
                    </section>` : ''}

                    <section class="detail-text">
                        <small>Số thẻ</small>
                        <p>${escapeHTML(card.number)}${card.artist ? ` · Artist: ${escapeHTML(card.artist)}` : ''}</p>
                    </section>
                </div>

                <aside class="detail-side">
                    <div class="side-box">
                        <small>Giá thị trường</small>
                        <div class="market-main">${hasPrice ? formatMoney(p.usd, 'USD') : 'Chưa có giá'}</div>
                        <div class="market-sub">
                            <span>VND</span><b>${formatMoney(p.vnd, 'VND')}</b>
                        </div>
                        ${p.eur != null ? `<div class="market-sub">
                            <span>EUR (Cardmarket)</span><b>€${Number(p.eur).toFixed(2)}</b>
                        </div>` : ''}
                        <small class="market-source">${escapeHTML(p.source || 'Chưa có nguồn giá')}</small>
                        ${buyLinksHTML(card, p)}
                    </div>

                    <div class="side-box">
                        <small>Bộ sưu tập của tôi</small>
                        <div class="collection-rows">${collectionHTML(card.code)}</div>
                    </div>
                </aside>
            </div>
        </div>
    `;

    $('#detailModal').classList.add('open');
}

function importJSON(file, callback) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
        try {
            callback(JSON.parse(reader.result));
        } catch (error) {
            alert('File JSON không hợp lệ: ' + error.message);
        }
    };

    reader.readAsText(file);
}

// Nạp danh sách thẻ vào bảng: dùng chung cho mọi game (trước đây mỗi game lặp lại 5 dòng này)
function showCards(list, emptyMsg = '') {
    list.forEach(c => { if (c.market) embeddedPrices[c.code] = c.market; });
    cards = list;
    page = 1;
    buildFilters();
    render();
    if (!list.length && emptyMsg) $('#resultCount').textContent = emptyMsg;
}

const CARDS_URL = 'data/riftbound.json';
const PRICES_URL = 'data/prices.json';

async function loadRemoteData() {
    try {
        const res = await fetch(CARDS_URL, { cache: 'no-cache' });
        if (res.ok) {
            const data = await res.json();
            loadCards(data, false);
        }
    } catch (e) {
        console.warn('Không tải được ' + CARDS_URL, e);
    }

    try {
        const res = await fetch(PRICES_URL, { cache: 'no-cache' });
        if (res.ok) {
            const data = await res.json();
            prices = data.prices || data;
            render();
        }
    } catch (e) {
        console.warn('Không tải được ' + PRICES_URL, e);
    }
}

// --- 5. POKÉMON: đọc từ pokemon.json (tạo bằng update-pokemon.js) — KHÔNG còn gọi API TCGdex ---
const POKEMON_DATA_URL = 'data/pokemon.json';     // đổi cho khớp chỗ bạn để onepiece.json
let DEFAULT_POKEMON_SET = '';                     // để trống = tự chọn bộ mới nhất sau khi tải
let pokemonSetsList = [];
let pokemonToken = 0;                             // hủy lượt tải cũ khi đổi bộ
let pokemonAll = null;                            // cache trong bộ nhớ: toàn bộ thẻ

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(res.status + ' ' + url);
    return res.json();
}
// Tải pokemon.json 1 lần, các lần sau dùng lại
async function loadPokemonData() {
    if (pokemonAll) return pokemonAll;
    const res = await fetch(POKEMON_DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Không đọc được ${POKEMON_DATA_URL} (${res.status})`);
    pokemonAll = await res.json();
    return pokemonAll;
}

// Danh sách bộ lấy từ chính pokemon.json: [{ id, name, count, releaseDate }], mới nhất lên đầu
async function fetchPokemonSets() {
    try {
        const all = await loadPokemonData();
        const bySet = new Map();
        all.forEach(c => {
            if (!bySet.has(c.set)) bySet.set(c.set, { id: c.set, name: c.setName, count: 0, releaseDate: c.releaseDate || '' });
            bySet.get(c.set).count++;
        });
        const sets = [...bySet.values()].sort((a, b) =>
            (b.releaseDate || '').localeCompare(a.releaseDate || '') || a.name.localeCompare(b.name));
        if (!DEFAULT_POKEMON_SET && sets.length) DEFAULT_POKEMON_SET = sets[0].id;
        console.log(`✅ Pokémon: ${all.length} thẻ, ${sets.length} bộ (từ ${POKEMON_DATA_URL})`);
        return sets;
    } catch (error) {
        console.error('Lỗi tải pokemon.json:', error);
        return [];
    }
}

// Giữ nguyên chữ ký cũ: onProgress(list, done, total). Không còn gọi API nên xong ngay.
async function fetchCardsBySet(setId, onProgress = () => {}) {
    try {
        const all = await loadPokemonData();
        const list = setId && setId !== 'all' ? all.filter(c => c.set === setId) : all.slice();
        onProgress(list, list.length, list.length);
        return list;
    } catch (error) {
        console.error(`Lỗi khi đọc bộ bài ${setId}:`, error);
        return [];
    }
}

function fillPokemonSetSelect(selected = DEFAULT_POKEMON_SET) {
    const el = $('#setFilter');
    if (!el || !pokemonSetsList.length) return;
    el.innerHTML = '<option value="all">All Sets</option>';
    pokemonSetsList.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name} (${String(s.id).toUpperCase()})`;
        el.appendChild(opt);
    });
    el.value = selected || 'all';
}

async function loadPokemonSet(setId) {
    const token = ++pokemonToken;
    await fetchCardsBySet(setId, (list) => {
        if (token !== pokemonToken) return;     // đã đổi sang bộ/game khác
        showCards(list);
    });
}
// ---- One Piece: dữ liệu tạo bởi update-onepiece.js ----
async function loadOnePiece() {
    let list = [];
    try {
        const res = await fetch('data/onepiece.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        list = await res.json();
    } catch (e) {
        console.warn('Không tải được data/onepiece.json', e);
    }
    showCards(list, 'Chưa có dữ liệu One Piece (data/onepiece.json)');
}

// ---- Yu-Gi-Oh!: API YGOPRODeck (db.ygoprodeck.com), tải theo từng bộ giống Pokémon ----
const YGO_API = 'https://db.ygoprodeck.com/api/v7';
const DEFAULT_YGO_SET = 'Legend of Blue Eyes White Dragon';
const YGO_CACHE_TTL = 12 * 3600 * 1000;
let ygoSetsList = [];

const ygoNum = v => { const n = parseFloat(v); return n > 0 ? n : null; };

async function fetchYugiohSets() {
    try {
        const sets = await fetchJSON(`${YGO_API}/cardsets.php`);
        // bộ mới nhất lên đầu
        return sets.sort((a, b) => String(b.tcg_date || '').localeCompare(String(a.tcg_date || '')));
    } catch (e) {
        console.error('Lỗi tải danh sách bộ Yu-Gi-Oh!:', e);
        return [{ set_name: DEFAULT_YGO_SET, set_code: 'LOB' }];
    }
}

// ygoMode: 'file' = đọc data/yugioh/*.json (tạo bởi update-yugioh.js, nhanh nhất)
//          'api'  = dự phòng, gọi YGOPRODeck khi chưa có file
let ygoMode = 'api';
let ygoFileSets = [];
let ygoVersion = '';

function ygoDefaultSet() {
    if (ygoMode === 'file') return ygoFileSets[0] ? ygoFileSets[0].id : '';
    return DEFAULT_YGO_SET;
}

let ygoCurrent = '';          // bộ đang xem (luôn giữ trong danh sách khi tìm kiếm)
let ygoSearchEl = null;

// Ô tìm bộ: tạo bằng JS ngay trước ô chọn bộ, chỉ hiện ở tab Yu-Gi-Oh!
function ensureYgoSearch() {
    if (ygoSearchEl) return;
    const sel = $('#setFilter');
    if (!sel || !sel.parentNode) return;
    ygoSearchEl = document.createElement('input');
    ygoSearchEl.type = 'search';
    ygoSearchEl.placeholder = 'Tìm bộ bài (vd: mega-tin, 2016, LOB)...';
    ygoSearchEl.className = ($('#search') || {}).className || '';
    ygoSearchEl.setAttribute('aria-label', 'Tìm bộ bài Yu-Gi-Oh!');
    ygoSearchEl.addEventListener('input', () => fillYugiohSetSelect(ygoCurrent, ygoSearchEl.value));
    ygoSearchEl.addEventListener('keydown', e => {
        if (e.key !== 'Enter') return;
        const first = [...sel.options].find(o => o.value !== 'all');
        if (first) { sel.value = first.value; loadYugiohSet(first.value); }
    });
    sel.parentNode.insertBefore(ygoSearchEl, sel);
}

// Ô chọn bộ gom theo năm. rows: [{ value, text, group }] đã xếp mới -> cũ nên các năm nằm liền nhau
function fillGroupedSelect(el, rows, selected) {
    el.innerHTML = '<option value="all">All Sets</option>';
    let groupEl = null, groupName = null;
    rows.forEach(r => {
        if (r.group !== groupName) {
            groupName = r.group;
            groupEl = document.createElement('optgroup');
            groupEl.label = groupName;
            el.appendChild(groupEl);
        }
        const opt = document.createElement('option');
        opt.value = r.value;
        opt.textContent = r.text;
        groupEl.appendChild(opt);
    });
    el.value = [...el.options].some(o => o.value === selected) ? selected : 'all';
}

function fillYugiohSetSelect(selected = ygoDefaultSet(), query = '') {
    const el = $('#setFilter');
    if (!el) return;
    ensureYgoSearch();

    let rows = ygoMode === 'file'
        ? ygoFileSets.map(s => ({
            value: s.id,
            text: `${s.name}${s.abbreviation ? ` (${s.abbreviation})` : ''} · ${s.count}`,
            group: String(s.published || '').slice(0, 4) || 'Khác'
        }))
        : ygoSetsList.map(s => ({
            value: s.set_name,
            text: `${s.set_name} (${s.set_code})`,
            group: String(s.tcg_date || '').slice(0, 4) || 'Khác'
        }));
    if (!rows.length) return;

    const q = query.trim().toLowerCase();
    rows = rows.filter(r => !q || r.text.toLowerCase().includes(q) || r.group === q || r.value === ygoCurrent);

    fillGroupedSelect(el, rows, selected);
}

// Điểm độ hiếm Yu-Gi-Oh! để chọn độ hiếm cao nhất làm độ hiếm hiển thị
function ygoRarityScore(r) {
    const v = String(r || '').toLowerCase();
    if (/starlight|ghost|ultimate|collector|quarter century|platinum|extra secret|premium gold/.test(v)) return 9;
    if (/prismatic|secret|gold/.test(v)) return 8;
    if (/ultra|parallel/.test(v)) return 6;
    if (/super|holofoil|shatterfoil|mosaic|starfoil/.test(v)) return 4;
    if (/rare/.test(v)) return 3;
    if (/short|common/.test(v)) return 1;
    return 2;
}

// Mỗi mã bộ (vd LOB-EN001) là MỘT lá: các độ hiếm gộp lại, hiện độ hiếm cao nhất
function yugiohCards(c, setName) {
    const gp = (c.card_prices || [])[0] || {};
    const usd = ygoNum(gp.tcgplayer_price), eur = ygoNum(gp.cardmarket_price);
    const isSpell = /spell/i.test(c.type), isTrap = /trap/i.test(c.type);
    const levelLabel = c.linkval != null ? 'Link' : /xyz/i.test(c.type) ? 'Rank' : 'Level';
    const img = (c.card_images || [])[0] || {};

    const byCode = {};
    (c.card_sets || []).filter(s => s.set_name === setName).forEach(p => {
        (byCode[p.set_code] ||= new Set()).add(p.set_rarity);
    });

    return Object.entries(byCode).map(([setCode, rarSet]) => {
        const rars = [...rarSet].filter(Boolean).sort((a, b) => ygoRarityScore(b) - ygoRarityScore(a));
        return {
            tcg: 'yugioh',
            code: `${setCode}|${c.id}`,
            name: c.name,
            set: setName,
            setName,
            number: setCode,
            rarity: rars[0] || 'Unspecified',
            domain: c.attribute || (isSpell ? 'SPELL' : isTrap ? 'TRAP' : ''),
            type: [c.type, c.race].filter(Boolean).join(', '),
            image: img.image_url || '',
            artist: '',
            atk: c.atk ?? '', def: c.def ?? '',
            level: c.level ?? c.linkval ?? '', levelLabel,
            energy: '', power: '', might: '',
            ability: c.desc || '',
            flavor: '',
            market: (usd != null || eur != null)
                ? { usd, eur, source: 'YGOPRODeck (giá TCGplayer theo lá bài)' } : null,
            tags: [rars.length > 1 ? 'Rarities: ' + rars.join(', ') : '', c.archetype].filter(Boolean)
        };
    });
}

async function fetchYugiohCardsBySet(setName) {
    const key = 'ygo_set_v1_' + setName;
    try {
        const c = JSON.parse(localStorage.getItem(key) || 'null');
        if (c && Date.now() - c.time < YGO_CACHE_TTL) return c.cards;
    } catch (e) { /* bỏ qua cache hỏng */ }

    try {
        const res = await fetch(`${YGO_API}/cardinfo.php?cardset=${encodeURIComponent(setName)}`);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const seen = {};
        const list = (data.data || []).flatMap(c => yugiohCards(c, setName)).map(card => {
            seen[card.code] = (seen[card.code] || 0) + 1;
            return seen[card.code] > 1 ? { ...card, code: `${card.code}#${seen[card.code]}` } : card;
        });
        try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), cards: list })); }
        catch (e) { /* hết dung lượng thì bỏ qua */ }
        return list;
    } catch (e) {
        console.error(`Lỗi khi tải bộ Yu-Gi-Oh! ${setName}:`, e);
        return [];
    }
}

async function fetchYugiohFile(id) {
    try {
        return await fetchJSON(`data/yugioh/${encodeURIComponent(id)}.json?v=${encodeURIComponent(ygoVersion)}`);
    } catch (e) {
        console.warn('Không tải được bộ Yu-Gi-Oh! ' + id, e);
        return [];
    }
}

async function loadYugiohSet(setId) {
    const token = ++pokemonToken;
    ygoCurrent = setId;
    $('#resultCount').textContent = 'Đang tải bộ bài...';
    const list = ygoMode === 'file' ? await fetchYugiohFile(setId) : await fetchYugiohCardsBySet(setId);
    if (token !== pokemonToken) return;          // đã đổi sang bộ/game khác
    showCards(list, 'Bộ này chưa có thẻ');
}

async function loadYugioh() {
    const token = ++pokemonToken;
    $('#resultCount').textContent = 'Đang tải Yu-Gi-Oh!...';
    try {
        const idx = await (await fetch('data/yugioh/index.json', { cache: 'no-cache' })).json();
        if (!Array.isArray(idx.sets) || !idx.sets.length) throw new Error('index rỗng');
        ygoFileSets = idx.sets;
        ygoVersion = idx.updated || '';
        ygoMode = 'file';
    } catch (e) {
        ygoMode = 'api';                          // chưa chạy update-yugioh.js -> dùng YGOPRODeck
        if (!ygoSetsList.length) ygoSetsList = await fetchYugiohSets();
    }
    if (token !== pokemonToken) return;
    fillYugiohSetSelect();
    await loadYugiohSet(ygoDefaultSet());
}

// ---- Gundam & Dragon Ball: đọc data/<game>.json (cùng kiểu One Piece) ----
// Chấp nhận cả file đã chuẩn hóa (có tcg khớp) lẫn dữ liệu thô kiểu API (images, color, cardType, ap, hp...).
// Tên trường khác thì chỉnh trong jsonCard().
const JSON_GAMES = {
    gundam: {
        file: 'data/gundam.json', label: 'Gundam',
        rarity: { C: 'Common', U: 'Uncommon', R: 'Rare', LR: 'Legendary Rare', SR: 'Super Rare', P: 'Promo' }
    },
    dbs: {
        file: 'data/dragonball.json', label: 'Dragon Ball',
        rarity: { C: 'Common', UC: 'Uncommon', R: 'Rare', SR: 'Super Rare', SCR: 'Secret Rare', SPR: 'Special Rare', L: 'Leader', P: 'Promo' }
    }
};

function jsonCard(c, tcg) {
    if (c.tcg === tcg) return c;
    const img = c.images || {};
    const setObj = c.set && typeof c.set === 'object' ? c.set : null;
    const setName = (setObj && (setObj.name || setObj.id)) || c.setName || c.set || c.series || '';
    const rarityRaw = String(c.rarity || '').trim();
    const priceNum = Number(c.price);

    return {
        tcg,
        code: c.code || c.id || c.cardNo || c.number || '',
        name: c.name || c.fullName || 'Unknown',
        set: setName,
        setName,
        number: c.number || c.cardNo || c.code || c.id || '',
        rarity: JSON_GAMES[tcg].rarity[rarityRaw.toUpperCase()] || rarityRaw || 'Unknown',
        domain: Array.isArray(c.color) ? c.color.join(', ') : (c.color || ''),
        type: c.cardType || c.type || '',
        image: img.large || img.small || (typeof c.image === 'string' ? c.image : '') || c.imageUrl || '',
        artist: c.artist || c.illustrator || '',
        cost: c.cost ?? c.energyCost ?? '',
        level: c.level ?? '',
        ap: c.ap ?? '', hp: c.hp ?? '',
        power: c.power ?? c.battlePower ?? '',
        combo: c.comboPower ?? c.combo ?? '',
        energy: '', might: '',
        ability: c.effect || c.text || c.ability || c.skill || '',
        flavor: c.flavor || c.flavorText || '',
        market: c.market || (Number.isFinite(priceNum) && c.price !== '' && c.price != null
            ? { usd: priceNum, eur: null, source: JSON_GAMES[tcg].file } : null),
        tags: [].concat(c.trait || c.traits || [], c.zone || [], c.link || [], c.feature || [])
            .filter(t => t && typeof t === 'string')
    };
}

async function loadJsonGame(tcg) {
    const g = JSON_GAMES[tcg];
    let list = [];
    try {
        const res = await fetch(g.file, { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        const raw = Array.isArray(data) ? data : (data.cards || data.data || []);
        list = raw.map(c => jsonCard(c, tcg)).filter(c => c.code);
    } catch (e) {
        console.warn('Không tải được ' + g.file, e);
    }
    showCards(list, `Chưa có dữ liệu ${g.label} (${g.file})`);
}

// ---- Game đọc theo bộ từ data/<folder>/ (tạo bởi update-kayou.js) ----
// Thêm game cùng kiểu: 1 dòng ở FILE_GAMES + 1 dòng ở GAME_BRAND (+ IPS trong update-kayou.js).
// Bộ mới tự hiện: chạy script -> index.json được ghi lại -> web đọc index.json mỗi lần mở game.
// ws: true = thẻ Weiss Schwarz (tạo bởi update-ws.js từ en.ws-tcg.com/cardlist)
const FILE_GAMES = {
    naruto:   { name: 'Naruto', folder: 'naruto' },
    aot:      { name: 'Attack on Titan · WS',      folder: 'aot',      ws: true, script: 'update-ws.js' },
    overlord: { name: 'Overlord · WS',             folder: 'overlord', ws: true, script: 'update-ws.js' },
    rascal:   { name: 'Rascal Does Not Dream · WS', folder: 'rascal',   ws: true, script: 'update-ws.js' }
};
const fileState = {};          // tcg -> { sets, version }

// Chưa có nguồn giá cho KAYOU -> mở eBay tìm đúng thẻ (tên thẻ + mã độ hiếm)
const ebaySearchURL = card => {
    const g = FILE_GAMES[card.tcg];
    const q = g.ws
        ? `Weiss Schwarz ${card.number} ${card.name}`
        : `Kayou ${g.name} ${card.name} ${card.tags[0] || ''}`;
    return 'https://www.ebay.com/sch/i.html?_nkw=' + encodeURIComponent(q);
};

async function fetchFileSet(tcg, id) {
    const { folder } = FILE_GAMES[tcg];
    try {
        return await fetchJSON(`data/${folder}/${encodeURIComponent(id)}.json?v=${encodeURIComponent(fileState[tcg].version)}`);
    } catch (e) {
        console.warn(`Không tải được bộ ${id} (${tcg})`, e);
        return [];
    }
}

// setId = 'all' -> gộp mọi bộ của game
async function loadFileSet(tcg, setId) {
    const token = ++pokemonToken;
    $('#resultCount').textContent = 'Đang tải bộ bài...';
    const ids = setId === 'all' ? fileState[tcg].sets.map(s => s.id) : [setId];
    const list = (await Promise.all(ids.map(id => fetchFileSet(tcg, id)))).flat();
    if (token !== pokemonToken) return;          // đã đổi sang bộ/game khác
    showCards(list, 'Bộ này chưa có thẻ');
}

async function loadFileGame(tcg) {
    const { name, folder } = FILE_GAMES[tcg];
    const token = ++pokemonToken;
    $('#resultCount').textContent = `Đang tải ${name}...`;
    try {
        const res = await fetch(`data/${folder}/index.json`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        const idx = await res.json();
        fileState[tcg] = { sets: idx.sets || [], version: idx.updated || '' };
    } catch (e) {
        console.warn(`Không tải được data/${folder}/index.json`, e);
        fileState[tcg] = { sets: [], version: '' };
    }
    if (token !== pokemonToken) return;

    const { sets } = fileState[tcg];
    fillGroupedSelect($('#setFilter'), sets.map(s => ({
        value: s.id,
        text: `${s.name}${s.abbreviation ? ` (${s.abbreviation})` : ''} · ${s.count}`,
        group: String(s.published || '').slice(0, 4) || 'Khác'
    })), sets[0] && sets[0].id);

    if (!sets.length) return showCards([], `Chưa có dữ liệu ${name} (chạy ${FILE_GAMES[tcg].script || 'update-kayou.js'})`);
    await loadFileSet(tcg, sets[0].id);
}

// ---- Nút "Xé pack": mở pack.html ở TAB MỚI (trang riêng, nhẹ, không làm nặng trang tra giá) ----
function addPackButton() {
    if ($('#packOpenBtn')) return;
    const a = document.createElement('a');
    a.id = 'packOpenBtn';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = ' Xé pack';
    a.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:60;padding:12px 18px;border-radius:999px;'
        + 'background:linear-gradient(135deg,var(--g1,#FFD43B),var(--g2,#F59F00));color:#14213D;font-weight:700;'
        + 'text-decoration:none;box-shadow:0 8px 24px #0008;font-family:inherit';
    // link theo game + bộ đang xem; pack.js tự bỏ qua bộ không tồn tại
    a.addEventListener('click', () => {
        const q = new URLSearchParams({ game: currentGame });
        const set = $('#setFilter') && $('#setFilter').value;
        if (set && set !== 'all') q.set('set', set);
        a.href = 'pack.html?' + q;
    });
    a.href = 'pack.html';
    document.body.appendChild(a);
}

// ---- Danh sách game TCG trong dropdown ----
// Thêm game mới: thêm 1 dòng vào đây (soon: true = hiện mờ, "Sắp có"), rồi viết hàm load() cho game đó.
const TCG_GAMES = [
    { id: 'pokemon',   name: 'Pokémon TCG', icon: '⚡', load: () => { fillPokemonSetSelect(); loadPokemonSet(DEFAULT_POKEMON_SET); } },
    { id: 'riftbound', name: 'Riftbound',   icon: '✦', load: async () => { pokemonToken++; await loadRemoteData(); } },
    { id: 'lorcana',   name: 'Disney Lorcana',        icon: '✧', soon: true },
    { id: 'onepiece',  name: 'One Piece Card Game',   icon: '☠', load: async () => { pokemonToken++; await loadOnePiece(); } },
    { id: 'mtg',       name: 'Magic: The Gathering',  icon: '✺', soon: true },
    { id: 'yugioh',    name: 'Yu-Gi-Oh!',             icon: '◈', load: async () => { await loadYugioh(); } },
    { id: 'gundam',    name: 'Gundam Card Game',      icon: '⬡', load: async () => { pokemonToken++; await loadJsonGame('gundam'); } },
    { id: 'dbs',       name: 'Dragon Ball Super CG',  icon: '❂', load: async () => { pokemonToken++; await loadJsonGame('dbs'); } },
    ...Object.entries(FILE_GAMES).map(([id, g]) => ({ id, name: g.name, load: () => loadFileGame(id) }))
];
let currentGame = 'pokemon';

function renderGameList(filter = '') {
    const q = filter.trim().toLowerCase();
    const list = TCG_GAMES.filter(g => g.name.toLowerCase().includes(q));
    $('#gameList').innerHTML = list.length ? list.map(g => `
        <button type="button" role="option" class="game-option${g.id === currentGame ? ' active' : ''}"
                data-game="${g.id}" ${g.soon ? 'disabled' : ''} aria-selected="${g.id === currentGame}">
            <span class="game-icon">${gameLogoHTML(g.id, 32)}</span>
            <span class="game-name">${escapeHTML(g.name)}</span>
            ${g.soon ? '<small class="game-soon">Sắp có</small>' : (g.id === currentGame ? '<span class="game-check">✓</span>' : '')}
        </button>`).join('') : '<div class="game-empty">Không tìm thấy game nào</div>';
}

function toggleGameMenu(open) {
    const menu = $('#gameMenu'), trigger = $('#gameTrigger');
    const willOpen = open ?? menu.hidden;
    menu.hidden = !willOpen;
    trigger.setAttribute('aria-expanded', String(willOpen));
    $('#gameDropdown').classList.toggle('open', willOpen);
    if (willOpen) {
        $('#gameSearch').value = '';
        renderGameList();
        // ô tìm kiếm chỉ cần khi có nhiều game
        $('#gameSearch').style.display = TCG_GAMES.length > 5 ? '' : 'none';
        if (TCG_GAMES.length > 5) $('#gameSearch').focus();
    }
}

async function selectGame(id) {
    const game = TCG_GAMES.find(g => g.id === id);
    toggleGameMenu(false);
    if (!game || game.soon || id === currentGame) return;

    currentGame = id;
    syncGameUI();
    page = 1;
    await game.load();
}

function initGameDropdown() {
    $('#gameTrigger').addEventListener('click', () => toggleGameMenu());
    $('#gameSearch').addEventListener('input', e => renderGameList(e.target.value));
    $('#gameList').addEventListener('click', e => {
        const opt = e.target.closest('.game-option');
        if (opt && !opt.disabled) selectGame(opt.dataset.game);
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('#gameDropdown')) toggleGameMenu(false);
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') toggleGameMenu(false);
    });
}

// --- 6. HÀM KHỞI TẠO INIT ---
async function init() {
    try {
        prices = JSON.parse(
            localStorage.getItem('riftbound_prices') || '{}'
        );
    } catch (error) {
        prices = {};
    }

    if (!new URLSearchParams(location.search).has('admin')) {
        ['#importButton', '#importPrices', '#emptyImport'].forEach(sel => {
            const el = $(sel);
            if (el) el.style.display = 'none';
        });
    }

    $('#setFilter').addEventListener('change', e => {
        const v = e.target.value;
        if (FILE_GAMES[currentGame]) { loadFileSet(currentGame, v); return; }
        if (v !== 'all' && currentGame === 'pokemon') { loadPokemonSet(v); return; }
        if (v !== 'all' && currentGame === 'yugioh') { loadYugiohSet(v); return; }
        page = 1;               // các game còn lại (và "All Sets"): lọc ngay trên danh sách đã tải
        render();
    });

    initGameDropdown();
    syncGameUI();
    initGameTiles();
    hydrateLogos();
    addPackButton();
    preloadLogoFiles();

    $('#importButton').onclick = () => $('#jsonFile').click();
    $('#emptyImport').onclick = () => $('#jsonFile').click();

    $('#jsonFile').onchange = e => {
        importJSON(e.target.files[0], loadCards);
    };

    $('#importPrices').onclick = () => $('#priceFile').click();

    $('#priceFile').onchange = e => {
        importJSON(e.target.files[0], data => {
            prices = data.prices || data;
            localStorage.setItem('riftbound_prices', JSON.stringify(prices));
            render();
        });
    };

    [
        '#search',
        '#rarityFilter',
        '#domainFilter',
        '#typeFilter',
        '#sortFilter'
    ].forEach(selector => {
        const el = $(selector);
        if (el) {
            let timer;
            el.addEventListener('input', () => {
                clearTimeout(timer);
                // gõ chữ thì đợi 150ms cho đỡ giật, còn chọn dropdown thì lọc ngay
                timer = setTimeout(() => { page = 1; render(); }, selector === '#search' ? 150 : 0);
            });
        }
    });

    $('#resetFilters').onclick = () => {
        $('#search').value = '';
        [
            '#setFilter',
            '#rarityFilter',
            '#domainFilter',
            '#typeFilter'
        ].forEach(s => {
            if ($(s)) $(s).value = 'all';
        });

        if ($('#sortFilter')) $('#sortFilter').value = 'name';
        page = 1;
        render();
    };

    document.querySelectorAll('.currency-switch button').forEach(btn => {
        btn.onclick = () => {
            currency = btn.dataset.currency;
            document.querySelectorAll('.currency-switch button')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            render();
        };
    });

    $('#cardGrid').onclick = e => {
        const item = e.target.closest('.card-item');
        if (item) showDetail(item.dataset.code);
    };

    $('#prevPage').onclick = () => {
        if (page > 1) {
            page--;
            render();
        }
    };

    $('#nextPage').onclick = () => {
        page++;
        render();
    };

    $('#detailContent').addEventListener('click', e => {
        const btn = e.target.closest('[data-coll]');
        if (!btn) return;
        const box = btn.closest('.detail');
        const code = box.dataset.code;
        const data = loadCollection();
        const entry = data[code] || { owned: 0, trade: 0, wish: 0 };
        const key = btn.dataset.coll;
        entry[key] = Math.max(0, (entry[key] || 0) + Number(btn.dataset.step));
        data[code] = entry;
        saveCollection(data);
        box.querySelector('.collection-rows').innerHTML = collectionHTML(code);
    });

    $('#closeModal').onclick = () => {
        $('#detailModal').classList.remove('open');
    };

    $('#detailModal').onclick = e => {
        if (e.target.id === 'detailModal') {
            $('#detailModal').classList.remove('open');
        }
    };

    loadFx();

    // Pokémon là tab mặc định: nạp danh sách bộ rồi tải bộ đầu tiên
    pokemonSetsList = await fetchPokemonSets();
    if (currentGame !== 'pokemon') return;     // người dùng đã chuyển game trong lúc chờ
    fillPokemonSetSelect();
    loadPokemonSet(DEFAULT_POKEMON_SET);
}

document.addEventListener('DOMContentLoaded', init);

// --- 7. HIỆU ỨNG TILT & HOLO FOIL ---
(() => {
    const SEL = '.card-image, .holo-wrap';
    const TILT = 6;

    document.addEventListener('pointermove', e => {
        const el = e.target.closest && e.target.closest(SEL);
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width;
        const y = (e.clientY - r.top) / r.height;
        el.style.setProperty('--hx', (x * 100).toFixed(1) + '%');
        el.style.setProperty('--hy', (y * 100).toFixed(1) + '%');
        if (el.classList.contains('holo-wrap')) {
            el.style.setProperty('--ry', ((x - .5) * 2 * TILT).toFixed(2) + 'deg');
            el.style.setProperty('--rx', ((.5 - y) * 2 * TILT).toFixed(2) + 'deg');
        }
    });

    document.addEventListener('pointerout', e => {
        const el = e.target.closest && e.target.closest(SEL);
        if (!el || el.contains(e.relatedTarget)) return;
        ['--hx', '--hy'].forEach(p => el.style.setProperty(p, '50%'));
        ['--rx', '--ry'].forEach(p => el.style.setProperty(p, '0deg'));
    });

    const wrapImages = () => {
        document.querySelectorAll('.detail-art img').forEach(img => {
            if (img.parentElement.classList.contains('holo-wrap')) return;
            const w = document.createElement('div');
            w.className = 'holo-wrap';
            img.replaceWith(w);
            w.appendChild(img);
        });
    };
    const target = document.getElementById('detailContent');
    if (target) new MutationObserver(wrapImages).observe(target, { childList: true });
})();


// =========================================================
// CHECKPRICE 2.0 — logo từng game, banner tự chạy, intro
// =========================================================

// ---- Logo từng dòng TCG ----
// Đây là biểu tượng TỰ VẼ (không phải logo chính thức của hãng).
// Muốn dùng logo thật: bỏ file vào  assets/logos/<id>.png  (id = pokemon, riftbound, onepiece,
// yugioh, gundam, dbs, lorcana, mtg). Có file là tự thay, không cần sửa code.
const GAME_BRAND = {
    pokemon:   { c1: '#FFD43B', c2: '#F59F00', ink: '#14213D', glyph: '<path d="M27 4 10 27h11l-4 17 21-26H27z"/>' },
    riftbound: { c1: '#2DD4BF', c2: '#0F9F8F', glyph: '<path d="M24 4 42 24 24 44 6 24z" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linejoin="round"/><path d="M24 15l9 9-9 9-9-9z"/>' },
    onepiece:  { c1: '#FF6B81', c2: '#E11D48', glyph: '<path d="M10 29c0-10 6-17 14-17s14 7 14 17z"/><ellipse cx="24" cy="30" rx="20" ry="6"/><path d="M11 27c8 3 18 3 26 0" fill="none" stroke="#E11D48" stroke-width="3"/>' },
    lorcana:   { c1: '#F472D0', c2: '#C026D3', glyph: '<path d="M24 4S10 20 10 30a14 14 0 0 0 28 0C38 20 24 4 24 4z"/><path d="M18 31a6 6 0 0 0 6 6" fill="none" stroke="#C026D3" stroke-width="3" stroke-linecap="round"/>' },
    mtg:       { c1: '#A3E635', c2: '#4D9F0C', glyph: '<circle cx="24" cy="9" r="6"/><circle cx="39" cy="20" r="6"/><circle cx="33" cy="38" r="6"/><circle cx="15" cy="38" r="6"/><circle cx="9" cy="20" r="6"/>' },
    yugioh:    { c1: '#9B6BFF', c2: '#5B21B6', glyph: '<path d="M24 6 43 40H5z" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linejoin="round"/><circle cx="24" cy="29" r="5.5"/>' },
    gundam:    { c1: '#5B8CFF', c2: '#1D4ED8', glyph: '<path d="M24 36 9 10h7l8 14 8-14h7z"/><rect x="18" y="37" width="12" height="7" rx="2"/>' },
    dbs:       { c1: '#FFA53D', c2: '#EA580C', glyph: '<circle cx="24" cy="24" r="18" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 14l2.8 6 6.5.8-4.8 4.5 1.3 6.4-5.8-3.2-5.8 3.2 1.3-6.4-4.8-4.5 6.5-.8z"/>' },
    aot:       { c1: '#4ADE80', c2: '#15803D', glyph: '<path d="M6 40 20 8l4 14-8 18zM42 40 28 8l-4 14 8 18z"/>' },
    overlord:  { c1: '#A78BFA', c2: '#4C1D95', glyph: '<circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="5"/><path d="M24 14l6 10-6 10-6-10z"/>' },
    rascal:    { c1: '#F9A8D4', c2: '#BE185D', glyph: '<ellipse cx="17" cy="14" rx="5" ry="11"/><ellipse cx="31" cy="14" rx="5" ry="11"/><circle cx="24" cy="33" r="11"/>' },
    naruto:    { c1: '#FF9F1C', c2: '#E85D04', glyph: '<path d="M24 6a18 18 0 1 0 18 18 12 12 0 1 0-12 12 7 7 0 1 0 7-7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' }
};

const LOGO_FILE_OK = {};        // id -> true nếu có file assets/logos/<id>.png

function gameLogoHTML(id, size = 44) {
    const b = GAME_BRAND[id] || GAME_BRAND.pokemon;
    const img = LOGO_FILE_OK[id] ? `<img src="assets/logos/${id}.png" alt="">` : '';
    return `<span class="glogo" style="--size:${size}px;--c1:${b.c1};--c2:${b.c2};color:${b.ink || '#fff'}">`
        + `<svg viewBox="0 0 48 48" aria-hidden="true">${b.glyph}</svg>${img}</span>`;
}

// Điền logo vào mọi chỗ có data-glogo, đặt màu cho thẻ có data-brand
function hydrateLogos() {
    document.querySelectorAll('[data-brand]').forEach(n => {
        const b = GAME_BRAND[n.dataset.brand];
        if (b) { n.style.setProperty('--c1', b.c1); n.style.setProperty('--c2', b.c2); }
    });
    document.querySelectorAll('[data-glogo]').forEach(n => {
        n.innerHTML = gameLogoHTML(n.dataset.glogo, Number(n.dataset.size) || 44);
    });
}

// Thử tải logo thật; có file nào thì vẽ lại logo đó
function preloadLogoFiles() {
    Object.keys(GAME_BRAND).forEach(id => {
        const im = new Image();
        im.onload = () => { LOGO_FILE_OK[id] = true; refreshLogos(); };
        im.src = `assets/logos/${id}.png`;
    });
}

function refreshLogos() {
    hydrateLogos();
    syncGameUI();
    if (!$('#gameMenu').hidden) renderGameList($('#gameSearch').value);
}

// Cập nhật logo + tên game đang chọn, màu nhấn (--g1/--g2) và các ô game
function syncGameUI() {
    const game = TCG_GAMES.find(g => g.id === currentGame) || TCG_GAMES[0];
    const b = GAME_BRAND[game.id] || GAME_BRAND.pokemon;
    $('#gameIcon').innerHTML = gameLogoHTML(game.id, 32);
    $('#gameName').textContent = game.name;
    document.documentElement.style.setProperty('--g1', b.c1);
    document.documentElement.style.setProperty('--g2', b.c2);
    renderGameTiles();
}

function renderGameTiles() {
    const box = $('#gameTiles');
    if (!box) return;
    box.innerHTML = TCG_GAMES.map(g => {
        const b = GAME_BRAND[g.id] || GAME_BRAND.pokemon;
        const active = g.id === currentGame;
        return `<button type="button" class="tile${active ? ' active' : ''}" data-game="${g.id}"
                    style="--c1:${b.c1};--c2:${b.c2}" ${g.soon ? 'disabled' : ''} aria-pressed="${active}">
                ${gameLogoHTML(g.id, 52)}
                <span class="tile-text">
                    <b>${escapeHTML(g.name)}</b>
                    <small>${g.soon ? 'Sắp có' : active ? 'Đang xem' : 'Tra giá ngay'}</small>
                </span>
            </button>`;
    }).join('');
}

// Chọn game rồi cuộn xuống phần tra giá
async function goToGame(id) {
    const loading = selectGame(id);
    const db = document.getElementById('database');
    if (db) db.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await loading;
}

function initGameTiles() {
    $('#gameTiles').addEventListener('click', e => {
        const tile = e.target.closest('.tile');
        if (tile && !tile.disabled) goToGame(tile.dataset.game);
    });
    // Nút trong banner: <button data-go="pokemon">
    document.addEventListener('click', e => {
        const go = e.target.closest('[data-go]');
        if (go) goToGame(go.dataset.go);
    });
}

// ---- Banner tự chạy qua lại (ping-pong: 1→2→3→4→5→4→3→2→1…) ----
function initBanner() {
    const root = $('#banner');
    if (!root) return;

    const INTERVAL = 5000;                                   // ms mỗi slide
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const track = root.querySelector('.banner-track');
    const slides = [...root.querySelectorAll('.slide')];
    const dotsBox = root.querySelector('.banner-dots');

    let index = 0, dir = 1, timer = null;
    let hovering = false, focused = false;
    let ready = !document.body.classList.contains('intro-lock');   // đợi intro chạy xong mới tự chạy

    root.style.setProperty('--interval', INTERVAL + 'ms');
    dotsBox.innerHTML = slides.map((s, i) =>
        `<button type="button" class="dot" role="tab" data-i="${i}"
                 aria-label="Slide ${i + 1}: ${escapeHTML(s.getAttribute('aria-label') || '')}"><i></i></button>`).join('');
    const dots = [...dotsBox.children];

    function markActive() {
        dots.forEach((d, k) => {
            d.classList.remove('active');
            d.setAttribute('aria-selected', String(k === index));
        });
        void dotsBox.offsetWidth;                            // khởi động lại thanh tiến trình
        dots[index].classList.add('active');
    }

    function show(i) {
        index = i;
        track.style.transform = `translateX(${-100 * i}%)`;
        slides.forEach((s, k) => {
            s.classList.toggle('is-active', k === i);
            s.inert = k !== i;
            s.setAttribute('aria-hidden', String(k !== i));
        });
        markActive();
    }

    function schedule() {
        clearTimeout(timer);
        if (reduce || !ready || hovering || focused || document.hidden) return;
        timer = setTimeout(tick, INTERVAL);
    }

    function tick() {
        let n = index + dir;
        if (n < 0 || n >= slides.length) { dir = -dir; n = index + dir; }   // chạm đầu/cuối thì quay đầu
        show(n);
        schedule();
    }

    function go(i, d) {
        dir = d;
        show((i + slides.length) % slides.length);
        schedule();
    }

    function pause() { root.classList.add('paused'); clearTimeout(timer); }
    function resume() {
        if (hovering || focused) return;
        root.classList.remove('paused');
        markActive();
        schedule();
    }

    root.querySelector('.banner-nav.prev').onclick = () => go(index - 1, -1);
    root.querySelector('.banner-nav.next').onclick = () => go(index + 1, 1);
    dotsBox.addEventListener('click', e => {
        const dot = e.target.closest('.dot');
        if (dot) { const i = Number(dot.dataset.i); go(i, i >= index ? 1 : -1); }
    });

    root.addEventListener('mouseenter', () => { hovering = true; pause(); });
    root.addEventListener('mouseleave', () => { hovering = false; resume(); });
    root.addEventListener('focusin', () => { focused = true; pause(); });
    root.addEventListener('focusout', () => { focused = false; resume(); });
    root.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') go(index - 1, -1);
        if (e.key === 'ArrowRight') go(index + 1, 1);
    });
    document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());

    // Vuốt trái/phải trên điện thoại
    let startX = null;
    root.addEventListener('pointerdown', e => { startX = e.target.closest('a,button') ? null : e.clientX; });
    root.addEventListener('pointerup', e => {
        if (startX == null) return;
        const dx = e.clientX - startX;
        startX = null;
        if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
    });

    document.addEventListener('intro:done', () => { ready = true; markActive(); schedule(); });

    show(0);
    schedule();
}

// ---- Intro: phát assets/intro.mp4 nếu có, không thì chạy intro hoạt hình ----
function initIntro() {
    const el = $('#intro');
    if (!el) return;

    const video = $('#introVideo');
    const FALLBACK_MS = 6400;
    let finished = false, timer = null;

    function finish() {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        try { sessionStorage.setItem('cp_intro_seen', '1'); } catch (e) { /* bỏ qua */ }
        if (video) video.pause();
        document.body.classList.remove('intro-lock');
        el.classList.add('closing');
        setTimeout(() => {
            el.hidden = true;
            el.classList.remove('closing', 'has-video');
            document.dispatchEvent(new Event('intro:done'));
        }, 800);
    }

    function play() {
        finished = false;
        // chạy lại hoạt hình từ đầu: nhân bản node để CSS animation khởi động lại
        const anim = $('#introAnim');
        anim.replaceWith(anim.cloneNode(true));
        el.hidden = false;
        el.classList.remove('closing', 'has-video');
        document.body.classList.add('intro-lock');

        clearTimeout(timer);
        timer = setTimeout(finish, FALLBACK_MS);

        if (video) {
            video.currentTime = 0;
            const p = video.play();
            if (p && p.catch) p.catch(() => { /* không phát được: dùng hoạt hình */ });
            onVideoReady();
        }
    }

    // Có file video: dừng bộ đếm hoạt hình, chờ video kết thúc
    function onVideoReady() {
        if (finished || !video || video.readyState < 1) return;
        el.classList.add('has-video');
        clearTimeout(timer);
        timer = setTimeout(finish, Math.min(((video.duration || 20) + 1) * 1000, 60000));
    }
    if (video) {
        video.addEventListener('loadedmetadata', onVideoReady);
        video.addEventListener('ended', finish);
    }

    $('#introSkip').onclick = finish;
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !el.hidden) finish();
    });
    const replay = $('#replayIntro');
    if (replay) replay.onclick = () => { window.scrollTo({ top: 0 }); play(); };

    // Bỏ qua intro nếu: đã xem trong phiên này, hoặc người dùng chọn giảm chuyển động
    let seen = false;
    try { seen = sessionStorage.getItem('cp_intro_seen') === '1'; } catch (e) { /* bỏ qua */ }
    if (seen || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.hidden = true;
        document.body.classList.remove('intro-lock');
        document.dispatchEvent(new Event('intro:done'));
        return;
    }

    hydrateLogos();
    play();
}

document.addEventListener('DOMContentLoaded', () => {
    hydrateLogos();
    initBanner();
    initIntro();
});