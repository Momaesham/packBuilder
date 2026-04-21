  // ── Java → Bedrock ───────────────────────────────────
  (function() {
    var jbFile1 = null, jbFile2 = null, jbOutputBlob = null, jbMappingBlob = null, _jbLogFilter = 'all';

    function jbHandleFile(f, contentId, slot) {
      if (!f.name.endsWith('.zip')) {
        document.getElementById(contentId).innerHTML =
          '<div class="file-info"><span>⚠️</span>' +
          '<span class="name" style="color:var(--err)">Нужен .zip файл</span></div>';
        if (slot === 1) jbFile1 = null; else jbFile2 = null;
        jbUpdateBtn();
        return;
      }
      if (slot === 1) jbFile1 = f; else jbFile2 = f;
      var sizeLabel = f.size > 1048576
        ? (f.size / 1048576).toFixed(1) + ' MB'
        : (f.size / 1024).toFixed(1) + ' KB';
      document.getElementById(contentId).innerHTML =
        '<div class="file-info"><span>📦</span><span class="name">' +
        escHtml(f.name) + '</span><span class="badge">' + sizeLabel + '</span></div>';
      jbUpdateBtn();
    }

    function jbUpdateBtn() {
      document.getElementById('jbBuildBtn').disabled = !(jbFile1 && jbFile2);
    }

    // Locate a named folder inside a ZIP regardless of any root wrapper.
    // Returns the full prefix up to and including 'folderName/', e.g. 'root/models_bedrock/'
    function jbFindFolder(zip, folderName) {
      var target = folderName + '/';
      var keys   = Object.keys(zip.files).filter(function(p) { return !zip.files[p].dir; });
      for (var i = 0; i < keys.length; i++) {
        var idx = keys[i].indexOf(target);
        if (idx !== -1) return keys[i].slice(0, idx + target.length);
      }
      return target; // fallback: assume at root
    }

    function jbLog(tag, msg, type) {
      var out  = document.getElementById('jbLogOutput');
      var line = document.createElement('div');
      var hidden = _jbLogFilter !== 'all' && _jbLogFilter !== type;
      line.className = 'log-line' + (hidden ? ' log-hidden' : '');
      line.dataset.type = type;
      line.innerHTML = '<span class="log-tag t-' + type + '">[' + tag + ']</span>' +
                       '<span class="log-msg">' + msg + '</span>';
      out.appendChild(line);
      if (!hidden) out.scrollTop = out.scrollHeight;
    }

    ['1','2'].forEach(function(n) {
      var zone  = document.getElementById('jbDropZone' + n);
      var input = document.getElementById('jbFileInput' + n);
      var slot  = parseInt(n, 10);
      var cid   = 'jbDropContent' + n;
      zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', function() { zone.classList.remove('over'); });
      zone.addEventListener('drop', function(e) {
        e.preventDefault(); zone.classList.remove('over');
        var f = e.dataTransfer.files[0];
        if (f) jbHandleFile(f, cid, slot);
      });
      input.addEventListener('change', function(e) {
        if (e.target.files[0]) jbHandleFile(e.target.files[0], cid, slot);
      });
    });

    document.querySelectorAll('[data-jbfilter]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _jbLogFilter = btn.dataset.jbfilter;
        document.querySelectorAll('[data-jbfilter]').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('#jbLogOutput .log-line').forEach(function(line) {
          line.classList.toggle('log-hidden', _jbLogFilter !== 'all' && line.dataset.type !== _jbLogFilter);
        });
      });
    });

    document.getElementById('jbBuildBtn').addEventListener('click', async function() {
      var btn = document.getElementById('jbBuildBtn');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Конвертирую...';
      _jbLogFilter = 'all';
      document.querySelectorAll('[data-jbfilter]').forEach(function(b) { b.classList.remove('active'); });
      document.querySelector('[data-jbfilter="all"]').classList.add('active');
      document.getElementById('jbLogCard').classList.add('visible', 'fade-in');
      document.getElementById('jbLogOutput').innerHTML = '';
      document.getElementById('jbDownloadBtn').classList.remove('visible');
      document.getElementById('jbMappingBtn').classList.remove('visible');
      jbOutputBlob  = null;
      jbMappingBlob = null;
      try {
        var javaZip  = await JSZip.loadAsync(jbFile1);
        var brZip    = await JSZip.loadAsync(jbFile2);
        var outZip   = new JSZip();
        var javaRoot     = getRootPrefix(javaZip);
        var brModelsBase = jbFindFolder(brZip, 'models_bedrock');
        var brIconsBase  = jbFindFolder(brZip, 'textures_icon');
        if (javaRoot) jbLog('INFO', 'Java пак: корневая папка <b>' + escHtml(javaRoot) + '</b>', 'info');

        var vArr = parseVersion(document.getElementById('jbVersionInput').value);
        var vStr = vArr.join('.');

        // UUIDs (shared with bedrock builder)
        var uuid1 = getOrCreateUUID('bedrock_uuid_header');
        var uuid2 = getOrCreateUUID('bedrock_uuid_module');

        // manifest.json
        outZip.file('test_pack/manifest.json', JSON.stringify({
          format_version: 2,
          header: {
            name: "custom",
            description: "custom for server",
            uuid: uuid1,
            version: vArr,
            min_engine_version: [1, 16, 0]
          },
          modules: [{ type: "resources", uuid: uuid2, version: vArr }]
        }, null, 2));
        jbLog('DONE', '<b>manifest.json</b> (версия ' + vStr + ')', 'done');

        // Icons set for path selection in texture atlases
        var iconNames = new Set(
          getFiles(brZip, brIconsBase)
            .map(function(p) {
              return p.slice(brIconsBase.length).replace(/\.[^.]+$/, '');
            })
        );

        var itemTextureData    = {};
        var terrainTextureData = {};

        // ── Bedrock models ──────────────────────────────
        var modelFiles = getFiles(brZip, brModelsBase);
        if (modelFiles.length === 0) {
          jbLog('WARN', 'Папка <b>models_bedrock</b> не найдена во втором архиве', 'warn');
        }
        for (var mi = 0; mi < modelFiles.length; mi++) {
          var mpath     = modelFiles[mi];
          var mrel      = mpath.slice(brModelsBase.length);
          var modelName = mrel.replace(/\.geo\.json$/i, '').replace(/\.json$/i, '');
          var rawText   = await brZip.files[mpath].async('string');
          var geoJson;
          try {
            geoJson = JSON.parse(rawText);
          } catch(e) {
            jbLog('ERR', '<b>' + escHtml(mrel) + '</b>: ошибка парсинга — ' + escHtml(e.message), 'err');
            continue;
          }

          // Fix geometry identifier in parsed JSON
          var geomArr = geoJson['minecraft:geometry'];
          if (Array.isArray(geomArr) && geomArr[0] && geomArr[0].description) {
            geomArr[0].description.identifier = 'geometry.' + modelName;
          }

          // Read Java model: item_display_transforms + animation params from display.head
          var jbHeadY = 0, jbBoneScale = null;
          var javaModelFile = javaZip.file(javaRoot + 'assets/minecraft/models/custom/' + modelName + '.json');
          if (javaModelFile) {
            try {
              var javaModel = JSON.parse(await javaModelFile.async('string'));
              if (javaModel.display) {
                if (Array.isArray(geomArr) && geomArr[0]) {
                  geomArr[0].item_display_transforms = javaModel.display;
                }
                jbLog('INFO', 'models/entity/<b>' + escHtml(mrel) + '</b> — item_display_transforms добавлен', 'info');
                var head = javaModel.display.head;
                if (head) {
                  jbHeadY = (head.translation && typeof head.translation[1] === 'number') ? head.translation[1] : 0;
                  if (head.scale && head.scale[0] !== undefined && head.scale[0] !== 1) {
                    var rawScale = head.scale[0] / 1.6;
                    var rounded  = Math.round(rawScale * 10) / 10;
                    if (rounded !== 1) jbBoneScale = rounded;
                  }
                }
              }
            } catch(e) {
              jbLog('WARN', '<b>' + escHtml(modelName) + '</b>: ошибка чтения Java модели — ' + escHtml(e.message), 'warn');
            }
          } else {
            jbLog('WARN', 'models/entity/<b>' + escHtml(mrel) + '</b>: Java модель не найдена, display не добавлен', 'warn');
          }

          var geoText = JSON.stringify(geoJson, null, 2);
          outZip.file('test_pack/models/entity/' + mrel, geoText);
          jbLog('DONE', 'models/entity/<b>' + escHtml(mrel) + '</b>', 'done');

          var rootBones = findRootBones(geoJson);
          if (rootBones.length === 0) {
            jbLog('WARN', '<b>' + escHtml(modelName) + '</b>: корневые кости не найдены', 'warn');
          }

          // animations — position и scale из display.head джава-модели
          var animKey  = 'animation.' + modelName + '.head_offset';
          var boneData = { position: [0, 24 + jbHeadY, 0] };
          if (jbBoneScale !== null) boneData.scale = [jbBoneScale, jbBoneScale, jbBoneScale];
          var animBones = {};
          rootBones.forEach(function(bone) { animBones[bone] = boneData; });
          outZip.file('test_pack/animations/' + modelName + '.animation.json', JSON.stringify({
            format_version: "1.8.0",
            animations: { [animKey]: { loop: true, bones: animBones } }
          }, null, 4));
          jbLog('DONE', 'animations/<b>' + modelName + '.animation.json</b>' +
            (rootBones.length ? ' (кости: ' + rootBones.join(', ') + ')' : ''), 'done');

          // attachables
          outZip.file('test_pack/attachables/' + modelName + '.json', JSON.stringify({
            format_version: "1.10.0",
            "minecraft:attachable": {
              description: {
                identifier: 'test:' + modelName,
                materials: { default: "entity_alphatest" },
                textures: { default: 'textures/items/' + modelName },
                geometry: { default: 'geometry.' + modelName },
                render_controllers: ["controller.render.item_default"],
                animations: { head_offset: animKey },
                scripts: { animate: ["head_offset"] }
              }
            }
          }, null, 4));
          jbLog('DONE', 'attachables/<b>' + modelName + '.json</b>', 'done');

          // items
          outZip.file('test_pack/items/' + modelName + '.json', JSON.stringify({
            format_version: "1.21.0",
            "minecraft:item": {
              description: { identifier: 'test:' + modelName, category: "items" },
              components: { "minecraft:icon": { texture: modelName } }
            }
          }, null, 4));
          jbLog('DONE', 'items/<b>' + modelName + '.json</b>', 'done');

          // Texture atlas entries
          var iconTexPath = iconNames.has(modelName)
            ? 'textures/items/icons/' + modelName
            : 'textures/items/' + modelName;
          itemTextureData['test:' + modelName] = { textures: [iconTexPath] };
          terrainTextureData[modelName] = { textures: 'textures/items/' + modelName };
        }

        // item_texture.json
        outZip.file('test_pack/textures/item_texture.json', JSON.stringify({
          resource_pack_name: "test_pack",
          texture_name: "atlas.items",
          texture_data: itemTextureData
        }, null, 4));
        jbLog('DONE', '<b>item_texture.json</b>', 'done');

        // terrain_texture.json
        outZip.file('test_pack/textures/terrain_texture.json', JSON.stringify({
          resource_pack_name: "test_pack",
          texture_name: "atlas.terrain",
          texture_data: terrainTextureData
        }, null, 4));
        jbLog('DONE', '<b>terrain_texture.json</b>', 'done');

        // ── Textures from Java pack ──────────────────────
        // For each texture: if filename is in TEX_IDX with a bedrock path → use that path
        // (handles vanilla overrides and renames); otherwise → textures/items/
        var texBase  = javaRoot + 'assets/minecraft/textures/';
        var texFiles = getFiles(javaZip, texBase);
        if (texFiles.length === 0) {
          jbLog('WARN', 'Папка <b>assets/minecraft/textures</b> не найдена в Java паке', 'warn');
        }
        for (var ti = 0; ti < texFiles.length; ti++) {
          var tpath    = texFiles[ti];
          var fullRel  = tpath.slice(texBase.length);  // "block/buble.png" / "entity/creeper/creeper.png"
          var lastSlash = fullRel.lastIndexOf('/');
          var tfilename = lastSlash >= 0 ? fullRel.slice(lastSlash + 1) : fullRel;  // "buble.png"
          if (!tfilename) continue;
          var tbuf = await javaZip.files[tpath].async('arraybuffer');
          var texEntry   = TEX_IDX[tfilename];
          var brDestRel  = texEntry && texEntry.bedrock;
          if (brDestRel) {
            outZip.file('test_pack/textures/' + brDestRel, tbuf);
            jbLog('DONE', 'textures/<b>' + escHtml(brDestRel) + '</b>', 'done');
          } else {
            outZip.file('test_pack/textures/items/' + tfilename, tbuf);
            jbLog('DONE', 'textures/items/<b>' + escHtml(tfilename) + '</b>', 'done');
          }
        }

        // ── Icons from Bedrock zip ───────────────────────
        var iconFiles = getFiles(brZip, brIconsBase);
        for (var ii = 0; ii < iconFiles.length; ii++) {
          var ipath = iconFiles[ii];
          var irel  = ipath.slice(brIconsBase.length);
          var ibuf  = await brZip.files[ipath].async('arraybuffer');
          outZip.file('test_pack/textures/items/icons/' + irel, ibuf);
          jbLog('DONE', 'textures/items/icons/<b>' + escHtml(irel) + '</b>', 'done');
        }

        // ── Custom_mapping из Java paper.json ───────────
        var jbCmds = {};
        var jbPaperFile = javaZip.file(javaRoot + 'assets/minecraft/items/paper.json');
        if (jbPaperFile) {
          try {
            var jbPaperJson = JSON.parse(await jbPaperFile.async('string'));
            var entries = jbPaperJson.model && jbPaperJson.model.entries;
            if (Array.isArray(entries)) {
              entries.forEach(function(e) {
                var cmd  = e.threshold;
                var mdl  = e.model && e.model.model;
                if (cmd !== undefined && mdl) {
                  jbCmds[cmd] = mdl.split('/').pop();
                }
              });
            }
          } catch(e) {
            jbLog('WARN', 'Не удалось прочитать paper.json из Java пака: ' + escHtml(e.message), 'warn');
          }
        } else {
          jbLog('WARN', '<b>assets/minecraft/items/paper.json</b> не найден в Java паке — Custom_mapping не будет создан', 'warn');
        }

        jbLog('INFO', 'Генерирую ZIP...', 'info');
        jbOutputBlob = await outZip.generateAsync({ type: 'blob' });
        jbLog('ГОТОВО', '<b>Конвертация завершена!</b>', 'done');
        document.getElementById('jbDownloadBtn').classList.add('visible', 'fade-in');
        if (Object.keys(jbCmds).length > 0) {
          jbMappingBlob = new Blob([generateBedrockMapping(jbCmds)], { type: 'application/json' });
          document.getElementById('jbMappingBtn').classList.add('visible', 'fade-in');
        }
      } catch(e) {
        jbLog('ОШИБКА', '<b>' + escHtml(e.message) + '</b>', 'err');
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Конвертировать в Bedrock';
      }
    });

    document.getElementById('jbDownloadBtn').addEventListener('click', function() {
      if (!jbOutputBlob) return;
      var url = URL.createObjectURL(jbOutputBlob);
      var a   = document.createElement('a');
      a.href     = url;
      a.download = 'test_pack.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    document.getElementById('jbMappingBtn').addEventListener('click', function() {
      if (!jbMappingBlob) return;
      var url = URL.createObjectURL(jbMappingBlob);
      var a   = document.createElement('a');
      a.href     = url;
      a.download = 'paper.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  })();


