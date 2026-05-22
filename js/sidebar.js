document.addEventListener('DOMContentLoaded', function() {
  const user = getUser();
  if (user) {
    document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = user.name || user.email);
  }
});
