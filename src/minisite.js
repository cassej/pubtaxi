export function renderMinisite(data, qrId) {
    const config = JSON.parse(data.config || '{}');
    const buttons = config.buttons || [];
    
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title || 'pubtaxi.lat'}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: ui-sans-serif, system-ui; background-color: ${config.bgColor || '#f3f4f6'}; }
        .btn-custom { background-color: ${config.btnColor || '#003366'}; color: white; }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center p-6 text-gray-900">
    <div class="max-w-md w-full text-center">
        ${config.logoUrl ? `<img src="${config.logoUrl}" class="w-24 h-24 mx-auto rounded-full shadow-lg mb-4">` : '<div class="w-24 h-24 bg-[#FFB800] rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold">P</div>'}
        <h1 class="text-2xl font-bold mb-2">${data.title || 'Bienvenido'}</h1>
        <p class="text-gray-600 mb-8">${config.description || 'Escanea y descubre promociones exclusivas'}</p>
        
        <div class="space-y-4">
            ${buttons.map((btn, index) => `
                <a href="${btn.url}" 
                   onclick="trackClick('${qrId}', 'btn_${index}')"
                   class="btn-custom w-full block py-4 rounded-2xl font-bold shadow-md transition active:scale-95">
                    ${btn.text}
                </a>
            `).join('')}
        </div>

        <div class="mt-12 text-xs text-gray-400">
            <p>Powered by <span class="font-bold text-[#003366]">pubtaxi.lat</span></p>
        </div>
    </div>

    <script>
        async function trackClick(qrId, btnId) {
            await fetch('/api/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ qr_id: qrId, event_type: 'click_button', metadata: { btn_id: btnId } })
            });
        }
    </script>
</body>
</html>`;
}
