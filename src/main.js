import './styles.css';

const icons = {
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
  code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></svg>',
  cart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h2l2 12h10l2-8H6M9 20h.01M17 20h.01"/></svg>',
  shield: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  layers: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
  cloud: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.5 19H6a4 4 0 1 1 .7-7.94A6 6 0 0 1 18.4 9.5 4.8 4.8 0 0 1 17.5 19Z"/></svg>',
  chart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M7 16l4-5 4 3 5-7"/></svg>',
  headset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2M18 19c0 1-1 2-2 2h-3"/><rect x="3" y="13" width="4" height="6" rx="2"/><rect x="17" y="13" width="4" height="6" rx="2"/></svg>',
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M18 5l2 2M15 8l2 2"/></svg>'
};

const Icon = (name) => `<span class="icon">${icons[name]}</span>`;

document.querySelector('#app').innerHTML = `
  <div class="noise"></div>
  <header class="site-header">
    <div class="container nav-wrap">
      <a href="#inicio" class="brand" aria-label="4Byts início">
        <span class="official-logo official-logo--header"><img src="/assets/logo.png" alt="4Byts" /></span>
      </a>
      <nav class="desktop-nav" aria-label="Navegação principal">
        <a href="#solucoes">Soluções</a>
        <a href="#processo">Como funciona</a>
        <a href="#licencas">Licenças</a>
        <a href="#sobre">Sobre</a>
      </nav>
      <div class="nav-actions">
        <button class="btn btn-ghost open-client">Área do cliente</button>
        <a href="#contato" class="btn btn-primary">Falar com especialista ${Icon('arrow')}</a>
      </div>
      <button class="menu-btn" aria-label="Abrir menu">${Icon('menu')}</button>
    </div>
    <div class="mobile-nav">
      <a href="#solucoes">Soluções</a><a href="#processo">Como funciona</a><a href="#licencas">Licenças</a><a href="#sobre">Sobre</a>
      <button class="btn btn-ghost open-client">Área do cliente</button>
      <a href="#contato" class="btn btn-primary">Falar com especialista</a>
    </div>
  </header>

  <main>
    <section class="hero" id="inicio">
      <div class="hero-glow"></div>
      <div class="container hero-grid">
        <div class="hero-copy reveal">
          <div class="eyebrow"><span></span> Software que trabalha pelo seu negócio</div>
          <h1>Transformamos ideias em <em>sistemas que escalam.</em></h1>
          <p>Produtos digitais prontos e soluções sob medida para simplificar operações, vender mais e colocar sua empresa no controle.</p>
          <div class="hero-actions">
            <a href="#solucoes" class="btn btn-primary btn-lg">Conhecer soluções ${Icon('arrow')}</a>
            <a href="#contato" class="btn btn-soft btn-lg">Solicitar projeto</a>
          </div>
          <div class="trust-row">
            <div class="avatar-stack"><span>4B</span><span>UX</span><span>DEV</span></div>
            <div><div class="stars">★★★★★</div><small>Construído para o seu crescimento</small></div>
          </div>
        </div>

        <div class="hero-visual reveal delay-1" aria-label="Prévia do painel 4Byts PDV">
          <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
          <div class="dashboard-card">
            <div class="dash-head">
              <div class="mini-brand"><span class="official-logo official-logo--mini"><img src="/assets/logo.png" alt="" /></span><b>PDV</b></div>
              <div class="dash-search">⌕ &nbsp; Buscar produto...</div>
              <span class="status"><i></i> Online</span>
            </div>
            <div class="dash-body">
              <aside><span class="active">⌂</span><span>▦</span><span>▥</span><span>♙</span><span>⚙</span></aside>
              <div class="dash-content">
                <div class="dash-title"><div><small>Visão geral</small><strong>Olá, equipe 4Byts 👋</strong></div><button>+ Nova venda</button></div>
                <div class="stats-grid">
                  <div><small>Vendas hoje</small><strong>R$ 8.420</strong><b>↑ 12,5%</b></div>
                  <div><small>Pedidos</small><strong>124</strong><b>↑ 8,2%</b></div>
                  <div><small>Ticket médio</small><strong>R$ 67,90</strong><b>↑ 4,1%</b></div>
                </div>
                <div class="chart-card">
                  <div class="chart-label"><span>Faturamento</span><strong>R$ 42.860,00</strong></div>
                  <div class="bars">${[35,54,42,70,61,84,73,93,66,79,90,100].map((h,i)=>`<i style="--h:${h}%" class="${i===11?'hot':''}"></i>`).join('')}</div>
                  <div class="chart-days"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div>
                </div>
              </div>
            </div>
          </div>
          <div class="float-pill pill-one">${Icon('shield')} <span><b>Licença ativa</b><small>Protegida e atualizada</small></span></div>
          <div class="float-pill pill-two">${Icon('chart')} <span><b>+24%</b><small>crescimento mensal</small></span></div>
        </div>
      </div>
      <div class="container metrics reveal">
        <div><strong>100%</strong><span>Foco no seu negócio</span></div>
        <div><strong>24/7</strong><span>Sistemas disponíveis</span></div>
        <div><strong>LGPD</strong><span>Dados protegidos</span></div>
        <div><strong>∞</strong><span>Possibilidades para crescer</span></div>
      </div>
    </section>

    <section class="section solutions" id="solucoes">
      <div class="container">
        <div class="section-heading reveal"><div><span class="kicker">NOSSAS SOLUÇÕES</span><h2>Tecnologia certa para cada <em>próximo passo.</em></h2></div><p>Comece com um produto pronto ou construa uma solução exclusiva para o seu modelo de negócio.</p></div>
        <div class="product-grid">
          <article class="product-card featured reveal">
            <div class="product-copy">
              <span class="product-tag">PRODUTO EM DESTAQUE</span>
              <div class="product-icon">${Icon('cart')}</div>
              <h3>4Byts PDV</h3>
              <p>O ponto de venda completo que simplifica sua operação — do caixa ao relatório.</p>
              <ul><li>${Icon('check')} Vendas rápidas e intuitivas</li><li>${Icon('check')} Estoque em tempo real</li><li>${Icon('check')} Relatórios inteligentes</li><li>${Icon('check')} Emissão fiscal integrada</li></ul>
              <button class="btn btn-dark product-detail" data-product="pdv">Conhecer o 4Byts PDV ${Icon('arrow')}</button>
            </div>
            <div class="pos-mockup">
              <div class="pos-screen">
                <div class="pos-top"><b>Nova venda</b><span>● Caixa aberto</span></div>
                <div class="pos-main"><div class="products-mini"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="checkout-mini"><small>Resumo</small><p>3 itens</p><strong>R$ 142,70</strong><button>Finalizar venda</button></div></div>
              </div>
              <div class="pos-base"></div>
            </div>
          </article>

          <article class="product-card custom reveal delay-1">
            <div class="product-icon purple">${Icon('code')}</div>
            <span class="product-tag purple-tag">SOB MEDIDA</span>
            <h3>Seu sistema, do seu jeito.</h3>
            <p>Desenvolvemos plataformas, painéis e automações pensados para resolver desafios reais da sua empresa.</p>
            <div class="chip-list"><span>Sistemas web</span><span>Aplicativos</span><span>Integrações</span><span>Automação</span></div>
            <a href="#contato" class="text-link">Conte sua ideia ${Icon('arrow')}</a>
            <div class="code-window"><div><i></i><i></i><i></i></div><code><b>const</b> seuNegocio = {<br>&nbsp;&nbsp;ideia: <span>'única'</span>,<br>&nbsp;&nbsp;potencial: <span>'ilimitado'</span><br>};</code></div>
          </article>
        </div>

        <div class="capabilities reveal">
          <div>${Icon('monitor')}<span><b>Experiência intuitiva</b><small>Simples para sua equipe usar</small></span></div>
          <div>${Icon('cloud')}<span><b>Acesso de qualquer lugar</b><small>Seguro, rápido e disponível</small></span></div>
          <div>${Icon('layers')}<span><b>Pronto para crescer</b><small>Tecnologia que acompanha você</small></span></div>
          <div>${Icon('headset')}<span><b>Suporte próximo</b><small>Gente de verdade para ajudar</small></span></div>
        </div>
      </div>
    </section>

    <section class="section process" id="processo">
      <div class="container process-grid">
        <div class="process-copy reveal">
          <span class="kicker">DO PLANO À PRÁTICA</span><h2>Ideias boas merecem virar <em>produtos incríveis.</em></h2>
          <p>Um processo transparente, colaborativo e sem complicação. Você acompanha tudo de perto, da primeira conversa até o lançamento.</p>
          <a href="#contato" class="btn btn-outline">Começar um projeto ${Icon('arrow')}</a>
        </div>
        <div class="steps">
          <article class="reveal"><span>01</span><div>${Icon('headset')}<h3>Entendemos</h3><p>Mergulhamos no seu negócio, nos desafios e nas oportunidades.</p></div></article>
          <article class="reveal"><span>02</span><div>${Icon('layers')}<h3>Planejamos</h3><p>Desenhamos a solução, o escopo e um caminho claro para entregar.</p></div></article>
          <article class="reveal"><span>03</span><div>${Icon('code')}<h3>Construímos</h3><p>Desenvolvemos com qualidade e você acompanha cada evolução.</p></div></article>
          <article class="reveal"><span>04</span><div>${Icon('chart')}<h3>Evoluímos</h3><p>Lançamos, acompanhamos os resultados e melhoramos continuamente.</p></div></article>
        </div>
      </div>
    </section>

    <section class="section licensing" id="licencas">
      <div class="container license-grid">
        <div class="license-visual reveal">
          <div class="license-card">
            <div class="license-top"><div class="key-icon">${Icon('key')}</div><span class="active-badge">● ATIVA</span></div>
            <small>LICENÇA 4BYTS PDV</small><h3>4B-PDV-••••-A82F</h3>
            <div class="license-info"><div><small>Plano</small><b>Profissional</b></div><div><small>Renovação</small><b>12 Set 2026</b></div></div>
            <div class="license-progress"><i></i></div>
            <p>${Icon('shield')} Dispositivo verificado e protegido</p>
          </div>
          <div class="decor-key">${Icon('key')}</div>
        </div>
        <div class="license-copy reveal delay-1">
          <span class="kicker">LICENCIAMENTO SIMPLES</span><h2>Seu software sempre <em>seguro e atualizado.</em></h2>
          <p>Controle suas licenças em um só lugar. Ative, renove ou gerencie seus dispositivos com poucos cliques.</p>
          <ul><li>${Icon('check')} Ativação rápida e segura</li><li>${Icon('check')} Atualizações incluídas no plano</li><li>${Icon('check')} Gestão de dispositivos</li><li>${Icon('check')} Suporte especializado</li></ul>
          <button class="btn btn-primary open-client">Acessar minhas licenças ${Icon('arrow')}</button>
        </div>
      </div>
    </section>

    <section class="section about" id="sobre">
      <div class="container about-grid">
        <div class="about-copy reveal"><span class="kicker">POR QUE 4BYTS?</span><h2>Pequenos detalhes.<br><em>Grandes resultados.</em></h2><p>A gente acredita que tecnologia boa é aquela que desaparece na rotina — porque simplesmente funciona.</p></div>
        <div class="values">
          <article class="reveal"><span>01</span><h3>Clareza sempre</h3><p>Sem termos complicados, custos escondidos ou surpresas no caminho.</p></article>
          <article class="reveal"><span>02</span><h3>Feito para durar</h3><p>Código bem construído, seguro e preparado para evoluir.</p></article>
          <article class="reveal"><span>03</span><h3>Parceria de verdade</h3><p>Seu objetivo vira o nosso. Crescemos quando você cresce.</p></article>
        </div>
      </div>
    </section>

    <section class="cta-section" id="contato">
      <div class="container cta-card reveal">
        <div><span class="kicker light">VAMOS CONSTRUIR JUNTOS?</span><h2>O próximo grande passo<br>do seu negócio <em>começa aqui.</em></h2><p>Conte o que você precisa. A primeira conversa é por nossa conta.</p></div>
        <form class="lead-form" id="leadForm">
          <div class="form-row"><label><span>Seu nome</span><input name="name" required placeholder="Como podemos chamar você?" /></label><label><span>WhatsApp</span><input name="phone" required inputmode="tel" placeholder="(00) 00000-0000" /></label></div>
          <label><span>Como podemos ajudar?</span><select name="interest"><option>Quero conhecer o 4Byts PDV</option><option>Preciso de um sistema sob medida</option><option>Quero entender o licenciamento</option><option>Quero propor uma parceria</option></select></label>
          <label><span>Conte um pouco sobre sua ideia</span><textarea name="message" rows="3" placeholder="Qual desafio você quer resolver?"></textarea></label>
          <button class="btn btn-white" type="submit">Enviar minha ideia ${Icon('arrow')}</button>
          <small>Ao enviar, você concorda com nossa política de privacidade.</small>
        </form>
      </div>
    </section>
  </main>

  <footer>
    <div class="container footer-main">
      <div class="footer-brand"><a class="brand footer-logo-card" href="#inicio" aria-label="4Byts início"><span class="official-logo official-logo--footer"><img src="/assets/logo-footer.png" alt="4Byts" /></span></a><p>Tecnologia simples.<br>Resultados extraordinários.</p></div>
      <div><h4>Soluções</h4><a href="#solucoes">4Byts PDV</a><a href="#solucoes">Sistemas sob medida</a><a href="#licencas">Licenciamento</a></div>
      <div><h4>Empresa</h4><a href="#sobre">Sobre nós</a><a href="#processo">Como trabalhamos</a><a href="#contato">Contato</a></div>
      <div><h4>Atendimento</h4><a href="mailto:contato@4byts.com">contato@4byts.com</a><a href="#contato">Falar no WhatsApp</a><span>Seg–Sex, 9h às 18h</span></div>
    </div>
    <div class="container footer-bottom"><span>© 2026 4Byts Tecnologia. Todos os direitos reservados.</span><div><a href="#">Privacidade</a><a href="#">Termos de uso</a></div></div>
  </footer>

  <div class="modal" id="clientModal" aria-hidden="true">
    <div class="modal-backdrop"></div>
    <div class="modal-panel">
      <button class="modal-close" aria-label="Fechar">${Icon('close')}</button>
      <div class="modal-logo"><span class="official-logo official-logo--modal"><img src="/assets/logo.png" alt="4Byts" /></span></div>
      <span class="kicker">PORTAL 4BYTS</span><h2>Área do cliente</h2><p>Gerencie suas licenças, dispositivos e renovações.</p>
      <form id="loginForm"><label><span>E-mail</span><input type="email" required placeholder="voce@empresa.com" /></label><label><span>Senha</span><input type="password" required placeholder="Sua senha" /></label><div class="form-help"><label><input type="checkbox" /> Lembrar de mim</label><a href="#">Esqueci minha senha</a></div><button class="btn btn-primary" type="submit">Entrar na plataforma ${Icon('arrow')}</button></form>
      <small class="demo-note">Demonstração visual — o acesso real será conectado ao backend de licenças.</small>
    </div>
  </div>

  <div class="modal" id="productModal" aria-hidden="true">
    <div class="modal-backdrop"></div>
    <div class="modal-panel product-modal-panel">
      <button class="modal-close" aria-label="Fechar">${Icon('close')}</button>
      <span class="product-tag">4BYTS PDV</span><h2>Venda mais.<br>Gerencie melhor.</h2><p>Uma experiência de caixa rápida com estoque, clientes, relatórios e gestão integrados.</p>
      <div class="plan-toggle"><button class="active" data-cycle="monthly">Mensal</button><button data-cycle="yearly">Anual <b>economize 16%</b></button></div>
      <div class="price"><span>R$</span><strong id="planPrice">149</strong><small>/mês<br>por estabelecimento</small></div>
      <ul><li>${Icon('check')} 2 caixas inclusos</li><li>${Icon('check')} Usuários ilimitados</li><li>${Icon('check')} Atualizações e suporte</li></ul>
      <a href="#contato" class="btn btn-primary close-and-contact">Quero experimentar ${Icon('arrow')}</a>
      <small>Preço demonstrativo, sujeito à definição comercial.</small>
    </div>
  </div>

  <div class="toast" role="status">${Icon('check')} <span>Recebemos sua mensagem! Entraremos em contato.</span></div>
`;

