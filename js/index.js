// ===== index.js =====
// Version finale avec surveillance Realtime + notifications Chrome

(function() {
  const SUPABASE_URL = 'https://lnwrwvwunwsqeuluupis.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxud3J3dnd1bndzcWV1bHV1cGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2ODYsImV4cCI6MjA4OTM0MTY4Nn0.gfnPMtR3mNBFMTo3GtZ9t1A9_8gxEHY4loLgLdLJxLs';

  let supabase = null;
  let currentUser = null;
  let allDownloads = [];
  let filteredDownloads = [];
  let selectedDates = new Set();
  let searchTimeout = null;
  let realtimeChannel = null;
  let lastNotificationTime = 0;

  // DOM
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

  async function init() {
    try {
      loadingOverlay?.classList.remove('hidden');
      await initSupabase();
      const ok = await checkSession();
      if (!ok) return;
      await loadData();
      setupEvents();
      setupRealtimeListener();
      requestNotificationPermission();
    } catch (e) {
      console.error(e);
      window.location.href = '/aejappmobile/auth.html';
    } finally {
      setTimeout(() => loadingOverlay?.classList.add('hidden'), 800);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        window.location.href = '/aejappmobile/auth.html';
        return false;
      }
      currentUser = user;
      return true;
    } catch (e) {
      window.location.href = '/aejappmobile/auth.html';
      return false;
    }
  }

  // ========== NOTIFICATIONS ==========
  function requestNotificationPermission() {
    if (!('Notification' in window)) {
      console.log('Notifications non supportées');
      return;
    }
    
    if (Notification.permission === 'granted') {
      console.log('Notifications déjà autorisées');
      showNotifBanner('Notifications actives', 'success');
      return;
    }
    
    if (Notification.permission === 'denied') {
      showNotifBanner('Notifications désactivées. Activez-les dans les paramètres.', 'warning');
      return;
    }
    
    // Demander la permission
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        console.log('✅ Notifications autorisées');
        showNotifBanner('Notifications activées !', 'success');
      } else {
        console.log('❌ Notifications refusées');
        showNotifBanner('Notifications refusées', 'error');
      }
    });
  }

  function showNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    // Éviter les doublons (1 notification toutes les 5 secondes max)
    const now = Date.now();
    if (now - lastNotificationTime < 5000) return;
    lastNotificationTime = now;
    
    try {
      const notification = new Notification(title, {
        body: body,
        icon: '/aejappmobile/assets/icon-192.png',
        badge: '/aejappmobile/assets/icon-192.png',
        vibrate: [200, 100, 200],
        silent: false
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      
      console.log('📢 Notification affichée:', title);
    } catch (e) {
      console.error('Erreur affichage notification:', e);
    }
  }

  function showNotifBanner(message, type) {
    const banner = document.createElement('div');
    banner.className = `notif-banner ${type}`;
    banner.innerHTML = `
      <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-bell'}"></i>
      <span>${message}</span>
      <button class="close-banner">&times;</button>
    `;
    document.body.appendChild(banner);
    banner.querySelector('.close-banner').onclick = () => banner.remove();
    setTimeout(() => banner.remove(), 5000);
  }

  // ========== REALTIME SURVEILLANCE ==========
  function setupRealtimeListener() {
    if (!supabase) return;
    
    // Nettoyer l'ancien canal si existe
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
    }
    
    console.log('📡 Connexion au canal Realtime...');
    
    // Créer un canal pour écouter la table telechargements
    realtimeChannel = supabase
      .channel('telechargements-watch')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'telechargements'
        },
        async (payload) => {
          console.log('🔄 Nouveau téléchargement détecté!', payload);
          
          // Récupérer les infos du stagiaire
          const { data: stagiaire } = await supabase
            .from('securite')
            .select('prenom, nom, matricule')
            .eq('id', payload.new.user_id)
            .single();
          
          const nom = stagiaire ? `${stagiaire.prenom} ${stagiaire.nom}` : 'Un stagiaire';
          const matricule = stagiaire?.matricule || '';
          
          // Afficher la notification
          showNotification(
            '📥 Nouveau téléchargement',
            `${nom} (${matricule}) a téléchargé sa fiche`
          );
          
          // Rafraîchir la liste
          await loadDownloads();
          showNotifBanner(`Nouveau: ${nom}`, 'success');
        }
      )
      .subscribe((status) => {
        console.log('📡 Realtime status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Écoute Realtime active sur telechargements');
        }
      });
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
      const { data } = await supabase
        .from('telechargements')
        .select(`
          id, date_telechargement, categorie, filiere, user_id,
          securite!inner (nom, prenom, matricule, telephone, filiere)
        `)
        .order('date_telechargement', { ascending: false });

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
    } catch (e) {
      console.error(e);
      if (downloadsContainer) downloadsContainer.innerHTML = '<div class="empty-state"><p>Erreur</p></div>';
    }
  }

  function updateStats() {
    if (statTotal) statTotal.textContent = allDownloads.length;
    const now = new Date();
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
    const mois = allDownloads.filter(d => new Date(d.date) >= debutMois);
    if (statMois) statMois.textContent = mois.length;
  }

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

  function renderDownloads() {
    if (!downloadsContainer) return;
    if (!filteredDownloads.length) {
      downloadsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-download"></i><p>Aucun téléchargement</p></div>';
      return;
    }
    const grouped = new Map();
    filteredDownloads.forEach(d => {
      if (!grouped.has(d.dateKey)) grouped.set(d.dateKey, []);
      grouped.get(d.dateKey).push(d);
    });
    const sorted = Array.from(grouped.keys()).sort((a,b) => {
      const [da,ma,ya] = a.split('/').map(Number);
      const [db,mb,yb] = b.split('/').map(Number);
      return new Date(yb,mb-1,db) - new Date(ya,ma-1,da);
    });
    let html = '';
    sorted.forEach(date => {
      const items = grouped.get(date);
      html += `<div class="date-group"><div class="date-header">📁 ${date}</div><div class="downloads-grid">`;
      items.forEach(d => {
        html += `
          <div class="download-card" data-id="${d.id}">
            <div class="card-nom">${escapeHtml(d.prenom)} ${escapeHtml(d.nom)}</div>
            <div class="card-matricule">${escapeHtml(d.matricule)}</div>
            <div class="card-phone"><i class="fas fa-phone-alt"></i> ${formatPhone(d.telephone)}</div>
            <div class="card-actions">
              <a href="https://wa.me/${waPhone(d.telephone)}" target="_blank" class="card-action-btn whatsapp"><i class="fab fa-whatsapp"></i></a>
              <a href="tel:${callPhone(d.telephone)}" class="card-action-btn call"><i class="fas fa-phone-alt"></i></a>
            </div>
          </div>
        `;
      });
      html += `</div></div>`;
    });
    downloadsContainer.innerHTML = html;
    document.querySelectorAll('.download-card').forEach(c => {
      c.addEventListener('click', () => showDetails(c.dataset.id));
    });
  }

  async function showDetails(id) {
    const d = filteredDownloads.find(x => x.id === id);
    if (!d) return;
    const fileUrl = await getFileUrl(d.matricule);
    detailsContent.innerHTML = `
      <div class="detail-row"><i class="fas fa-user"></i><strong>Nom</strong><span>${escapeHtml(d.prenom)} ${escapeHtml(d.nom)}</span></div>
      <div class="detail-row"><i class="fas fa-id-card"></i><strong>Matricule</strong><span>${escapeHtml(d.matricule)}</span></div>
      <div class="detail-row"><i class="fas fa-phone-alt"></i><strong>Téléphone</strong><span>${formatPhone(d.telephone)}</span></div>
      <div class="detail-row"><i class="fas fa-graduation-cap"></i><strong>Filière</strong><span>${escapeHtml(d.filiere)}</span></div>
      <div class="detail-row"><i class="fas fa-calendar"></i><strong>Date</strong><span>${d.dateFormatted}</span></div>
      <div class="detail-actions">
        <a href="https://wa.me/${waPhone(d.telephone)}" target="_blank" class="detail-btn whatsapp"><i class="fab fa-whatsapp"></i> WhatsApp</a>
        <a href="tel:${callPhone(d.telephone)}" class="detail-btn call"><i class="fas fa-phone-alt"></i> Appeler</a>
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

  async function handleLogout() {
    if (!confirm('Déconnexion ?')) return;
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);
    await supabase.auth.signOut();
    window.location.href = '/aejappmobile/auth.html';
  }

  function setupEvents() {
    if (searchInput) searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(applyFilters, 300);
    });
    refreshBtn?.addEventListener('click', () => { loadData(); });
    logoutBtn?.addEventListener('click', handleLogout);
    closeDetailsOverlay?.addEventListener('click', () => detailsOverlay.classList.add('hidden'));
    detailsOverlay?.addEventListener('click', e => { if (e.target === detailsOverlay) detailsOverlay.classList.add('hidden'); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') detailsOverlay?.classList.add('hidden'); });
  }

  init();
})();
