function setActiveNav(page) {
    document.querySelectorAll('nav a').forEach(link => {
        link.classList.remove('bg-[#003366]/10', 'text-[#003366]', 'border-l-4', 'border-[#003366]');
        link.classList.add('text-gray-600', 'hover:bg-gray-50');
    });
    const activeLink = document.querySelector(`nav a[href="${page}"]`);
    if (activeLink) {
        activeLink.classList.add('bg-[#003366]/10', 'text-[#003366]', 'border-l-4', 'border-[#003366]');
        activeLink.classList.remove('text-gray-600', 'hover:bg-gray-50');
    }
}