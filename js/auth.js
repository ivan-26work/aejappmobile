// ===== auth.js =====
// Page de connexion PWA AEJ - Email + Mot de passe + Code secret

(function() {
  // ---------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------
  const SUPABASE_URL = 'https://lnwrwvwunwsqeuluupis.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxud3J3dnd1bndzcWV1bHV1cGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjU2ODYsImV4cCI6MjA4OTM0MTY4Nn0.gfnPMtR3mNBFMTo3GtZ9t1A9_8gxEHY4loLgLdLJxLs';

  let supabase = null;
  let codeSecretUnique = 'ipote233@'; // Valeur par défaut

  // ---------------------------------------------
  // ÉLÉMENTS DOM
  // ---------------------------------------------
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const codeSecretInput = document.getElementById('codeSecret');
  const togglePasswordBtn = document.getElementById('togglePassword');
  const forgotLink = document.getElementById('forgotPassword');
  const forgotModal = document.getElementById('forgotModal');
  const cancelReset = document.getElementById('cancelReset');
  const sendReset = document.getElementById('sendReset');
  const resetEmail = document.getElementById('resetEmail');
  const resetCodeSecret = document.getElementById('resetCodeSecret');

  // ---------------------------------------------
  // INITIALISATION
  // ---------------------------------------------
  async function init() {
    try {
      loadingOverlay?.classList.remove('hidden');
      await initSupabase();
      await loadCodeSecret();
      await checkExistingSession();
      setupEventListeners();
    } catch (error) {
      console.warn('Erreur initialisation:', error);
      setupEventListeners();
    } finally {
      setTimeout(() => loadingOverlay?.classList.add('hidden'), 500);
    }
  }

  async function initSupabase() {
    if (window.supabase?.createClient) {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      await loadSupabaseScript();
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  }

  function loadSupabaseScript() {
    return new Promise((resolve, reject) => {
      if (document.querySelector('script[src*="supabase"]')) {
        const checkInterval = setInterval(() => {
          if (window.supabase) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
        setTimeout(() => reject(new Error('Timeout')), 5000);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
      script.onload = () => window.supabase ? resolve() : reject();
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async function loadCodeSecret() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('code_secret_unique')
        .select('code')
        .limit(1)
        .single();
      
      if (error) {
        console.warn('Table code_secret_unique non trouvée');
        return;
      }
      
      if (data && data.code) {
        codeSecretUnique = data.code;
      }
    } catch (error) {
      console.warn('Erreur chargement code secret:', error);
    }
  }

  async function checkExistingSession() {
    if (!supabase) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        window.location.href = 'index.html';
      }
    } catch (error) {
      console.log('Pas de session active');
    }
  }

  // ---------------------------------------------
  // VALIDATION
  // ---------------------------------------------
  function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  function verifierCodeSecret(code) {
    return code === codeSecretUnique;
  }

  // ---------------------------------------------
  // AFFICHAGE ERREURS
  // ---------------------------------------------
  function showError(element, message) {
    clearError(element);
    const errorEl = document.createElement('div');
    errorEl.className = 'error-message';
    errorEl.textContent = message;
    element.parentElement.appendChild(errorEl);
    showNotification(message, 'error');
    shakeForm();
  }

  function clearError(element) {
    const errorEl = element.parentElement.querySelector('.error-message');
    if (errorEl) errorEl.remove();
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

  function shakeForm() {
    loginForm.classList.add('shake');
    setTimeout(() => loginForm.classList.remove('shake'), 500);
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  }

  // ---------------------------------------------
  // CONNEXION
  // ---------------------------------------------
  async function handleLogin(e) {
    e.preventDefault();

    [emailInput, passwordInput, codeSecretInput].forEach(field => clearError(field));

    let hasError = false;

    if (!emailInput.value.trim()) {
      showError(emailInput, 'Email requis');
      hasError = true;
    } else if (!isValidEmail(emailInput.value.trim())) {
      showError(emailInput, 'Email invalide');
      hasError = true;
    }

    if (!passwordInput.value) {
      showError(passwordInput, 'Mot de passe requis');
      hasError = true;
    }

    if (!codeSecretInput.value) {
      showError(codeSecretInput, 'Code secret requis');
      hasError = true;
    } else if (!verifierCodeSecret(codeSecretInput.value)) {
      showError(codeSecretInput, 'Code secret incorrect');
      hasError = true;
    }

    if (hasError) return;

    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Connexion...';

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailInput.value.trim(),
        password: passwordInput.value
      });

      if (error) throw error;

      showNotification('Connexion réussie', 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 500);

    } catch (error) {
      console.error('Erreur connexion:', error);
      showError(passwordInput, 'Email ou mot de passe incorrect');
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  }

  // ---------------------------------------------
  // MOT DE PASSE OUBLIÉ
  // ---------------------------------------------
  function openForgotModal(e) {
    e.preventDefault();
    forgotModal?.classList.remove('hidden');
    setTimeout(() => resetEmail?.focus(), 100);
  }

  function closeForgotModal() {
    forgotModal?.classList.add('hidden');
    if (resetEmail) resetEmail.value = '';
    if (resetCodeSecret) resetCodeSecret.value = '';
  }

  async function handlePasswordReset() {
    if (!resetEmail || !resetCodeSecret) return;

    clearError(resetEmail);
    clearError(resetCodeSecret);

    let hasError = false;

    if (!resetEmail.value.trim()) {
      showError(resetEmail, 'Email requis');
      hasError = true;
    } else if (!isValidEmail(resetEmail.value.trim())) {
      showError(resetEmail, 'Email invalide');
      hasError = true;
    }

    if (!resetCodeSecret.value) {
      showError(resetCodeSecret, 'Code secret requis');
      hasError = true;
    } else if (!verifierCodeSecret(resetCodeSecret.value)) {
      showError(resetCodeSecret, 'Code secret incorrect');
      hasError = true;
    }

    if (hasError) return;

    const originalText = sendReset.textContent;
    sendReset.disabled = true;
    sendReset.textContent = 'Envoi...';

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        resetEmail.value.trim()
      );

      if (error) throw error;

      showNotification('Email de réinitialisation envoyé', 'success');
      setTimeout(() => closeForgotModal(), 1500);

    } catch (error) {
      console.error('Erreur:', error);
      showError(resetEmail, error.message || 'Erreur envoi');
      sendReset.disabled = false;
      sendReset.textContent = originalText;
    }
  }

  // ---------------------------------------------
  // TOGGLE MOT DE PASSE
  // ---------------------------------------------
  function setupTogglePassword() {
    if (!togglePasswordBtn || !passwordInput) return;
    togglePasswordBtn.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      togglePasswordBtn.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });
  }

  // ---------------------------------------------
  // ÉCOUTEURS
  // ---------------------------------------------
  function setupEventListeners() {
    loginForm?.addEventListener('submit', handleLogin);
    forgotLink?.addEventListener('click', openForgotModal);
    cancelReset?.addEventListener('click', closeForgotModal);
    sendReset?.addEventListener('click', handlePasswordReset);
    setupTogglePassword();

    if (forgotModal) {
      forgotModal.addEventListener('click', (e) => {
        if (e.target === forgotModal) closeForgotModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !forgotModal.classList.contains('hidden')) {
          closeForgotModal();
        }
      });
    }

    // Enter key sur les champs
    [emailInput, passwordInput, codeSecretInput].forEach(input => {
      input?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          loginForm.dispatchEvent(new Event('submit'));
        }
      });
    });
  }

  // ---------------------------------------------
  // DÉMARRAGE
  // ---------------------------------------------
  init();
})();
