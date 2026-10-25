(function () {
  const body = document.body;
  const scriptEl = document.currentScript || document.querySelector('script[data-page]');
  const page = (scriptEl && scriptEl.dataset.page) || (body && body.dataset.page) || '';

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
  }

  function initLoginPage() {
    const form = document.getElementById('loginForm');
    const message = document.getElementById('loginMessage');
    if (!form) return;

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const user = document.getElementById('user');
      const pass = document.getElementById('pass');
      const btn = document.getElementById('btnLogin');
      if (!user || !pass || !btn) return;

      btn.disabled = true;
      if (message) message.textContent = '';
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user.value.trim(), password: pass.value })
        });
        if (!response.ok) {
          if (message) message.textContent = response.status === 429
            ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
            : 'Usuário ou senha incorretos.';
          return;
        }
        window.location.href = 'admin2.html';
      } catch (error) {
        if (message) message.textContent = 'Não foi possível conectar ao servidor.';
        console.error('Falha ao conectar ao serviço de autenticação:', error);
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function logout() {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (error) {
      console.error('Falha ao encerrar a sessão:', error);
    }
    window.location.href = 'admin.html';
  }

  function initAdminDashboard() {
    const accountsSection = document.getElementById('adminAccounts');
    const slotsContainer = document.getElementById('adminSlots');
    const message = document.getElementById('adminAccountsMessage');
    const logoutButton = document.getElementById('btnLogout');

    if (logoutButton) logoutButton.addEventListener('click', logout);

    fetch('/api/session')
      .then(function (response) {
        if (!response.ok) {
          window.location.href = 'admin.html';
          return null;
        }
        return response.json();
      })
      .then(function (session) {
        if (!session || !session.isMaster || !accountsSection || !slotsContainer) return;
        accountsSection.hidden = false;
        return loadAdminSlots(slotsContainer, message);
      })
      .catch(function (error) {
        console.error('Falha ao verificar a sessão administrativa:', error);
        window.location.href = 'admin.html';
      });
  }

  async function loadAdminSlots(container, message) {
    const response = await fetch('/api/admins');
    if (!response.ok) throw new Error('Não foi possível carregar as contas administrativas.');
    const result = await response.json();
    container.replaceChildren();

    result.administrators.forEach(function (admin) {
      const form = document.createElement('form');
      form.className = 'admin-slot';
      form.dataset.slot = String(admin.slot);

      const title = document.createElement('h3');
      title.textContent = 'Administrador ' + admin.slot + (admin.configured ? ' (configurado)' : ' (disponível)');

      const usernameLabel = document.createElement('label');
      usernameLabel.textContent = 'Usuário';
      const username = document.createElement('input');
      username.name = 'username';
      username.autocomplete = 'off';
      username.required = true;
      username.minLength = 3;
      username.maxLength = 32;
      username.pattern = '[A-Za-z0-9._-]{3,32}';
      username.title = 'Use de 3 a 32 letras, números, ponto, hífen ou sublinhado.';
      username.value = admin.username || '';
      usernameLabel.appendChild(username);

      const passwordLabel = document.createElement('label');
      passwordLabel.textContent = admin.configured ? 'Nova senha (opcional)' : 'Senha (mínimo 12 caracteres)';
      const password = document.createElement('input');
      password.type = 'password';
      password.name = 'password';
      password.autocomplete = 'new-password';
      password.minLength = 12;
      password.required = !admin.configured;
      passwordLabel.appendChild(password);

      const save = document.createElement('button');
      save.type = 'submit';
      save.className = 'btn btn-green';
      save.textContent = admin.configured ? 'Salvar alterações' : 'Definir administrador';

      form.append(title, usernameLabel, passwordLabel, save);
      if (admin.configured) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-gray';
        remove.textContent = 'Remover conta';
        remove.addEventListener('click', function () {
          removeAdminSlot(admin.slot, container, message);
        });
        form.appendChild(remove);
      }

      form.addEventListener('submit', function (event) {
        saveAdminSlot(event, admin.slot, username, password, save, container, message);
      });
      container.appendChild(form);
    });
  }

  async function saveAdminSlot(event, slot, username, password, button, container, message) {
    event.preventDefault();
    button.disabled = true;
    if (message) message.textContent = '';
    try {
      const response = await fetch('/api/admins/' + slot, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.value.trim(), password: password.value })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a conta.');
      if (message) message.textContent = 'Conta administrativa salva.';
      await loadAdminSlots(container, message);
    } catch (error) {
      if (message) message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }

  async function removeAdminSlot(slot, container, message) {
    if (!window.confirm('Remover esta conta administrativa?')) return;
    if (message) message.textContent = '';
    try {
      const response = await fetch('/api/admins/' + slot, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível remover a conta.');
      if (message) message.textContent = 'Conta removida; o espaço está disponível novamente.';
      await loadAdminSlots(container, message);
    } catch (error) {
      if (message) message.textContent = error.message;
    }
  }

  function initCollectionPage(storageKey, fallbackImage) {
    const container = document.getElementById(storageKey + 'Container');
    const main = document.getElementById('eventosContainer') || document.getElementById('trilhasContainer') || document.getElementById('cachoeirasContainer');
    if (!container && !main) return;

    function carregar() {
      const target = container || main;
      const items = JSON.parse(localStorage.getItem(storageKey) || '[]');
      target.innerHTML = '';

      if (!items.length) {
        target.innerHTML = '<p style="text-align:center;color:#555;padding:36px;background:#fff;border-radius:8px">Nenhum item disponível no momento.</p>';
        return;
      }

      items.forEach(function (item) {
        const block = document.createElement('div');
        block.className = 'event-block';
        const mapa = item.mapa || '';
        const urlExterna = item.urlExterna || '';

        block.innerHTML = [
          '<img src="' + (item.imagem || fallbackImage) + '" class="event-banner" onerror="this.style.display=\'none\'">',
          '<div class="event-card">',
          '<h2>' + escapeHtml(item.titulo) + '</h2>',
          '<p>' + escapeHtml(item.descricao) + '</p>',
          mapa ? '<iframe src="' + mapa + '" loading="lazy"></iframe>' : '',
          (!mapa && urlExterna) ? '<p><a href="' + urlExterna + '" target="_blank" rel="noopener">Abrir local em nova aba</a></p>' : '',
          '</div>'
        ].join('');

        target.appendChild(block);
      });
    }

    document.addEventListener('DOMContentLoaded', carregar);
  }

  function initAdminPage(storageKey, fallbackImage) {
    fetch('/api/session').then(function (response) {
      if (!response.ok) window.location.href = 'admin.html';
    }).catch(function (error) {
      console.error('Falha ao verificar a sessão administrativa:', error);
      window.location.href = 'admin.html';
    });

    const fileInput = document.getElementById('file');
    const imgPreview = document.getElementById('imgPreview');
    const iframePreview = document.getElementById('iframePreview');
    const titleEl = document.getElementById('title');
    const descEl = document.getElementById('description');
    const urlEl = document.getElementById('url');
    const createBtn = document.getElementById('createBtn');
    const saveBtn = document.getElementById('saveBtn');
    const clearBtn = document.getElementById('clearBtn');
    const btnLogout = document.getElementById('btnLogout');
    const eventsGrid = document.getElementById('eventsGrid');

    if (!fileInput || !eventsGrid || !titleEl || !descEl || !urlEl || !createBtn || !saveBtn || !clearBtn) return;

    var items = JSON.parse(localStorage.getItem(storageKey) || '[]');
    var editIndex = -1;

    function dataURLFromFile(file, cb) {
      const reader = new FileReader();
      reader.onload = function (event) {
        cb(event.target.result);
      };
      reader.readAsDataURL(file);
    }

    function saveItems() {
      localStorage.setItem(storageKey, JSON.stringify(items));
    }

    function findMapSource(value) {
      const clean = (value || '').trim();
      if (!clean) return '';
      const match = clean.match(/src=["']([^"']+)["']/i);
      return match ? match[1] : clean;
    }

    function clearForm() {
      fileInput.value = '';
      if (imgPreview) {
        imgPreview.src = '';
        imgPreview.style.display = 'none';
      }
      if (iframePreview) {
        iframePreview.src = '';
        iframePreview.style.display = 'none';
      }
      titleEl.value = '';
      descEl.value = '';
      urlEl.value = '';
    }

    function resetEdit() {
      editIndex = -1;
      createBtn.style.display = 'inline-block';
      saveBtn.style.display = 'none';
    }

    function render() {
      eventsGrid.innerHTML = '';
      if (!items.length) {
        eventsGrid.innerHTML = '<div style="grid-column:1/-1;padding:18px;background:#fff;border-radius:8px;border:1px solid #eee;color:#555">Nenhum item cadastrado.</div>';
        return;
      }

      items.forEach(function (item, idx) {
        const wrap = document.createElement('div');
        wrap.className = 'event-block';
        const mapa = item.mapa || '';
        const urlExterna = item.urlExterna || '';

        wrap.innerHTML = [
          '<img src="' + (item.imagem || fallbackImage) + '" class="event-banner" onerror="this.style.display=\'none\'">',
          '<div class="event-card">',
          '<h2>' + escapeHtml(item.titulo) + '</h2>',
          '<p>' + escapeHtml(item.descricao) + '</p>',
          mapa ? '<iframe src="' + mapa + '" style="width:100%;height:160px;border:none;border-radius:8px;margin-top:10px"></iframe>' : '',
          '<div class="card-actions">',
          '<button class="btn btn-blue" onclick="editar(' + idx + ')">Editar</button>',
          '<button class="btn btn-gray" style="background:#c82333;color:#fff" onclick="remover(' + idx + ')">Excluir</button>',
          urlExterna ? '<a class="btn btn-blue" href="' + urlExterna + '" target="_blank" style="text-decoration:none;padding:8px 10px;border-radius:8px">Abrir local</a>' : '',
          '</div>',
          '</div>'
        ].join('');
        eventsGrid.appendChild(wrap);
      });
    }

    fileInput.addEventListener('change', function (event) {
      const file = event.target.files[0];
      if (!file) {
        if (imgPreview) {
          imgPreview.style.display = 'none';
          imgPreview.src = '';
        }
        return;
      }
      dataURLFromFile(file, function (dataUrl) {
        if (imgPreview) {
          imgPreview.src = dataUrl;
          imgPreview.style.display = 'block';
        }
      });
    });

    urlEl.addEventListener('input', function () {
      const v = urlEl.value.trim();
      if (!v) {
        if (iframePreview) {
          iframePreview.style.display = 'none';
          iframePreview.src = '';
        }
        return;
      }
      const src = findMapSource(v);
      if (iframePreview) {
        iframePreview.src = src;
        iframePreview.style.display = 'block';
      }
    });

    createBtn.addEventListener('click', function () {
      const titulo = titleEl.value.trim();
      const descricao = descEl.value.trim();
      const raw = urlEl.value.trim();
      if (!titulo || !descricao) {
        alert('Preencha título e descrição.');
        return;
      }

      const mapaSrc = findMapSource(raw);
      const file = fileInput.files[0];

      function applyCreate(imageValue) {
        items.unshift({
          imagem: imageValue,
          titulo: titulo,
          descricao: descricao,
          mapa: mapaSrc || '',
          urlExterna: (!raw.match(/src=["']([^"']+)["']/i) && raw) ? raw : ''
        });
        saveItems();
        render();
        clearForm();
      }

      if (file) {
        dataURLFromFile(file, applyCreate);
      } else {
        applyCreate(imgPreview && imgPreview.src ? imgPreview.src : fallbackImage);
      }
    });

    function editar(i) {
      editIndex = i;
      const item = items[i];
      if (!item) return;

      if (imgPreview) {
        imgPreview.src = item.imagem || '';
        imgPreview.style.display = item.imagem ? 'block' : 'none';
      }
      titleEl.value = item.titulo || '';
      descEl.value = item.descricao || '';
      urlEl.value = item.mapa || item.urlExterna || '';

      if (iframePreview) {
        iframePreview.src = item.mapa || '';
        iframePreview.style.display = item.mapa ? 'block' : 'none';
      }

      createBtn.style.display = 'none';
      saveBtn.style.display = 'inline-block';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    window.editar = editar;

    saveBtn.addEventListener('click', function () {
      if (editIndex === -1) return;
      const titulo = titleEl.value.trim();
      const descricao = descEl.value.trim();
      const raw = urlEl.value.trim();
      if (!titulo || !descricao) {
        alert('Preencha título e descrição.');
        return;
      }

      const mapaSrc = findMapSource(raw);
      const file = fileInput.files[0];

      function applySave(imageValue) {
        items[editIndex] = {
          imagem: imageValue || items[editIndex].imagem || '',
          titulo: titulo,
          descricao: descricao,
          mapa: mapaSrc || '',
          urlExterna: (!raw.match(/src=["']([^"']+)["']/i) && raw) ? raw : ''
        };
        saveItems();
        render();
        clearForm();
        resetEdit();
      }

      if (file) {
        dataURLFromFile(file, applySave);
      } else {
        applySave(imgPreview && imgPreview.src ? imgPreview.src : items[editIndex].imagem || fallbackImage);
      }
    });

    window.remover = function (idx) {
      if (!confirm('Excluir item?')) return;
      items.splice(idx, 1);
      saveItems();
      render();
    };

    clearBtn.addEventListener('click', clearForm);
    if (btnLogout) {
      btnLogout.addEventListener('click', logout);
    }

    render();
    resetEdit();
  }

  switch (page) {
    case 'admin':
      initLoginPage();
      break;
    case 'admin2':
      initAdminDashboard();
      break;
    case 'trilhas':
      initCollectionPage('trilhas', 'trilhas/img2.jpg');
      break;
    case 'cachoeiras':
      initCollectionPage('cachoeiras', 'cachoeiras/img2.jpg');
      break;
    case 'eventos':
      initCollectionPage('eventos', 'eventos/img2.jpg');
      break;
    case 'trilhas-admin':
      initAdminPage('trilhas', 'trilhas/img2.jpg');
      break;
    case 'cachoeiras-admin':
      initAdminPage('cachoeiras', 'cachoeiras/img2.jpg');
      break;
    case 'eventos-admin':
      initAdminPage('eventos', 'eventos/img2.jpg');
      break;
    default:
      break;
  }
})();
