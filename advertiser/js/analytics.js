async function initCharts() {
    try {
        const data = await api('advertiser.stats', { days: 30 });

        document.getElementById('total-scans').textContent = data.totalScans.toLocaleString();
        document.getElementById('today-scans').textContent = data.todayScans;
        document.getElementById('avg-daily').textContent = data.dailyAvg;
        document.getElementById('active-campaigns').textContent = data.activeCampaigns;

        const dailyLabels = data.daily.map(d => d.date);
        const dailyValues = data.daily.map(d => d.count);

        new Chart(document.getElementById('dailyChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: dailyLabels.length ? dailyLabels : ['Sin datos'],
                datasets: [{
                    label: 'Escaneos',
                    data: dailyValues.length ? dailyValues : [0],
                    borderColor: '#003366',
                    backgroundColor: 'rgba(0, 51, 102, 0.05)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        const hourlyLabels = ['00', '04', '08', '12', '16', '20'];
        const hourlyValues = new Array(6).fill(0);

        data.hourly.forEach(h => {
            const hour = parseInt(h.hour);
            const index = Math.floor(hour / 4);
            if (index >= 0 && index < 6) hourlyValues[index] += h.count;
        });

        new Chart(document.getElementById('hourlyChart').getContext('2d'), {
            type: 'bar',
            data: {
                labels: ['0-4h', '4-8h', '8-12h', '12-16h', '16-20h', '20-24h'],
                datasets: [{
                    label: 'Escaneos',
                    data: hourlyValues,
                    backgroundColor: '#FFB800',
                    borderRadius: 6
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        const perfContainer = document.getElementById('campaign-perf');
        if (perfContainer && data.campaigns.length > 0) {
            perfContainer.innerHTML = data.campaigns.map(c => `
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gray-50 rounded-xl">
                    <div>
                        <p class="font-semibold text-sm">${c.name || 'Sin nombre'}</p>
                        <p class="text-xs text-gray-500">${c.status === 'active' ? 'Activa' : 'Pausada'}</p>
                    </div>
                </div>
            `).join('');
        }

    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const user = getUser();
    if (!user) { window.location.href = '/auth.html'; return; }
    initCharts();
});
