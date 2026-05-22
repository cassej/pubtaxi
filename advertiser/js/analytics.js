new Chart(document.getElementById('dailyChart').getContext('2d'), {
    type: 'line',
    data: {
        labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        datasets: [{
            label: 'Escaneos',
            data: [30, 45, 60, 52, 80, 41, 22],
            borderColor: '#003366',
            backgroundColor: 'rgba(0, 51, 102, 0.05)',
            borderWidth: 2,
            fill: true,
            tension: 0.3
        }]
    },
    options: { responsive: true, maintainAspectRatio: false }
});

new Chart(document.getElementById('hourlyChart').getContext('2d'), {
    type: 'bar',
    data: {
        labels: ['6-9am', '9-12pm', '12-3pm', '3-6pm', '6-9pm', '9-12am'],
        datasets: [{
            label: 'Escaneos',
            data: [45, 30, 55, 90, 65, 20],
            backgroundColor: '#FFB800',
            borderRadius: 6
        }]
    },
    options: { responsive: true, maintainAspectRatio: false }
});