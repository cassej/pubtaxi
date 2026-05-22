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
            // In MVP we use taxiId to find campaign, in real app use campaignId
            const response = await fetch('/api/update-campaign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: taxiId, // For MVP demo
                    target_url: targetUrl,
                    redirect_mode: redirectMode 
                })
            });

            if (response.ok) {
                alert('¡Guardado con éxito!');
            } else {
                alert('Error al guardar');
            }
        } catch (err) {
            alert('Error de conexión');
        } finally {
            saveBtn.innerText = 'Guardar';
            saveBtn.disabled = false;
        }
    };
});
