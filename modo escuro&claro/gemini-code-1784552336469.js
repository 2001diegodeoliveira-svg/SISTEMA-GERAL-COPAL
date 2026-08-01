<script>
  const iconeLua = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
  const iconeSol = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';

  function atualizarInterface(isDark) {
    const iconSvg = document.getElementById('theme-icon');
    const btnText = document.getElementById('btn-text');

    // Dispara a animação de rotação no ícone
    iconSvg.classList.add('rotate-anim');
    setTimeout(() => iconSvg.classList.remove('rotate-anim'), 500);

    if (isDark) {
      document.body.classList.add('dark-mode');
      iconSvg.innerHTML = iconeSol;
      btnText.textContent = 'Modo Claro';
    } else {
      document.body.classList.remove('dark-mode');
      iconSvg.innerHTML = iconeLua;
      btnText.textContent = 'Modo Escuro';
    }
  }

  function alternarTema() {
    const isDark = !document.body.classList.contains('dark-mode');
    atualizarInterface(isDark);
    localStorage.setItem('tema', isDark ? 'escuro' : 'claro');
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('tema') === 'escuro') {
      atualizarInterface(true);
    }
  });
</script>