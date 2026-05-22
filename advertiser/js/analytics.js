async function initCharts() {
    try {
        const response = await fetch('/api/stats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "stats.get",
                params: { days: 7 },
                id: 1
            })
        });
        const rpcResponse = await response.json();

        if (rpcResponse.error) {
            console.error('RPC Error:', rpcResponse.error);
            return;
        }

        const data = rpcResponse.result;

        // Daily Chart
        const dailyLabels = data.daily.map(d => d.date);
        const dailyValues = data.daily.map(d => d.count);

        new Chart(document.getElementById('dailyChart').getContext('2d'), {
            type: 'line',
            data: {
                labels: dailyLabels.length ? dailyLabels : ['Sin datos'],
                datasets: [{
                    label: 'Escaneos Reales',
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

        // Hourly Chart
        const hourlyLabels = ['00', '04', '08', '12', '16', '20'];
        const hourlyValues = new Array(6).fill(0);

        data.hourly.forEach(h => {
            const hour = parseInt(h.hour);
            const index = Math.floor(hour / 4);
            hourlyValues[index] += h.count;
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

    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

initCharts();
