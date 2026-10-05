document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('paytechModal');
  const form = document.getElementById('paytechDonationForm');
  const amount = document.getElementById('paytechAmount');
  const name = document.getElementById('paytechName');
  const email = document.getElementById('paytechEmail');
  const status = document.getElementById('paytechStatus');
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  const openModal = (e) => { if (e) e.preventDefault(); modal.classList.add('is-open'); modal.setAttribute('aria-hidden','false'); document.body.classList.add('modal-open'); setTimeout(() => amount.focus(), 120); };
  const closeModal = () => { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden','true'); document.body.classList.remove('modal-open'); };

  document.querySelectorAll('[data-open-paytech]').forEach(btn => btn.addEventListener('click', openModal));
  document.querySelectorAll('[data-close-paytech]').forEach(btn => btn.addEventListener('click', closeModal));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });
  document.querySelectorAll('[data-paytech-amount]').forEach(btn => btn.addEventListener('click', () => { amount.value = btn.dataset.paytechAmount; amount.focus(); }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = Number(amount.value);
    if (!Number.isInteger(value) || value < 100) return setStatus('Veuillez saisir un montant d’au moins 100 FCFA.', 'error');
    const submit = form.querySelector('.paytech-submit');
    submit.disabled = true;
    submit.innerHTML = '<span>CRÉATION DU PAIEMENT...</span><span>⏳</span>';
    setStatus('Connexion sécurisée à PayTech…', 'loading');
    try {
      const response = await fetch('/api/paytech/create-payment', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ amount:value, name:name.value.trim(), email:email.value.trim() }) });
      const data = await response.json();
      if (!response.ok || Number(data.success) !== 1 || !data.redirect_url) throw new Error(data.message || 'Impossible de créer le paiement.');
      setStatus('Redirection vers PayTech…', 'success');
      window.location.href = data.redirect_url;
    } catch (err) {
      setStatus(err.message || 'Une erreur est survenue.', 'error');
      submit.disabled = false;
      submit.innerHTML = '<span>CONTINUER AVEC PAYTECH</span><span>→</span>';
    }
  });

  function setStatus(message, type) { status.textContent = message; status.className = `paytech-status ${type}`; }

  menuToggle.addEventListener('click', () => { const open = navLinks.classList.toggle('open'); menuToggle.setAttribute('aria-expanded', String(open)); });
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => navLinks.classList.remove('open')));

  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add('visible'); }), { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

  document.querySelectorAll('[data-share]').forEach(btn => btn.addEventListener('click', async () => {
    const url = window.location.href;
    const text = 'Un Cartable, Un Avenir — Ensemble, donnons à chaque jeune les moyens de réussir.';
    const type = btn.dataset.share;
    const feedback = document.querySelector('.share-feedback');
    try {
      if (type === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`, '_blank', 'noopener');
      else if (type === 'facebook') window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank', 'noopener');
      else if (type === 'instagram') { await navigator.clipboard.writeText(url); feedback.textContent = 'Lien copié. Vous pouvez le partager sur Instagram.'; return; }
      else { await navigator.clipboard.writeText(url); feedback.textContent = 'Lien copié.'; return; }
      feedback.textContent = 'Merci de faire circuler l’espoir.';
    } catch { feedback.textContent = 'Copiez le lien depuis la barre d’adresse.'; }
  }));
});
