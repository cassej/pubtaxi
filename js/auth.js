function toggleTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    if (tab === 'login') {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
        tabLogin.className = 'flex-1 py-2 text-sm font-bold rounded-lg bg-white shadow-sm';
        tabRegister.className = 'flex-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-800';
    } else {
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        tabRegister.className = 'flex-1 py-2 text-sm font-bold rounded-lg bg-white shadow-sm';
        tabLogin.className = 'flex-1 py-2 text-sm font-medium text-gray-500 hover:text-gray-800';
    }
}

document.getElementById('tab-login').addEventListener('click', () => toggleTab('login'));
document.getElementById('tab-register').addEventListener('click', () => toggleTab('register'));

document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = this.querySelector('input[type="email"]').value;
    const password = this.querySelector('input[type="password"]').value;
    const btn = this.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Entrando...';

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
        } else {
            toast(rpcResponse.error?.message || 'Error al iniciar sesión', 'error');
        }
    } catch (err) {
        toast('Error de conexión con el servidor', 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Iniciar Sesión';
    }
});

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const role = document.querySelector('input[name="role"]:checked')?.value;
    const btn = this.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Creando cuenta...';

    try {
        const response = await fetch('/rpc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "auth.register",
                params: { email, password, name, role },
                id: 1
            })
        });

        const rpcResponse = await response.json();

        if (rpcResponse.result && rpcResponse.result.success) {
            const { token, user, redirect } = rpcResponse.result;
            document.cookie = `token=${token}; Max-Age=86400; Path=/; SameSite=Lax`;
            localStorage.setItem('pubtaxi_user', JSON.stringify(user));
            window.location.href = redirect;
        } else {
            toast(rpcResponse.error?.message || 'Error al registrarse', 'error');
        }
    } catch (err) {
        toast('Error de conexión con el servidor', 'error');
    } finally {
        btn.disabled = false; btn.textContent = 'Crear Cuenta';
    }
});
