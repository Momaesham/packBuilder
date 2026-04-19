  // ── State ──────────────────────────────────────────────
  let selectedFile       = null;
  let outputBlob         = null;
  let outputBlobLocal    = null;
  let configBlob         = null;
  let bedrockMappingBlob = null;
  let lastCmds           = null;
  let activeVersion      = 'java-old'; // 'java-old' | 'java-new'

  // ── Version tabs ──────────────────────────────────────
  const versionMap = { 'tab-java-old': 'java-old', 'tab-java-new': 'java-new', 'tab-bedrock': 'bedrock' };
  document.querySelectorAll('.tab:not(.soon)').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeVersion = versionMap[tab.id] || 'java-old';
      document.getElementById('versionCard').style.display = activeVersion === 'bedrock' ? 'block' : 'none';
      document.getElementById('downloadBtn').classList.remove('visible');
      document.getElementById('downloadBtnLocal').classList.remove('visible');
      document.getElementById('configBtn').classList.remove('visible');
      document.getElementById('bedrockMappingBtn').classList.remove('visible');
      document.getElementById('logCard').classList.remove('visible');
      outputBlob         = null;
      outputBlobLocal    = null;
      configBlob         = null;
      bedrockMappingBlob = null;
      lastCmds           = null;
    });
  });

  // ── Guide toggle ───────────────────────────────────────
  const guideToggle = document.getElementById('guideToggle');
  const guideBody   = document.getElementById('guideBody');
  guideToggle.addEventListener('click', () => {
    const open = guideBody.classList.toggle('open');
    guideToggle.classList.toggle('open', open);
  });

  // ── Instructions toggle ────────────────────────────────
  const instrToggle = document.getElementById('instrToggle');
  const instrBody   = document.getElementById('instrBody');
  instrToggle.addEventListener('click', () => {
    const open = instrBody.classList.toggle('open');
    instrToggle.classList.toggle('open', open);
  });
  // Open by default
  instrBody.classList.add('open');
  instrToggle.classList.add('open');

  // ── Drop Zone ──────────────────────────────────────────
  const dropZone  = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const buildBtn  = document.getElementById('buildBtn');

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  function handleFile(f) {
    if (!f.name.endsWith('.zip')) {
      showDropError('Нужен .zip файл');
      return;
    }
    selectedFile = f;
    const sizeLabel = f.size > 1024 * 1024
      ? (f.size / 1024 / 1024).toFixed(1) + ' MB'
      : (f.size / 1024).toFixed(1) + ' KB';

    document.getElementById('dropContent').innerHTML = `
      <div class="file-info">
        <span>📦</span>
        <span class="name">${escHtml(f.name)}</span>
        <span class="badge">${sizeLabel}</span>
      </div>`;
    buildBtn.disabled = false;
    document.getElementById('downloadBtn').classList.remove('visible');
    document.getElementById('configBtn').classList.remove('visible');
    document.getElementById('bedrockMappingBtn').classList.remove('visible');
    document.getElementById('logCard').classList.remove('visible');
    outputBlob         = null;
    configBlob         = null;
    bedrockMappingBlob = null;
    lastCmds           = null;
  }

  function showDropError(msg) {
    document.getElementById('dropContent').innerHTML = `
      <div class="file-info">
        <span>⚠️</span>
        <span class="name" style="color:var(--err)">${msg}</span>
      </div>`;
    buildBtn.disabled = true;
  }

  // ── Logging ────────────────────────────────────────────
  let _logFilter = 'all';

  function log(tag, msg, type = 'info') {
    const out = document.getElementById('logOutput');
    const line = document.createElement('div');
    const hidden = _logFilter !== 'all' && _logFilter !== type;
    line.className = 'log-line' + (hidden ? ' log-hidden' : '');
    line.dataset.type = type;
    line.innerHTML = `<span class="log-tag t-${type}">[${tag}]</span><span class="log-msg">${msg}</span>`;
    out.appendChild(line);
    if (!hidden) out.scrollTop = out.scrollHeight;
  }

  // ── Log filters ────────────────────────────────────────
  document.querySelectorAll('.log-filter').forEach(function(btn) {
    btn.addEventListener('click', function() {
      _logFilter = btn.dataset.filter;
      document.querySelectorAll('.log-filter').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('#logOutput .log-line').forEach(function(line) {
        const show = _logFilter === 'all' || line.dataset.type === _logFilter;
        line.classList.toggle('log-hidden', !show);
      });
    });
  });

  // ── Build ──────────────────────────────────────────────
  buildBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    buildBtn.disabled = true;
    buildBtn.innerHTML = '<span class="spinner"></span> Собираю...';

    const logCard = document.getElementById('logCard');
    logCard.classList.add('visible', 'fade-in');
    document.getElementById('logOutput').innerHTML = '';
    document.getElementById('downloadBtn').classList.remove('visible');
    document.getElementById('downloadBtnLocal').classList.remove('visible');
    document.getElementById('configBtn').classList.remove('visible');
    document.getElementById('bedrockMappingBtn').classList.remove('visible');
    outputBlobLocal    = null;
    configBlob         = null;
    bedrockMappingBlob = null;
    lastCmds           = null;
    _logFilter = 'all';
    document.querySelectorAll('.log-filter').forEach(function(b) { b.classList.remove('active'); });
    document.querySelector('.log-filter[data-filter="all"]').classList.add('active');

    try {
      let buildResult;
      if (activeVersion === 'java-new') {
        buildResult = await buildJavaNew(selectedFile);
      } else if (activeVersion === 'bedrock') {
        buildResult = { regular: await buildBedrock(selectedFile), local: null };
      } else {
        buildResult = await buildJavaOld(selectedFile);
      }
      outputBlob      = buildResult.regular;
      outputBlobLocal = buildResult.local;
      log('ГОТОВО', `<b>Пак успешно собран!</b>`, 'done');
      document.getElementById('downloadBtn').classList.add('visible', 'fade-in');
      if (outputBlobLocal) {
        document.getElementById('downloadBtnLocal').classList.add('visible', 'fade-in');
      }
      if (lastCmds) {
        configBlob = new Blob([generateCustomModelYaml(lastCmds)], { type: 'text/yaml' });
        document.getElementById('configBtn').classList.add('visible', 'fade-in');
      }
      if (activeVersion === 'bedrock' && lastCmds) {
        bedrockMappingBlob = new Blob([generateBedrockMapping(lastCmds)], { type: 'application/json' });
        document.getElementById('bedrockMappingBtn').classList.add('visible', 'fade-in');
      }
    } catch (e) {
      log('ОШИБКА', `<b>${escHtml(e.message)}</b>`, 'err');
    } finally {
      buildBtn.disabled  = false;
      buildBtn.innerHTML = 'Собрать ресурс-пак';
    }
  });

  // ── Core: Java 1.16 – 1.21.3 ─────────────────────────
  async function buildJavaOld(file) {
    const inZip  = await JSZip.loadAsync(file);
    const outZip = new JSZip();

    // Автодетект корневой папки (архиватор может добавить её автоматически)
    const root = getRootPrefix(inZip);
    if (root) log('INFO', `Обнаружена корневая папка: <b>${escHtml(root)}</b>`, 'info');
    else      log('INFO', 'Архив прочитан', 'info');

    // pack.mcmeta
    outZip.file('pack.mcmeta', JSON.stringify({
      pack: {
        pack_format: 6,
        supported_formats: { min_inclusive: 6, max_inclusive: 42 },
        description: "Custom Models"
      }
    }, null, 4));
    log('DONE', '<b>pack.mcmeta</b> создан', 'done');

    // cmds.json
    const cmdsFile = inZip.file(root + 'cmds.json');
    if (!cmdsFile) throw new Error('Файл cmds.json не найден в архиве');
    const cmds = JSON.parse(await cmdsFile.async('string'));
    lastCmds = cmds;
    const cmdCount = Object.keys(cmds).length;
    log('INFO', `<b>cmds.json</b>: найдено ${cmdCount} ${plural(cmdCount, 'модель', 'модели', 'моделей')}`, 'info');

    // models_java → assets/minecraft/models/custom/
    const modelFiles = getFiles(inZip, root + 'models_java/');
    if (modelFiles.length === 0) {
      log('WARN', 'Папка <b>models_java</b> пуста или не найдена', 'warn');
    }
    for (const path of modelFiles) {
      const rel       = path.slice((root + 'models_java/').length);
      const modelName = rel.replace(/\.json$/i, '');

      // Читаем как текст — чтобы сохранить форматирование
      const rawText = await inZip.files[path].async('string');
      let modelJson;
      try {
        modelJson = JSON.parse(rawText);
      } catch (e) {
        log('ERR', `<b>${escHtml(rel)}</b>: ошибка парсинга JSON — ${escHtml(e.message)}`, 'err');
        continue;
      }

      // Заменяем пути текстур прямо в исходном тексте (форматирование не трогаем)
      let outputText = rawText;
      if (modelJson.textures && typeof modelJson.textures === 'object') {
        const correctPath = `minecraft:block/${modelName}`;
        let changedCount = 0;
        for (const key of Object.keys(modelJson.textures)) {
          const oldVal = modelJson.textures[key];
          if (oldVal !== correctPath) {
            outputText = outputText.replaceAll(`"${oldVal}"`, `"${correctPath}"`);
            changedCount++;
          }
        }
        if (changedCount > 0) {
          log('DONE', `models/custom/<b>${escHtml(rel)}</b> — исправлено путей: ${changedCount}`, 'done');
        } else {
          log('DONE', `models/custom/<b>${escHtml(rel)}</b>`, 'done');
        }
      } else {
        log('SKIP', `models/custom/<b>${escHtml(rel)}</b> — нет секции textures`, 'skip');
      }

      // Проверяем, что текстура с таким же именем есть в папке textures/
      const texExists = inZip.file(root + `textures/${modelName}.png`);
      if (!texExists) {
        log('WARN', `Текстура <b>${escHtml(modelName)}.png</b> не найдена в textures/`, 'warn');
      }

      // Добавляем/дополняем display.head если нужно
      {
        const headVal = { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1.6, 1.6, 1.6] };
        let djson = JSON.parse(outputText);
        if (!djson.display) {
          djson.display = {
            head:  headVal,
            fixed: { rotation: [0, 0, 0], translation: [0, 10.0, 0], scale: [1.6, 1.6, 1.6] }
          };
          outputText = JSON.stringify(djson, null, 2);
          log('INFO', `models/custom/<b>${escHtml(rel)}</b> — добавлен display.head`, 'info');
        } else if (!djson.display.head) {
          djson.display.head = headVal;
          outputText = JSON.stringify(djson, null, 2);
          log('INFO', `models/custom/<b>${escHtml(rel)}</b> — добавлен display.head (display уже был)`, 'info');
        } else if (!djson.display.head.scale) {
          djson.display.head.scale = [1.6, 1.6, 1.6];
          outputText = JSON.stringify(djson, null, 2);
          log('INFO', `models/custom/<b>${escHtml(rel)}</b> — добавлен display.head.scale`, 'info');
        }
      }

      outZip.file(`assets/minecraft/models/custom/${rel}`, outputText);
    }

    // paper.json (overrides)
    const overrides = Object.entries(cmds)
      .map(([cmd, name]) => ({
        predicate: { custom_model_data: parseInt(cmd, 10) },
        model: `minecraft:custom/${name}`
      }))
      .sort((a, b) => a.predicate.custom_model_data - b.predicate.custom_model_data);

    const paperJson = {
      parent: "minecraft:item/generated",
      textures: { layer0: "minecraft:item/paper" },
      overrides
    };
    outZip.file('assets/minecraft/models/item/paper.json',
      JSON.stringify(paperJson, null, 2));
    log('DONE', `models/item/<b>paper.json</b> (${overrides.length} overrides)`, 'done');

    // textures → assets/minecraft/textures/block/
    const texFiles = getFiles(inZip, root + 'textures/');
    if (texFiles.length === 0) {
      log('WARN', 'Папка <b>textures</b> пуста или не найдена', 'warn');
    }
    for (const path of texFiles) {
      const rel = path.slice((root + 'textures/').length);
      const buf = await inZip.files[path].async('arraybuffer');
      outZip.file(`assets/minecraft/textures/block/${rel}`, buf);
      log('DONE', `textures/block/<b>${escHtml(rel)}</b>`, 'done');
    }

    await processTexturesBlocks(inZip, outZip, root, 'java-old');

    log('INFO', 'Генерирую ZIP...', 'info');
    const regularBlob1 = await outZip.generateAsync({ type: 'blob' });

    // Локальный пак: paper.json → stick.json
    outZip.remove('assets/minecraft/models/item/paper.json');
    const stickJson1 = {
      parent: 'minecraft:item/handheld',
      textures: { layer0: 'minecraft:item/stick' },
      overrides
    };
    outZip.file('assets/minecraft/models/item/stick.json', JSON.stringify(stickJson1, null, 2));
    const localBlob1 = await outZip.generateAsync({ type: 'blob' });

    return { regular: regularBlob1, local: localBlob1 };
  }

  // ── Core: Java 1.21.4+ ───────────────────────────────
  async function buildJavaNew(file) {
    const inZip  = await JSZip.loadAsync(file);
    const outZip = new JSZip();

    const root = getRootPrefix(inZip);
    if (root) log('INFO', `Обнаружена корневая папка: <b>${escHtml(root)}</b>`, 'info');
    else      log('INFO', 'Архив прочитан', 'info');

    // pack.mcmeta
    outZip.file('pack.mcmeta', JSON.stringify({
      pack: {
        pack_format: 46,
        supported_formats: { min_inclusive: 46, max_inclusive: 9999 },
        description: "Custom Models"
      }
    }, null, 4));
    log('DONE', '<b>pack.mcmeta</b> создан', 'done');

    // cmds.json
    const cmdsFile = inZip.file(root + 'cmds.json');
    if (!cmdsFile) throw new Error('Файл cmds.json не найден в архиве');
    const cmds = JSON.parse(await cmdsFile.async('string'));
    lastCmds = cmds;
    const cmdCount = Object.keys(cmds).length;
    log('INFO', `<b>cmds.json</b>: найдено ${cmdCount} ${plural(cmdCount, 'модель', 'модели', 'моделей')}`, 'info');

    // models_java → assets/minecraft/models/custom/
    const modelFiles = getFiles(inZip, root + 'models_java/');
    if (modelFiles.length === 0) {
      log('WARN', 'Папка <b>models_java</b> пуста или не найдена', 'warn');
    }
    for (const path of modelFiles) {
      const rel       = path.slice((root + 'models_java/').length);
      const modelName = rel.replace(/\.json$/i, '');

      const rawText = await inZip.files[path].async('string');
      let modelJson;
      try {
        modelJson = JSON.parse(rawText);
      } catch (e) {
        log('ERR', `<b>${escHtml(rel)}</b>: ошибка парсинга JSON — ${escHtml(e.message)}`, 'err');
        continue;
      }

      let outputText = rawText;
      if (modelJson.textures && typeof modelJson.textures === 'object') {
        const correctPath = `minecraft:block/${modelName}`;
        let changedCount = 0;
        for (const key of Object.keys(modelJson.textures)) {
          const oldVal = modelJson.textures[key];
          if (oldVal !== correctPath) {
            outputText = outputText.replaceAll(`"${oldVal}"`, `"${correctPath}"`);
            changedCount++;
          }
        }
        if (changedCount > 0) {
          log('DONE', `models/custom/<b>${escHtml(rel)}</b> — исправлено путей: ${changedCount}`, 'done');
        } else {
          log('DONE', `models/custom/<b>${escHtml(rel)}</b>`, 'done');
        }
      } else {
        log('SKIP', `models/custom/<b>${escHtml(rel)}</b> — нет секции textures`, 'skip');
      }

      const texExists = inZip.file(root + `textures/${modelName}.png`);
      if (!texExists) {
        log('WARN', `Текстура <b>${escHtml(modelName)}.png</b> не найдена в textures/`, 'warn');
      }

      // Добавляем/дополняем display.head если нужно
      {
        const headVal = { rotation: [0, 0, 0], translation: [0, 0, 0], scale: [1.6, 1.6, 1.6] };
        let djson = JSON.parse(outputText);
        if (!djson.display) {
          djson.display = {
            head:  headVal,
            fixed: { rotation: [0, 0, 0], translation: [0, 10.0, 0], scale: [1.6, 1.6, 1.6] }
          };
          outputText = JSON.stringify(djson, null, 2);
          log('INFO', `models/custom/<b>${escHtml(rel)}</b> — добавлен display.head`, 'info');
        } else if (!djson.display.head) {
          djson.display.head = headVal;
          outputText = JSON.stringify(djson, null, 2);
          log('INFO', `models/custom/<b>${escHtml(rel)}</b> — добавлен display.head (display уже был)`, 'info');
        } else if (!djson.display.head.scale) {
          djson.display.head.scale = [1.6, 1.6, 1.6];
          outputText = JSON.stringify(djson, null, 2);
          log('INFO', `models/custom/<b>${escHtml(rel)}</b> — добавлен display.head.scale`, 'info');
        }
      }

      outZip.file(`assets/minecraft/models/custom/${rel}`, outputText);
    }

    // items/paper.json (range_dispatch)
    const entries = Object.entries(cmds)
      .map(([cmd, name]) => ({
        threshold: parseInt(cmd, 10),
        model: { type: 'minecraft:model', model: `minecraft:custom/${name}` }
      }))
      .sort((a, b) => a.threshold - b.threshold);

    const paperJson = {
      model: {
        type: 'minecraft:range_dispatch',
        property: 'minecraft:custom_model_data',
        fallback: {
          type: 'minecraft:model',
          model: 'minecraft:item/paper'
        },
        entries
      }
    };
    outZip.file('assets/minecraft/items/paper.json',
      JSON.stringify(paperJson, null, 2)
        .replace(/"threshold": (\d+)(?!\.\d)/g, '"threshold": $1.0'));
    log('DONE', `items/<b>paper.json</b> (${entries.length} entries)`, 'done');

    // textures → assets/minecraft/textures/block/
    const texFiles = getFiles(inZip, root + 'textures/');
    if (texFiles.length === 0) {
      log('WARN', 'Папка <b>textures</b> пуста или не найдена', 'warn');
    }
    for (const path of texFiles) {
      const rel = path.slice((root + 'textures/').length);
      const buf = await inZip.files[path].async('arraybuffer');
      outZip.file(`assets/minecraft/textures/block/${rel}`, buf);
      log('DONE', `textures/block/<b>${escHtml(rel)}</b>`, 'done');
    }

    await processTexturesBlocks(inZip, outZip, root, 'java-new');

    log('INFO', 'Генерирую ZIP...', 'info');
    const regularBlob2 = await outZip.generateAsync({ type: 'blob' });

    // Локальный пак: paper.json → stick.json
    outZip.remove('assets/minecraft/items/paper.json');
    const stickJson2 = {
      model: {
        type: 'minecraft:range_dispatch',
        property: 'minecraft:custom_model_data',
        fallback: { type: 'minecraft:model', model: 'minecraft:item/stick' },
        entries
      }
    };
    outZip.file('assets/minecraft/items/stick.json',
      JSON.stringify(stickJson2, null, 2)
        .replace(/"threshold": (\d+)(?!\.\d)/g, '"threshold": $1.0'));
    const localBlob2 = await outZip.generateAsync({ type: 'blob' });

    return { regular: regularBlob2, local: localBlob2 };
  }

  // ── Download ──────────────────────────────────────────
  document.getElementById('downloadBtn').addEventListener('click', () => {
    if (!outputBlob) return;
    const url = URL.createObjectURL(outputBlob);
    const a   = document.createElement('a');
    a.href     = url;
    const dlNames = { 'java-old': 'resource_pack_java_1.16-1.21.3.zip', 'java-new': 'resource_pack_java_1.21.4+.zip', 'bedrock': 'test_pack.zip' };
    a.download = dlNames[activeVersion] || 'resource_pack.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('downloadBtnLocal').addEventListener('click', () => {
    if (!outputBlobLocal) return;
    const url = URL.createObjectURL(outputBlobLocal);
    const a   = document.createElement('a');
    a.href     = url;
    const dlNames = { 'java-old': 'resource_pack_java_1.16-1.21.3_local.zip', 'java-new': 'resource_pack_java_1.21.4+_local.zip' };
    a.download = dlNames[activeVersion] || 'resource_pack_local.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('configBtn').addEventListener('click', () => {
    if (!configBlob) return;
    const url = URL.createObjectURL(configBlob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = 'custom_models.yml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('bedrockMappingBtn').addEventListener('click', () => {
    if (!bedrockMappingBlob) return;
    const url = URL.createObjectURL(bedrockMappingBlob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = 'paper.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });


  // ── Core: Bedrock ─────────────────────────────────────
  async function buildBedrock(file) {
    const inZip  = await JSZip.loadAsync(file);
    const outZip = new JSZip();
    const root   = getRootPrefix(inZip);

    if (root) log('INFO', `Обнаружена корневая папка: <b>${escHtml(root)}</b>`, 'info');
    else      log('INFO', 'Архив прочитан', 'info');

    // Версия из поля ввода
    const versionArr = parseVersion(document.getElementById('versionInput').value);
    const versionStr = versionArr.join('.');

    // cmds.json
    const cmdsFile = inZip.file(root + 'cmds.json');
    if (!cmdsFile) throw new Error('Файл cmds.json не найден в архиве');
    const cmds = JSON.parse(await cmdsFile.async('string'));
    lastCmds = cmds;
    const cmdCount = Object.keys(cmds).length;
    log('INFO', `<b>cmds.json</b>: найдено ${cmdCount} ${plural(cmdCount, 'модель', 'модели', 'моделей')}`, 'info');

    // UUIDs — генерируем один раз и сохраняем в localStorage
    const uuid1 = getOrCreateUUID('bedrock_uuid_header');
    const uuid2 = getOrCreateUUID('bedrock_uuid_module');

    // manifest.json
    outZip.file('test_pack/manifest.json', JSON.stringify({
      format_version: 2,
      header: {
        name: "custom",
        description: "custom for server",
        uuid: uuid1,
        version: versionArr,
        min_engine_version: [1, 16, 0]
      },
      modules: [{ type: "resources", uuid: uuid2, version: versionArr }]
    }, null, 2));
    log('DONE', `<b>manifest.json</b> (версия ${versionStr})`, 'done');

    // Список иконок (без расширения) для определения пути текстуры
    const iconNames = new Set(
      getFiles(inZip, root + 'textures_icon/')
        .map(p => p.slice((root + 'textures_icon/').length).replace(/\.[^.]+$/, ''))
    );

    const itemTextureData   = {};
    const terrainTextureData = {};

    // Обрабатываем каждый geo.json из models_bedrock
    const modelFiles = getFiles(inZip, root + 'models_bedrock/');
    if (modelFiles.length === 0) {
      log('WARN', 'Папка <b>models_bedrock</b> пуста или не найдена', 'warn');
    }

    for (const path of modelFiles) {
      const rel       = path.slice((root + 'models_bedrock/').length);
      const modelName = rel.replace(/\.geo\.json$/i, '').replace(/\.json$/i, '');

      const rawText = await inZip.files[path].async('string');
      let geoJson;
      try {
        geoJson = JSON.parse(rawText);
      } catch (e) {
        log('ERR', `<b>${escHtml(rel)}</b>: ошибка парсинга — ${escHtml(e.message)}`, 'err');
        continue;
      }

      // Фиксируем identifier прямо в тексте
      const geoText = rawText.replace(
        /"identifier"\s*:\s*"geometry\.[^"]*"/,
        `"identifier": "geometry.${modelName}"`
      );
      outZip.file(`test_pack/models/entity/${rel}`, geoText);
      log('DONE', `models/entity/<b>${escHtml(rel)}</b>`, 'done');

      // Находим корневые кости
      const rootBones = findRootBones(geoJson);
      if (rootBones.length === 0) {
        log('WARN', `<b>${escHtml(modelName)}</b>: корневые кости не найдены`, 'warn');
      }

      // animations/<model>.animation.json
      const animKey = `animation.${modelName}.head_offset`;
      outZip.file(`test_pack/animations/${modelName}.animation.json`, JSON.stringify({
        format_version: "1.8.0",
        animations: {
          [animKey]: {
            loop: true,
            bones: Object.fromEntries(
              rootBones.map(bone => [bone, { position: [0, 20.0, 0] }])
            )
          }
        }
      }, null, 4));
      log('DONE', `animations/<b>${modelName}.animation.json</b> (кости: ${rootBones.join(', ') || 'нет'})`, 'done');

      // attachables/<model>.json
      const attachTexture = `textures/items/${modelName}`;
      outZip.file(`test_pack/attachables/${modelName}.json`, JSON.stringify({
        format_version: "1.10.0",
        "minecraft:attachable": {
          description: {
            identifier: `test:${modelName}`,
            materials: { default: "entity_alphatest" },
            textures: { default: attachTexture },
            geometry: { default: `geometry.${modelName}` },
            render_controllers: ["controller.render.item_default"],
            animations: { head_offset: animKey },
            scripts: { animate: ["head_offset"] }
          }
        }
      }, null, 4));
      log('DONE', `attachables/<b>${modelName}.json</b>`, 'done');

      // items/<model>.json
      outZip.file(`test_pack/items/${modelName}.json`, JSON.stringify({
        format_version: "1.21.0",
        "minecraft:item": {
          description: { identifier: `test:${modelName}`, category: "items" },
          components: { "minecraft:icon": { texture: modelName } }
        }
      }, null, 4));
      log('DONE', `items/<b>${modelName}.json</b>`, 'done');

      // Данные для item_texture.json
      const iconTexPath = iconNames.has(modelName)
        ? `textures/items/icons/${modelName}`
        : `textures/items/${modelName}`;
      itemTextureData[`test:${modelName}`] = { textures: [iconTexPath] };
      terrainTextureData[modelName] = { textures: `textures/items/${modelName}` };
    }

    // item_texture.json
    outZip.file('test_pack/textures/item_texture.json', JSON.stringify({
      resource_pack_name: "test_pack",
      texture_name: "atlas.items",
      texture_data: itemTextureData
    }, null, 4));
    log('DONE', '<b>item_texture.json</b>', 'done');

    // terrain_texture.json
    outZip.file('test_pack/textures/terrain_texture.json', JSON.stringify({
      resource_pack_name: "test_pack",
      texture_name: "atlas.terrain",
      texture_data: terrainTextureData
    }, null, 4));
    log('DONE', '<b>terrain_texture.json</b>', 'done');

    // textures/items/ — копируем из textures/
    for (const path of getFiles(inZip, root + 'textures/')) {
      const rel = path.slice((root + 'textures/').length);
      const buf = await inZip.files[path].async('arraybuffer');
      outZip.file(`test_pack/textures/items/${rel}`, buf);
      log('DONE', `textures/items/<b>${escHtml(rel)}</b>`, 'done');
    }

    // textures/items/icons/ — копируем из textures_icon/
    for (const path of getFiles(inZip, root + 'textures_icon/')) {
      const rel = path.slice((root + 'textures_icon/').length);
      const buf = await inZip.files[path].async('arraybuffer');
      outZip.file(`test_pack/textures/items/icons/${rel}`, buf);
      log('DONE', `textures/items/icons/<b>${escHtml(rel)}</b>`, 'done');
    }

    await processTexturesBlocks(inZip, outZip, root, 'bedrock');

    log('INFO', 'Генерирую ZIP...', 'info');
    return outZip.generateAsync({ type: 'blob' });
  }

