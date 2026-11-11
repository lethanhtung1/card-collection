/* supabase-config.js — điền 2 giá trị lấy ở Supabase: Project Settings -> API
 *   url     = "Project URL"
 *   anonKey = khoá "anon" / "publishable" (khoá CÔNG KHAI, an toàn để nằm trong trang web nhờ RLS trong schema.sql)
 * TUYỆT ĐỐI KHÔNG dán khoá "service_role" / "secret" vào đây — khoá đó bỏ qua RLS, ai xem mã nguồn cũng lấy được.
 *
 * Nạp theo thứ tự (trong pack.html và binder.html, trước pack.js / binder script):
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
 *   <script src="supabase-config.js"></script>
 *   <script src="binder-store.js"></script>
 *   <script src="cloud-auth.js"></script>
 */
window.SB_CONFIG = {
    url: 'https://jrpehoiscoberehturbm.supabase.co',
    anonKey: 'sb_publishable_gBqvg72yUWFWLbdSH83b0A_Dm0Pzyqo',

    requireLogin: true,     // true = phải đăng nhập / đăng ký mới xé được pack
    allowGuest: false,      // true = hiện thêm nút "Chơi thử, không lưu" (dữ liệu chỉ nằm trên máy)
    google: false,          // true = hiện nút "Đăng nhập bằng Google" (phải bật Google trong Authentication -> Providers)
    redirectTo: location.origin + location.pathname   // trang quay lại sau khi xác nhận email / quên mật khẩu / Google
};

// chưa điền cấu hình hoặc chưa nạp thư viện -> trang vẫn chạy ở chế độ lưu cục bộ như cũ (không bắt đăng nhập)
(function () {
    const c = window.SB_CONFIG;
    const ok = window.supabase && c.url && c.anonKey && !/YOUR-PROJECT|YOUR_ANON/.test(c.url + c.anonKey);
    if (!ok) { console.warn('[cloud] Chưa cấu hình Supabase (supabase-config.js) -> chạy chế độ lưu trên máy, không đăng nhập.'); window.sb = null; return; }
    window.freeCacheSpace = function () {
    const keys = Object.keys(localStorage).filter(k => /^(tcgdex_set_|ygo_set_)/.test(k));
    keys.forEach(k => localStorage.removeItem(k));   // chỉ là cache tra giá, tải lại được
    return keys.length;
};
const safeStorage = {
    getItem: k => localStorage.getItem(k),
    removeItem: k => localStorage.removeItem(k),
    setItem(k, v) {
        try { localStorage.setItem(k, v); }
        catch (e) { window.freeCacheSpace(); localStorage.setItem(k, v); }
    }
};
    window.sb = window.supabase.createClient(c.url, c.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'pack_sb_auth' }
    });
})();

// Mở bằng file:// (bấm đúp file .html) thì trình duyệt coi mỗi trang là một "nguồn" riêng -> đăng nhập ở trang này KHÔNG sang được trang kia.
if (location.protocol === 'file:') {
    console.error('[cloud] Đang mở bằng file:// — đăng nhập sẽ không giữ được giữa pack.html và binder.html. Hãy chạy qua http (VS Code Live Server, `npx serve`, GitHub Pages, Netlify...).');
    document.addEventListener('DOMContentLoaded', () => {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;background:#b91c1c;color:#fff;padding:8px 12px;font:13px/1.4 sans-serif;text-align:center';
        d.textContent = '⚠ Bạn đang mở file trực tiếp (file://) nên đăng nhập không giữ được giữa các trang. Hãy chạy qua http://localhost hoặc đưa lên hosting.';
        document.body.append(d);
    });
}