import './styles.css';
import './portal.css';

const root = document.querySelector('#portal');
const lightLogo = '<span class="official-logo official-logo--portal"><img src="/assets/logo.png" alt="4Byts" /></span>';
const darkLogo = '<span class="official-logo official-logo--portal"><img src="/assets/logo-footer.png" alt="4Byts" /></span>';

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
        <a href="/" class="portal-brand">${darkLogo}</a>
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
          <span class="mobile-auth-logo">${lightLogo}</span>
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
const formatDateTime = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(`${value}${value.endsWith('Z') || value.includes('+') ? '' : 'Z'}`)) : '—';

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

const inputDateTime = value => value ? new Date(value).toISOString().slice(0, 16) : '';
const formatMoney = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents || 0) / 100);
const billingStatusLabel = status => ({ paid: 'Em dia', pending: 'Aguardando pagamento', overdue: 'Em atraso' }[status] || status || 'Não configurada');

function billingPlanForm() {
  return `<form id="billingPlanForm" class="admin-form">
    <div class="portal-form-row"><label><span>Código</span><input name="code" placeholder="pdv-mensal" pattern="[a-z0-9-]+" required></label><label><span>Nome</span><input name="name" placeholder="PDV Profissional" required></label></div>
    <label><span>Produto</span><input name="product" value="4Byts PDV" required></label>
    <div class="portal-form-row"><label><span>Valor mensal (R$)</span><input type="number" name="price" min="1" step="0.01" placeholder="99,90" required></label><label><span>Ciclo</span><select name="cycle"><option value="MONTHLY">Mensal</option><option value="QUARTERLY">Trimestral</option><option value="SEMIANNUALLY">Semestral</option><option value="YEARLY">Anual</option></select></label></div>
    <div id="adminFormMessage" class="portal-message" hidden></div><button class="portal-primary" type="submit">Criar plano <span>→</span></button>
  </form>`;
}

function subscriptionForm(licenses, plans) {
  const nextDueDate = new Date().toISOString().slice(0, 10);
  return `<form id="subscriptionForm" class="admin-form">
    <label><span>Licença</span><select name="licenseId" required>${licenses.map(license => `<option value="${license.id}">${escapeHtml(license.product)} · ${escapeHtml(license.key)}</option>`).join('')}</select></label>
    <label><span>Plano</span><select name="planId" required>${plans.map(plan => `<option value="${plan.id}">${escapeHtml(plan.name)} · ${formatMoney(plan.price_cents)}</option>`).join('')}</select></label>
    <div class="portal-form-row"><label><span>CPF ou CNPJ</span><input name="cpfCnpj" inputmode="numeric" required></label><label><span>Celular</span><input name="phone" inputmode="tel" required></label></div>
    <div class="portal-form-row"><label><span>Forma de pagamento</span><select name="billingType"><option value="PIX">Pix</option><option value="BOLETO">Boleto</option></select></label><label><span>Primeiro vencimento</span><input type="date" name="nextDueDate" min="${nextDueDate}" value="${nextDueDate}" required></label></div>
    <p class="billing-note">As próximas cobranças serão geradas automaticamente conforme o ciclo do plano.</p>
    <div id="subscriptionMessage" class="portal-message" hidden></div><button class="portal-primary" type="submit">Criar assinatura <span>→</span></button>
  </form>`;
}

