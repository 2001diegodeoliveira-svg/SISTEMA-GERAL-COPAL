(function () {
  const storedBase = localStorage.getItem('API_BASE_URL') || '';
  const configuredBase = (window.API_BASE_URL || storedBase || '').trim().replace(/\/$/, '');
  const originalFetch = window.fetch.bind(window);

  window.API_BASE_URL = configuredBase;

  function isBackendPath(path) {
    return typeof path === 'string' && (path.startsWith('/api/') || path.startsWith('/auth/'));
  }

  window.apiUrl = function apiUrl(path) {
    const normalizedPath = String(path || '');
    if (/^https?:\/\//i.test(normalizedPath)) {
      return normalizedPath;
    }
    if (!configuredBase) {
      return normalizedPath;
    }
    return `${configuredBase}${normalizedPath}`;
  };

  window.fetch = async function patchedFetch(input, init) {
    const rawUrl = typeof input === 'string' ? input : (input && input.url) || '';

    if (isBackendPath(rawUrl)) {
      if (!configuredBase) {
        return new Response(JSON.stringify({
          message: 'Backend não configurado nesta publicação. Defina API_BASE_URL para apontar ao servidor Node.js.'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const targetUrl = `${configuredBase}${rawUrl}`;
      if (typeof input === 'string') {
        return originalFetch(targetUrl, init);
      }

      const clonedRequest = new Request(targetUrl, input);
      return originalFetch(clonedRequest, init);
    }

    return originalFetch(input, init);
  };

  window.apiFetchJson = async function apiFetchJson(path, options) {
    const response = await fetch(window.apiUrl(path), options);
    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    let data = null;

    if (contentType.includes('application/json')) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error('Resposta JSON inválida do servidor.');
      }
    } else if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      try {
        data = JSON.parse(text);
      } catch (error) {
        throw new Error('Resposta JSON inválida do servidor.');
      }
    } else {
      const snippet = text.trim().slice(0, 120).replace(/\s+/g, ' ');
      throw new Error(snippet ? `O backend respondeu com HTML/texto inesperado: ${snippet}` : 'O backend não retornou JSON.');
    }

    if (!response.ok) {
      const message = data && typeof data === 'object' && data.message ? data.message : 'Falha na requisição.';
      throw new Error(message);
    }

    return data;
  };

  window.apiFetch = async function apiFetch(path, options) {
    return fetch(window.apiUrl(path), options);
  };
})();
