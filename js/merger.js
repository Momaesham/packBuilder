  // ── Merger ────────────────────────────────────────────
  (function() {
    var mFile1 = null, mFile2 = null, mOutputBlob = null, mConfigBlob = null, _mLogFilter = 'all';

    function mHandleFile(f, contentId, slot) {
      if (!f.name.endsWith('.zip')) {
        document.getElementById(contentId).innerHTML =
          '<div class="file-info"><span>⚠️</span>' +
          '<span class="name" style="color:var(--err)">Нужен .zip файл</span></div>';
        if (slot === 1) mFile1 = null; else mFile2 = null;
        mUpdateBtn();
        return;
      }
      if (slot === 1) mFile1 = f; else mFile2 = f;
      var sizeLabel = f.size > 1048576
        ? (f.size / 1048576).toFixed(1) + ' MB'
        : (f.size / 1024).toFixed(1) + ' KB';
      document.getElementById(contentId).innerHTML =
        '<div class="file-info"><span>📦</span><span class="name">' +
        escHtml(f.name) + '</span><span class="badge">' + sizeLabel + '</span></div>';
      mUpdateBtn();
    }

    function mUpdateBtn() {
      document.getElementById('mergeBtn').disabled = !(mFile1 && mFile2);
    }

    function mLog(tag, msg, type) {
      var out  = document.getElementById('mLogOutput');
      var line = document.createElement('div');
      var hidden = _mLogFilter !== 'all' && _mLogFilter !== type;
      line.className = 'log-line' + (hidden ? ' log-hidden' : '');
      line.dataset.type = type;
      line.innerHTML = '<span class="log-tag t-' + type + '">[' + tag + ']</span>' +
                       '<span class="log-msg">' + msg + '</span>';
      out.appendChild(line);
      if (!hidden) out.scrollTop = out.scrollHeight;
    }

    function mFindPaper(zip, root) {
      var oldPath = root + 'assets/minecraft/models/item/paper.json';
      var newPath = root + 'assets/minecraft/items/paper.json';
      if (zip.files[oldPath] && !zip.files[oldPath].dir)
        return { fullPath: oldPath, outPath: 'assets/minecraft/models/item/paper.json', format: 'old' };
      if (zip.files[newPath] && !zip.files[newPath].dir)
        return { fullPath: newPath, outPath: 'assets/minecraft/items/paper.json', format: 'new' };
      return null;
    }

    function mMergePaperOld(j1, j2) {
      var map = new Map();
      (j2.overrides || []).forEach(function(o) {
        var cmd = o.predicate && o.predicate.custom_model_data;
        if (cmd !== undefined) map.set(cmd, o);
      });
      (j1.overrides || []).forEach(function(o) {
        var cmd = o.predicate && o.predicate.custom_model_data;
        if (cmd !== undefined) map.set(cmd, o);
      });
      var merged = Array.from(map.values()).sort(function(a, b) {
        return a.predicate.custom_model_data - b.predicate.custom_model_data;
      });
      return Object.assign({}, j1, { overrides: merged });
    }

    function mMergePaperNew(j1, j2) {
      var entries1 = (j1.model && j1.model.entries) || [];
      var entries2 = (j2.model && j2.model.entries) || [];
      var map = new Map();
      entries2.forEach(function(e) { map.set(e.threshold, e); });
      entries1.forEach(function(e) { map.set(e.threshold, e); });
      var merged = Array.from(map.values()).sort(function(a, b) { return a.threshold - b.threshold; });
      return { model: Object.assign({}, j1.model, { entries: merged }) };
    }

    function mExtractCmds(paperJson, format) {
      var cmds = {};
      if (format === 'old') {
        (paperJson.overrides || []).forEach(function(o) {
          var cmd  = o.predicate && o.predicate.custom_model_data;
          var name = (o.model || '').split('/').pop();
          if (cmd !== undefined && name) cmds[String(cmd)] = name;
        });
      } else {
        ((paperJson.model && paperJson.model.entries) || []).forEach(function(e) {
          var cmd  = Math.round(e.threshold);
          var name = ((e.model && e.model.model) || '').split('/').pop();
          if (name) cmds[String(cmd)] = name;
        });
      }
      return cmds;
    }

    ['1', '2'].forEach(function(n) {
      var zone  = document.getElementById('mDropZone' + n);
      var input = document.getElementById('mFileInput' + n);
      var slot  = parseInt(n, 10);
      var cid   = 'mDropContent' + n;
      zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', function() { zone.classList.remove('over'); });
      zone.addEventListener('drop', function(e) {
        e.preventDefault(); zone.classList.remove('over');
        var f = e.dataTransfer.files[0];
        if (f) mHandleFile(f, cid, slot);
      });
      input.addEventListener('change', function(e) {
        if (e.target.files[0]) mHandleFile(e.target.files[0], cid, slot);
      });
    });

    document.querySelectorAll('[data-mfilter]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _mLogFilter = btn.dataset.mfilter;
        document.querySelectorAll('[data-mfilter]').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('#mLogOutput .log-line').forEach(function(line) {
          line.classList.toggle('log-hidden', _mLogFilter !== 'all' && line.dataset.type !== _mLogFilter);
        });
      });
    });

    document.getElementById('mergeBtn').addEventListener('click', async function() {
      var btn = document.getElementById('mergeBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Объединяю...';
      _mLogFilter = 'all';
      document.querySelectorAll('[data-mfilter]').forEach(function(b) { b.classList.remove('active'); });
      document.querySelector('[data-mfilter="all"]').classList.add('active');
      var mLogCard = document.getElementById('mLogCard');
      mLogCard.classList.add('visible', 'fade-in');
      document.getElementById('mLogOutput').innerHTML = '';
      document.getElementById('mDownloadBtn').classList.remove('visible');
      document.getElementById('mConfigBtn').classList.remove('visible');
      mOutputBlob = null;
      mConfigBlob = null;
      try {
        var zip1   = await JSZip.loadAsync(mFile1);
        var zip2   = await JSZip.loadAsync(mFile2);
        var outZip = new JSZip();

        var root1 = getRootPrefix(zip1);
        var root2 = getRootPrefix(zip2);
        if (root1) mLog('INFO', 'Пак 1: корневая папка <b>' + escHtml(root1) + '</b>', 'info');
        if (root2) mLog('INFO', 'Пак 2: корневая папка <b>' + escHtml(root2) + '</b>', 'info');

        // ── paper.json: detect & merge ──────────────────
        var paper1 = mFindPaper(zip1, root1);
        var paper2 = mFindPaper(zip2, root2);
        var paperResult = null; // { outPath, content? | raw? }

        if (!paper1 && !paper2) {
          mLog('INFO', 'paper.json не найден ни в одном из паков', 'info');
        } else if (paper1 && !paper2) {
          mLog('ОШИБКА', 'paper.json найден только в <b>Паке 1</b> — нужны оба пака для объединения. Используется как есть', 'err');
          paperResult = { outPath: paper1.outPath, raw: zip1.files[paper1.fullPath] };
        } else if (!paper1 && paper2) {
          mLog('ОШИБКА', 'paper.json найден только в <b>Паке 2</b> — нужны оба пака для объединения. Используется как есть', 'err');
          paperResult = { outPath: paper2.outPath, raw: zip2.files[paper2.fullPath] };
        } else {
          if (paper1.format !== paper2.format) {
            var fmt = function(f) { return f === 'old' ? 'models/item (1.16–1.21.3)' : 'items (1.21.4+)'; };
            mLog('ОШИБКА',
              'paper.json — разные форматы: Пак 1 использует <b>' + fmt(paper1.format) +
              '</b>, Пак 2 — <b>' + fmt(paper2.format) +
              '</b>. Объединение невозможно, используется версия из Пака 1', 'err');
            paperResult = { outPath: paper1.outPath, raw: zip1.files[paper1.fullPath] };
          } else {
            try {
              var pJson1  = JSON.parse(await zip1.files[paper1.fullPath].async('string'));
              var pJson2  = JSON.parse(await zip2.files[paper2.fullPath].async('string'));
              // Log individual CMD conflicts before merging
              if (paper1.format === 'old') {
                var cmdMap1 = new Map();
                (pJson1.overrides || []).forEach(function(o) {
                  var cmd = o.predicate && o.predicate.custom_model_data;
                  if (cmd !== undefined) cmdMap1.set(cmd, (o.model || '').split('/').pop());
                });
                (pJson2.overrides || []).forEach(function(o) {
                  var cmd = o.predicate && o.predicate.custom_model_data;
                  if (cmd !== undefined && cmdMap1.has(cmd)) {
                    var n2 = (o.model || '').split('/').pop();
                    mLog('ОШИБКА',
                      'CMD <b>' + cmd + '</b> — конфликт: Пак 1 "<b>' + escHtml(cmdMap1.get(cmd)) + '</b>", Пак 2 "<b>' + escHtml(n2) + '</b>" — взят из Пака 1',
                      'err');
                  }
                });
              } else {
                var thrMap1 = new Map();
                ((pJson1.model && pJson1.model.entries) || []).forEach(function(e) {
                  thrMap1.set(e.threshold, ((e.model && e.model.model) || '').split('/').pop());
                });
                ((pJson2.model && pJson2.model.entries) || []).forEach(function(e) {
                  if (thrMap1.has(e.threshold)) {
                    var n2 = ((e.model && e.model.model) || '').split('/').pop();
                    mLog('ОШИБКА',
                      'CMD <b>' + Math.round(e.threshold) + '</b> — конфликт: Пак 1 "<b>' + escHtml(thrMap1.get(e.threshold)) + '</b>", Пак 2 "<b>' + escHtml(n2) + '</b>" — взят из Пака 1',
                      'err');
                  }
                });
              }
              var pMerged = paper1.format === 'old' ? mMergePaperOld(pJson1, pJson2) : mMergePaperNew(pJson1, pJson2);
              var cnt1    = paper1.format === 'old' ? (pJson1.overrides||[]).length   : ((pJson1.model||{}).entries||[]).length;
              var cnt2    = paper1.format === 'old' ? (pJson2.overrides||[]).length   : ((pJson2.model||{}).entries||[]).length;
              var cntM    = paper1.format === 'old' ? (pMerged.overrides||[]).length  : ((pMerged.model||{}).entries||[]).length;
              var cmdConflicts = (cnt1 + cnt2) - cntM;
              mLog('DONE',
                '<b>paper.json</b> объединён: Пак 1 (' + cnt1 + ') + Пак 2 (' + cnt2 + ') = ' + cntM + ' записей' +
                (cmdConflicts > 0 ? ', CMD-конфликтов: <b>' + cmdConflicts + '</b> (взяты из Пака 1)' : ''),
                'done');
              paperResult = { outPath: paper1.outPath, content: JSON.stringify(pMerged, null, 2) };
              var mCmds = mExtractCmds(pMerged, paper1.format);
              if (Object.keys(mCmds).length > 0) {
                mConfigBlob = new Blob([generateCustomModelYaml(mCmds)], { type: 'text/yaml' });
              }
            } catch(pe) {
              mLog('ОШИБКА', 'paper.json — ошибка парсинга: ' + escHtml(pe.message) + '. Используется версия из Пака 1', 'err');
              paperResult = { outPath: paper1.outPath, raw: zip1.files[paper1.fullPath] };
            }
          }
        }

        // ── Regular file merge (skip paper.json, strip root prefix) ──
        var skipPaths = new Set();
        if (paper1) skipPaths.add(paper1.fullPath);
        if (paper2) skipPaths.add(paper2.fullPath);

        var files1 = Object.keys(zip1.files).filter(function(p) { return !zip1.files[p].dir && !skipPaths.has(p); });
        var files2 = Object.keys(zip2.files).filter(function(p) { return !zip2.files[p].dir && !skipPaths.has(p); });
        var added  = new Set();
        var doneCount = 0, conflictCount = 0;

        for (var i = 0; i < files1.length; i++) {
          var p1   = files1[i];
          var out1 = root1 ? p1.slice(root1.length) : p1;
          if (!out1) continue;
          var buf  = await zip1.files[p1].async('arraybuffer');
          outZip.file(out1, buf);
          added.add(out1);
          doneCount++;
          mLog('DONE', '[Пак 1] ' + escHtml(out1), 'done');
        }
        for (var j = 0; j < files2.length; j++) {
          var p2   = files2[j];
          var out2 = root2 ? p2.slice(root2.length) : p2;
          if (!out2) continue;
          if (added.has(out2)) {
            conflictCount++;
            mLog('КОНФЛИКТ', '<b>' + escHtml(out2) + '</b> — есть в обоих паках, взят из <b>Пака 1</b>', 'warn');
          } else {
            var buf2 = await zip2.files[p2].async('arraybuffer');
            outZip.file(out2, buf2);
            added.add(out2);
            doneCount++;
            mLog('DONE', '[Пак 2] ' + escHtml(out2), 'done');
          }
        }

        // ── Write paper.json result ──────────────────────
        if (paperResult) {
          if (paperResult.content !== undefined) {
            outZip.file(paperResult.outPath, paperResult.content);
          } else {
            var pBuf = await paperResult.raw.async('arraybuffer');
            outZip.file(paperResult.outPath, pBuf);
          }
        }

        mLog('INFO', 'Генерирую ZIP...', 'info');
        mOutputBlob = await outZip.generateAsync({ type: 'blob' });
        var total = doneCount + conflictCount;
        mLog('ГОТОВО',
          '<b>Объединение завершено!</b> Файлов: ' + total +
          (conflictCount ? ', конфликтов: <b>' + conflictCount + '</b>' : ''),
          'done');
        document.getElementById('mDownloadBtn').classList.add('visible', 'fade-in');
        if (mConfigBlob) document.getElementById('mConfigBtn').classList.add('visible', 'fade-in');
      } catch(e) {
        mLog('ОШИБКА', '<b>' + escHtml(e.message) + '</b>', 'err');
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Объединить паки';
      }
    });

    document.getElementById('mDownloadBtn').addEventListener('click', function() {
      if (!mOutputBlob) return;
      var url = URL.createObjectURL(mOutputBlob);
      var a   = document.createElement('a');
      a.href     = url;
      a.download = 'merged_resource_pack.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    document.getElementById('mConfigBtn').addEventListener('click', function() {
      if (!mConfigBlob) return;
      var url = URL.createObjectURL(mConfigBlob);
      var a   = document.createElement('a');
      a.href     = url;
      a.download = 'custom_models.yml';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  })();

