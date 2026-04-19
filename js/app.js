  // ── Page navigation ──────────────────────────────────
  document.querySelectorAll('.page-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var page = btn.dataset.page;
      document.querySelectorAll('.page-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('page-builder').style.display = page === 'builder' ? '' : 'none';
      document.getElementById('page-merger').style.display  = page === 'merger'  ? '' : 'none';
      document.getElementById('page-jb').style.display      = page === 'jb'      ? '' : 'none';
    });
  });

