const previewScreen = document.getElementById('preview-screen');

// Текстовые поля
const textFields = [
    { input: 'input-title', preview: 'preview-title' },
    { input: 'input-desc', preview: 'preview-desc' }
];

textFields.forEach(field => {
    document.getElementById(field.input).addEventListener('input', (e) => {
        document.getElementById(field.preview).innerText = e.target.value;
    });
});

// Цвета текста
const titleColorInput = document.getElementById('input-title-color');
const previewTitle = document.getElementById('preview-title');

titleColorInput.addEventListener('input', (e) => {
    previewTitle.style.color = e.target.value;
});

const descColorInput = document.getElementById('input-desc-color');
const previewDesc = document.getElementById('preview-desc');

descColorInput.addEventListener('input', (e) => {
    previewDesc.style.color = e.target.value;
});

// Тип фона
const bgTypeSelect = document.getElementById('bg-type');
const colorSection = document.getElementById('bg-color-section');
const gradientSection = document.getElementById('bg-gradient-section');
const imageSection = document.getElementById('bg-image-section');

bgTypeSelect.addEventListener('change', (e) => {
    const type = e.target.value;
    colorSection.classList.toggle('hidden', type !== 'color');
    gradientSection.classList.toggle('hidden', type !== 'gradient');
    imageSection.classList.toggle('hidden', type !== 'image');
    previewScreen.style.backgroundImage = 'none';
    previewScreen.style.backgroundColor = '#f9fafb';
});

// Цвет фона
const bgColorInput = document.getElementById('input-bg-color');
bgColorInput.addEventListener('input', (e) => {
    if (bgTypeSelect.value === 'color') {
        previewScreen.style.backgroundColor = e.target.value;
    }
});

// Градиент
const gradientStart = document.getElementById('gradient-start');
const gradientEnd = document.getElementById('gradient-end');
const gradientDirection = document.getElementById('gradient-direction');

function updateGradient() {
    if (bgTypeSelect.value === 'gradient') {
        previewScreen.style.background = `linear-gradient(${gradientDirection.value}, ${gradientStart.value}, ${gradientEnd.value})`;
    }
}
gradientStart.addEventListener('input', updateGradient);
gradientEnd.addEventListener('input', updateGradient);
gradientDirection.addEventListener('change', updateGradient);

// Картинка фона
const bgImageInput = document.getElementById('input-bg-image');
bgImageInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && bgTypeSelect.value === 'image') {
        const reader = new FileReader();
        reader.onload = function(event) {
            previewScreen.style.backgroundImage = `url(${event.target.result})`;
            previewScreen.style.backgroundSize = 'cover';
            previewScreen.style.backgroundPosition = 'center';
        };
        reader.readAsDataURL(file);
    }
});

// Логотип
const logoInput = document.getElementById('input-logo');
const previewLogoPlaceholder = document.getElementById('preview-logo-placeholder');
const previewLogoImg = document.getElementById('preview-logo-img');

logoInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
            previewLogoPlaceholder.classList.add('hidden');
            previewLogoImg.classList.remove('hidden');
            previewLogoImg.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// Кнопки - текст и видимость
const buttons = [
    { checkbox: 'show-wa', text: 'btn-wa-text', link: 'btn-wa-link', preview: 'preview-wa', color: 'green' },
    { checkbox: 'show-ig', text: 'btn-ig-text', link: 'btn-ig-link', preview: 'preview-ig', gradient: true },
    { checkbox: 'show-fb', text: 'btn-fb-text', link: 'btn-fb-link', preview: 'preview-fb', color: 'blue' },
    { checkbox: 'show-yt', text: 'btn-yt-text', link: 'btn-yt-link', preview: 'preview-yt', color: 'red' },
    { checkbox: 'show-web', text: 'btn-web-text', link: 'btn-web-link', preview: 'preview-web', color: 'gray' },
    { checkbox: 'show-phone', text: 'btn-phone-text', link: 'btn-phone-link', preview: 'preview-phone', color: 'purple' }
];

buttons.forEach(btn => {
    const checkbox = document.getElementById(btn.checkbox);
    const textInput = document.getElementById(btn.text);
    const linkInput = document.getElementById(btn.link);
    const preview = document.getElementById(btn.preview);

    checkbox.addEventListener('change', () => {
        preview.style.display = checkbox.checked ? 'block' : 'none';
    });

    textInput.addEventListener('input', () => {
        preview.innerText = textInput.value;
    });

    linkInput.addEventListener('input', () => {
        preview.href = linkInput.value;
    });
});