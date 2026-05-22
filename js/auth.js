document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const role = document.getElementById('role-select').value;
    if (role === 'advertiser') {
        window.location.href = 'advertiser/index.html';
    } else if (role === 'driver') {
        window.location.href = 'driver/index.html';
    } else if (role === 'admin') {
        window.location.href = 'admin/index.html';
    }
});