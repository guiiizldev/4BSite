const root = document.querySelector('#app');
const state = { agent: null, conversations: [], selectedId: null, filter: '', timer: null };
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const formatTime = value => value ? new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(String(value).replace(' ', 'T') + 'Z')) : '';

async function api(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Não foi possível concluir a solicitação.');
  return payload;
}

function message(element, text, type = 'error') { element.textContent = text; element.className = `form-message ${type}`; element.hidden = false; }

function loginScreen() {
  clearInterval(state.timer);
  root.innerHTML = `<main class="login-layout"><section class="login-brand"><img src="/assets/logo-footer.png" alt="4Byts"><div><span>4BYTS ATENDIMENTO</span><h1>Conversas que começam com agilidade e continuam com pessoas.</h1><p>Automatize a triagem no WhatsApp e entregue cada cliente ao atendente certo.</p></div><small>Integração oficial com WhatsApp Business Platform</small></section><section class="login-form"><form id="loginForm"><span class="eyebrow">PORTAL DO ATENDENTE</span><h2>Bem-vindo de volta</h2><p>Use a mesma conta central da 4Byts.</p><label>E-mail<input type="email" name="email" autocomplete="email" required></label><label>Senha<input type="password" name="password" autocomplete="current-password" required></label><div id="loginMessage" class="form-message" hidden></div><button type="submit">Entrar no atendimento <b>→</b></button><a href="https://4byts.com/portal.html">Acessar portal do cliente</a></form></section></main>`;
  document.querySelector('#loginForm').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const notice = form.querySelector('#loginMessage'); const button = form.querySelector('button'); button.disabled = true;
    try { const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); state.agent = result.agent; await dashboard(); }
    catch (error) { message(notice, error.message); button.disabled = false; }
  });
}

const statusLabel = status => ({ bot: 'No bot', waiting: 'Aguardando', human: 'Em atendimento', closed: 'Encerrada' }[status] || status);

function conversationRows() {
  if (!state.conversations.length) return '<div class="empty-list"><span>◇</span><b>Nenhuma conversa nesta fila</b><small>Novos contatos aparecerão automaticamente.</small></div>';
  return state.conversations.map(item => `<button class="conversation-row ${item.id === state.selectedId ? 'selected' : ''}" data-conversation="${item.id}"><span class="avatar">${escapeHtml((item.contactName || 'C').slice(0, 2).toUpperCase())}</span><span class="conversation-copy"><b>${escapeHtml(item.contactName || item.phone)}</b><small>${escapeHtml(item.lastMessage || 'Nova conversa')}</small><em>${escapeHtml(item.department)}</em></span><span class="conversation-meta"><time>${formatTime(item.lastMessageAt)}</time>${item.unreadCount ? `<b>${item.unreadCount}</b>` : ''}</span></button>`).join('');
}

async function loadConversations(preserve = true) {
  const query = state.filter ? `?status=${encodeURIComponent(state.filter)}` : '';
  state.conversations = (await api(`/api/conversations${query}`)).conversations;
  if (!preserve || !state.conversations.some(item => item.id === state.selectedId)) state.selectedId = state.conversations[0]?.id || null;
  const list = document.querySelector('#conversationList'); if (list) { list.innerHTML = conversationRows(); bindConversationRows(); }
  const writingMessage = document.activeElement?.closest?.('#messageForm');
  if (state.selectedId && (!preserve || !writingMessage)) await openConversation(state.selectedId, preserve); else if (!state.selectedId) emptyChat();
}

function bindConversationRows() { document.querySelectorAll('[data-conversation]').forEach(button => button.addEventListener('click', () => { state.selectedId = Number(button.dataset.conversation); openConversation(state.selectedId); document.querySelector('.chat-panel').classList.add('mobile-open'); })); }

function emptyChat() { const panel = document.querySelector('#chatContent'); if (panel) panel.innerHTML = '<div class="empty-chat"><span>◇</span><h2>Selecione uma conversa</h2><p>Acompanhe a triagem e assuma o atendimento quando necessário.</p></div>'; }

