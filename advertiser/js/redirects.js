const configModeRadios = document.querySelectorAll('input[name="config-mode"]');
const globalConfig = document.getElementById('global-config');
const individualConfig = document.getElementById('individual-config');

configModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.value === 'global') {
            globalConfig.classList.remove('hidden');
            individualConfig.classList.add('hidden');
        } else {
            globalConfig.classList.add('hidden');
            individualConfig.classList.remove('hidden');
        }
    });
});

// Глобальная конфигурация - показать/скрыть URL
const globalActionSelect = document.getElementById('global-action');
const globalUrlSection = document.getElementById('global-url-section');

globalActionSelect.addEventListener('change', (e) => {
    if (e.target.value === 'direct') {
        globalUrlSection.classList.remove('hidden');
    } else {
        globalUrlSection.classList.add('hidden');
    }
});

// Индивидуальная конфигурация - показать/скрыть URL для каждого
const actionSelects = document.querySelectorAll('.action-select');

actionSelects.forEach(select => {
    select.addEventListener('change', (e) => {
        const container = select.parentElement;
        const urlInput = container.querySelector('.url-input');
        const urlLabel = container.querySelector('.url-label');
        if (e.target.value === 'direct') {
            urlInput.classList.remove('hidden');
            urlLabel.classList.remove('hidden');
        } else {
            urlInput.classList.add('hidden');
            urlLabel.classList.add('hidden');
        }
    });
});

// Инициализация - скрыть/show URL при загрузке в зависимости от выбранного значения
actionSelects.forEach(select => {
    const container = select.parentElement;
    const urlInput = container.querySelector('.url-input');
    const urlLabel = container.querySelector('.url-label');
    if (select.value === 'direct') {
        urlInput.classList.remove('hidden');
        urlLabel.classList.remove('hidden');
    } else {
        urlInput.classList.add('hidden');
        urlLabel.classList.add('hidden');
    }
});