(function initTheme() {
    try {
        var saved = window.localStorage.getItem('newsai-theme');
        var theme =
            saved === 'light' || saved === 'dark'
                ? saved
                : window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
                    ? 'light'
                    : 'dark';
        document.documentElement.dataset.theme = theme;
    } catch {
        document.documentElement.dataset.theme = 'dark';
    }
})();
