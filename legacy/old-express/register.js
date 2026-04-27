
document.addEventListener('DOMContentLoaded', function() {
  const form = document.querySelector('form');
  const errorMessage = document.querySelector('.error-message');

  form.addEventListener('submit', function(event) {
    event.preventDefault();

    const username = document.querySelector('input[name="username"]').value;
    const password = document.querySelector('input[name="password"]').value;

    if (username && password) {
      // Enviar los datos al servidor
      const formData = new FormData(form);

      fetch('/register', {
        method: 'POST',
        body: formData
      })
      .then(response => {
        if (response.ok) {
          window.location.href = '/login';  // Redirigir al inicio de sesión
        } else {
          return response.text();
        }
      })
      .then(errorText => {
        errorMessage.textContent = errorText || 'Hubo un error al registrar el usuario.';
      })
      .catch(() => {
        errorMessage.textContent = 'Error de conexión. Intenta de nuevo.';
      });
    } else {
      errorMessage.textContent = 'Por favor, complete todos los campos.';
    }
  });
});
