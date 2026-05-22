// Logic for saving redirect settings in advertiser/redirects.html
document.querySelectorAll('.bg-white.rounded-2xl.shadow-sm.border.border-gray-100.p-4.lg\\:p-6').forEach(container => {
    const saveBtn = container.querySelector('button');
    if (!saveBtn) return;

    saveBtn.onclick = async () => {
        const taxiId = container.querySelector('.font-semibold.text-gray-800').innerText;
        const targetUrl = container.querySelector('.url-input').value;
        const redirectMode = container.querySelector('.action-select').value;

        saveBtn.innerText = 'Guardando...';
        saveBtn.disabled = true;

        try {
            const response = await fetch('/rpc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "campaign.update",
                    params: {
                        id: taxiId,
                        target_url: targetUrl,
                        redirect_mode: redirectMode
                    },
                    id: 1
                })
            });

            const rpcResponse = await response.json();

            if (rpcResponse.result && rpcResponse.result.success) {
                alert('¡Guardado con éxito!');
            } else {
                alert(rpcResponse.error?.message || 'Error al guardar');
            }
        } catch (err) {
            alert('Error de conexión');
        } finally {
            saveBtn.innerText = 'Guardar';
            saveBtn.disabled = false;
        }
    };
});
