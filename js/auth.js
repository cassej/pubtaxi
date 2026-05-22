document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = this.querySelector('input[type="email"]').value;
    const password = this.querySelector('input[type="password"]').value;

    try {
        const response = await fetch('/rpc', {
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
            const { token, user, redirect } = rpcResponse.result;

            document.cookie = `token=${token}; Max-Age=86400; Path=/; SameSite=Lax`;
            localStorage.setItem('pubtaxi_user', JSON.stringify(user));

            window.location.href = redirect;
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
