document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = this.querySelector('input[type="email"]').value;
    const password = this.querySelector('input[type="password"]').value;

    try {
        // JSON-RPC request
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "auth.login",
                params: { email, password },
                id: 1
            })
        });

        const rpcResponse = await response.json();

        if (rpcResponse.result && rpcResponse.result.success) {
            // Use server-provided redirect based on user role
            window.location.href = rpcResponse.result.redirect;
        } else if (rpcResponse.error) {
            alert(rpcResponse.error.message || 'Error al iniciar sesión');
        } else {
            alert('Error al iniciar sesión');
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Error de conexión con el servidor');
    }
});
