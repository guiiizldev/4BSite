import './styles.css';
import './portal.css';

const root = document.querySelector('#portal');
const logo = '<span class="official-logo official-logo--portal"><img src="/assets/logo.png" alt="4Byts" /></span>';

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a solicitação.');
  return data;
}

const spinner = () => `<div class="portal-loading"><i></i><span>Carregando seu portal...</span></div>`;

function showMessage(element, message, type = 'error') {
  element.textContent = message;
  element.className = `portal-message ${type}`;
  element.hidden = false;
}

function authScreen(mode = 'login') {
  root.innerHTML = `
    <main class="auth-layout">
      <section class="auth-brand-panel">
        <a href="/" class="portal-brand">${logo}</a>
        <div class="auth-brand-copy">
          <span class="portal-kicker">PORTAL 4BYTS</span>
          <h1>Controle suas licenças.<br><em>Simples assim.</em></h1>
          <p>Acesse produtos, dispositivos, vencimentos e suporte em um só lugar.</p>
        </div>
        <div class="auth-security"><span>✓</span><div><b>Ambiente protegido</b><small>Sessão criptografada e dados isolados</small></div></div>
      </section>
      <section class="auth-form-panel">
        <a href="/" class="back-link">← Voltar ao site</a>
        <div class="auth-box">
          <span class="mobile-auth-logo">${logo}</span>
          <div class="auth-tabs" role="tablist">
            <button class="${mode === 'login' ? 'active' : ''}" data-auth-tab="login">Entrar</button>
            <button class="${mode === 'register' ? 'active' : ''}" data-auth-tab="register">Criar conta</button>
          </div>
          <div id="authContent"></div>
        </div>
      </section>
    </main>`;

  const renderForm = selectedMode => {
    const content = document.querySelector('#authContent');
    document.querySelectorAll('[data-auth-tab]').forEach(button => button.classList.toggle('active', button.dataset.authTab === selectedMode));
    content.innerHTML = selectedMode === 'login' ? `
      <div class="auth-heading"><h2>Bem-vindo de volta</h2><p>Entre para acessar seus produtos 4Byts.</p></div>
      <form id="authForm" class="portal-form">
        <label><span>E-mail</span><input type="email" name="email" autocomplete="email" placeholder="voce@empresa.com" required /></label>
        <label><span>Senha</span><input type="password" name="password" autocomplete="current-password" placeholder="Sua senha" required /></label>
        <div id="authMessage" class="portal-message" hidden></div>
        <button class="portal-primary" type="submit">Entrar na plataforma <span>→</span></button>
      </form>` : `
      <div class="auth-heading"><h2>Crie sua conta</h2><p>Comece a gerenciar suas licenças agora.</p></div>
      <form id="authForm" class="portal-form">
        <div class="portal-form-row"><label><span>Seu nome</span><input name="name" autocomplete="name" placeholder="Nome completo" required minlength="2" /></label><label><span>Empresa</span><input name="company" autocomplete="organization" placeholder="Opcional" /></label></div>
        <label><span>E-mail</span><input type="email" name="email" autocomplete="email" placeholder="voce@empresa.com" required /></label>
        <label><span>Senha</span><input type="password" name="password" autocomplete="new-password" placeholder="Mínimo de 8 caracteres" minlength="8" required /></label>
        <div id="authMessage" class="portal-message" hidden></div>
        <button class="portal-primary" type="submit">Criar minha conta <span>→</span></button>
      </form>`;

    document.querySelector('#authForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const message = form.querySelector('#authMessage');
      const values = Object.fromEntries(new FormData(form));
      button.disabled = true;
      button.firstChild.textContent = selectedMode === 'login' ? 'Entrando... ' : 'Criando conta... ';
      try {
        await api(`/api/auth/${selectedMode}`, { method: 'POST', body: JSON.stringify(values) });
        await dashboard();
      } catch (error) {
        showMessage(message, error.message);
        button.disabled = false;
        button.firstChild.textContent = selectedMode === 'login' ? 'Entrar na plataforma ' : 'Criar minha conta ';
      }
    });
  };

  document.querySelectorAll('[data-auth-tab]').forEach(button => button.addEventListener('click', () => renderForm(button.dataset.authTab)));
  renderForm(mode);
}

const statusLabel = status => ({ active: 'Ativa', suspended: 'Suspensa', expired: 'Expirada', revoked: 'Revogada' }[status] || status);
const formatDate = value => value ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Sem vencimento';

