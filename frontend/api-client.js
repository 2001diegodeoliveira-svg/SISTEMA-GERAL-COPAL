(function () {
  const storedBase = localStorage.getItem('API_BASE_URL') || '';
  let configuredBase = '';
  let promptedForBaseInThisSession = false;
  const originalFetch = window.fetch.bind(window);
  const KNOWN_PUBLIC_BACKENDS = {
    '2001diegodeoliveira-svg.github.io': 'https://sistema-geral-copal-api.onrender.com'
  };

  function normalizeBase(value) {
    return String(value || '').trim().replace(/\/$/, '');
  }

  function setBaseUrl(baseUrl, persist) {
    configuredBase = normalizeBase(baseUrl);
    window.API_BASE_URL = configuredBase;
    if (persist !== false) {
      if (configuredBase) {
        localStorage.setItem('API_BASE_URL', configuredBase);
      } else {
        localStorage.removeItem('API_BASE_URL');
      }
    }
  }

  function inferDefaultBase() {
    const host = window.location.hostname || '';
    if (KNOWN_PUBLIC_BACKENDS[host]) {
      return KNOWN_PUBLIC_BACKENDS[host];
    }

    if (host === 'localhost' || host === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.host}`;
    }

    return '';
  }

  setBaseUrl(window.API_BASE_URL || storedBase || inferDefaultBase() || '', false);

  window.setApiBaseUrl = function setApiBaseUrl(url) {
    setBaseUrl(url, true);
    return configuredBase;
  };

  window.clearApiBaseUrl = function clearApiBaseUrl() {
    setBaseUrl('', true);
  };

  function isGithubPages() {
    return /github\.io$/i.test(window.location.hostname || '');
  }

  async function promptBackendBaseUrl() {
    if (promptedForBaseInThisSession) return '';
    promptedForBaseInThisSession = true;

    const suggested = localStorage.getItem('API_BASE_URL') || '';
    const message = [
      'Backend não configurado para esta publicação.',
      'Informe a URL pública do backend Node.js (ex: https://seu-backend.onrender.com).'
    ].join('\n');

    let input = '';
    try {
      if (typeof window.prompt === 'function') {
        input = window.prompt(message, suggested);
      }
    } catch (error) {
      // Ambientes com prompt bloqueado (webviews/test runners) não devem quebrar a app.
      input = '';
    }
    const normalized = normalizeBase(input);
    if (normalized) {
      setBaseUrl(normalized, true);
      return normalized;
    }
    return '';
  }

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
        if (isGithubPages()) {
          await promptBackendBaseUrl();
        } else {
          setBaseUrl(inferDefaultBase(), false);
        }
      }

      if (!configuredBase) {
        return new Response(JSON.stringify({
          message: 'Backend não configurado nesta publicação. Defina API_BASE_URL para apontar ao servidor Node.js. Use window.setApiBaseUrl("https://seu-backend") no console.'
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
