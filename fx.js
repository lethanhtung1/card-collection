/* =========================================================
   CheckPrice VFX Engine (Modern Canvas Particle & Light Field)
   1) Nút đổi giao diện sáng / tối mượt mà (có View Transition)
   2) Nền VFX Canvas hoàn toàn động (Không phụ thuộc file ảnh ngoài):
      - SÁNG: Hiệu ứng bầu trời nắng vàng, hạt bụi sáng bay lơ lửng.
      - TỐI : Hiệu ứng không gian vũ trụ sâu thẳm, quỹ đạo năng lượng & hạt sao.
   Chỉ cần <script src="fx.js" defer></script>
========================================================= */
(function () {
    'use strict';

    const root = document.documentElement;
    const STORE = 'checkprice-theme';
    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');

    /* ---------- Tiện ích toán học ---------- */
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const rand = (a, b) => a + Math.random() * (b - a);

    /* =========================================================
       CHẾ ĐỘ GIAO DIỆN
    ========================================================= */
    function storedTheme() {
        try { const v = localStorage.getItem(STORE); return v === 'dark' || v === 'light' ? v : null; }
        catch (e) { return null; }
    }
    const currentTheme = () => (root.dataset.theme === 'dark' ? 'dark' : 'light');

    function paintTheme(theme) {
        root.dataset.theme = theme;

        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'dark' ? '#05070D' : '#F6E7C4');

        const btn = document.getElementById('themeToggle');
        if (btn) {
            const label = theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối';
            btn.setAttribute('aria-label', label);
            btn.setAttribute('title', label);
            btn.setAttribute('aria-pressed', String(theme === 'dark'));
        }
        FX.setTheme(theme);
    }

    function switchTheme(next, origin) {
        try { localStorage.setItem(STORE, next); } catch (e) {}

        if (!document.startViewTransition || reduceMq.matches) { paintTheme(next); return; }

        const r = origin ? origin.getBoundingClientRect() : null;
        const x = r ? r.left + r.width / 2 : innerWidth / 2;
        const y = r ? r.top + r.height / 2 : 0;
        const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

        root.classList.add('vt');
        const vt = document.startViewTransition(() => paintTheme(next));
        vt.ready.then(() => {
            root.animate(
                { clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + radius + 'px at ' + x + 'px ' + y + 'px)'] },
                { duration: 800, easing: 'cubic-bezier(.5, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' }
            );
        }).catch(() => {});
        vt.finished.finally(() => root.classList.remove('vt'));
    }

    /* =========================================================
       VFX ENGINE (CANVAS 2D DYNAMIC PARTICLES & NEBULA)
    ========================================================= */
    const FX = {
        canvas: null, ctx: null,
        W: 0, H: 0, dpr: 1,
        theme: 'light',
        raf: 0, last: 0, lastTs: 0,
        mx: 0, my: 0, tmx: 0, tmy: 0,
        particles: [],
        orbs: [],

        init() {
            this.makeCanvas();
            this.makeElements();
            this.resize();
        },

        makeCanvas() {
            let c = document.getElementById('fx');
            if (!c) {
                c = document.createElement('canvas');
                c.id = 'fx';
                c.setAttribute('aria-hidden', 'true');
                document.body.insertBefore(c, document.body.firstChild);
            }
            this.canvas = c;
            this.ctx = c.getContext('2d', { alpha: false });
        },

        makeElements() {
            this.particles = [];
            // Tạo hệ thống hạt tương tác
            for (let i = 0; i < 90; i++) {
                this.particles.push({
                    x: Math.random(),
                    y: Math.random(),
                    vx: rand(-0.0001, 0.0001),
                    vy: rand(-0.0003, -0.0009),
                    r: rand(1, 2.8),
                    alpha: rand(0.2, 0.7),
                    pulse: rand(0, Math.PI * 2)
                });
            }

            // Tạo các khối sáng màu (Nebula / Orbs) tạo chiều sâu VFX
            this.orbs = [
                { x: 0.2, y: 0.3, r: 350, vx: 0.0002, vy: 0.0001, colorDark: 'rgba(56, 189, 248, 0.12)', colorLight: 'rgba(245, 158, 11, 0.15)' },
                { x: 0.8, y: 0.7, r: 450, vx: -0.0001, vy: -0.0002, colorDark: 'rgba(129, 140, 248, 0.08)', colorLight: 'rgba(251, 191, 36, 0.10)' },
                { x: 0.5, y: 0.5, r: 500, vx: 0.0001, vy: -0.0001, colorDark: 'rgba(99, 102, 241, 0.06)', colorLight: 'rgba(217, 119, 6, 0.08)' }
            ];
        },

        setTheme(t) {
            this.theme = t;
            this.start();
        },

        resize() {
            this.W = window.innerWidth;
            this.H = window.innerHeight;
            this.dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.canvas.width = Math.round(this.W * this.dpr);
            this.canvas.height = Math.round(this.H * this.dpr);
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        },

        paused() {
            if (document.hidden) return true;
            const modal = document.getElementById('detailModal');
            if (modal && modal.classList.contains('open')) return true;
            const intro = document.getElementById('intro');
            return !!(intro && !intro.hidden);
        },

        start() {
            cancelAnimationFrame(this.raf);
            if (reduceMq.matches) { this.draw(4); return; }
            const loop = now => {
                this.raf = requestAnimationFrame(loop);
                if (now - this.last < 20 || this.paused()) return; // ~50fps cực mượt
                this.last = now;
                this.mx += (this.tmx - this.mx) * 0.05;
                this.my += (this.tmy - this.my) * 0.05;
                this.draw(now / 1000);
            };
            this.raf = requestAnimationFrame(loop);
        },

        draw(ts) {
            const { ctx, W, H } = this;
            const dark = this.theme === 'dark';

            // 1. Vẽ nền Gradient sâu thẳm
            const bgGrad = ctx.createLinearGradient(0, 0, W, H);
            if (dark) {
                bgGrad.addColorStop(0, '#05070D');
                bgGrad.addColorStop(0.5, '#0B0F19');
                bgGrad.addColorStop(1, '#020307');
            } else {
                bgGrad.addColorStop(0, '#FFFBF0');
                bgGrad.addColorStop(0.5, '#Fef3c7');
                bgGrad.addColorStop(1, '#fde68a');
            }
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);

            // 2. Vẽ các khối sáng VFX (Orbs) chuyển động nhẹ theo thời gian và chuột
            for (let orb of this.orbs) {
                orb.x += orb.vx;
                orb.y += orb.vy;
                if (orb.x < -0.2 || orb.x > 1.2) orb.vx *= -1;
                if (orb.y < -0.2 || orb.y > 1.2) orb.vy *= -1;

                let ox = orb.x * W + this.mx * 30;
                let oy = orb.y * H + this.my * 30;

                const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.r);
                grad.addColorStop(0, dark ? orb.colorDark : orb.colorLight);
                grad.addColorStop(1, 'rgba(0,0,0,0)');

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(ox, oy, orb.r, 0, Math.PI * 2);
                ctx.fill();
            }

            // 3. Vẽ hệ thống hạt ánh sáng (Particles / Dust)
            if (dark) ctx.globalCompositeOperation = 'lighter';
            
            for (let p of this.particles) {
                p.y += p.vy;
                p.x += p.vx + Math.sin(ts + p.pulse) * 0.0002;

                if (p.y < 0) { p.y = 1; p.x = Math.random(); }
                if (p.x < 0) p.x = 1; if (p.x > 1) p.x = 0;

                let px = p.x * W - this.mx * 15 * (p.r * 2);
                let py = p.y * H - this.my * 15 * (p.r * 2);

                let currentAlpha = p.alpha * (0.6 + 0.4 * Math.sin(ts * 2 + p.pulse));

                ctx.fillStyle = dark 
                    ? `rgba(186, 230, 253, ${currentAlpha})` 
                    : `rgba(202, 138, 4, ${currentAlpha * 0.8})`;

                ctx.beginPath();
                ctx.arc(px, py, p.r, 0, Math.PI * 2);
                ctx.fill();

                // Hiệu ứng ánh sáng tỏa ra nhẹ cho các hạt lớn
                if (p.r > 2) {
                    ctx.fillStyle = dark 
                        ? `rgba(56, 189, 248, ${currentAlpha * 0.3})` 
                        : `rgba(245, 158, 11, ${currentAlpha * 0.2})`;
                    ctx.beginPath();
                    ctx.arc(px, py, p.r * 2.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            ctx.globalCompositeOperation = 'source-over';
        }
    };

    /* =========================================================
       KHỞI TẠO HỆ THỐNG
    ========================================================= */
    function boot() {
        FX.init();

        const theme = storedTheme() || (root.dataset.theme === 'dark' || root.dataset.theme === 'light'
            ? root.dataset.theme : (darkMq.matches ? 'dark' : 'light'));
        paintTheme(theme);

        const btn = document.getElementById('themeToggle');
        if (btn) btn.addEventListener('click', () => switchTheme(currentTheme() === 'dark' ? 'light' : 'dark', btn));

        const onSys = e => { if (!storedTheme()) paintTheme(e.matches ? 'dark' : 'light'); };
        darkMq.addEventListener ? darkMq.addEventListener('change', onSys) : darkMq.addListener(onSys);

        let rt = 0;
        window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => FX.resize(), 150); });

        window.addEventListener('pointermove', e => {
            if (e.pointerType === 'touch') return;
            FX.tmx = (e.clientX / window.innerWidth - 0.5) * 2;
            FX.tmy = (e.clientY / window.innerHeight - 0.5) * 2;
        }, { passive: true });

        reduceMq.addEventListener && reduceMq.addEventListener('change', () => FX.start());
    }

    window.CheckPriceTheme = {
        get: currentTheme,
        set: t => switchTheme(t === 'dark' ? 'dark' : 'light', document.getElementById('themeToggle')),
        toggle: () => switchTheme(currentTheme() === 'dark' ? 'light' : 'dark', document.getElementById('themeToggle'))
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();