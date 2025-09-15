if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        console.log('Service Worker terdaftar:', reg);
      })
      .catch(err => {
        console.log('Pendaftaran Service Worker gagal:', err);
      });
  });
}
