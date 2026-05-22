document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const role = document.getElementById('role-select').value;
    const email = this.querySelector('input[type="email"]').value;
    const password = this.querySelector('input[type="password"]').value;

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, role })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            if (result.role === 'advertiser') {
                window.location.href = 'advertiser/index.html';
            } else if (result.role === 'publisher' || result.role === 'driver') {
                window.location.href = 'driver/index.html';
            } else if (result.role === 'admin') {
                window.location.href = 'admin/index.html';
            }
        } else {
            alert(result.error || 'Error al iniciar sesión');
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Error de conexión con el servidor');
    }
});