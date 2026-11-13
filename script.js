document.addEventListener('DOMContentLoaded', () => {
    // Dark Mode Initialization & Toggling Logic
    const htmlElement = document.documentElement;
    const themeToggleBtns = [document.getElementById('theme-toggle'), document.getElementById('theme-toggle-hero')];

    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlElement.classList.add('dark');
    } else {
        htmlElement.classList.remove('dark');
    }

    themeToggleBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (htmlElement.classList.contains('dark')) {
                    htmlElement.classList.remove('dark');
                    localStorage.setItem('color-theme', 'light');
                } else {
                    htmlElement.classList.add('dark');
                    localStorage.setItem('color-theme', 'dark');
                }
            });
        }
    });

    // FAQ Toggle Logic
    document.querySelectorAll('.faq-toggle').forEach(item => {
        item.addEventListener('click', () => {
            const content = item.nextElementSibling;
            const icon = item.querySelector('.faq-icon');
            
            if (content) {
                content.classList.toggle('hidden');
                if (icon) {
                    icon.textContent = content.classList.contains('hidden') ? '+' : '-';
                }
            }
        });
    });
});