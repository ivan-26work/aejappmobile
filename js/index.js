// ===== index.js =====
// Version optimisée - Mobile First avec scroll horizontal

(function() {
  const SUPABASE_URL = 'https://lnwrwvwunwsqeuluupis.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxud3J3dnd1bndzcWV1bHV1cGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2ODYsImV4cCI6MjA4OTM0MTY4Nn0.gfnPMtR3mNBFMTo3GtZ9t1A9_8gxEHY4loLgLdLJxLs';

  let supabase = null;
  let currentUser = null;
  let allDownloads = [];
  let filteredDownloads = [];
  let selectedDates = new Set();
  let searchTimeout = null;

  // DOM Elements
  const loadingOverlay = document.getElementById('loadingOverlay');
  const searchInput = document.getElementById('searchInput');
  const refreshBtn = document.getElementById('refreshBtn');
  const statTotal = document.getElementById('statTotal');
  const statStagiaires = document.getElementById('statStagiaires');
  const statMois = document.getElementById('statMois');
  const filtersRow = document.getElementById('filtersRow');
  const downloadsContainer = document.getElementById('downloadsContainer');
  const detailsOverlay = document.getElementById('detailsOverlay');
  const closeDetailsOverlay = document.getElementById('closeDetailsOverlay');
  const detailsContent = document.getElementById('detailsContent');
  const logoutBtn = document.getElementById('logoutBtn');

  // ========== INITIALISATION ==========
  async function init() {
    try {
      loadingOverlay?.classList.remove('hidden');
      await initSupabase();
      const ok = await checkSession();
      if (!ok) return;
      await loadData();
      setupEvents();
      // Demander les notifications après connexion
      setTimeout(() => requestNotificationPermission(), 2000);
    } catch (e) {
      console.error(e);
      window.location.href = '/aejappmobile/auth.html';
    } finally {
      setTimeout(() => loadingOverlay?.classList.add('hidden'), 500);
    }
  }

  async function initSupabase() {
    if (window.supabase?.createClient) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      await new Promise(r => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        s.onload = r;
        document.head.appendChild(s);
      });
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  async function checkSession() {
    try {
      // Timeout rapide de 3 secondes
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000));
      const getUser = supabase.auth.getUser();
      const { data: { user } } = await Promise.race([getUser, timeout]);
      
      if (!user) {
        window.location.href = '/aejappmobile/auth.html';
        return false;
      }
      currentUser = user;
      return true;
    } catch (e) {
      console.error('Session error:', e);
      window.location.href = '/aejappmobile/auth.html';
      return false;
    }
  }

  // ========== NOTIFICATIONS ==========
  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('✅ Notifications activées');
      }
    });
  }

  function showNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      new Notification(title, {
        body: body,
        icon: '/aejappmobile/assets/icon-192.png',
        vibrate: [200, 100, 200]
      });
    } catch (e) {
      console.log('Notification error:', e);
    }
  }

  function showBanner(message, type = 'info') {
    const banner = document.createElement('div');
    banner.className = `notif-banner ${type}`;
    banner.innerHTML = `
      <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-bell'}"></i>
      <span>${message}</span>
      <button class="close-banner">&times;</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('.close-banner').onclick = () => banner.remove();
    setTimeout(() => banner.remove(), 3000);
  }

  // ========== CHARGEMENT DES DONNÉES ==========
  async function loadData() {
    await Promise.all([loadStagiaires(), loadDownloads()]);
  }

  async function loadStagiaires() {
    try {
      const { count } = await supabase.from('securite').select('*', { count: 'exact', head: true });
      if (statStagiaires) statStagiaires.textContent = count || 0;
    } catch (e) { if (statStagiaires) statStagiaires.textContent = '0'; }
  }

  async function loadDownloads() {
    try {
      const { data, error } = await supabase
        .from('telechargements')
        .select(`
          id, date_telechargement, categorie, filiere, user_id,
          securite!inner (nom, prenom, matricule, telephone, filiere)
        `)
        .order('date_telechargement', { ascending: false });

      if (error) throw error;

      allDownloads = (data || []).map(item => {
        const s = item.securite;
        const d = new Date(item.date_telechargement);
        const dateKey = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
        return {
          id: item.id,
          date: item.date_telechargement,
          dateKey: dateKey,
          dateFormatted: `${dateKey} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
          nom: s?.nom || '-',
          prenom: s?.prenom || '-',
          matricule: s?.matricule || '-',
          telephone: s?.telephone || '-',
          filiere: item.filiere || s?.filiere || '-',
          categorie: item.categorie || 'Fiche'
        };
      });

      filteredDownloads = [...allDownloads];
      updateStats();
      renderFilters();
      renderDownloads();
      
      // Notification pour les nouveaux (optionnel)
      if (data && data.length > 0 && allDownloads.length > 0) {
        const dernier = allDownloads[0];
        const s = dernier;
        if (s && s.prenom !== '-') {
          showNotification('📥 Nouveau téléchargement', `${s.prenom} ${s.nom} a téléchargé sa fiche`);
        }
      }
    } catch (e) {
      console.error('Load error:', e);
      if (downloadsContainer) {
        downloadsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erreur de chargement</p></div>';
      }
    }
  }

  function updateStats() {
    if (statTotal) statTotal.textContent = allDownloads.length;
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
    const mois = allDownloads.filter(d => new Date(d.date) >= debutMois);
    if (statMois) statMois.textContent = mois.length;
  }

  // ========== FILTRES ==========
  function renderFilters() {
    if (!filtersRow) return;
    const map = new Map();
    allDownloads.forEach(d => {
      if (!map.has(d.dateKey)) map.set(d.dateKey, 0);
      map.set(d.dateKey, map.get(d.dateKey) + 1);
    });
    const dates = Array.from(map.keys()).sort((a,b) => {
      const [da,ma,ya] = a.split('/').map(Number);
      const [db,mb,yb] = b.split('/').map(Number);
      return new Date(yb,mb-1,db) - new Date(ya,ma-1,da);
    });
    filtersRow.innerHTML = dates.map(d => `<div class="filter-pill ${selectedDates.has(d) ? 'active' : ''}" data-date="${d}">${d} (${map.get(d)})</div>`).join('');
    document.querySelectorAll('.filter-pill').forEach(p => {
      p.addEventListener('click', () => {
        const date = p.dataset.date;
        if (selectedDates.has(date)) selectedDates.delete(date);
        else selectedDates.add(date);
        renderFilters();
        applyFilters();
      });
    });
  }

  function applyFilters() {
    let f = [...allDownloads];
    if (selectedDates.size) f = f.filter(d => selectedDates.has(d.dateKey));
    const term = searchInput?.value.toLowerCase().trim();
    if (term) {
      f = f.filter(d => d.nom.toLowerCase().includes(term) || d.prenom.toLowerCase().includes(term) || d.matricule.includes(term));
    }
    filteredDownloads = f;
    renderDownloads();
  }

  // ========== AFFICHAGE SCROLL HORIZONTAL ==========
  function renderDownloads() {
    if (!downloadsContainer) return;
    if (!filteredDownloads.length) {
      downloadsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-download"></i><p>Aucun téléchargement</p></div>';
      return;
    }

    // Grouper par date
    const grouped = new Map();
    filteredDownloads.forEach(d => {
      if (!grouped.has(d.dateKey)) grouped.set(d.dateKey, []);
      grouped.get(d.dateKey).push(d);
    });

    // Trier dates décroissantes
    const sortedDates = Array.from(grouped.keys()).sort((a,b) => {
      const [da,ma,ya] = a.split('/').map(Number);
      const [db,mb,yb] = b.split('/').map(Number);
      return new Date(yb,mb-1,db) - new Date(ya,ma-1,da);
    });

    let html = '';
    sortedDates.forEach(dateKey => {
      const downloads = grouped.get(dateKey);
      html += `
        <div class="date-group">
          <div class="date-header">📁 ${dateKey}</div>
          <div class="horizontal-scroll">
            <div class="cards-row">
      `;
      downloads.forEach(d => {
        html += `
          <div class="download-card" data-id="${d.id}">
            <div class="card-nom">${escapeHtml(d.prenom)} ${escapeHtml(d.nom)}</div>
            <div class="card-matricule">${escapeHtml(d.matricule)}</div>
            <div class="card-phone"><i class="fas fa-phone-alt"></i> ${formatPhone(d.telephone)}</div>
            <div class="card-actions">
              <a href="https://wa.me/${waPhone(d.telephone)}" target="_blank" class="card-action-btn whatsapp" title="WhatsApp">
                <i class="fab fa-whatsapp"></i>
              </a>
              <a href="tel:${callPhone(d.telephone)}" class="card-action-btn call" title="Appeler">
                <i class="fas fa-phone-alt"></i>
              </a>
            </div>
          </div>
        `;
      });
      html += `
            </div>
          </div>
        </div>
      `;
    });
    downloadsContainer.innerHTML = html;

    // Écouteurs de clic
    document.querySelectorAll('.download-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const download = filteredDownloads.find(d => d.id === id);
        if (download) showDetails(download);
      });
      
      // Appui long pour suppression
      let pressTimer;
      card.addEventListener('touchstart', (e) => {
        pressTimer = setTimeout(() => {
          const id = card.dataset.id;
          const download = filteredDownloads.find(d => d.id === id);
          if (download) confirmDelete(download);
        }, 800);
      });
      card.addEventListener('touchend', () => clearTimeout(pressTimer));
      card.addEventListener('touchcancel', () => clearTimeout(pressTimer));
      card.addEventListener('mousedown', () => {
        pressTimer = setTimeout(() => {
          const id = card.dataset.id;
          const download = filteredDownloads.find(d => d.id === id);
          if (download) confirmDelete(download);
        }, 800);
      });
      card.addEventListener('mouseup', () => clearTimeout(pressTimer));
      card.addEventListener('mouseleave', () => clearTimeout(pressTimer));
    });
  }

  // ========== SUPPRESSION ==========
  async function confirmDelete(download) {
    if (!confirm(`Supprimer le téléchargement de ${download.prenom} ${download.nom} ?`)) return;
    
    try {
      const { error } = await supabase
        .from('telechargements')
        .delete()
        .eq('id', download.id);
      
      if (error) throw error;
      
      showBanner('Téléchargement supprimé', 'success');
      await loadDownloads();
    } catch (e) {
      console.error('Delete error:', e);
      showBanner('Erreur lors de la suppression', 'error');
    }
  }

  // ========== DÉTAILS ==========
  async function showDetails(download) {
    const fileUrl = await getFileUrl(download.matricule);
    detailsContent.innerHTML = `
      <div class="detail-row"><i class="fas fa-user"></i><strong>Nom</strong><span>${escapeHtml(download.prenom)} ${escapeHtml(download.nom)}</span></div>
      <div class="detail-row"><i class="fas fa-id-card"></i><strong>Matricule</strong><span>${escapeHtml(download.matricule)}</span></div>
      <div class="detail-row"><i class="fas fa-phone-alt"></i><strong>Téléphone</strong><span>${formatPhone(download.telephone)}</span></div>
      <div class="detail-row"><i class="fas fa-graduation-cap"></i><strong>Filière</strong><span>${escapeHtml(download.filiere)}</span></div>
      <div class="detail-row"><i class="fas fa-calendar"></i><strong>Date</strong><span>${download.dateFormatted}</span></div>
      <div class="detail-actions">
        <a href="https://wa.me/${waPhone(download.telephone)}" target="_blank" class="detail-btn whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</a>
        <a href="tel:${callPhone(download.telephone)}" class="detail-btn call"><i class="fas fa-phone-alt"></i> Appeler</a>
        ${fileUrl ? `<a href="${fileUrl}" target="_blank" class="detail-btn file"><i class="fas fa-file-pdf"></i> Voir la fiche</a>` : ''}
      </div>
    `;
    detailsOverlay.classList.remove('hidden');
  }

  async function getFileUrl(matricule) {
    try {
      const { data } = await supabase.from('fichiers').select('chemin_storage,bucket').filter('nom','ilike',`${matricule}%`).limit(1);
      if (!data?.length) return null;
      const { data: url } = supabase.storage.from(data[0].bucket).getPublicUrl(data[0].chemin_storage);
      return url.publicUrl;
    } catch { return null; }
  }

  // ========== UTILITAIRES ==========
  function formatPhone(p) {
    if (!p || p === '-') return '-';
    const c = p.replace(/\D/g,'');
    if (c.length === 10) return c.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/,'$1 $2 $3 $4 $5');
    return p;
  }
  function waPhone(p) {
    if (!p || p === '-') return '';
    const c = p.replace(/\D/g,'');
    return c.length === 10 ? `225${c}` : c;
  }
  function callPhone(p) {
    if (!p || p === '-') return '';
    const c = p.replace(/\D/g,'');
    return c.length === 10 ? `+225${c}` : `+${c}`;
  }
  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/[&<>]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[m]));
  }

  // ========== ACTIONS ==========
  async function refresh() {
    showBanner('Actualisation...', 'info');
    await loadData();
    showBanner('Données actualisées', 'success');
  }

  async function handleLogout() {
    if (!confirm('Déconnexion ?')) return;
    await supabase.auth.signOut();
    window.location.href = '/aejappmobile/auth.html';
  }

  // ========== ÉVÉNEMENTS ==========
  function setupEvents() {
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(applyFilters, 300);
      });
    }
    refreshBtn?.addEventListener('click', refresh);
    logoutBtn?.addEventListener('click', handleLogout);
    closeDetailsOverlay?.addEventListener('click', () => detailsOverlay.classList.add('hidden'));
    detailsOverlay?.addEventListener('click', e => {
      if (e.target === detailsOverlay) detailsOverlay.classList.add('hidden');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') detailsOverlay?.classList.add('hidden');
    });
  }

  // ========== DÉMARRAGE ==========
  init();
})();