function adminModal(title, content) {
  document.querySelector('#adminModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="adminModal" class="admin-modal">
      <button class="admin-modal-backdrop" aria-label="Fechar"></button>
      <section class="admin-modal-card">
        <button class="admin-modal-close" type="button" aria-label="Fechar">×</button>
        <h2>${escapeHtml(title)}</h2>${content}
      </section>
    </div>`);
  const modal = document.querySelector('#adminModal');
  const close = () => modal.remove();
  modal.querySelector('.admin-modal-backdrop').addEventListener('click', close);
  modal.querySelector('.admin-modal-close').addEventListener('click', close);
  return modal;
}

function userForm(user = {}) {
  return `<form id="adminUserForm" class="admin-form">
    <div class="portal-form-row"><label><span>Nome</span><input name="name" value="${escapeHtml(user.name || '')}" required minlength="2"></label><label><span>Empresa</span><input name="company" value="${escapeHtml(user.company || '')}"></label></div>
    <label><span>E-mail</span><input type="email" name="email" value="${escapeHtml(user.email || '')}" required></label>
    <div class="portal-form-row"><label><span>${user.id ? 'Nova senha (opcional)' : 'Senha inicial'}</span><input type="password" name="password" minlength="8" ${user.id ? '' : 'required'}></label><label><span>Permissão</span><select name="role"><option value="customer" ${user.role !== 'admin' ? 'selected' : ''}>Cliente</option><option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Administrador</option></select></label></div>
    <div id="adminFormMessage" class="portal-message" hidden></div><button class="portal-primary" type="submit">${user.id ? 'Salvar alterações' : 'Criar conta'} <span>→</span></button>
  </form>`;
}

function licenseForm(license = {}, users = []) {
  const customerEmail = license.customer_email || '';
  return `<form id="adminLicenseForm" class="admin-form">
    <label><span>Cliente (deixe vazio para gerar sem vínculo)</span><input type="email" name="email" list="customerEmails" value="${escapeHtml(customerEmail)}" placeholder="cliente@empresa.com"><datalist id="customerEmails">${users.filter(user => user.role === 'customer').map(user => `<option value="${escapeHtml(user.email)}">${escapeHtml(user.name)}</option>`).join('')}</datalist></label>
    <div class="portal-form-row"><label><span>Produto</span><input name="product" value="${escapeHtml(license.product || '4Byts PDV')}" required></label><label><span>Plano</span><input name="plan" value="${escapeHtml(license.plan || 'Profissional')}" required></label></div>
    <div class="portal-form-row"><label><span>Máximo de dispositivos</span><input type="number" name="maxDevices" min="1" max="100" value="${license.max_devices || 1}" required></label><label><span>Vencimento (opcional)</span><input type="datetime-local" name="expiresAt" value="${inputDateTime(license.expires_at)}"></label></div>
    ${license.id ? `<label><span>Status</span><select name="status"><option value="active" ${license.status === 'active' ? 'selected' : ''}>Ativa</option><option value="suspended" ${license.status === 'suspended' ? 'selected' : ''}>Suspensa</option><option value="expired" ${license.status === 'expired' ? 'selected' : ''}>Expirada</option><option value="revoked" ${license.status === 'revoked' ? 'selected' : ''}>Revogada</option></select></label>` : ''}
    <div id="adminFormMessage" class="portal-message" hidden></div><button class="portal-primary" type="submit">${license.id ? 'Salvar licença' : 'Gerar licença'} <span>→</span></button>
  </form>`;
}

function deviceListContent(license, devices) {
  return `<div class="device-modal-summary">
      <div><small>Licença</small><b>${escapeHtml(license.license_key)}</b></div>
      <div><small>Produto</small><b>${escapeHtml(license.product)}</b></div>
      <div><small>Limite</small><b>${license.max_devices} instalação(ões)</b></div>
    </div>
    <div id="deviceModalMessage" class="portal-message" hidden></div>
    <div class="device-list">
      ${devices.length ? devices.map(device => `
        <article class="device-item ${device.released_at ? 'released' : ''}">
          <div class="device-item-main">
            <div class="device-status-dot"></div>
            <div><b>${escapeHtml(device.device_name || 'Instalação sem nome')}</b><small>${escapeHtml(device.company_document || 'CNPJ não informado')} · ${escapeHtml(device.device_id)}</small></div>
          </div>
          <div class="device-details">
            <span><small>Último acesso</small><b>${escapeHtml(formatDateTime(device.last_seen_at))}</b></span>
            <span><small>IP mais recente</small><b>${escapeHtml(device.last_ip || '—')}</b></span>
          </div>
          ${!device.released_at && (device.approval_status !== 'approved' || device.requested_ip)
            ? `<div class="ip-approval"><div><small>${device.approval_status !== 'approved' ? 'Nova máquina aguardando aprovação' : 'Novo IP solicitado'}</small><b>${escapeHtml(device.requested_ip || device.last_ip || '—')}</b></div><button data-approve-ip="${device.id}" type="button">Aprovar máquina e IP</button></div>`
            : device.ip_enforced ? `<p class="allowed-ips">IPs autorizados: ${escapeHtml(device.allowed_ips || '—')}</p>` : '<p class="allowed-ips legacy">Instalação anterior à trava de IP</p>'}
          ${device.released_at
            ? `<p class="device-released">Liberada em ${escapeHtml(formatDateTime(device.released_at))}${device.released_by_name ? ` por ${escapeHtml(device.released_by_name)}` : ''}</p>`
            : `<button class="device-release" data-release-device="${device.id}" type="button">Liberar instalação</button>`}
        </article>`).join('')
        : '<div class="admin-empty">Nenhuma instalação registrada nesta licença.</div>'}
    </div>`;
}

async function adminDashboard(admin) {
  root.innerHTML = spinner();
  try {
    const [{ users }, { licenses }, billing] = await Promise.all([
      api('/api/admin/users'), api('/api/admin/licenses'), api('/api/admin/billing/plans')
    ]);
    const activeLicenses = licenses.filter(license => license.status === 'active').length;
    const customerCount = users.filter(user => user.role === 'customer').length;
    root.innerHTML = `
      <div class="customer-shell admin-shell">
        <aside class="customer-sidebar">
          <a href="/" class="portal-brand">${darkLogo}</a>
          <nav><button class="active"><span>⌂</span> Administração</button><a href="/"><span>↗</span> Ver site</a></nav>
          <div class="sidebar-user"><span>${escapeHtml(admin.name.slice(0, 2).toUpperCase())}</span><div><b>${escapeHtml(admin.name)}</b><small>Administrador geral</small></div></div>
        </aside>
        <main class="customer-main">
          <header class="customer-header"><button class="customer-menu" aria-label="Abrir menu">☰</button><span class="admin-header-label">PAINEL 4BYTS</span><button id="logoutButton" class="logout-button">Sair</button></header>
          <div class="customer-content admin-content">
            <div class="customer-welcome"><div><span class="portal-kicker">ADMINISTRAÇÃO</span><h1>Visão geral</h1><p>Gerencie clientes e licenças em um só lugar.</p></div><div class="admin-actions"><button id="newUser" class="portal-secondary">+ Criar cliente</button><button id="newLicense" class="portal-primary compact">+ Gerar licença</button></div></div>
            <div class="customer-metrics"><article><span>Clientes</span><strong>${customerCount}</strong><small>contas cadastradas</small></article><article><span>Licenças ativas</span><strong>${activeLicenses}</strong><small>de ${licenses.length} licenças</small></article><article><span>Administradores</span><strong>${users.length - customerCount}</strong><small>acesso geral</small></article></div>
            <section class="admin-section"><div class="licenses-heading"><div><h2>Clientes e contas</h2><p>Crie contas, altere dados, permissões e senhas.</p></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Cliente</th><th>Empresa</th><th>Permissão</th><th>Licenças</th><th></th></tr></thead><tbody>${users.map(user => `<tr><td><b>${escapeHtml(user.name)}</b><small>${escapeHtml(user.email)}</small></td><td>${escapeHtml(user.company || '—')}</td><td><span class="admin-role ${user.role}">${user.role === 'admin' ? 'Administrador' : 'Cliente'}</span></td><td>${user.license_count}</td><td><button class="admin-edit" data-edit-user="${user.id}">Editar</button></td></tr>`).join('')}</tbody></table></div></section>
            <section class="admin-section"><div class="licenses-heading"><div><h2>Licenças</h2><p>Emita, atribua, suspenda ou atualize licenças.</p></div></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Chave</th><th>Cliente</th><th>Produto / plano</th><th>Status</th><th></th></tr></thead><tbody>${licenses.length ? licenses.map(license => `<tr><td><b class="license-key-cell">${escapeHtml(license.license_key)}</b></td><td>${license.customer_name ? `<b>${escapeHtml(license.customer_name)}</b><small>${escapeHtml(license.customer_email)}</small>` : '<span class="unassigned">Sem vínculo</span>'}</td><td><b>${escapeHtml(license.product)}</b><small>${escapeHtml(license.plan)} · ${license.max_devices} dispositivo(s)</small></td><td><span class="license-status ${escapeHtml(license.status)}">● ${escapeHtml(statusLabel(license.status))}</span></td><td><div class="admin-row-actions"><button class="admin-edit" data-devices-license="${license.id}">Instalações (${license.device_count || 0})</button><button class="admin-edit" data-edit-license="${license.id}">Editar</button></div></td></tr>`).join('') : '<tr><td colspan="5" class="admin-empty">Nenhuma licença emitida.</td></tr>'}</tbody></table></div></section>
          </div>
        </main>
      </div>`;

    const sidebar = document.querySelector('.customer-sidebar');
    document.querySelector('.customer-menu').addEventListener('click', () => sidebar.classList.toggle('open'));
    document.querySelector('#logoutButton').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); authScreen(); });
    document.querySelector('#newUser').insertAdjacentHTML('beforebegin', '<button id="newBillingPlan" class="portal-secondary">+ Criar plano</button>');
    document.querySelector('.customer-metrics').insertAdjacentHTML('afterend', `
      <section class="admin-section billing-admin-section">
        <div class="licenses-heading"><div><h2>Planos e cobranças</h2><p>Valores usados nas assinaturas recorrentes do Asaas.</p></div><span class="provider-state ${billing.providerConfigured ? 'ready' : ''}">${billing.providerConfigured ? 'Asaas configurado' : 'Asaas aguardando configuração'}</span></div>
        <div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Plano</th><th>Produto</th><th>Ciclo</th><th>Valor</th><th>Status</th></tr></thead><tbody>${billing.plans.length ? billing.plans.map(plan => `<tr><td><b>${escapeHtml(plan.name)}</b><small>${escapeHtml(plan.code)}</small></td><td>${escapeHtml(plan.product)}</td><td>${escapeHtml(plan.cycle)}</td><td><b>${formatMoney(plan.price_cents)}</b></td><td>${plan.active ? 'Ativo' : 'Inativo'}</td></tr>`).join('') : '<tr><td colspan="5" class="admin-empty">Crie o primeiro plano comercial do 4Byts PDV.</td></tr>'}</tbody></table></div>
      </section>`);
    const openBillingPlan = () => {
      const modal = adminModal('Criar plano de cobrança', billingPlanForm());
      modal.querySelector('#billingPlanForm').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        const message = form.querySelector('#adminFormMessage');
        values.priceCents = Math.round(Number(values.price) * 100);
        values.active = true;
        delete values.price;
        try {
          await api('/api/admin/billing/plans', { method: 'POST', body: JSON.stringify(values) });
          modal.remove();
          await adminDashboard(admin);
        } catch (error) { showMessage(message, error.message); }
      });
    };
    const openUser = user => {
      const modal = adminModal(user?.id ? 'Editar conta' : 'Criar conta', userForm(user));
      modal.querySelector('#adminUserForm').addEventListener('submit', async event => {
        event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const message = form.querySelector('#adminFormMessage');
        try { await api(user?.id ? `/api/admin/users/${user.id}` : '/api/admin/users', { method: user?.id ? 'PATCH' : 'POST', body: JSON.stringify(values) }); modal.remove(); await adminDashboard(admin); } catch (error) { showMessage(message, error.message); }
      });
    };
    const openLicense = license => {
      const modal = adminModal(license?.id ? 'Editar licença' : 'Gerar licença', licenseForm(license, users));
      modal.querySelector('#adminLicenseForm').addEventListener('submit', async event => {
        event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form)); const message = form.querySelector('#adminFormMessage');
        values.maxDevices = Number(values.maxDevices); values.expiresAt = values.expiresAt ? new Date(values.expiresAt).toISOString() : null;
        try { const result = await api(license?.id ? `/api/admin/licenses/${license.id}` : '/api/admin/licenses', { method: license?.id ? 'PATCH' : 'POST', body: JSON.stringify(values) }); if (result.key) alert(`Licença criada: ${result.key}`); modal.remove(); await adminDashboard(admin); } catch (error) { showMessage(message, error.message); }
      });
    };
    const openDevices = async license => {
      const modal = adminModal('Instalações da licença', '<div class="portal-loading compact-loading"><i></i><span>Consultando instalações...</span></div>');
      try {
        const result = await api(`/api/admin/licenses/${license.id}/devices`);
        const card = modal.querySelector('.admin-modal-card');
        card.querySelector(':scope > h2').insertAdjacentHTML('afterend', deviceListContent(result.license, result.devices));
        card.querySelector('.compact-loading').remove();
        card.querySelectorAll('[data-approve-ip]').forEach(button => button.addEventListener('click', async () => {
          const device = result.devices.find(item => item.id === Number(button.dataset.approveIp));
          const requestedIp = device?.requested_ip || device?.last_ip;
          if (!confirm(`Autorizar esta máquina a utilizar o IP ${requestedIp}?`)) return;
          const message = card.querySelector('#deviceModalMessage');
          button.disabled = true;
          try {
            const approved = await api(`/api/admin/licenses/${license.id}/devices/${device.id}/approve-ip`, {
              method: 'PATCH', body: JSON.stringify({ ip: requestedIp })
            });
            showMessage(message, approved.message, 'success');
            setTimeout(() => { modal.remove(); adminDashboard(admin); }, 900);
          } catch (error) { showMessage(message, error.message); button.disabled = false; }
        }));
        card.querySelectorAll('[data-release-device]').forEach(button => button.addEventListener('click', async () => {
          const device = result.devices.find(item => item.id === Number(button.dataset.releaseDevice));
          if (!confirm(`Liberar a instalação "${device?.device_name || 'sem nome'}"? O PDV perderá o acesso na próxima validação.`)) return;
          const message = card.querySelector('#deviceModalMessage');
          button.disabled = true;
          try {
            const released = await api(`/api/admin/licenses/${license.id}/devices/${device.id}/release`, { method: 'PATCH' });
            showMessage(message, released.message, 'success');
            setTimeout(() => { modal.remove(); adminDashboard(admin); }, 900);
          } catch (error) {
            showMessage(message, error.message);
            button.disabled = false;
          }
        }));
      } catch (error) {
        modal.querySelector('.compact-loading').innerHTML = `<span>${escapeHtml(error.message)}</span>`;
      }
    };
    document.querySelector('#newBillingPlan').addEventListener('click', openBillingPlan);
    document.querySelector('#newUser').addEventListener('click', () => openUser());
    document.querySelector('#newLicense').addEventListener('click', () => openLicense());
    document.querySelectorAll('[data-edit-user]').forEach(button => button.addEventListener('click', () => openUser(users.find(user => user.id === Number(button.dataset.editUser)))));
    document.querySelectorAll('[data-edit-license]').forEach(button => button.addEventListener('click', () => openLicense(licenses.find(license => license.id === Number(button.dataset.editLicense)))));
    document.querySelectorAll('[data-devices-license]').forEach(button => button.addEventListener('click', () => openDevices(licenses.find(license => license.id === Number(button.dataset.devicesLicense)))));
  } catch (error) {
    root.innerHTML = `<div class="portal-fatal"><h1>Não foi possível abrir a administração</h1><p>${escapeHtml(error.message)}</p><button onclick="location.reload()">Tentar novamente</button></div>`;
  }
}

async function dashboard() {
  root.innerHTML = spinner();
  try {
    const { user } = await api('/api/auth/me');
    if (user.role === 'admin') return adminDashboard(user);
    const [{ licenses }, billing, planData] = await Promise.all([
      api('/api/licenses'), api('/api/billing'), api('/api/billing/plans')
    ]);
    const activeLicenses = licenses.filter(license => license.status === 'active').length;
    const deviceCount = licenses.reduce((total, license) => total + license.deviceCount, 0);
    root.innerHTML = `
      <div class="customer-shell">
        <aside class="customer-sidebar">
          <a href="/" class="portal-brand">${darkLogo}</a>
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
    const currentPayment = billing.payments[0];
    const billingSection = billing.subscription ? `
      <section class="billing-section">
        <div class="licenses-heading"><div><h2>Assinatura e pagamentos</h2><p>Acompanhe sua mensalidade do 4Byts PDV.</p></div><button id="syncBilling" class="admin-edit">Atualizar situação</button></div>
        <div class="billing-overview">
          <article><small>Plano</small><strong>${escapeHtml(billing.subscription.plan_name)}</strong><span>${formatMoney(billing.subscription.price_cents)} · ${escapeHtml(billing.subscription.billing_type)}</span></article>
          <article><small>Situação</small><strong class="billing-${escapeHtml(billing.subscription.billing_status)}">${escapeHtml(billingStatusLabel(billing.subscription.billing_status))}</strong><span>${billing.subscription.billing_grace_until ? `Carência até ${escapeHtml(formatDate(billing.subscription.billing_grace_until))}` : 'Sem pendências vencidas'}</span></article>
          <article><small>Próximo vencimento</small><strong>${escapeHtml(formatDate(billing.subscription.next_due_date))}</strong><span>Cobrança recorrente</span></article>
        </div>
        ${currentPayment ? `<div class="payment-card">
          <div><span class="license-status ${currentPayment.status === 'OVERDUE' ? 'expired' : ''}">${escapeHtml(currentPayment.status)}</span><h3>${formatMoney(currentPayment.valueCents)}</h3><p>Vencimento: ${escapeHtml(formatDate(currentPayment.dueDate))}</p>
          <div class="payment-actions">${currentPayment.invoiceUrl ? `<a href="${escapeHtml(currentPayment.invoiceUrl)}" target="_blank" rel="noopener">Abrir fatura</a>` : ''}${currentPayment.bankSlipUrl ? `<a href="${escapeHtml(currentPayment.bankSlipUrl)}" target="_blank" rel="noopener">Abrir boleto</a>` : ''}${currentPayment.pixPayload ? '<button id="copyPix">Copiar código Pix</button>' : ''}</div></div>
          ${currentPayment.pixEncodedImage ? `<img src="data:image/png;base64,${escapeHtml(currentPayment.pixEncodedImage)}" alt="QR Code Pix">` : ''}
        </div>` : '<div class="admin-empty">A primeira cobrança está sendo preparada.</div>'}
      </section>` : `
      <section class="billing-section billing-start">
        <div><span class="portal-kicker">PAGAMENTOS</span><h2>Ative sua cobrança recorrente</h2><p>Escolha Pix ou boleto. A mensalidade é gerada automaticamente e fica disponível neste painel.</p></div>
        <button id="startSubscription" class="portal-primary compact" ${!licenses.length || !planData.plans.length || !planData.providerConfigured ? 'disabled' : ''}>Configurar pagamento <span>→</span></button>
        ${!planData.providerConfigured ? '<small>O administrador ainda precisa conectar a conta Asaas.</small>' : !planData.plans.length ? '<small>Nenhum plano comercial disponível.</small>' : ''}
      </section>`;
    document.querySelector('.licenses-section').insertAdjacentHTML('afterend', billingSection);
    document.querySelector('#startSubscription')?.addEventListener('click', () => {
      const modal = adminModal('Configurar pagamento', subscriptionForm(licenses, planData.plans));
      modal.querySelector('#subscriptionForm').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = Object.fromEntries(new FormData(form));
        const message = form.querySelector('#subscriptionMessage');
        values.licenseId = Number(values.licenseId);
        values.planId = Number(values.planId);
        try {
          await api('/api/billing/subscribe', { method: 'POST', body: JSON.stringify(values) });
          modal.remove();
          await dashboard();
        } catch (error) { showMessage(message, error.message); }
      });
    });
    document.querySelector('#syncBilling')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try { await api('/api/billing/sync', { method: 'POST' }); await dashboard(); }
      catch (error) { alert(error.message); event.currentTarget.disabled = false; }
    });
    document.querySelector('#copyPix')?.addEventListener('click', async event => {
      await navigator.clipboard.writeText(currentPayment.pixPayload);
      event.currentTarget.textContent = 'Pix copiado ✓';
    });
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
