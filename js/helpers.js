  function generateCustomModelYaml(cmds) {
    const sorted = Object.entries(cmds)
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));
    let yaml = '# Namespaces listed here cannot be placed as fake blocks in the world\n';
    yaml += '#non-placeable-namespaces:\n';
    yaml += '#  - products\n';
    yaml += '\n';
    yaml += 'namespaces:\n  models:\n';
    for (const [cmd, name] of sorted) {
      yaml += `    ${name}:\n`;
      yaml += `      id: ${parseInt(cmd, 10)}\n`;
      yaml += `      display: "${name}"\n`;
    }
    return yaml;
  }

  function generateBedrockMapping(cmds) {
    const items = Object.entries(cmds)
      .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
      .map(([cmd, name]) => ({
        type: "legacy",
        custom_model_data: parseInt(cmd, 10),
        bedrock_identifier: "test:" + name,
        bedrock_options: { icon: "test:" + name }
      }));
    return JSON.stringify({ format_version: 2, items: { "minecraft:paper": items } }, null, 4);
  }


  // ── Helpers ───────────────────────────────────────────

  // Если все файлы лежат внутри одной папки — возвращает её как префикс ("folder/")
  function getRootPrefix(zip) {
    const allPaths = Object.keys(zip.files).filter(p => !zip.files[p].dir);
    if (allPaths.length === 0) return '';
    const tops = allPaths.map(p => p.split('/')[0]);
    const first = tops[0];
    if (tops.every(t => t === first)) return first + '/';
    return '';
  }

  function getFiles(zip, prefix) {
    return Object.keys(zip.files).filter(
      p => p.startsWith(prefix) && !zip.files[p].dir && p.slice(prefix.length)
    );
  }

  // ── Conflict resolution ─────────────────────────────────
  const _conflictCache = new Map(); // filename -> chosen option index

  function showConflictModal(filename, options) {
    return new Promise(function(resolve) {
      const modal = document.getElementById('conflictModal');
      document.getElementById('conflictFilename').textContent = filename;
      const container = document.getElementById('conflictOptions');
      container.innerHTML = '';
      options.forEach(function(opt, i) {
        const btn = document.createElement('button');
        btn.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);padding:11px 16px;color:var(--text);font-size:.9rem;cursor:pointer;text-align:left;font-family:inherit;transition:border-color .15s';
        btn.textContent = opt.label;
        btn.onmouseenter = function(){ btn.style.borderColor = 'var(--primary)'; };
        btn.onmouseleave = function(){ btn.style.borderColor = 'var(--border)'; };
        btn.onclick = function() {
          modal.style.display = 'none';
          _conflictCache.set(filename, i);
          resolve(i);
        };
        container.appendChild(btn);
      });
      modal.style.display = 'flex';
    });
  }

  // ── textures_blocks handler ───────────────────────────
  // versionKey: 'java-old' | 'java-new' | 'bedrock'
  async function processTexturesBlocks(inZip, outZip, root, versionKey) {
    const files = getFiles(inZip, root + 'textures_blocks/');
    if (files.length === 0) return;

    const isBedrock = versionKey === 'bedrock';
    const fieldKey  = versionKey === 'java-new' ? 'v1214' : isBedrock ? 'bedrock' : 'v116';
    const outPrefix = isBedrock ? 'test_pack/textures/' : 'assets/minecraft/textures/';

    for (const path of files) {
      const filename = path.slice((root + 'textures_blocks/').length);
      const buf = await inZip.files[path].async('arraybuffer');

      // Для Bedrock: сначала карта переименований Java→Bedrock
      if (isBedrock && BR_RENAME[filename]) {
        const { file: brFile, path: brPath } = BR_RENAME[filename];
        const dest = 'test_pack/' + brPath.replace(/^\/+|\/+$/g, '') + '/' + brFile;
        outZip.file(dest, buf);
        log('DONE', `textures_blocks/<b>${escHtml(filename)}</b> → ${dest}`, 'done');
        continue;
      }

      // Conflict resolution: same filename in multiple folders.
      // textures_blocks/ подразумевает блок-текстуры → если есть block/-вариант, берём его автоматически.
      // Модалку показываем только когда block/ среди вариантов нет.
      const conflictOpts = TEX_CONFLICTS[filename];
      let resolvedEntry = null;
      if (conflictOpts) {
        // Сначала ищем вариант с block/-путём именно для текущей версии (fieldKey).
        // Только если не нашли — ищем cross-version (для старых Java-версий, где v1214 есть, а v116 нет).
        const blockOpt =
          conflictOpts.find(function(o) {
            const p = o[fieldKey] || '';
            return p.startsWith('block/') || p.startsWith('blocks/');
          }) ||
          conflictOpts.find(function(o) {
            const p = o['v1214'] || o['v116'] || o['bedrock'] || '';
            return p.startsWith('block/') || p.startsWith('blocks/');
          });
        if (blockOpt) {
          resolvedEntry = blockOpt;
        } else {
          let choiceIdx;
          if (_conflictCache.has(filename)) {
            choiceIdx = _conflictCache.get(filename);
          } else {
            choiceIdx = await showConflictModal(filename, conflictOpts);
          }
          resolvedEntry = conflictOpts[choiceIdx];
        }
      }

      // Общий индекс (для неконфликтных файлов)
      const entry = resolvedEntry || TEX_IDX[filename];
      if (!entry) {
        const blockDir = isBedrock ? 'blocks/' : 'block/';
        const fallback = outPrefix + blockDir + filename;
        outZip.file(fallback, buf);
        log('WARN', `textures_blocks/<b>${escHtml(filename)}</b> — не в индексе → ${blockDir}${escHtml(filename)}`, 'warn');
        continue;
      }
      // For java-old: check against rp_both_slim data (textures that exist in 1.16)
      if (versionKey === 'java-old' && !V116_SUPPORTED.has(filename)) {
        const fallback = outPrefix + (entry['v1214'] || 'block/' + filename);
        outZip.file(fallback, buf);
        log('ERR', `textures_blocks/<b>${escHtml(filename)}</b> — текстура не поддерживается в версии 1.16. Выберите другой объект для замены текстуры`, 'err');
        continue;
      }
      const destRel = entry[fieldKey];
      if (!destRel) {
        const blockDir = isBedrock ? 'blocks/' : 'block/';
        const fallback = outPrefix + blockDir + filename;
        outZip.file(fallback, buf);
        log('SKIP', `textures_blocks/<b>${escHtml(filename)}</b> → ${blockDir}${escHtml(filename)} (нет пути для ${versionKey})`, 'skip');
        continue;
      }
      outZip.file(outPrefix + destRel, buf);
      log('DONE', `textures_blocks/<b>${escHtml(filename)}</b> → ${outPrefix}${destRel}`, 'done');
    }
  }

  function parseVersion(str) {
    const parts = (str || '1.0.0').trim().split('.').map(s => parseInt(s, 10) || 0);
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  }

  function getOrCreateUUID(key) {
    let uuid = localStorage.getItem(key);
    if (!uuid) { uuid = crypto.randomUUID(); localStorage.setItem(key, uuid); }
    return uuid;
  }

  function findRootBones(geoJson) {
    const bones = [];
    try {
      for (const g of geoJson['minecraft:geometry'] || [])
        (g.bones || []).forEach(b => bones.push(b));
    } catch (_) {}
    return bones.filter(b => b.name && !('parent' in b)).map(b => b.name);
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }
