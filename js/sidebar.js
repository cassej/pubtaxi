document.addEventListener('DOMContentLoaded', function() {
  const user = getUser();
  if (user) {
    document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = user.name || user.email);
  }
  const sidebarFooter = document.querySelector('.absolute.bottom-0.left-0.right-0 .flex.items-center.gap-3');
  if (sidebarFooter) {
    const link = document.createElement('a');
    link.href = '/password.html';
    link.className = 'text-[11px] text-gray-400 hover:text-[#003366] transition mt-1 block';
    link.textContent = '🔑 Cambiar contraseña';
    sidebarFooter.parentElement.appendChild(link);
  }
});