async function openConversation(id, quiet = false) {
  const result = await api(`/api/conversations/${id}/messages`);
  state.selectedId = id;
  const conversation = result.conversation;
  document.querySelectorAll('[data-conversation]').forEach(row => row.classList.toggle('selected', Number(row.dataset.conversation) === id));
  document.querySelector('#chatContent').innerHTML = `<header class="chat-header"><button id="backToList" class="back-mobile">←</button><span class="avatar">${escapeHtml((conversation.contactName || 'C').slice(0, 2).toUpperCase())}</span><div><b>${escapeHtml(conversation.contactName || conversation.phone)}</b><small>${escapeHtml(conversation.phone)} · ${escapeHtml(conversation.department)}</small></div><span class="status status-${conversation.status}">${statusLabel(conversation.status)}</span><button id="closeConversation" class="outline-action">Encerrar</button></header><div class="messages">${result.messages.map(item => `<article class="bubble ${item.direction}"><small>${item.senderType === 'agent' ? escapeHtml(item.agentName || 'Atendente') : item.senderType === 'bot' ? 'Bot 4Byts' : escapeHtml(conversation.contactName)}</small><p>${escapeHtml(item.content)}</p><time>${formatTime(item.createdAt)} ${item.direction === 'outbound' ? `· ${escapeHtml(item.providerStatus || 'enviada')}` : ''}</time></article>`).join('')}</div><footer class="composer">${conversation.status !== 'human' ? '<button id="assignConversation" class="assign-button">Assumir atendimento</button>' : ''}<form id="messageForm"><textarea name="content" rows="1" placeholder="Digite sua mensagem..." required></textarea><button type="submit">Enviar</button></form></footer>`;
  const messages = document.querySelector('.messages'); messages.scrollTop = messages.scrollHeight;
  document.querySelector('#backToList').addEventListener('click', () => document.querySelector('.chat-panel').classList.remove('mobile-open'));
  document.querySelector('#assignConversation')?.addEventListener('click', async () => { await api(`/api/conversations/${id}/assign`, { method: 'POST', body: '{}' }); await loadConversations(); });
  document.querySelector('#closeConversation').addEventListener('click', async () => { if (!confirm('Encerrar este atendimento?')) return; await api(`/api/conversations/${id}/close`, { method: 'POST', body: '{}' }); await loadConversations(false); });
  document.querySelector('#messageForm').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const content = new FormData(form).get('content'); const button = form.querySelector('button'); button.disabled = true; try { await api(`/api/conversations/${id}/messages`, { method: 'POST', body: JSON.stringify({ content }) }); form.reset(); await openConversation(id); } catch (error) { alert(error.message); button.disabled = false; } });
  if (!quiet) document.querySelector('.conversation-title').textContent = conversation.contactName || conversation.phone;
}