const header = document.querySelector('.site-header');
const menuBtn = document.querySelector('.menu-btn');
const mobileNav = document.querySelector('.mobile-nav');

window.addEventListener('scroll', () => header.classList.toggle('scrolled', scrollY > 30));
menuBtn.addEventListener('click', () => {
  mobileNav.classList.toggle('open');
  menuBtn.innerHTML = mobileNav.classList.contains('open') ? Icon('close') : Icon('menu');
});
document.querySelectorAll('.mobile-nav a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('open')));

const toggleModal = (modal, open) => {
  modal.classList.toggle('open', open);
  modal.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('modal-open', open);
};

const clientModal = document.querySelector('#clientModal');
const productModal = document.querySelector('#productModal');
document.querySelectorAll('.open-client').forEach(btn => btn.addEventListener('click', () => toggleModal(clientModal, true)));
document.querySelectorAll('.product-detail').forEach(btn => btn.addEventListener('click', () => toggleModal(productModal, true)));
document.querySelectorAll('.modal').forEach(modal => {
  modal.querySelector('.modal-close').addEventListener('click', () => toggleModal(modal, false));
  modal.querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(modal, false));
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal.open').forEach(m => toggleModal(m, false)); });

document.querySelectorAll('.plan-toggle button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.plan-toggle button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelector('#planPrice').textContent = btn.dataset.cycle === 'yearly' ? '125' : '149';
}));

document.querySelector('.close-and-contact').addEventListener('click', () => toggleModal(productModal, false));

const showToast = (message) => {
  const toast = document.querySelector('.toast');
  toast.querySelector('span').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
};

document.querySelector('#leadForm').addEventListener('submit', e => {
  e.preventDefault();
  showToast('Recebemos sua mensagem! Entraremos em contato.');
  e.target.reset();
});
document.querySelector('#loginForm').addEventListener('submit', e => {
  e.preventDefault();
  toggleModal(clientModal, false);
  showToast('Portal demonstrativo. A autenticação será conectada ao backend.');
});

const phone = document.querySelector('input[name="phone"]');
phone.addEventListener('input', e => {
  let v = e.target.value.replace(/\D/g, '').slice(0, 11);
  if (v.length > 6) v = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  else if (v.length > 2) v = `(${v.slice(0,2)}) ${v.slice(2)}`;
  else if (v.length) v = `(${v}`;
  e.target.value = v;
});

const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}), { threshold: .12 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
