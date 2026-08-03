(function () {
  const storedBase = localStorage.getItem('API_BASE_URL') || '';
  let configuredBase = '';
  let runtimeConfig = null;
  let configLoaded = false;
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

  function defaultConfig() {
    return {
      localApiBase: 'http://localhost:3000',
      productionApiBase: '',
      githubPagesHosts: ['2001diegodeoliveira-svg.github.io'],
    };
  }

  async function loadRuntimeConfig() {
    if (configLoaded) return runtimeConfig || defaultConfig();
    configLoaded = true;

    const fallback = defaultConfig();

    try {
      const response = await originalFetch('app-config.json', { cache: 'no-store' });
      if (!response.ok) {
        runtimeConfig = fallback;
        return runtimeConfig;
      }

      const parsed = await response.json();
      runtimeConfig = {
        ...fallback,
        ...parsed,
        githubPagesHosts: Array.isArray(parsed.githubPagesHosts) && parsed.githubPagesHosts.length
          ? parsed.githubPagesHosts
          : fallback.githubPagesHosts,
      };
      return runtimeConfig;
    } catch (error) {
      runtimeConfig = fallback;
      return runtimeConfig;
    }
  }

  function isLocalHost(host) {
    const normalized = String(host || '').toLowerCase();
    return normalized === 'localhost' || normalized === '127.0.0.1';
  }

  function isConfiguredGithubPagesHost(host, config) {
    const normalizedHost = String(host || '').toLowerCase();
    return (config.githubPagesHosts || []).some((entry) => String(entry || '').toLowerCase() === normalizedHost);
  }

  function inferDefaultBase(config) {
    const host = window.location.hostname || '';

    if (isLocalHost(host)) {
      return normalizeBase(config.localApiBase || `${window.location.protocol}//${window.location.host}`);
    }

    if (isConfiguredGithubPagesHost(host, config)) {
      return normalizeBase(config.productionApiBase || '');
    }

    return '';
  }

  setBaseUrl(window.API_BASE_URL || storedBase || '', false);

  window.setApiBaseUrl = function setApiBaseUrl(url) {
    setBaseUrl(url, true);
    return configuredBase;
  };

  window.clearApiBaseUrl = function clearApiBaseUrl() {
    setBaseUrl('', true);
  };

  function isGithubPages() {
    const host = window.location.hostname || '';
    if (!runtimeConfig) return /github\.io$/i.test(host);
    return isConfiguredGithubPagesHost(host, runtimeConfig) || /github\.io$/i.test(host);
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
    runtimeConfig = await loadRuntimeConfig();

    const localFallbackBase = normalizeBase(runtimeConfig.localApiBase || 'http://localhost:3000');
    const defaultBase = inferDefaultBase(runtimeConfig);
    const currentBase = normalizeBase(configuredBase);
    const localIsUp = await canReachBase(localFallbackBase);

    if (!currentBase && defaultBase) {
      setBaseUrl(defaultBase, false);
    }

    const effectiveBase = normalizeBase(configuredBase);

    if (!effectiveBase) {
      if (localIsUp) {
        setBaseUrl(localFallbackBase, true);
      }
      return;
    }

    const currentIsUp = await canReachBase(effectiveBase);
    if (!currentIsUp && localIsUp) {
      setBaseUrl(localFallbackBase, true);
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
      if (!runtimeConfig) {
        runtimeConfig = await loadRuntimeConfig();
      }

      if (!configuredBase) {
        const inferred = inferDefaultBase(runtimeConfig || defaultConfig());
        if (inferred) {
          setBaseUrl(inferred, true);
        }
      }

      if (!configuredBase) {
        const localFallback = normalizeBase((runtimeConfig && runtimeConfig.localApiBase) || 'http://localhost:3000');
        if (await canReachBase(localFallback)) {
          setBaseUrl(localFallback, true);
        }
      }

      if (!configuredBase) {
        return new Response(JSON.stringify({
          message: 'Backend não configurado nesta publicação. Defina a URL da API em frontend/app-config.json (productionApiBase) ou use window.setApiBaseUrl("https://seu-backend").'
        }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const localFallbackBase = normalizeBase((runtimeConfig && runtimeConfig.localApiBase) || 'http://localhost:3000');
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