function licenseCard(license) {
  return `
    <article class="customer-license-card">
      <div class="license-card-head">
        <span class="license-product-icon">4B</span>
        <span class="license-status ${escapeHtml(license.status)}">● ${escapeHtml(statusLabel(license.status))}</span>
      </div>
      <span class="license-product-name">${escapeHtml(license.product)}</span>
      <h3>${escapeHtml(license.key)}</h3>
      <div class="license-meta">
        <div><small>Plano</small><b>${escapeHtml(license.plan)}</b></div>
        <div><small>Dispositivos</small><b>${license.deviceCount} de ${license.maxDevices}</b></div>
        <div><small>Vencimento</small><b>${escapeHtml(formatDate(license.expiresAt))}</b></div>
      </div>
      <button class="copy-license" data-copy="${escapeHtml(license.key)}">Copiar chave</button>
    </article>`;
}

async function dashboard() {
  root.innerHTML = spinner();
  try {
    const [{ user }, { licenses }] = await Promise.all([api('/api/auth/me'), api('/api/licenses')]);
    const activeLicenses = licenses.filter(license => license.status === 'active').length;
    const deviceCount = licenses.reduce((total, license) => total + license.deviceCount, 0);
    root.innerHTML = `
      <div class="customer-shell">
        <aside class="customer-sidebar">
          <a href="/" class="portal-brand">${logo}</a>
          <nav><button class="active"><span>⌂</span> Visão geral</button><button><span>◇</span> Minhas licenças</button><a href="mailto:contato@4byts.com"><span>?</span> Suporte</a></nav>
          <div class="sidebar-user"><span>${escapeHtml(user.name.slice(0, 2).toUpperCase())}</span><div><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.email)}</small></div></div>
        </aside>
        <main class="customer-main">
          <header class="customer-header"><button class="customer-menu" aria-label="Abrir menu">☰</button><div></div><button id="logoutButton" class="logout-button">Sair</button></header>
          <div class="customer-content">
            <div class="customer-welcome"><div><span class="portal-kicker">ÁREA DO CLIENTE</span><h1>Olá, ${escapeHtml(user.name.split(' ')[0])} 👋</h1><p>Acompanhe seus produtos e licenças 4Byts.</p></div><button id="claimToggle" class="portal-primary compact">+ Vincular licença</button></div>
            <section id="claimPanel" class="claim-panel" hidden>
              <div><h2>Vincular uma licença</h2><p>Digite a chave recebida na compra do produto.</p></div>
              <form id="claimForm"><input name="key" placeholder="4B-PDV-XXXXXX-XXXXXX" required /><button type="submit">Vincular</button></form>
              <div id="claimMessage" class="portal-message" hidden></div>
            </section>
            <div class="customer-metrics"><article><span>Licenças ativas</span><strong>${activeLicenses}</strong><small>de ${licenses.length} licenças</small></article><article><span>Dispositivos</span><strong>${deviceCount}</strong><small>conectados aos produtos</small></article><article><span>Status da conta</span><strong class="account-ok">Tudo certo</strong><small>nenhuma pendência</small></article></div>
            <section class="licenses-section"><div class="licenses-heading"><div><h2>Minhas licenças</h2><p>Produtos vinculados à sua conta.</p></div></div><div class="customer-license-grid">${licenses.length ? licenses.map(licenseCard).join('') : `<div class="empty-licenses"><span>◇</span><h3>Nenhuma licença vinculada</h3><p>Use a chave recebida na compra para adicionar seu primeiro produto.</p><button id="emptyClaim" class="portal-secondary">Vincular licença</button></div>`}</div></section>
          </div>
        </main>
      </div>`;

    const sidebar = document.querySelector('.customer-sidebar');
    document.querySelector('.customer-menu').addEventListener('click', () => sidebar.classList.toggle('open'));
    document.querySelector('#logoutButton').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); authScreen(); });
    const claimPanel = document.querySelector('#claimPanel');
    const openClaim = () => { claimPanel.hidden = false; claimPanel.querySelector('input').focus(); };
    document.querySelector('#claimToggle').addEventListener('click', () => claimPanel.hidden ? openClaim() : claimPanel.hidden = true);
    document.querySelector('#emptyClaim')?.addEventListener('click', openClaim);
    document.querySelector('#claimForm').addEventListener('submit', async event => {
      event.preventDefault();
      const message = document.querySelector('#claimMessage');
      const key = new FormData(event.currentTarget).get('key');
      try {
        const result = await api('/api/licenses/claim', { method: 'POST', body: JSON.stringify({ key }) });
        showMessage(message, result.message, 'success');
        setTimeout(dashboard, 700);
      } catch (error) { showMessage(message, error.message); }
    });
    document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      button.textContent = 'Chave copiada ✓';
      setTimeout(() => button.textContent = 'Copiar chave', 1800);
    }));
  } catch (error) {
    if (error.message.includes('login')) return authScreen();
    root.innerHTML = `<div class="portal-fatal"><h1>Não foi possível abrir o portal</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">Tentar novamente</button></div>`;
  }
}

root.innerHTML = spinner();
api('/api/auth/me').then(dashboard).catch(() => authScreen());
