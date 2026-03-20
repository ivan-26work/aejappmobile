// ===== index.js =====
// PWA AEJ - VU Téléchargements - Mobile First avec notifications push

(function() {
  // ---------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------
  const SUPABASE_URL = 'https://lnwrwvwunwsqeuluupis.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxud3J3dnd1bndzcWV1bHV1cGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2ODYsImV4cCI6MjA4OTM0MTY4Nn0.gfnPMtR3mNBFMTo3GtZ9t1A9_8gxEHY4loLgLdLJxLs';

  let supabase = null;
  let currentUser = null;
  let allDownloads = [];
  let filteredDownloads = [];
  let selectedDownload = null;
  let selectedDates = new Set();
  let searchTimeout = null;

  // ---------------------------------------------
  // ÉLÉMENTS DOM
  // ---------------------------------------------
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

  // ---------------------------------------------
  // INITIALISATION
  // ---------------------------------------------
  async function init() {
    try {
      loadingOverlay?.classList.remove('hidden');
      await initSupabase();
      const sessionOk = await checkSession();
      if (!sessionOk) return;
      await loadTotalStagiaires();
      await loadDownloads();
      await setupPushNotifications();
      setupEventListeners();
    } catch (error) {
      console.error('Erreur initialisation:', error);
      showNotification('Erreur de chargement', 'error');
    } finally {
      setTimeout(() => loadingOverlay?.classList.add('hidden'), 500);
    }
  }

  async function initSupabase() {
    if (window.supabase?.createClient) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      await loadScript();
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  function loadScript() {
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  async function checkSession() {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        window.location.href = '/aejappmobile/auth.html';
        return false;
      }
      currentUser = user;
      return true;
    } catch (error) {
      console.error('Erreur session:', error);
      window.location.href = '/aejappmobile/auth.html';
      return false;
    }
  }

  // ---------------------------------------------
  // NOTIFICATIONS PUSH
  // ---------------------------------------------
  async function getVapidPublicKey() {
    try {
      const { data, error } = await supabase
        .from('vapid_config')
        .select('public_key')
        .single();
      
      if (error) {
        console.error('Erreur récupération clé VAPID:', error);
        return null;
      }
      return data.public_key;
    } catch (error) {
      console.error('Erreur:', error);
      return null;
    }
  }

  async function setupPushNotifications() {
    // Vérifier les prérequis
    if (!('Notification' in window)) {
      console.log('Notifications non supportées');
      return;
    }
    
    if (Notification.permission !== 'granted') {
      console.log('Permission non accordée');
      return;
    }
    
    if (!('serviceWorker' in navigator)) {
      console.log('Service Worker non supporté');
      return;
    }
    
    try {
      const vapidPublicKey = await getVapidPublicKey();
      if (!vapidPublicKey) {
        console.log('Clé VAPID non trouvée');
        return;
      }
      
      const registration = await navigator.serviceWorker.ready;
      
      // Vérifier si déjà abonné
      let subscription = await registration.pushManager.getSubscription();
      
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey
        });
        console.log('✅ Nouvel abonnement push créé');
      } else {
        console.log('✅ Abonnement push existant');
      }
      
      // Sauvegarder l'abonnement dans Supabase
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: currentUser.id,
          subscription: subscription,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
      
      if (error) {
        console.error('Erreur sauvegarde abonnement:', error);
      } else {
        console.log('✅ Abonnement sauvegardé');
      }
      
    } catch (error) {
      console.error('Erreur abonnement push:', error);
    }
  }

  // ---------------------------------------------
  // CHARGEMENT DONNÉES
  // ---------------------------------------------
  async function loadTotalStagiaires() {
    try {
      const { count, error } = await supabase
        .from('securite')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      if (statStagiaires) statStagiaires.textContent = count || 0;
    } catch (error) {
      console.error('Erreur chargement stagiaires:', error);
      if (statStagiaires) statStagiaires.textContent = '0';
    }
  }

  async function loadDownloads() {
    try {
      const { data, error } = await supabase
        .from('telechargements')
        .select(`
          id,
          date_telechargement,
          categorie,
          filiere,
          user_id,
          securite!inner (
            nom,
            prenom,
            matricule,
            telephone,
            filiere
          )
        `)
        .order('date_telechargement', { ascending: false });

      if (error) throw error;

      allDownloads = (data || []).map(item => {
        const s = item.securite;
        return {
          id: item.id,
          date: item.date_telechargement,
          dateFormatted: formatDateDisplay(item.date_telechargement),
          dateKey: formatDateKey(item.date_telechargement),
          categorie: item.categorie || 'Fiche',
          filiere: item.filiere || s?.filiere || '-',
          nom: s?.nom || '-',
          prenom: s?.prenom || '-',
          matricule: s?.matricule || '-',
          telephone: s?.telephone || '-',
          user_id: item.user_id
        };
      });

      filteredDownloads = [...allDownloads];
      updateStats();
      updateFiltersUI();
      renderDownloads();
      
    } catch (error) {
      console.error('Erreur chargement téléchargements:', error);
      showNotification('Erreur chargement des données', 'error');
      if (downloadsContainer) {
        downloadsContainer.innerHTML = `
          <div class="empty-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Erreur de chargement</p>
          </div>
        `;
      }
    }
  }

  function updateStats() {
    if (statTotal) statTotal.textContent = allDownloads.length;
    
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
    const downloadsMois = allDownloads.filter(d => new Date(d.date) >= debutMois);
    if (statMois) statMois.textContent = downloadsMois.length;
  }

  // ---------------------------------------------
  // FILTRES DATES
  // ---------------------------------------------
  function updateFiltersUI() {
    if (!filtersRow) return;

    const datesMap = new Map();
    allDownloads.forEach(d => {
      if (!datesMap.has(d.dateKey)) {
        datesMap.set(d.dateKey, { count: 0, date: d.date });
      }
      datesMap.get(d.dateKey).count++;
    });

    const sortedDates = Array.from(datesMap.entries()).sort((a, b) => {
      return new Date(b[1].date) - new Date(a[1].date);
    });

    filtersRow.innerHTML = sortedDates.map(([dateKey, info]) => `
      <div class="filter-pill ${selectedDates.has(dateKey) ? 'active' : ''}" data-date="${dateKey}">
        <i class="fas fa-calendar"></i>
        <span>${dateKey}</span>
        <span class="filter-count">(${info.count})</span>
      </div>
    `).join('');

    document.querySelectorAll('.filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const date = pill.dataset.date;
        if (selectedDates.has(date)) {
          selectedDates.delete(date);
        } else {
          selectedDates.add(date);
        }
        updateFiltersUI();
        applyFilters();
      });
    });
  }

  function applyFilters() {
    let filtered = [...allDownloads];

    if (selectedDates.size > 0) {
      filtered = filtered.filter(d => selectedDates.has(d.dateKey));
    }

    const searchTerm = searchInput?.value.toLowerCase().trim();
    if (searchTerm) {
      filtered = filtered.filter(d => 
        d.nom.toLowerCase().includes(searchTerm) ||
        d.prenom.toLowerCase().includes(searchTerm) ||
        d.matricule.toLowerCase().includes(searchTerm) ||
        d.dateKey.includes(searchTerm) ||
        d.telephone.includes(searchTerm)
      );
    }

    filteredDownloads = filtered;
    renderDownloads();
  }

  // ---------------------------------------------
  // RECHERCHE
  // ---------------------------------------------
  function setupSearch() {
    if (!searchInput) return;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => applyFilters(), 300);
    });
  }

  // ---------------------------------------------
  // AFFICHAGE DES CARTES
  // ---------------------------------------------
  function renderDownloads() {
    if (!downloadsContainer) return;

    if (filteredDownloads.length === 0) {
      downloadsContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-download"></i>
          <p>Aucun téléchargement trouvé</p>
        </div>
      `;
      return;
    }

    const groupedByDate = new Map();
    filteredDownloads.forEach(d => {
      if (!groupedByDate.has(d.dateKey)) {
        groupedByDate.set(d.dateKey, []);
      }
      groupedByDate.get(d.dateKey).push(d);
    });

    const sortedDates = Array.from(groupedByDate.keys()).sort((a, b) => {
      const [da, ma, ya] = a.split('/').map(Number);
      const [db, mb, yb] = b.split('/').map(Number);
      return new Date(yb, mb-1, db) - new Date(ya, ma-1, da);
    });

    let html = '';
    sortedDates.forEach(dateKey => {
      const downloads = groupedByDate.get(dateKey);
      html += `
        <div class="date-group">
          <div class="date-header">📁 ${dateKey}</div>
          <div class="downloads-grid">
      `;

      downloads.forEach(d => {
        html += `
          <div class="download-card" data-id="${d.id}">
            <div class="card-nom">${escapeHtml(d.prenom)} ${escapeHtml(d.nom)}</div>
            <div class="card-matricule">${escapeHtml(d.matricule)}</div>
            <div class="card-phone">
              <i class="fas fa-phone-alt"></i>
              ${formatPhoneNumber(d.telephone)}
            </div>
            <div class="card-date">
              <i class="fas fa-calendar"></i>
              ${d.dateKey}
            </div>
            <div class="card-actions">
              <a href="https://wa.me/${formatPhoneForWhatsApp(d.telephone)}" target="_blank" class="card-action-btn whatsapp" title="WhatsApp">
                <i class="fab fa-whatsapp"></i>
              </a>
              <a href="tel:${formatPhoneForCall(d.telephone)}" class="card-action-btn call" title="Appeler">
                <i class="fas fa-phone-alt"></i>
              </a>
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
    });

    downloadsContainer.innerHTML = html;

    document.querySelectorAll('.download-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.id;
        const download = filteredDownloads.find(d => d.id === id);
        if (download) showDetails(download);
      });
    });
  }

  // ---------------------------------------------
  // DÉTAILS OVERLAY
  // ---------------------------------------------
  async function showDetails(download) {
    selectedDownload = download;
    const fileUrl = await getFileUrl(download.matricule);
    
    detailsContent.innerHTML = `
      <div class="detail-row">
        <i class="fas fa-user"></i>
        <strong>Nom complet</strong>
        <span>${escapeHtml(download.prenom)} ${escapeHtml(download.nom)}</span>
      </div>
      <div class="detail-row">
        <i class="fas fa-id-card"></i>
        <strong>Matricule</strong>
        <span>${escapeHtml(download.matricule)}</span>
      </div>
      <div class="detail-row">
        <i class="fas fa-phone-alt"></i>
        <strong>Téléphone</strong>
        <span>${formatPhoneNumber(download.telephone)}</span>
      </div>
      <div class="detail-row">
        <i class="fas fa-graduation-cap"></i>
        <strong>Filière</strong>
        <span>${escapeHtml(download.filiere)}</span>
      </div>
      <div class="detail-row">
        <i class="fas fa-calendar"></i>
        <strong>Date</strong>
        <span>${download.dateFormatted}</span>
      </div>
      <div class="detail-row">
        <i class="fas fa-tag"></i>
        <strong>Catégorie</strong>
        <span>${escapeHtml(download.categorie)}</span>
      </div>
      <div class="detail-actions">
        <a href="https://wa.me/${formatPhoneForWhatsApp(download.telephone)}" target="_blank" class="detail-btn whatsapp">
          <i class="fab fa-whatsapp"></i> WhatsApp
        </a>
        <a href="tel:${formatPhoneForCall(download.telephone)}" class="detail-btn call">
          <i class="fas fa-phone-alt"></i> Appeler
        </a>
        ${fileUrl ? `<a href="${fileUrl}" target="_blank" class="detail-btn file">
          <i class="fas fa-file-pdf"></i> Voir la fiche
        </a>` : ''}
      </div>
    `;
    
    detailsOverlay.classList.remove('hidden');
  }

  async function getFileUrl(matricule) {
    try {
      const { data, error } = await supabase
        .from('fichiers')
        .select('chemin_storage, bucket')
        .filter('nom', 'ilike', `${matricule}%`)
        .limit(1);
      
      if (error || !data || data.length === 0) return null;
      
      const { data: urlData } = supabase.storage
        .from(data[0].bucket || 'fichiers')
        .getPublicUrl(data[0].chemin_storage);
      
      return urlData.publicUrl;
    } catch (e) {
      return null;
    }
  }

  function closeDetails() {
    detailsOverlay?.classList.add('hidden');
    selectedDownload = null;
  }

  // ---------------------------------------------
  // DÉCONNEXION
  // ---------------------------------------------
  async function handleLogout() {
    if (!confirm('Voulez-vous vraiment vous déconnecter ?')) return;
    
    try {
      await supabase.auth.signOut();
      showNotification('Déconnexion réussie', 'success');
      setTimeout(() => {
        window.location.href = '/aejappmobile/auth.html';
      }, 500);
    } catch (error) {
      console.error('Erreur déconnexion:', error);
      showNotification('Erreur lors de la déconnexion', 'error');
    }
  }

  // ---------------------------------------------
  // RAFRAÎCHISSEMENT
  // ---------------------------------------------
  async function refreshData() {
    showNotification('Actualisation...', 'info');
    await loadTotalStagiaires();
    await loadDownloads();
    showNotification('Données actualisées', 'success');
  }

  // ---------------------------------------------
  // UTILITAIRES
  // ---------------------------------------------
  function formatDateKey(date) {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  function formatDateDisplay(date) {
    const d = new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function formatPhoneNumber(phone) {
    if (!phone || phone === '-') return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return cleaned.replace(/(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4 $5');
    }
    return phone;
  }

  function formatPhoneForWhatsApp(phone) {
    if (!phone || phone === '-') return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return `225${cleaned}`;
    return cleaned;
  }

  function formatPhoneForCall(phone) {
    if (!phone || phone === '-') return '';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) return `+225${cleaned}`;
    return `+${cleaned}`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
      if (m === '&') return '&amp;';
      if (m === '<') return '&lt;';
      if (m === '>') return '&gt;';
      return m;
    });
  }

  function showNotification(message, type = 'info') {
    const notif = document.createElement('div');
    notif.className = `temp-notification ${type}`;
    notif.textContent = message;
    document.body.appendChild(notif);
    setTimeout(() => {
      notif.style.opacity = '0';
      setTimeout(() => notif.remove(), 300);
    }, 3000);
  }

  // ---------------------------------------------
  // ÉCOUTEURS
  // ---------------------------------------------
  function setupEventListeners() {
    setupSearch();
    refreshBtn?.addEventListener('click', refreshData);
    logoutBtn?.addEventListener('click', handleLogout);
    closeDetailsOverlay?.addEventListener('click', closeDetails);
    detailsOverlay?.addEventListener('click', (e) => {
      if (e.target === detailsOverlay) closeDetails();
    });
    
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !detailsOverlay?.classList.contains('hidden')) {
        closeDetails();
      }
    });
  }

  // ---------------------------------------------
  // DÉMARRAGE
  // ---------------------------------------------
  init();
})();
