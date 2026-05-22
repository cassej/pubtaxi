function toast(message, type) {
  const colors = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-[#003366]'
  };
  const bg = colors[type] || colors.info;

  const el = document.createElement('div');
  el.className = `fixed top-4 right-4 z-[9999] ${bg} text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 translate-x-full opacity-0 max-w-sm`;
  el.textContent = message;
  document.body.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.remove('translate-x-full', 'opacity-0');
  });

  setTimeout(() => {
    el.classList.add('translate-x-full', 'opacity-0');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

function customAlert(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <p class="text-sm text-gray-700 mb-5">${message}</p>
        <button onclick="this.closest('.fixed').remove(); (${resolve.toString()})()" class="w-full bg-[#003366] text-white py-3 rounded-xl text-sm font-bold hover:bg-blue-950 transition">OK</button>
      </div>`;
    document.body.appendChild(overlay);
  });
}

function customConfirm(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
        <p class="text-sm text-gray-700 mb-5">${message}</p>
        <div class="flex gap-3">
          <button class="confirm-yes flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-bold hover:bg-red-700 transition">Sí</button>
          <button class="confirm-no flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl text-sm font-bold hover:bg-gray-200 transition">Cancelar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('.confirm-yes').onclick = () => { overlay.remove(); resolve(true); };
    overlay.querySelector('.confirm-no').onclick = () => { overlay.remove(); resolve(false); };
  });
}
