(function () {
  const storedBase = localStorage.getItem('API_BASE_URL') || '';
  let configuredBase = '';
  let promptedForBaseInThisSession = false;
  const originalFetch = window.fetch.bind(window);

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

    if (isGithubPages()) {
      // Em GitHub Pages, evita travar no localhost em produção.
      return '';
    }

    if (host === 'localhost' || host === '127.0.0.1') {
      return `${window.location.protocol}//${window.location.host}`;
    }

    return '';
  }

  const initialBase = window.API_BASE_URL || storedBase || inferDefaultBase() || '';

  setBaseUrl(initialBase, false);

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

  async function canReachBase(baseUrl) {
    const normalized = normalizeBase(baseUrl);
    if (!normalized) return false;

    try {
      const response = await originalFetch(`${normalized}/api/health`, { method: 'GET' });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async function bootstrapApiBase() {
    if (!isGithubPages()) return;

    const localFallbackBase = 'http://localhost:3000';
    const currentBase = normalizeBase(configuredBase);
    const localIsUp = await canReachBase(localFallbackBase);

    if (!currentBase) {
      if (localIsUp) {
        setBaseUrl(localFallbackBase, true);
      }
      return;
    }

    const currentIsUp = await canReachBase(currentBase);
    if (!currentIsUp && localIsUp) {
      setBaseUrl(localFallbackBase, true);
      return;
    }

    if (!currentIsUp && currentBase === localFallbackBase) {
      // Limpa base inválida para permitir prompt de backend público no primeiro login.
      setBaseUrl('', true);
    }
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
        const inferred = inferDefaultBase();
        if (inferred) {
          setBaseUrl(inferred, false);
        }

        if (!configuredBase && isGithubPages()) {
          await promptBackendBaseUrl();
        }
      }

      if (!configuredBase) {
        return new Response(JSON.stringify({
          message: 'Backend não configurado nesta publicação. Inicie o Node local em http://localhost:3000 ou defina a URL pública com window.setApiBaseUrl("https://seu-backend").'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const localFallbackBase = 'http://localhost:3000';
      const canTryLocalFallback = isGithubPages() && configuredBase !== localFallbackBase;

      async function doFetch(baseUrl) {
        const targetUrl = `${baseUrl}${rawUrl}`;
        if (typeof input === 'string') {
          return originalFetch(targetUrl, init);
        }

        const clonedRequest = new Request(targetUrl, input);
        return originalFetch(clonedRequest, init);
      }

      try {
        const response = await doFetch(configuredBase);

        // Se o backend público estiver fora do ar, tenta automaticamente o Node local.
        if (canTryLocalFallback && [502, 503, 504].includes(response.status)) {
          try {
            const localResponse = await doFetch(localFallbackBase);
            setBaseUrl(localFallbackBase, true);
            return localResponse;
          } catch (fallbackError) {
            return response;
          }
        }

        // Se estiver no GitHub Pages com localhost e houver erro de gateway, pede backend público.
        if (isGithubPages() && configuredBase === localFallbackBase && [502, 503, 504].includes(response.status)) {
          const promptedBase = await promptBackendBaseUrl();
          if (promptedBase) {
            return doFetch(promptedBase);
          }
        }

        return response;
      } catch (error) {
        if (canTryLocalFallback) {
          try {
            const localResponse = await doFetch(localFallbackBase);
            setBaseUrl(localFallbackBase, true);
            return localResponse;
          } catch (fallbackError) {
            // Se também não houver backend local, mantém mensagem padrão abaixo.
          }
        }

        if (isGithubPages() && configuredBase === localFallbackBase) {
          const promptedBase = await promptBackendBaseUrl();
          if (promptedBase) {
            try {
              return await doFetch(promptedBase);
            } catch (retryError) {
              // Mantém resposta padronizada abaixo caso nova URL também falhe.
            }
          }
        }

        return new Response(JSON.stringify({
          message: `Não foi possível conectar ao backend em ${configuredBase}. Verifique se a API está no ar.`
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
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

  bootstrapApiBase();
})();
