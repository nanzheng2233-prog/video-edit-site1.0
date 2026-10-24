(function () {
  'use strict';

  const allWorks = Array.isArray(window.PORTFOLIO_DATA) ? window.PORTFOLIO_DATA : [];
  const categories = { all: '全部', original: '原创', commercial: '商业', commission: '委托', showreel: 'SHOWREEL', showcase: 'Showcase' };
  const newIds = ['duplex-lens', 'xuan-ai', 'moshi-moshi'];
  const orderedWorks = [
    ...newIds.map(id => allWorks.find(work => work.id === id)).filter(Boolean),
    ...allWorks.filter(work => !newIds.includes(work.id))
  ];
  const pageSize = 12;
  const views = [...document.querySelectorAll('.page-view')];
  const grid = document.getElementById('portfolioGrid');
  const pagination = document.getElementById('pagination');
  const dialog = document.getElementById('work-dialog');
  const worksMenu = document.getElementById('works-menu');
  const worksMenuButton = document.getElementById('works-menu-button');
  const mobileMenuButton = document.getElementById('mobile-menu-button');
  const navLinks = document.getElementById('nav-links');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  let route = null;
  let activeWorks = orderedWorks;
  let dialogWorks = [], dialogIndex = 0, opener = null;
  let motion = !reducedMotion.matches, sound = false, audioContext;
  let toastTimeout, sceneTimeout, viewAnimation, menuCloseTimeout;
  let menuOpenedByHover = false;
  const hoverStates = new Map();
  let hoverFrame = 0, lastHoverTime = 0;
  const pointerGlow = el('div');
  pointerGlow.id = 'pointer-glow';
  pointerGlow.setAttribute('aria-hidden', 'true');
  pointerGlow.hidden = true;
  document.body.append(pointerGlow);
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0, started: false };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function setText(id, text) {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
  }
  function validCategory(value) {
    return Object.prototype.hasOwnProperty.call(categories, value);
  }
  function categoryWorks(category) {
    return category === 'all' ? orderedWorks : allWorks.filter(work => work.category === category);
  }
  function normalizeRoute(next) {
    const view = views.some(node => node.id === next.view) ? next.view : 'portfolio';
    const category = validCategory(next.category) ? next.category : 'all';
    const count = categoryWorks(category).length;
    const maximum = Math.max(1, Math.ceil(count / pageSize));
    const number = Number(next.page);
    const page = Math.max(1, Math.min(maximum, Number.isFinite(number) ? Math.floor(number) : 1));
    return { view, category: view === 'portfolio' ? category : 'all', page: view === 'portfolio' ? page : 1 };
  }
  function readRoute() {
    const raw = location.hash.slice(1);
    const split = raw.indexOf('?');
    const view = (split < 0 ? raw : raw.slice(0, split)) || 'portfolio';
    const query = new URLSearchParams(split < 0 ? '' : raw.slice(split + 1));
    return normalizeRoute({ view, category: query.get('category') || 'all', page: query.get('page') || 1 });
  }
  function routeHash(next) {
    return next.view === 'portfolio'
      ? '#portfolio?category=' + encodeURIComponent(next.category) + '&page=' + next.page
      : '#' + next.view;
  }
  function routeKey(next) {
    return next ? routeHash(next) : '';
  }
  function setWorksMenu(open, restoreFocus = false) {
    if (!worksMenu || !worksMenuButton) return;
    clearTimeout(menuCloseTimeout);
    if (!open) menuOpenedByHover = false;
    worksMenu.hidden = !open;
    worksMenuButton.setAttribute('aria-expanded', String(open));
    worksMenuButton.classList.toggle('open', open);
    if (!open && restoreFocus) worksMenuButton.focus({ preventScroll: true });
  }
  function setMobileMenu(open, restoreFocus = false) {
    navLinks?.classList.toggle('open', open);
    mobileMenuButton?.setAttribute('aria-expanded', String(open));
    if (!open && restoreFocus) mobileMenuButton?.focus({ preventScroll: true });
  }
  function focusHeading() {
    const view = document.getElementById(route?.view || 'portfolio');
    const heading = view?.querySelector('h1, h2');
    if (!heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
  function scrollForRoute(previous, reason) {
    if (reason === 'initial') return;
    const behavior = motion ? 'smooth' : 'instant';
    if (reason === 'page' || (reason === 'history' && previous?.view === 'portfolio' && route.view === 'portfolio')) {
      const target = document.querySelector('#portfolio .archive-heading, #portfolio .section-heading') || document.getElementById('works-title') || grid;
      target?.scrollIntoView({ behavior, block: 'start' });
    } else {
      window.scrollTo({ top: 0, behavior });
    }
  }
  function applyRoute(next, reason = 'navigation') {
    const previous = route;
    if (routeKey(next) === routeKey(previous) && reason !== 'initial') {
      setWorksMenu(false);
      setMobileMenu(false);
      if (reason === 'navigation') scrollForRoute(previous, reason);
      return;
    }
    const viewChanged = previous?.view !== next.view;
    const focusWillHide = (viewChanged && !!document.activeElement?.closest('.page-view')) ||
      (navLinks?.classList.contains('open') && navLinks.contains(document.activeElement));
    if (dialog?.open) closeDialog();
    clearTimeout(sceneTimeout);
    route = next;
    views.forEach(view => { view.hidden = view.id !== route.view; });
    document.querySelectorAll('a[data-view]').forEach(link => {
      const name = link.dataset.view || link.getAttribute('href')?.slice(1);
      const selected = name === route.view;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-category]').forEach(button => {
      const selected = button.dataset.category === route.category;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-menu-category]').forEach(button => {
      const selected = route.view === 'portfolio' && button.dataset.menuCategory === route.category;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.querySelectorAll('[data-device]').forEach(button => {
      button.classList.toggle('selected', route.view === 'portfolio' && button.dataset.device === route.category);
    });
    if (route.view === 'portfolio') {
      activeWorks = categoryWorks(route.category);
      renderCards();
      renderPagination();
    } else {
      stopHover();
    }
    setWorksMenu(false);
    setMobileMenu(false);
    viewAnimation?.cancel();
    if (viewChanged && motion) {
      const view = document.getElementById(route.view);
      if (view?.animate) viewAnimation = view.animate(
        [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 360, easing: 'cubic-bezier(.2,.7,.2,1)' }
      );
    }
    window.STUDIO?.setMotion(motion && route.view === 'home');
    if (viewChanged) requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    scrollForRoute(previous, reason);
    if (reason === 'page') pagination?.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    else if (focusWillHide) focusHeading();
  }
  function navigate(next, reason = 'navigation') {
    const normalized = normalizeRoute(next);
    const hash = routeHash(normalized);
    if (location.hash !== hash) history.pushState(null, '', hash);
    applyRoute(normalized, reason);
  }
  function onHistory() {
    const next = readRoute();
    if (location.hash !== routeHash(next)) history.replaceState(null, '', routeHash(next));
    applyRoute(next, 'history');
  }
  window.addEventListener('popstate', onHistory);
  window.addEventListener('hashchange', onHistory);

  function writeHover(state) {
    state.node.style.setProperty('--tilt-x', state.x.toFixed(3) + 'deg');
    state.node.style.setProperty('--tilt-y', state.y.toFixed(3) + 'deg');
    state.node.style.setProperty('--light-x', state.lightX.toFixed(2) + '%');
    state.node.style.setProperty('--light-y', state.lightY.toFixed(2) + '%');
    state.node.style.setProperty('--proximity', state.proximity.toFixed(3));
  }
  function animateHover(time) {
    hoverFrame = 0;
    const delta = Math.min((time - lastHoverTime) / 16.667 || 1, 2);
    lastHoverTime = time;
    let moving = false;
    for (const [node, state] of hoverStates) {
      if (!node.isConnected) { hoverStates.delete(node); continue; }
      const blend = 1 - Math.pow(0.77, delta);
      state.x += (state.targetX - state.x) * blend;
      state.y += (state.targetY - state.y) * blend;
      state.lightX += (state.targetLightX - state.lightX) * blend;
      state.lightY += (state.targetLightY - state.lightY) * blend;
      state.proximity += (state.targetProximity - state.proximity) * blend;
      const unsettled = Math.abs(state.targetX - state.x) + Math.abs(state.targetY - state.y) +
        Math.abs(state.targetLightX - state.lightX) + Math.abs(state.targetLightY - state.lightY) +
        Math.abs(state.targetProximity - state.proximity) > 0.025;
      if (!unsettled) {
        state.x = state.targetX; state.y = state.targetY;
        state.lightX = state.targetLightX; state.lightY = state.targetLightY;
        state.proximity = state.targetProximity;
      }
      writeHover(state);
      moving ||= unsettled;
    }
    if (!pointerGlow.hidden) {
      const blend = 1 - Math.pow(0.74, delta);
      pointer.x += (pointer.targetX - pointer.x) * blend;
      pointer.y += (pointer.targetY - pointer.y) * blend;
      document.documentElement.style.setProperty('--pointer-x', pointer.x.toFixed(2) + 'px');
      document.documentElement.style.setProperty('--pointer-y', pointer.y.toFixed(2) + 'px');
      moving ||= Math.abs(pointer.targetX - pointer.x) + Math.abs(pointer.targetY - pointer.y) > 0.1;
    }
    if (moving && motion) hoverFrame = requestAnimationFrame(animateHover);
  }
  function queueHover() {
    if (!motion || hoverFrame) return;
    lastHoverTime = performance.now();
    hoverFrame = requestAnimationFrame(animateHover);
  }
  function resetHover(state) {
    state.targetX = state.targetY = 0;
    state.targetLightX = state.targetLightY = 50;
    state.targetProximity = 0;
    queueHover();
  }
  function stopHover() {
    cancelAnimationFrame(hoverFrame);
    hoverFrame = 0;
    pointerGlow.hidden = true;
    pointer.started = false;
    for (const state of hoverStates.values()) {
      state.x = state.y = state.targetX = state.targetY = 0;
      state.lightX = state.lightY = state.targetLightX = state.targetLightY = 50;
      state.proximity = state.targetProximity = 0;
      writeHover(state);
    }
  }
  function attachHover(button) {
    const state = { node: button, x: 0, y: 0, targetX: 0, targetY: 0, lightX: 50, lightY: 50, targetLightX: 50, targetLightY: 50, proximity: 0, targetProximity: 0 };
    hoverStates.set(button, state);
    button.addEventListener('focus', () => {
      if (!motion || !button.matches(':focus-visible')) return;
      state.targetLightX = 48;
      state.targetLightY = 36;
      state.targetProximity = 1;
      queueHover();
    });
    button.addEventListener('blur', () => resetHover(state));
  }
  document.addEventListener('pointermove', event => {
    if (!motion || !finePointer.matches || event.pointerType === 'touch' || dialog?.open) return;
    pointer.targetX = event.clientX;
    pointer.targetY = event.clientY;
    if (!pointer.started) {
      pointer.x = pointer.targetX; pointer.y = pointer.targetY; pointer.started = true;
    }
    pointerGlow.hidden = false;
    if (route?.view === 'portfolio') {
      for (const state of hoverStates.values()) {
        // Read the untransformed article so the card's own tilt cannot feed back into the pointer position.
        const rect = state.node.parentElement.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) { resetHover(state); continue; }
        const dx = Math.max(rect.left - event.clientX, 0, event.clientX - rect.right);
        const dy = Math.max(rect.top - event.clientY, 0, event.clientY - rect.bottom);
        const influence = Math.max(0, 1 - Math.hypot(dx, dy) / 150);
        const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
        state.targetX = (x - 0.5) * 7 * influence;
        state.targetY = (0.5 - y) * 7 * influence;
        state.targetLightX = influence ? x * 100 : 50;
        state.targetLightY = influence ? y * 100 : 50;
        state.targetProximity = influence;
      }
    }
    queueHover();
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', stopHover);
  window.addEventListener('blur', stopHover);
  function buildCard(work, index) {
    const article = el('article', 'work-card' + (work.portrait ? ' work-card-portrait' : ''));
    article.style.setProperty('--index', index % pageSize);
    const button = el('button', 'work-button');
    button.type = 'button';
    button.setAttribute('aria-label', '查看作品：' + work.title);
    button.setAttribute('aria-haspopup', 'dialog');
    button.dataset.workId = work.id;
    const media = el('div', 'work-image');
    const image = el('img');
    image.src = work.thumb;
    image.alt = work.title + ' · 作品封面';
    image.loading = index % pageSize < 3 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.width = work.portrait ? 1080 : 640;
    image.height = work.portrait ? 1440 : 360;
    media.append(image, el('span', 'play-badge', '▶'));
    if (newIds.includes(work.id)) media.append(el('span', 'new-badge', 'NEW'));
    const info = el('div', 'work-info');
    const tags = el('div', 'work-tags');
    tags.append(el('span', 'category-badge', categories[work.category] || work.category));
    info.append(el('h3', 'work-title', work.title), el('p', 'work-description', work.desc), tags);
    button.append(media, info);
    article.append(button);
    button.addEventListener('click', () => openWork(work.id, activeWorks, button));
    attachHover(button);
    return article;
  }
  function renderCards() {
    if (!grid) return;
    stopHover();
    hoverStates.clear();
    const start = (route.page - 1) * pageSize;
    const fragment = document.createDocumentFragment();
    activeWorks.slice(start, start + pageSize).forEach((work, index) => fragment.append(buildCard(work, start + index)));
    grid.replaceChildren(fragment);
    grid.classList.toggle('has-portrait-cards', !!grid.querySelector('.work-card-portrait'));
    const first = activeWorks.length ? start + 1 : 0;
    const end = Math.min(start + pageSize, activeWorks.length);
    setText('work-count', String(first).padStart(2, '0') + '–' + String(end).padStart(2, '0') + ' / ' + activeWorks.length);
  }
  function renderPagination() {
    if (!pagination) return;
    pagination.replaceChildren();
    const pages = Math.max(1, Math.ceil(activeWorks.length / pageSize));
    const add = (text, page, label, disabled = false) => {
      const button = el('button', 'page-button', text);
      button.type = 'button';
      button.dataset.page = page;
      button.setAttribute('aria-label', label);
      button.disabled = disabled;
      if (!/^\d+$/.test(text)) button.classList.add('pagination-arrow');
      if (page === route.page && /^\d+$/.test(text)) {
        button.classList.add('active');
        button.setAttribute('aria-current', 'page');
      }
      pagination.append(button);
    };
    add('←', route.page - 1, '上一页', route.page === 1);
    for (let page = 1; page <= pages; page++) add(String(page), page, '第 ' + page + ' 页');
    add('→', route.page + 1, '下一页', route.page === pages);
  }
  pagination?.addEventListener('click', event => {
    const button = event.target.closest('button[data-page]');
    if (!button || button.disabled) return;
    navigate({ ...route, page: button.dataset.page }, 'page');
    clickSound();
  });
  document.querySelectorAll('[data-category]').forEach(button => {
    const key = button.dataset.category;
    const count = validCategory(key) ? categoryWorks(key).length : 0;
    const small = button.querySelector('small');
    if (small) small.textContent = String(count).padStart(2, '0');
    button.addEventListener('click', () => {
      navigate({ view: 'portfolio', category: key, page: 1 }, 'category');
      clickSound();
    });
  });
  document.querySelectorAll('[data-menu-category]').forEach(button => {
    button.addEventListener('click', () => {
      navigate({ view: 'portfolio', category: button.dataset.menuCategory, page: 1 });
      focusHeading();
      clickSound();
    });
  });
  document.querySelectorAll('a[data-view]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate({ view: link.dataset.view || link.getAttribute('href')?.slice(1), category: 'all', page: 1 });
    });
  });
  worksMenuButton?.addEventListener('click', () => {
    const open = menuOpenedByHover || worksMenu?.hidden !== false;
    menuOpenedByHover = false;
    setWorksMenu(open);
  });
  const worksNav = worksMenuButton?.closest('.works-nav');
  worksNav?.addEventListener('pointerenter', event => {
    if (!finePointer.matches || event.pointerType === 'touch') return;
    clearTimeout(menuCloseTimeout);
    if (worksMenu?.hidden) { setWorksMenu(true); menuOpenedByHover = true; }
  });
  worksNav?.addEventListener('pointerleave', event => {
    if (!finePointer.matches || event.pointerType === 'touch') return;
    menuCloseTimeout = setTimeout(() => {
      const keyboardInside = worksNav.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
      if (!keyboardInside) setWorksMenu(false);
    }, 200);
  });
  worksMenuButton?.addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault();
    setWorksMenu(true);
    worksMenu?.querySelector('button')?.focus();
  });
  worksMenu?.addEventListener('keydown', event => {
    const buttons = [...worksMenu.querySelectorAll('button')];
    const current = buttons.indexOf(document.activeElement);
    if (!buttons.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].focus();
  });
  mobileMenuButton?.addEventListener('click', () => setMobileMenu(!navLinks?.classList.contains('open')));
  document.addEventListener('pointerdown', event => {
    if (!worksMenu?.contains(event.target) && !worksMenuButton?.contains(event.target)) setWorksMenu(false);
    if (!navLinks?.contains(event.target) && !mobileMenuButton?.contains(event.target)) setMobileMenu(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || dialog?.open) return;
    if (worksMenu && !worksMenu.hidden) setWorksMenu(false, true);
    else if (navLinks?.classList.contains('open')) setMobileMenu(false, true);
  });

  function openWork(id, list, trigger) {
    if (!dialog) return;
    const index = list.findIndex(work => work.id === id);
    if (index < 0) return;
    dialogWorks = list.slice();
    dialogIndex = index;
    opener = trigger || document.activeElement;
    showDialogWork();
    if (!dialog.open) {
      dialog.showModal();
      document.body.classList.add('modal-open');
    }
    clickSound('play');
  }
  function showDialogWork() {
    const work = dialogWorks[dialogIndex];
    const media = document.getElementById('dialog-media');
    if (!work || !media) return;
    const restoreMediaFocus = media.contains(document.activeElement);
    clearDialogMedia();
    setText('dialog-title', work.title);
    setText('dialog-description', work.desc);
    setText('dialog-label', 'video / ' + categories[work.category]);
    setText('dialog-position', String(dialogIndex + 1).padStart(2, '0') + ' / ' + String(dialogWorks.length).padStart(2, '0'));
    const source = document.getElementById('dialog-source');
    if (source) {
      source.href = work.url;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = work.type === 'bilibili' ? '前往 Bilibili 观看 ↗' : '前往原站观看 ↗';
    }
    const preview = el('div', 'dialog-preview' + (work.portrait ? ' dialog-preview-portrait' : ''));
    const image = el('img');
    image.src = work.thumb;
    image.alt = work.title;
    preview.append(image);
    if (work.bvid || work.videoSrc) {
      const play = el('button', '', '▶ 播放影片');
      play.type = 'button';
      play.addEventListener('click', () => playVideo(work));
      preview.append(play);
      image.addEventListener('click', () => playVideo(work));
    }
    media.append(preview);
    dialog.scrollTop = 0;
    if (restoreMediaFocus) (media.querySelector('button') || document.getElementById('dialog-close'))?.focus({ preventScroll: true });
  }
  function playVideo(work) {
    const media = document.getElementById('dialog-media');
    if (!media) return;
    if (work.videoSrc) {
      clearDialogMedia();
      const wrap = el('div', 'native-player-wrap' + (work.videoHeight > work.videoWidth ? ' native-player-portrait' : ''));
      const video = el('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.poster = work.thumb;
      video.src = work.videoSrc;
      video.setAttribute('aria-label', work.title + ' · 视频播放器');
      const error = el('div', 'native-player-error');
      error.hidden = true;
      error.setAttribute('role', 'status');
      const retry = el('button', 'button button-paper', '重新加载');
      retry.type = 'button';
      error.append(el('p', '', '视频加载失败，请重试。'), retry);
      video.addEventListener('error', () => { error.hidden = false; });
      retry.addEventListener('click', () => { error.hidden = true; video.load(); video.play().catch(() => {}); });
      wrap.append(video);
      media.replaceChildren(wrap, error);
      video.play().catch(() => { /* Native controls remain available when autoplay is declined. */ });
      video.focus({ preventScroll: true });
      clickSound('play');
      return;
    }
    if (!work.bvid) return;
    const parts = work.bvid.split('?');
    let urlPage = '';
    try { urlPage = new URL(work.url, location.href).searchParams.get('p'); } catch (_) { /* The BVID still supplies a playable address. */ }
    const requestedPage = urlPage || new URLSearchParams(parts[1] || '').get('p') || '1';
    const page = /^\d+$/.test(requestedPage) && Number(requestedPage) > 0 ? requestedPage : '1';
    const params = new URLSearchParams({ bvid: parts[0], page, autoplay: '1', high_quality: '1' });
    const wrap = el('div', 'player-wrap');
    const iframe = el('iframe');
    iframe.title = work.title + ' · Bilibili 播放器';
    iframe.src = 'https://player.bilibili.com/player.html?' + params;
    iframe.allow = 'autoplay; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    wrap.append(iframe);
    media.replaceChildren(wrap, el('p', 'player-hint', '如播放器受平台限制，请使用下方「前往 Bilibili 观看」。'));
    document.getElementById('dialog-close')?.focus({ preventScroll: true });
    clickSound('play');
  }
  function clearDialogMedia() {
    const media = document.getElementById('dialog-media');
    media?.querySelectorAll('video').forEach(video => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
    media?.replaceChildren();
  }
  function closeDialog() {
    clearDialogMedia();
    if (dialog?.open) dialog.close();
    document.body.classList.remove('modal-open');
  }
  dialog?.addEventListener('close', () => {
    clearDialogMedia();
    document.body.classList.remove('modal-open');
    const hiddenView = opener?.closest('.page-view')?.hidden;
    if (opener?.isConnected && !hiddenView) opener.focus({ preventScroll: true });
    else focusHeading();
  });
  document.getElementById('dialog-close')?.addEventListener('click', closeDialog);
  dialog?.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
  });
  function navigateDialog(delta) {
    if (!dialogWorks.length) return;
    dialogIndex = (dialogIndex + delta + dialogWorks.length) % dialogWorks.length;
    showDialogWork();
    clickSound();
  }
  document.getElementById('dialog-prev')?.addEventListener('click', () => navigateDialog(-1));
  document.getElementById('dialog-next')?.addEventListener('click', () => navigateDialog(1));
  dialog?.addEventListener('keydown', event => {
    if (event.target.closest('video')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      navigateDialog(event.key === 'ArrowLeft' ? -1 : 1);
    }
  });
  document.getElementById('showreel-trigger')?.addEventListener('click', event => {
    const reels = allWorks.filter(work => work.category === 'showreel').slice().reverse();
    if (reels.length) openWork(reels[0].id, reels, event.currentTarget);
  });

  function scenePick(category) {
    if (!validCategory(category)) return;
    clearTimeout(sceneTimeout);
    clickSound();
    sceneTimeout = setTimeout(() => navigate({ view: 'portfolio', category, page: 1 }), motion ? 400 : 0);
  }
  document.querySelectorAll('[data-device]').forEach(button => {
    button.addEventListener('click', () => {
      window.STUDIO?.select(button.dataset.device);
      scenePick(button.dataset.device);
    });
  });
  window.addEventListener('studio-select', event => scenePick(event.detail?.category));
  function applyMotion() {
    document.body.classList.toggle('motion-off', !motion);
    document.documentElement.classList.toggle('motion-off', !motion);
    const button = document.getElementById('motion-toggle');
    button?.setAttribute('aria-pressed', String(motion));
    if (button) button.textContent = '动态 ' + (motion ? 'ON' : 'OFF');
    if (!motion) { stopHover(); viewAnimation?.cancel(); }
    window.STUDIO?.setMotion(motion && route?.view === 'home');
  }
  document.getElementById('motion-toggle')?.addEventListener('click', () => { motion = !motion; applyMotion(); });
  reducedMotion.addEventListener('change', event => { motion = !event.matches; applyMotion(); });
  finePointer.addEventListener('change', () => { if (!finePointer.matches) stopHover(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopHover(); });

  function updateSound() {
    const button = document.getElementById('sound-toggle');
    if (button) button.textContent = '声音 ' + (sound ? 'ON' : 'OFF');
    button?.setAttribute('aria-pressed', String(sound));
  }
  function clickSound(kind) {
    if (!sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      const now = audioContext.currentTime;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(kind === 'play' ? 660 : 240, now);
      oscillator.frequency.exponentialRampToValueAtTime(90, now + 0.065);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.1);
    } catch (_) { sound = false; updateSound(); }
  }
  document.getElementById('sound-toggle')?.addEventListener('click', () => { sound = !sound; updateSound(); clickSound(); });
  function toast(message) {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => node.classList.remove('visible'), 2800);
  }
  function fallbackCopy(text) {
    const field = el('textarea');
    field.value = text;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    field.setSelectionRange(0, text.length);
    let copied = false;
    try { copied = document.execCommand('copy'); } finally { field.remove(); }
    return copied;
  }
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(button.dataset.copy); copied = true; } catch (_) { /* Local or denied contexts can use the selection fallback. */ }
    }
    if (!copied) { try { copied = fallbackCopy(button.dataset.copy); } catch (_) { /* Keep the visible contact available. */ } }
    button.focus({ preventScroll: true });
    toast(copied ? '已复制微信号：' + button.dataset.copy : '微信号：' + button.dataset.copy);
  }));
  function updateHeader() { document.getElementById('top')?.classList.toggle('scrolled', window.scrollY > 16); }
  window.addEventListener('scroll', updateHeader, { passive: true });
  setText('archive-total', allWorks.length);
  updateHeader();
  updateSound();
  const initial = readRoute();
  if (location.hash !== routeHash(initial)) history.replaceState(null, '', routeHash(initial));
  applyRoute(initial, 'initial');
  applyMotion();
  if (location.protocol !== 'file:') window.STUDIO?.setCover('assets/duplex-lens.jpg');
})();
