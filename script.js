const $ = selector => document.querySelector(selector);

let cards = [];
let prices = {};
let currency = 'both';
let page = 1;
const PAGE_SIZE = 20;

const rarityOrder = [
    'Common', 'Uncommon', 'Rare',
    'Epic', 'Legendary', 'Showcase'
];

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

function getPrice(code) {
    return prices[code] || {};
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
        catch (e) { /* file quá lớn cho localStorage thì bỏ qua */ }
    }

    buildFilters();
    page = 1;
    render();
}

function buildSelect(selector, values, label) {
    const el = $(selector);
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

function buildFilters() {
    buildSelect('#setFilter', cards.map(c => c.set), 'All Sets');
    buildSelect('#rarityFilter', cards.map(c => c.rarity), 'All Rarities');
    buildSelect(
        '#domainFilter',
        cards.flatMap(c => c.domain.split(', ')),
        'All Domains'
    );
    buildSelect(
        '#typeFilter',
        cards.flatMap(c => c.type.split(', ')),
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
            && (set === 'all' || c.set === set)
            && (rarity === 'all' || c.rarity === rarity)
            && (domain === 'all' || c.domain.split(', ').includes(domain))
            && (type === 'all' || c.type.split(', ').includes(type));
    });

    result.sort((a, b) => {
        if (sort === 'rarity') {
            return rarityOrder.indexOf(b.rarity)
                - rarityOrder.indexOf(a.rarity);
        }

        if (sort === 'price-desc' || sort === 'price-asc') {
            const pa = Number(getPrice(a.code).usd ?? -1);
            const pb = Number(getPrice(b.code).usd ?? -1);
            return sort === 'price-desc' ? pb - pa : pa - pb;
        }

        return a.name.localeCompare(b.name);
    });

    return result;
}

