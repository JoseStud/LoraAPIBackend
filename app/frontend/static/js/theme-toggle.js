/* Theme toggle helper — toggles light/dark theme and persists preference */
(function () {
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) { /* ignore storage errors */ }
        // update meta theme-color
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute('content', theme === 'dark' ? '#0f172a' : '#2563eb');
        }
    }

    function getStoredTheme() {
        try { return localStorage.getItem('theme'); } catch (e) { return null; }
    }

    function detectPreferredTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || getStoredTheme() || detectPreferredTheme();
        const next = current === 'dark' ? 'light' : 'dark';
        setTheme(next);
    }

    document.addEventListener('DOMContentLoaded', () => {
        const stored = getStoredTheme();
        setTheme(stored || detectPreferredTheme());

        document.body.addEventListener('click', (e) => {
            const el = e.target.closest && e.target.closest('#theme-toggle');
            if (el) { toggleTheme(); }
        });
    });

    // Expose for console
    window.toggleTheme = toggleTheme;
})();