function settingsView(settings) {
  const menu = settings.bot.menu || [];
  root.innerHTML = shell(`<section class="settings-page"><div class="page-heading"><div><span class="eyebrow">CONFIGURAÇÕES</span><h1>Automação e canal</h1><p>Configure a triagem e conecte o número oficial da empresa.</p></div><button data-view="inbox" class="outline-action">← Voltar às conversas</button></div><div class="settings-grid"><form id="botForm" class="settings-card"><span class="card-kicker">AUTOATENDIMENTO</span><h2>Fluxo inicial</h2><label class="toggle"><input type="checkbox" name="botEnabled" ${settings.bot.botEnabled ? 'checked' : ''}><span><b>Bot ativo</b><small>Responde novos contatos e organiza a fila.</small></span></label><label>Mensagem de boas-vindas<textarea name="welcomeMessage" rows="4" required>${escapeHtml(settings.bot.welcomeMessage)}</textarea></label><label>Mensagem de transferência<textarea name="handoffMessage" rows="3" required>${escapeHtml(settings.bot.handoffMessage)}</textarea></label><div class="menu-editor"><b>Opções do menu</b>${menu.map((item, index) => `<div><input name="key${index}" value="${escapeHtml(item.key)}" aria-label="Tecla"><input name="label${index}" value="${escapeHtml(item.label)}" aria-label="Nome"><input name="department${index}" value="${escapeHtml(item.department)}" aria-label="Departamento"></div>`).join('')}</div><div id="botMessage" class="form-message" hidden></div><button type="submit">Salvar fluxo</button></form><form id="channelForm" class="settings-card"><span class="card-kicker">WHATSAPP CLOUD API</span><h2>Canal oficial</h2><p class="card-note">Dados encontrados no painel Meta for Developers. O token é criptografado antes de ser armazenado.</p><label>Phone Number ID<input name="phoneNumberId" value="${escapeHtml(settings.channel?.phoneNumberId || '')}" required></label><label>WhatsApp Business Account ID<input name="wabaId" value="${escapeHtml(settings.channel?.wabaId || '')}"></label><label>Número exibido<input name="displayPhone" value="${escapeHtml(settings.channel?.displayPhone || '')}" placeholder="+55 11 99999-9999"></label><label>Token permanente<input type="password" name="accessToken" placeholder="${settings.channel ? 'Deixe vazio para manter o atual' : 'Obrigatório na primeira configuração'}"></label><div class="webhook-box"><small>URL DO WEBHOOK</small><code>${escapeHtml(`${location.origin}/webhooks/whatsapp`)}</code></div><div id="channelMessage" class="form-message" hidden></div><button type="submit">Salvar canal</button></form></div></section>`);
  bindShell();
  document.querySelector('#botForm').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const updatedMenu = menu.map((_, index) => ({ key: data.get(`key${index}`), label: data.get(`label${index}`), department: data.get(`department${index}`) })); try { const result = await api('/api/settings/bot', { method: 'PUT', body: JSON.stringify({ botEnabled: form.elements.botEnabled.checked, welcomeMessage: data.get('welcomeMessage'), handoffMessage: data.get('handoffMessage'), menu: updatedMenu }) }); message(form.querySelector('#botMessage'), result.message, 'success'); } catch (error) { message(form.querySelector('#botMessage'), error.message); } });
  document.querySelector('#channelForm').addEventListener('submit', async event => { event.preventDefault(); const form = event.currentTarget; try { const result = await api('/api/settings/channel', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); message(form.querySelector('#channelMessage'), result.message, 'success'); form.elements.accessToken.value = ''; } catch (error) { message(form.querySelector('#channelMessage'), error.message); } });
}

function shell(content) { return `<div class="app-shell"><aside><img src="/assets/logo-footer.png" alt="4Byts"><strong>Atendimento</strong><nav><button data-view="inbox"><span>◇</span> Conversas</button><button data-view="settings"><span>⚙</span> Configurações</button></nav><div class="agent-card"><span>${escapeHtml((state.agent?.name || 'A').slice(0, 2).toUpperCase())}</span><div><b>${escapeHtml(state.agent?.name)}</b><small>${escapeHtml(state.agent?.tenantName)}</small></div></div></aside><main>${content}</main></div>`; }

function bindShell() {
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async () => { if (button.dataset.view === 'settings') settingsView(await api('/api/settings')); else dashboard(); }));
}

async function dashboard() {
  clearInterval(state.timer);
  const summary = await api('/api/dashboard');
  root.innerHTML = shell(`<section class="inbox-page"><header class="topbar"><div><span class="eyebrow">CAIXA DE ENTRADA</span><h1 class="conversation-title">Conversas</h1></div><div class="channel-state ${summary.channel ? 'online' : ''}"><i></i>${summary.channel ? escapeHtml(summary.channel.displayPhone || 'WhatsApp conectado') : 'Canal não configurado'}</div><button id="logout">Sair</button></header><div class="metrics"><article><span>Aguardando</span><b>${summary.counters.waiting}</b></article><article><span>Em atendimento</span><b>${summary.counters.human}</b></article><article><span>No bot</span><b>${summary.counters.bot}</b></article></div><div class="inbox"><section class="conversation-panel"><div class="filters"><button data-filter="" class="active">Todas</button><button data-filter="waiting">Fila</button><button data-filter="human">Comigo</button><button data-filter="bot">Bot</button></div><div id="conversationList" class="conversation-list"></div></section><section class="chat-panel"><div id="chatContent"></div></section></div></section>`);
  bindShell();
  document.querySelector('#logout').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST', body: '{}' }); loginScreen(); });
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', async () => { state.filter = button.dataset.filter; document.querySelectorAll('[data-filter]').forEach(item => item.classList.toggle('active', item === button)); await loadConversations(false); }));
  await loadConversations(false);
  state.timer = setInterval(() => loadConversations().catch(() => {}), 5000);
}

api('/api/auth/me').then(result => { state.agent = result.agent; return dashboard(); }).catch(loginScreen);