function render() {
    const result = getFilteredCards();
    const pages = Math.max(1, Math.ceil(result.length / PAGE_SIZE));

    page = Math.min(page, pages);

    const start = (page - 1) * PAGE_SIZE;
    const visible = result.slice(start, start + PAGE_SIZE);

    $('#cardGrid').innerHTML = visible.map(card => {
        // Chuẩn hóa tên độ hiếm để kiểm tra xem có phải thẻ holo/showcase đặc biệt không
        const raritySlug = getRarityClass(card.rarity);
        const isSpecialHolo = ['showcase', 'epic', 'holo'].includes(raritySlug);
        
        // Thêm class 'holo-card' và 'data-rarity' để CSS nhận diện hiệu ứng lấp lánh
        const extraClass = isSpecialHolo ? ' holo-card' : '';
        const rarityAttr = `data-rarity="${raritySlug}"`;

        return `
            <article class="card-item${extraClass}" ${rarityAttr} data-code="${escapeHTML(card.code)}">
                <div class="card-image">
                    ${card.image
                        ? `<img loading="lazy" src="${escapeHTML(card.image)}" alt="${escapeHTML(card.name)}">`
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

    $('#pricedCards').textContent = Object.values(prices).filter(
        p => p && (p.usd != null || p.vnd != null)
    ).length;

    $('#resultCount').textContent = `${result.length} CARDS FOUND`;
    $('#pageInfo').textContent = `Page ${page} / ${pages}`;

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
                    <h2>${escapeHTML(card.code)} ${escapeHTML(card.name)}</h2>
                    <p>${escapeHTML(card.type || 'Card')}</p>
                </div>
            </header>

            <div class="detail-body">
                <div class="detail-art">
                    <img src="${escapeHTML(card.image)}" alt="${escapeHTML(card.name)}">
                    ${card.image
                        ? `<a class="zoom-btn" href="${escapeHTML(card.image)}" target="_blank" rel="noopener" aria-label="Xem ảnh gốc">⌕</a>`
                        : ''}
                </div>

                <div class="detail-main">
                    <div class="pill-row">
                        <span class="pill rarity-${slug}">${escapeHTML(card.rarity)}</span>
                    </div>
                    <p class="detail-set">${escapeHTML(card.number || card.code)} · <b>${escapeHTML(card.setName)}</b></p>

                    <div class="stat-grid stat-grid-3">
                        ${statHTML('Energy', card.energy)}
                        ${statHTML('Power', card.power)}
                        ${statHTML('Might', card.might)}
                    </div>
                    <div class="stat-grid stat-grid-3">
                        ${statHTML('Domain', card.domain)}
                        ${statHTML('Type', card.type)}
                        ${statHTML('Rarity', card.rarity)}
                    </div>

                    <section class="detail-text">
                        <small>EFFECT</small>
                        <p>${escapeHTML(card.ability || 'No ability text.')}</p>
                    </section>

                    ${card.flavor ? `
                    <section class="detail-text">
                        <small>FLAVOR</small>
                        <p class="flavor">${escapeHTML(card.flavor)}</p>
                    </section>` : ''}

                    ${card.tags.length ? `
                    <section class="detail-text">
                        <small>TAGS</small>
                        <div class="tag-row">
                            ${card.tags.map(t => `<span class="tag">${escapeHTML(t)}</span>`).join('')}
                        </div>
                    </section>` : ''}

                    <section class="detail-text">
                        <small>CARD NUMBER</small>
                        <p>${escapeHTML(card.number)}${card.artist ? ` · Artist: ${escapeHTML(card.artist)}` : ''}</p>
                    </section>
                </div>

                <aside class="detail-side">
                    <div class="side-box">
                        <small>MARKET</small>
                        <div class="market-main">${hasPrice ? formatMoney(p.usd, 'USD') : 'Chưa có giá'}</div>
                        <div class="market-sub">
                            <span>VND</span><b>${formatMoney(p.vnd, 'VND')}</b>
                        </div>
                        <small class="market-source">${escapeHTML(p.source || 'Chưa có nguồn giá')}</small>
                        ${p.url ? `<a class="buy-btn" href="${escapeHTML(p.url)}" target="_blank" rel="noopener">Buy now</a>` : ''}
                    </div>

                    <div class="side-box">
                        <small>MY COLLECTION</small>
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

// ---- Dữ liệu có sẵn trên server: người dùng không cần import ----
const CARDS_URL = 'data/riftbound.json';
const PRICES_URL = 'data/prices.json';

async function loadRemoteData() {
    try {
        const res = await fetch(CARDS_URL, { cache: 'no-cache' });
        if (res.ok) loadCards(await res.json(), false);
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
// Hàm lấy thẻ bài TCG chuẩn từ TCGDex API
// Hàm nạp lá bài Pokémon TCG chuẩn từ TCGDex API
// Hàm lấy thẻ bài TCG CHUẨN từ TCGDex API (Có khung bài, thông số đầy đủ)
// Hàm nạp danh sách lá bài Pokémon TCG chuẩn từ TCGDex (Tải số lượng lớn / Full)
async function fetchPokemonCards(limit = 1000) { // Bạn có thể chỉnh 1000, 2000 hoặc đổi limit = null để lấy TOÀN BỘ
    try {
        console.log(`Đang tiến hành đồng bộ dữ liệu TCGDex...`);
        
        // Sử dụng CORS Proxy để vượt qua rào cản bảo mật của trình duyệt
        const proxyUrl = 'https://corsproxy.io/?';
        const targetUrl = 'https://api.tcgdex.net/v2/en/cards';
        
        const res = await fetch(proxyUrl + encodeURIComponent(targetUrl));
        if (!res.ok) throw new Error('Không thể kết nối TCGDex API');
        
        const allCards = await res.json();
        console.log(`Tổng số lá bài tìm thấy trên TCGDex: ${allCards.length} thẻ.`);

        // Chọn số lượng thẻ muốn nạp (nếu limit = null hoặc undefined thì sẽ lấy toàn bộ allCards)
        const selectedList = limit ? allCards.slice(0, limit) : allCards;

        const pokemonCards = selectedList.map(item => {
            // Tách set ID và local ID để ghép link ảnh TCG full khung viền chuẩn từ CDN
            const parts = item.id.split('-');
            const setCode = parts[0] || 'card';
            const localId = parts.slice(1).join('-') || item.localId || '1';
            
            // Link ảnh lá bài TCG chuẩn high-quality của TCGDex
            const imageUrl = `https://assets.tcgdex.net/en/${setCode}/${localId}/high.png`;

            return {
                code: item.id,
                cardCode: item.localId || item.id,
                name: item.name,
                set: 'pokemon',
                setName: `Pokémon TCG (${setCode.toUpperCase()})`,
                setCode: setCode.toUpperCase(),
                rarity: 'TCG Card',
                type: 'Pokémon Card',
                domain: 'COLORLESS',
                might: 0,
                hp: 0,
                image: imageUrl,
                artist: 'Pokémon TCG',
                ability: `Card ID: ${item.id}`
            };
        });

        console.log(`✅ Đã nạp thành công ${pokemonCards.length} lá bài TCG chuẩn!`);
        return pokemonCards;

    } catch (error) {
        console.error("Lỗi khi kết nối TCGDex API:", error);
        return [];
    }
}
async function init() {
    try {
        const savedCards = localStorage.getItem('riftbound_cards');
        if (savedCards) loadCards(JSON.parse(savedCards));
    } catch (error) {
        console.error(error);
    }

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

    // 1. Tải dữ liệu remote local hiện tại
    await loadRemoteData();

   cards = cards.filter(c => c.set !== 'pokemon' && c.setCode !== 'POKEMON');

    // 3. Tải 1.000 lá bài TCGDex (hoặc đổi fetchPokemonCards(null) để tải TẤT CẢ 20.000+ thẻ)
    try {
        const pokemonCards = await fetchPokemonCards(1000); 
        if (pokemonCards.length > 0) {
            cards = [...cards, ...pokemonCards];
            if (typeof buildFilters === 'function') buildFilters();
            render();
        }
    } catch (err) {
        console.error("Lỗi tải TCGDex:", err);
    }
    // Các sự kiện DOM bên dưới giữ nguyên...
    $('#importButton').onclick = () => $('#jsonFile').click();
    $('#emptyImport').onclick = () => $('#jsonFile').click();

    $('#jsonFile').onchange = e => {
        importJSON(e.target.files[0], loadCards);
    };

    $('#importPrices').onclick = () => $('#priceFile').click();

    $('#priceFile').onchange = e => {
        importJSON(e.target.files[0], data => {
            prices = data.prices || data;
            localStorage.setItem(
                'riftbound_prices',
                JSON.stringify(prices)
            );
            render();
        });
    };

    [
        '#search',
        '#setFilter',
        '#rarityFilter',
        '#domainFilter',
        '#typeFilter',
        '#sortFilter'
    ].forEach(selector => {
        const el = $(selector);
        if (el) {
            el.addEventListener('input', () => {
                page = 1;
                render();
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
        page--;
        render();
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
}
function getRarityClass(rarity) {
    const value = String(rarity || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    const rarityMap = {
        common: "common",
        uncommon: "uncommon",
        rare: "rare",
        epic: "epic",
        legendary: "legendary",
        showcase: "showcase",
        holo: "holo",
        foil: "holo"
    };

    return rarityMap[value] || "common";
}

function renderRarity(rarity) {
    const className = getRarityClass(rarity);

    return `
        <span class="rarity rarity-${className}">
            ${rarity || "Unknown"}
        </span>
    `;
}

document.addEventListener('DOMContentLoaded', init);
/* Holo foil: theo dõi chuột + bọc ảnh trong modal.
   Dán vào cuối script.js (hoặc thêm <script src="holo.js" defer>). */
(() => {
    const SEL = '.card-image, .holo-wrap';
    const TILT = 6; // độ nghiêng tối đa (deg), chỉ áp dụng cho ảnh modal

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

    // Modal được render bằng JS -> bọc <img> khi nó xuất hiện
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


