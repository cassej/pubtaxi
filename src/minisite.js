function escapeHtml(unsafe) {
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(unsafe) {
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function validateUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

function sanitizeColor(color) {
    if (!color) return null;
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color;
    if (/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/.test(color)) return color;
    return null;
}

export function renderMinisite(data, qrId) {
    const config = JSON.parse(data.config || '{}');
    const buttons = Array.isArray(config.buttons) ? config.buttons : [];

    const bgColor = sanitizeColor(config.bgColor);
    const btnColor = sanitizeColor(config.btnColor);
    const logoUrl = config.logoUrl && validateUrl(config.logoUrl) ? config.logoUrl : null;

    const escapedTitle = escapeHtml(data.title || 'pubtaxi.lat');
    const escapedDescription = escapeHtml(config.description || 'Escanea y descubre promociones exclusivas');
    const escapedQrId = escapeAttr(qrId);

    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapedTitle}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: ui-sans-serif, system-ui; ${bgColor ? `background-color: ${bgColor};` : ''} }
        .btn-custom { ${btnColor ? `background-color: ${btnColor};` : 'background-color: #003366;'} color: white; }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center p-6 text-gray-900">
    <div class="max-w-md w-full text-center">
        ${logoUrl ? `<img src="${escapeAttr(logoUrl)}" class="w-24 h-24 mx-auto rounded-full shadow-lg mb-4" alt="Logo">` : '<div class="w-24 h-24 bg-[#FFB800] rounded-full mx-auto mb-4 flex items-center justify-center text-2xl font-bold">P</div>'}
        <h1 class="text-2xl font-bold mb-2">${escapedTitle}</h1>
        <p class="text-gray-600 mb-8">${escapedDescription}</p>

        <div class="space-y-4">
            ${buttons.map((btn, index) => {
                const btnText = escapeHtml(btn.text || '');
                const btnUrl = validateUrl(btn.url) ? escapeAttr(btn.url) : '#';
                const escapedBtnId = escapeAttr(`btn_${index}`);
                return `
                <a href="${btnUrl}"
                   onclick="trackClick('${escapedQrId}', '${escapedBtnId}')"
                   class="btn-custom w-full block py-4 rounded-2xl font-bold shadow-md transition active:scale-95">
                    ${btnText}
                </a>
            `;}).join('')}
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
