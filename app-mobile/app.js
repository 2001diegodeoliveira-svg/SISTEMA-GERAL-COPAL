const App = (() => {
  let API_BASE = '';
  let token = localStorage.getItem('copal_token') || null;
  let currentUser = null;
  let allContratos = [];
  let allUnidades = [];
  let allContatos = [];
  let allPatrimonio = [];
  let allRequisicoes = [];
  let contratoFilter = 'todos';
  let deferredPrompt = null;

  const SVG = {
    contract: '<i data-lucide="file-text"></i>',
    unit: '<i data-lucide="building-2"></i>',
    contact: '<i data-lucide="users-round"></i>',
    asset: '<i data-lucide="package"></i>',
    requisition: '<i data-lucide="clipboard-list"></i>',
    chevron: '<i data-lucide="chevron-right" class="chevron"></i>',
    empty: '<i data-lucide="inbox"></i>'
  };

  const ICON_COLORS = ['#16294f', '#374151', '#0e7490', '#b45309', '#4338ca', '#f2711c', '#16a34a', '#dc2626'];

  function init() {
    detectApiBase();
    setupLoginForm();
    setupPWA();
    applyIcons();
    if (token) {
      checkAuth();
    } else {
      showLogin();
    }
  }

  function detectApiBase() {
    const host = window.location.hostname;
    const port = window.location.port;
    if (host === 'localhost' || host === '127.0.0.1') {
      API_BASE = `http://localhost:3000`;
    } else if (host.includes('github.io')) {
      API_BASE = 'https://sistema-geral-copal-4.onrender.com';
    } else {
      API_BASE = window.location.origin;
    }
  }

  async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (res.status === 401) { logout(); throw new Error('Sessão expirada'); }
      return res;
    } catch (err) {
      if (err.message === 'Sessão expirada') throw err;
      throw new Error('Erro de conexão com o servidor');
    }
  }

  async function apiJson(path, options = {}) {
    const res = await apiFetch(path, options);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(err.error || `Erro ${res.status}`);
    }
    return res.json();
  }

  function setupLoginForm() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const matricula = document.getElementById('login-matricula').value.trim();
      const senha = document.getElementById('login-senha').value;
      const btn = document.getElementById('login-btn');
      const errEl = document.getElementById('login-error');

      btn.disabled = true;
      btn.textContent = 'Entrando...';
      errEl.classList.remove('visible');

      try {
        const data = await apiJson('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ matricula, password: senha })
        });
        token = data.accessToken;
        localStorage.setItem('copal_token', token);
        currentUser = data.user;
        showMainApp();
      } catch (err) {
        errEl.textContent = err.message || 'Erro ao fazer login';
        errEl.classList.add('visible');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Entrar';
      }
    });
  }

  async function checkAuth() {
    try {
      const data = await apiJson('/auth/me');
      currentUser = data.user || data;
      showMainApp();
    } catch {
      logout();
    }
  }

  function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
  }

  function showMainApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    updateProfile();
    loadDashboard();
  }

  function updateProfile() {
    if (!currentUser) return;
    const name = currentUser.name || currentUser.email || '--';
    const initials = name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('profile-avatar').textContent = initials;
    document.getElementById('profile-name').textContent = name;
    document.getElementById('profile-role').textContent = currentUser.perfil || currentUser.role || 'Usuário';
    document.getElementById('profile-email').textContent = currentUser.email || '--';
    document.getElementById('profile-matricula').textContent = currentUser.matricula || '--';
    document.getElementById('profile-unidade').textContent = currentUser.unidade || '--';
    document.getElementById('profile-perfil').textContent = currentUser.perfil || currentUser.role || '--';
    document.getElementById('profile-cpf').textContent = currentUser.cpf || '--';
    document.getElementById('profile-phone').textContent = currentUser.phone || '--';
    document.getElementById('profile-cargo').textContent = currentUser.cargo || '--';
    document.getElementById('user-badge').textContent = initials;
  }

  function logout() {
    token = null;
    currentUser = null;
    localStorage.removeItem('copal_token');
    showLogin();
  }

  function showLoading(msg) {
    const el = document.getElementById('loading');
    el.querySelector('.loading-text').textContent = msg || 'Carregando...';
    el.style.display = 'flex';
  }

  function hideLoading() {
    document.getElementById('loading').style.display = 'none';
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 3000);
  }

  function formatCurrency(val) {
    if (!val && val !== 0) return '--';
    const str = String(val).trim();
    if (str.startsWith('R$')) return str;
    const num = parseFloat(val);
    if (isNaN(num)) return '--';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function formatDate(d) {
    if (!d) return '--';
    try {
      const date = new Date(d);
      return date.toLocaleDateString('pt-BR');
    } catch { return d; }
  }

  // ========== ÍCONES LUCIDE + ANIMAÇÃO ==========
  function applyIcons() {
    if (window.lucide) lucide.createIcons();
  }

  function animDelay(i) {
    return `style="animation-delay:${(i % 10) * 0.07}s"`;
  }

  // ========== NORMALIZAÇÃO ==========
  function normalizeContrato(c) {
    if (!c || typeof c !== 'object') return c;
    return {
      ...c,
      numContrato: c.numcontrato || c.numContrato,
      numProcesso: c.numprocesso || c.numProcesso,
      razaoSocial: c.razaosocial || c.razaoSocial,
      valorGlobal: c.valorglobal || c.valorGlobal,
      objeto: c.objeto,
      dtInicial: c.dtinicial || c.dtInicial,
      dtFinal: c.dtfinal || c.dtFinal,
      prazoEntrega: c.prazoentrega || c.prazoEntrega,
      telefoneFixo: c.telefonefixo || c.telefoneFixo,
      telefoneWhatsapp: c.telefonewhatsapp || c.telefoneWhatsapp,
      emailEmpresa: c.emailempresa || c.emailEmpresa,
      numEndereco: c.numendereco || c.numEndereco,
      status: c.status
    };
  }

  // ========== DASHBOARD ==========
  async function loadDashboard() {
    showLoading('Carregando painel...');
    try {
      const [kpis, contracts] = await Promise.all([
        apiJson('/api/kpis').catch(() => null),
        apiJson('/api/contracts').catch(() => ({}))
      ]);

      if (kpis) {
        const kArr = Array.isArray(kpis) ? kpis : [];
        const getKpi = (t) => {
          const f = kArr.find(k => (k.title || '').toLowerCase().includes(t));
          return f ? f.value : null;
        };
        const ativos = getKpi('contratos ativos');
        document.getElementById('kpi-contratos').textContent = ativos || '--';
        document.getElementById('kpi-ativos').textContent = ativos || '--';
        document.getElementById('kpi-aditivos').textContent = getKpi('aditivos') || '--';
        document.getElementById('kpi-valor').textContent = getKpi('valor total') || '--';
      }

      const cObj = contracts && !Array.isArray(contracts) ? contracts : {};
      allContratos = (Array.isArray(cObj.contracts) ? cObj.contracts : []).map(normalizeContrato);
      document.getElementById('contratos-count').textContent = allContratos.length;

      renderContratosDash();
      renderContratosList();
      renderChartUnidades();
      loadUnidades();
      loadContatos();
      loadPatrimonio();
      loadRequisicoes();
    } catch (err) {
      showToast('Erro ao carregar dados: ' + err.message);
    } finally {
      hideLoading();
    }
  }

  function renderContratosDash() {
    const recent = allContratos.slice(0, 3);
    const el = document.getElementById('dash-recent');
    if (recent.length === 0) {
      el.innerHTML = `<div class="empty-state">${SVG.empty}<div class="empty-title">Nenhum contrato encontrado</div></div>`;
      return;
    }
    el.innerHTML = recent.map((c, i) => contratoCard(c, i, true)).join('');
    applyIcons();
  }

  function renderChartUnidades() {
    const counts = {};
    allContratos.forEach(c => {
      const units = c.unidades;
      if (Array.isArray(units)) {
        units.forEach(u => {
          const code = typeof u === 'string' ? u : (u.code || u.nome || u.unidade || 'Outro');
          counts[code] = (counts[code] || 0) + 1;
        });
      }
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const max = sorted.length > 0 ? sorted[0][1] : 1;
    const el = document.getElementById('chart-unidades');

    if (sorted.length === 0) {
      el.innerHTML = '<div style="text-align:center;color:var(--text-2);font-size:12px;padding:12px;">Sem dados de unidades</div>';
      return;
    }

    el.innerHTML = sorted.map(([name, count]) => {
      const pct = Math.round((count / max) * 100);
      return `<div class="bar-row anim-in" ${animDelay(0)}><div class="b-label">${name}</div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><div class="b-val">${count}</div></div>`;
    }).join('');
    applyIcons();
  }

  // ========== CONTRATOS ==========
  function contratoCard(c, idx, compact) {
    const status = (c.status || 'ativo').toLowerCase();
    let statusClass = 'status-ativo';
    let statusLabel = 'Ativo';
    if (status === 'encerrado' || status === 'inativo') { statusClass = 'status-encerrado'; statusLabel = 'Encerrado'; }
    else if (status.includes('andamento') || status.includes('analis')) { statusClass = 'status-pendente'; statusLabel = 'Em análise'; }

    const num = c.numContrato || c.numero || '--';
    const credor = c.credor || c.razaoSocial || '--';
    const units = Array.isArray(c.unidades) ? c.unidades.map(u => typeof u === 'string' ? u : (u.code || u.nome || u.unidade)).join(', ') : '';

    return `
    <div class="list-card anim-in" ${animDelay(idx)} onclick="App.openContrato(${idx})">
      <div class="list-icon" style="background:${ICON_COLORS[idx % ICON_COLORS.length]};">${SVG.contract}</div>
      <div class="list-body">
        <div class="list-title">${num}</div>
        <div class="list-sub">${units || 'N/A'} · ${credor}</div>
        <div class="list-meta">
          <span class="value-tag">${formatCurrency(c.valorGlobal)}</span>
          <span class="status-pill ${statusClass}">${statusLabel}</span>
        </div>
      </div>
      ${SVG.chevron}
    </div>`;
  }

  function renderContratosList() {
    let filtered = [...allContratos];
    const search = (document.getElementById('contratos-search')?.value || '').toLowerCase();

    if (contratoFilter !== 'todos') {
      filtered = filtered.filter(c => {
        const s = (c.status || '').toLowerCase();
        if (contratoFilter === 'ativo') return s === 'ativo' || s === 'em_vigor';
        if (contratoFilter === 'em_andamento') return s.includes('andamento') || s.includes('analis');
        if (contratoFilter === 'encerrado') return s === 'encerrado' || s === 'inativo';
        return true;
      });
    }

    if (search) {
      filtered = filtered.filter(c => {
        const text = `${c.numContrato || ''} ${c.credor || ''} ${c.razaoSocial || ''} ${c.objeto || ''}`.toLowerCase();
        return text.includes(search);
      });
    }

    document.getElementById('contratos-count').textContent = filtered.length;
    const el = document.getElementById('contratos-list');

    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-state">${SVG.empty}<div class="empty-title">Nenhum contrato encontrado</div><div class="empty-text">Tente outros filtros ou termos de busca.</div></div>`;
      applyIcons();
      return;
    }

    el.innerHTML = filtered.map((c, i) => {
      const realIdx = allContratos.indexOf(c);
      return contratoCard(c, realIdx);
    }).join('');
    applyIcons();
  }

  function setContratoFilter(filter) {
    contratoFilter = filter;
    document.querySelectorAll('#contratos-filters .filter-chip').forEach(el => {
      el.classList.toggle('active', el.dataset.filter === filter);
    });
    renderContratosList();
  }

  function filterContratos() { renderContratosList(); }

  function openContrato(idx) {
    const c = allContratos[idx];
    if (!c) return;

    document.getElementById('det-numero').textContent = c.numContrato || '--';
    document.getElementById('det-num').textContent = c.numContrato || '--';
    document.getElementById('det-processo').textContent = c.numProcesso || '--';
    document.getElementById('det-objeto').textContent = c.objeto || '--';
    document.getElementById('det-status').textContent = c.status || '--';
    document.getElementById('det-credor').textContent = c.credor || '--';
    document.getElementById('det-razao').textContent = c.razaoSocial || '--';
    document.getElementById('det-cnpj').textContent = c.cnpj || '--';
    document.getElementById('det-telefone').textContent = c.telefoneFixo || '--';
    document.getElementById('det-whatsapp').textContent = c.telefoneWhatsapp || '--';
    document.getElementById('det-email-empresa').textContent = c.emailEmpresa || '--';
    document.getElementById('det-cep').textContent = c.cep || '--';
    document.getElementById('det-logradouro').textContent = c.logradouro ? `${c.logradouro || ''} ${c.numEndereco || ''}`.trim() : '--';
    document.getElementById('det-bairro').textContent = c.bairro || '--';
    document.getElementById('det-cidade').textContent = c.cidade && c.uf ? `${c.cidade}/${c.uf}` : (c.cidade || c.uf || '--');
    document.getElementById('det-valor').textContent = formatCurrency(c.valorGlobal);
    document.getElementById('det-dt-inicial').textContent = formatDate(c.dtInicial);
    document.getElementById('det-dt-final').textContent = formatDate(c.dtFinal);
    document.getElementById('det-prazo').textContent = c.prazoEntrega || '--';

    const lotesBlock = document.getElementById('det-lotes-block');
    const lotesEl = document.getElementById('det-lotes');
    if (Array.isArray(c.lotes) && c.lotes.length > 0) {
      lotesBlock.style.display = 'block';
      lotesEl.innerHTML = c.lotes.map(l => `
        <div class="field-row"><span class="f-label">${l.numero || l.nome || l.lote || l.item || 'Lote'}</span><span class="f-val">${l.descricao || (l.valor ? formatCurrency(l.valor) : '--')}</span></div>
      `).join('');
    } else { lotesBlock.style.display = 'none'; }

    const aditivosBlock = document.getElementById('det-aditivos-block');
    const aditivosEl = document.getElementById('det-aditivos');
    if (Array.isArray(c.aditivos) && c.aditivos.length > 0) {
      aditivosBlock.style.display = 'block';
      aditivosEl.innerHTML = c.aditivos.map(a => `
        <div class="field-row"><span class="f-label">${a.tipo || a.numero || 'Aditivo'}</span><span class="f-val">${a.valor ? formatCurrency(a.valor) : (a.obs || '--')}</span></div>
      `).join('');
    } else { aditivosBlock.style.display = 'none'; }

    const empenhosBlock = document.getElementById('det-empenhos-block');
    const empenhosEl = document.getElementById('det-empenhos');
    if (Array.isArray(c.empenhos) && c.empenhos.length > 0) {
      empenhosBlock.style.display = 'block';
      empenhosEl.innerHTML = c.empenhos.map(e => `
        <div class="field-row"><span class="f-label">${e.numEmpenho || e.num_empenho || e.numero || 'Empenho'}</span><span class="f-val">${e.valorEmpenho || e.valor_empenho ? formatCurrency(e.valorEmpenho || e.valor_empenho) : '--'}</span></div>
      `).join('');
    } else { empenhosBlock.style.display = 'none'; }

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-detalhe').classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'none';
  }

  function closeDetail() {
    document.getElementById('view-detalhe').classList.remove('active');
    const currentView = document.querySelector('.view.active') || document.getElementById('view-dashboard');
    currentView.classList.add('active');
    document.querySelector('.bottom-nav').style.display = 'flex';
  }

  // ========== UNIDADES ==========
  async function loadUnidades() {
    try {
      const data = await apiJson('/api/units');
      allUnidades = Array.isArray(data) ? data : (data.units || []);
      document.getElementById('unidades-count').textContent = allUnidades.length;
      renderUnidades();
    } catch { renderUnidades(); }
  }

  function renderUnidades() {
    const el = document.getElementById('unidades-list');
    if (allUnidades.length === 0) {
      el.innerHTML = `<div class="empty-state">${SVG.empty}<div class="empty-title">Nenhuma unidade encontrada</div></div>`;
      applyIcons();
      return;
    }
    el.innerHTML = allUnidades.map((u, i) => `
      <div class="list-card readonly anim-in" ${animDelay(i)}>
        <div class="list-icon" style="background:${ICON_COLORS[i % ICON_COLORS.length]};">${SVG.unit}</div>
        <div class="list-body">
          <div class="list-title">${u.code || '--'}</div>
          <div class="list-sub">${u.name || '--'}</div>
          <div class="list-sub" style="margin-top:3px;">${u.location || ''} ${u.responsible ? '· Resp: ' + u.responsible : ''}</div>
          <div class="list-meta">
            <span class="status-pill ${u.status === 'ativo' ? 'status-ativo' : 'status-inativo'}">${u.status || 'ativo'}</span>
          </div>
        </div>
      </div>
    `).join('');
    applyIcons();
  }

  // ========== CONTATOS ==========
  async function loadContatos() {
    try {
      const data = await apiJson('/api/contacts');
      allContatos = Array.isArray(data) ? data : (data.contacts || []);
      document.getElementById('contatos-count').textContent = allContatos.length;
      renderContatos();
    } catch { renderContatos(); }
  }

  function renderContatos() {
    let filtered = [...allContatos];
    const search = (document.getElementById('contatos-search')?.value || '').toLowerCase();
    if (search) {
      filtered = filtered.filter(c => {
        const text = `${c.unidade || ''} ${c.setor || ''} ${c.telefone || ''} ${c.ramal || ''}`.toLowerCase();
        return text.includes(search);
      });
    }

    const el = document.getElementById('contatos-list');
    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-state">${SVG.empty}<div class="empty-title">Nenhum contato encontrado</div></div>`;
      applyIcons();
      return;
    }

    el.innerHTML = filtered.map((c, i) => `
      <div class="list-card readonly anim-in" ${animDelay(i)}>
        <div class="list-icon" style="background:${ICON_COLORS[i % ICON_COLORS.length]};">${SVG.contact}</div>
        <div class="list-body">
          <div class="list-title">${c.setor || '--'}</div>
          <div class="list-sub">${c.unidade || '--'}</div>
          <div class="list-meta">
            <span class="value-tag">${c.telefone || '--'}</span>
            ${c.ramal ? `<span class="status-pill status-pendente">Ramal ${c.ramal}</span>` : ''}
          </div>
        </div>
      </div>
    `).join('');
    applyIcons();
  }

  function filterContatos() { renderContatos(); }

  // ========== PATRIMÔNIO ==========
  async function loadPatrimonio() {
    try {
      const data = await apiJson('/api/patrimonio');
      allPatrimonio = Array.isArray(data) ? data : (data.items || []);
      document.getElementById('patrimonio-count').textContent = allPatrimonio.length;
      renderPatrimonio();
    } catch { renderPatrimonio(); }
  }

  function renderPatrimonio() {
    let filtered = [...allPatrimonio];
    const search = (document.getElementById('patrimonio-search')?.value || '').toLowerCase();
    if (search) {
      filtered = filtered.filter(p => {
        const text = `${p.rp || ''} ${p.descricao || ''}`.toLowerCase();
        return text.includes(search);
      });
    }

    const el = document.getElementById('patrimonio-list');
    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-state">${SVG.empty}<div class="empty-title">Nenhum item encontrado</div></div>`;
      applyIcons();
      return;
    }

    el.innerHTML = filtered.map((p, i) => {
      const estado = (p.estado || '').toLowerCase();
      let statusClass = 'status-ativo';
      let statusLabel = p.estado || 'Bom';
      if (estado.includes('ruim') || estado.includes('danificado') || estado.includes('péssimo')) { statusClass = 'status-inativo'; }
      else if (estado.includes('regular') || estado.includes('usado')) { statusClass = 'status-pendente'; }

      return `
      <div class="list-card readonly anim-in" ${animDelay(i)}>
        <div class="list-icon" style="background:${ICON_COLORS[i % ICON_COLORS.length]};">${SVG.asset}</div>
        <div class="list-body">
          <div class="list-title">RP ${p.rp || '--'}</div>
          <div class="list-sub">${p.descricao || '--'}</div>
          <div class="list-meta">
            <span class="value-tag">Qtd: ${p.quantidade || 1}</span>
            <span class="status-pill ${statusClass}">${statusLabel}</span>
          </div>
        </div>
      </div>`;
    }).join('');
    applyIcons();
  }

  function filterPatrimonio() { renderPatrimonio(); }

  // ========== REQUISIÇÕES ==========
  async function loadRequisicoes() {
    try {
      const data = await apiJson('/api/requisition-consumption');
      allRequisicoes = Array.isArray(data) ? data : (data.requisitions || []);
      document.getElementById('requisicoes-count').textContent = allRequisicoes.length;
      renderRequisicoes();
    } catch { renderRequisicoes(); }
  }

  function renderRequisicoes() {
    let filtered = [...allRequisicoes];
    const search = (document.getElementById('requisicoes-search')?.value || '').toLowerCase();
    if (search) {
      filtered = filtered.filter(r => {
        const text = `${r.contractNumber || r.contract_num || r.req_contract_num || ''} ${r.unitCode || r.unit || r.req_unit_demand || ''}`.toLowerCase();
        return text.includes(search);
      });
    }

    const el = document.getElementById('requisicoes-list');
    if (filtered.length === 0) {
      el.innerHTML = `<div class="empty-state">${SVG.empty}<div class="empty-title">Nenhuma requisição encontrada</div><div class="empty-text">As requisições realizadas aparecerão aqui.</div></div>`;
      applyIcons();
      return;
    }

    el.innerHTML = filtered.map((r, i) => `
      <div class="list-card readonly anim-in" ${animDelay(i)}>
        <div class="list-icon" style="background:${ICON_COLORS[i % ICON_COLORS.length]};">${SVG.requisition}</div>
        <div class="list-body">
          <div class="list-title">${r.contractNumber || r.contract_num || r.req_contract_num || '--'}</div>
          <div class="list-sub">${r.unitCode || r.unit || r.req_unit_demand || '--'}</div>
          <div class="list-meta">
            <span class="value-tag">${r.items_count || (Array.isArray(r.items) ? r.items.length : 0)} itens</span>
          </div>
        </div>
      </div>
    `).join('');
    applyIcons();
  }

  function filterRequisicoes() { renderRequisicoes(); }

  // ========== NAVIGATION ==========
  function navigate(viewName) {
    const bottomNav = document.querySelector('.bottom-nav');
    bottomNav.style.display = 'flex';

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === viewName);
    });
  }

  // ========== PWA ==========
  function setupPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      document.getElementById('install-banner').classList.add('visible');
    });

    document.getElementById('install-btn').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        document.getElementById('install-banner').classList.remove('visible');
        showToast('App instalado com sucesso!');
      }
      deferredPrompt = null;
    });
  }

  // ========== INIT ==========
  document.addEventListener('DOMContentLoaded', init);

  return {
    navigate,
    openContrato,
    closeDetail,
    setContratoFilter,
    filterContratos,
    filterContatos,
    filterPatrimonio,
    filterRequisicoes,
    logout
  };
})();
