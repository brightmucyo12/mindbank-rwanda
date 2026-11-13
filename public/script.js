document.addEventListener('DOMContentLoaded', () => {
    const htmlElement = document.documentElement;
    const themeToggleBtn = document.getElementById('theme-toggle');

    // 1. Initialize theme based on local storage or system preference
    if (localStorage.getItem('color-theme') === 'dark' || (!('color-theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlElement.classList.add('dark');
    } else {
        htmlElement.classList.remove('dark');
    }

    // 2. Dark mode button click handler
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            if (htmlElement.classList.contains('dark')) {
                htmlElement.classList.remove('dark');
                localStorage.setItem('color-theme', 'light');
            } else {
                htmlElement.classList.add('dark');
                localStorage.setItem('color-theme', 'dark');
            }
        });
    }

    // 3. FAQ Accordion Toggle Logic
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