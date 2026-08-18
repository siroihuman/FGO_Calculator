(function () {
  "use strict";

  const VERSION = "1.0.0";
  const SERVANT_LIST_URL = "/siroi_human/pages/54.html";
  const CALCULATOR_CDN = "https://cdn.jsdelivr.net/gh/siroihuman/FGO_Calculator@main/FGO_DamageCalculator_atwiki.js?v=1.1.5";
  const ROOT_ID = "fgo-ranking-generator";
  const CACHE_KEY = "fgo-ranking-generator-cache-v1";
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  const MAX_CONCURRENCY = 5;

  const CLASS_LABEL = {
    saber: "セイバー", archer: "アーチャー", lancer: "ランサー", rider: "ライダー",
    caster: "キャスター", assassin: "アサシン", berserker: "バーサーカー",
    shielder: "シールダー", ruler: "ルーラー", avenger: "アヴェンジャー",
    moonCancer: "ムーンキャンサー", alterEgo: "アルターエゴ", foreigner: "フォーリナー",
    pretender: "プリテンダー", beast: "ビースト", other: "その他"
  };

  function norm(value) {
    return String(value == null ? "" : value)
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 65248); })
      .replace(/．/g, ".").replace(/，/g, ",").replace(/％/g, "%")
      .replace(/\u00a0/g, " ").replace(/[ \t\r\n\u3000]+/g, " ").trim();
  }

  function compact(value) { return norm(value).replace(/\s+/g, ""); }

  function num(value) {
    const m = norm(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(Number(value))) return "-";
    const n = Number(value);
    if (digits != null) return n.toFixed(digits);
    return Math.round(n).toLocaleString("ja-JP");
  }

  function emptyBuffs() {
    return {
      attackUp: 0,
      npDamageUp: 0,
      cardUp: { quick: 0, arts: 0, buster: 0 },
      defenseDown: 0,
      cardResistanceDown: { quick: 0, arts: 0, buster: 0 },
      npGainUp: 0,
      starGenerationUp: 0,
      hitMultiplier: 1
    };
  }

  function mergeBuffs(target, source) {
    target.attackUp += source.attackUp || 0;
    target.npDamageUp += source.npDamageUp || 0;
    target.defenseDown += source.defenseDown || 0;
    target.npGainUp += source.npGainUp || 0;
    target.starGenerationUp += source.starGenerationUp || 0;
    ["quick", "arts", "buster"].forEach(function (card) {
      target.cardUp[card] += (source.cardUp && source.cardUp[card]) || 0;
      target.cardResistanceDown[card] += (source.cardResistanceDown && source.cardResistanceDown[card]) || 0;
    });
    target.hitMultiplier *= source.hitMultiplier || 1;
    return target;
  }

  function detectCard(text) {
    const t = compact(text).toLowerCase();
    if (t.indexOf("quick") !== -1 || t.indexOf("クイック") !== -1) return "quick";
    if (t.indexOf("arts") !== -1 || t.indexOf("アーツ") !== -1) return "arts";
    if (t.indexOf("buster") !== -1 || t.indexOf("バスター") !== -1) return "buster";
    return null;
  }

  function effectValueFromRow(row, preferredColumnIndexes) {
    if (preferredColumnIndexes && preferredColumnIndexes.length) {
      for (let i = 0; i < preferredColumnIndexes.length; i += 1) {
        const index = preferredColumnIndexes[i];
        const value = num(row[index]);
        if (value != null) return value;
      }
    }
    for (let i = row.length - 1; i >= 0; i -= 1) {
      const value = num(row[i]);
      if (value != null) return value;
    }
    return null;
  }

  function isSelfApplicable(text) {
    const t = compact(text);
    if (t.indexOf("自身を除く") !== -1) return false;
    if (t.indexOf("〔") !== -1 && /味方/.test(t)) return false;
    return /自身|味方全体|味方単体/.test(t);
  }

  function isEnemyApplicable(text) {
    const t = compact(text);
    if (!/敵/.test(t)) return false;
    // 〔○○〕特性、状態、フィールドなど対象依存の条件は自動適用しない。
    if (t.indexOf("〔") !== -1) return false;
    return true;
  }

  function applyEffectText(buffs, text, value) {
    if (!Number.isFinite(value)) return;
    const t = compact(text);
    const card = detectCard(t);

    if (/攻撃力をアップ/.test(t) && isSelfApplicable(t)) buffs.attackUp += value;
    if (/宝具威力をアップ/.test(t) && isSelfApplicable(t)) buffs.npDamageUp += value;
    if (/カード性能をアップ|性能をアップ/.test(t) && card && isSelfApplicable(t)) buffs.cardUp[card] += value;
    if (/NP獲得量をアップ/.test(t) && isSelfApplicable(t)) buffs.npGainUp += value;
    if (/スター発生率をアップ/.test(t) && isSelfApplicable(t)) buffs.starGenerationUp += value;

    if (/防御力をダウン/.test(t) && isEnemyApplicable(t)) buffs.defenseDown += value;
    if (/耐性をダウン/.test(t) && isEnemyApplicable(t) && card) buffs.cardResistanceDown[card] += value;

    if (/Hit数を(?:2倍|倍増)|ヒット数を(?:2倍|倍増)/i.test(t)) buffs.hitMultiplier *= 2;
  }

  function headingSequence(doc) {
    return Array.from(doc.querySelectorAll("h2,h3,h4,table"));
  }

  function nextTableAfterHeading(sequence, heading) {
    const start = sequence.indexOf(heading);
    if (start < 0) return null;
    const level = Number(heading.tagName.slice(1));
    for (let i = start + 1; i < sequence.length; i += 1) {
      const node = sequence[i];
      if (node.tagName === "TABLE") return node;
      if (/^H[2-4]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) return null;
    }
    return null;
  }

  function collectCurrentSkillTables(doc) {
    const sequence = headingSequence(doc);
    const chosen = {};
    Array.from(doc.querySelectorAll("h4")).forEach(function (heading) {
      const m = norm(heading.textContent).match(/Skill\s*([1-3])/i);
      if (!m) return;
      const table = nextTableAfterHeading(sequence, heading);
      if (table) chosen[m[1]] = table;
    });
    return Object.keys(chosen).sort().map(function (key) { return chosen[key]; });
  }

  function collectSectionTables(doc, headingText) {
    const sequence = headingSequence(doc);
    const heading = Array.from(doc.querySelectorAll("h2,h3")).find(function (h) {
      return compact(h.textContent) === compact(headingText);
    });
    if (!heading) return [];
    const start = sequence.indexOf(heading);
    const level = Number(heading.tagName.slice(1));
    const tables = [];
    for (let i = start + 1; i < sequence.length; i += 1) {
      const node = sequence[i];
      if (/^H[2-4]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
      if (node.tagName === "TABLE") tables.push(node);
    }
    return tables;
  }

  function parseBuffTables(tables, calculator, mode) {
    const buffs = emptyBuffs();
    tables.forEach(function (table) {
      const grid = calculator.tableToGrid(table);
      grid.forEach(function (row) {
        const text = row.join(" ");
        if (!/アップ|ダウン|Hit数|ヒット数/i.test(text)) return;
        let value = null;
        if (mode === "skill") {
          value = effectValueFromRow(row);
        } else {
          value = effectValueFromRow(row);
        }
        applyEffectText(buffs, text, value);
      });
    });
    return buffs;
  }

  function findNpGrid(grids) {
    let selected = null;
    grids.forEach(function (grid) {
      const hasHeader = grid.some(function (row) {
        const cells = row.map(compact);
        return cells.indexOf("Card") !== -1 && cells.indexOf("効果") !== -1 && cells.indexOf("1") !== -1;
      });
      const hasAttack = grid.some(function (row) { return /強力な攻撃|超強力な攻撃/.test(compact(row.join(" "))); });
      if (hasHeader && hasAttack) selected = grid;
    });
    return selected;
  }

  function parseNpDetails(grid, npLevel) {
    if (!grid) return null;
    const header = grid.find(function (row) {
      const cells = row.map(compact);
      return cells.indexOf("Card") !== -1 && cells.indexOf("効果") !== -1 && cells.indexOf("1") !== -1;
    });
    if (!header) return null;

    const levelColumns = [1, 2, 3, 4, 5].map(function (lv) {
      return header.findIndex(function (cell) { return compact(cell) === String(lv); });
    });
    const effectColumn = header.findIndex(function (cell) { return compact(cell) === "効果"; });
    const attackRowIndex = grid.findIndex(function (row) { return /強力な攻撃|超強力な攻撃/.test(compact(row.join(" "))); });
    if (attackRowIndex < 0) return null;
    const attackRow = grid[attackRowIndex];
    const selectedCol = levelColumns[Math.max(0, Math.min(4, npLevel - 1))];
    const multiplier = selectedCol >= 0 ? num(attackRow[selectedCol]) : null;
    const attackText = attackRow.join(" ");
    const scope = /敵全体/.test(attackText) ? "all" : (/敵単体/.test(attackText) ? "single" : "unknown");
    const card = detectCard(attackRow[0] || attackText);

    const preBuffs = emptyBuffs();
    for (let i = 0; i < attackRowIndex; i += 1) {
      const row = grid[i];
      const text = row.join(" ");
      if (!/アップ|ダウン|Hit数|ヒット数/i.test(text)) continue;
      let preferred = [];
      if (/\[Lv\]/i.test(text) && selectedCol >= 0) preferred = [selectedCol];
      else if (/OC|オーバーチャージ/i.test(text) && levelColumns[0] >= 0) preferred = [levelColumns[0]];
      const value = effectValueFromRow(row, preferred);
      applyEffectText(preBuffs, text, value);
    }

    let npEffect = 0;
    let fixedStars = 0;
    for (let i = attackRowIndex + 1; i < grid.length; i += 1) {
      const row = grid[i];
      const text = compact(row.join(" "));
      let preferred = [];
      if (/\[Lv\]/i.test(text) && selectedCol >= 0) preferred = [selectedCol];
      else if (/OC|オーバーチャージ/i.test(text) && levelColumns[0] >= 0) preferred = [levelColumns[0]];
      const value = effectValueFromRow(row, preferred);
      if (value == null) continue;
      if (!/毎ターン/.test(text) && /自身のNPを増やす|NPをリチャージ/.test(text)) npEffect += value;
      if (!/毎ターン/.test(text) && /スターを獲得/.test(text)) fixedStars += value;
    }

    return { multiplier: multiplier, scope: scope, card: card, preBuffs: preBuffs, npEffect: npEffect, fixedStars: fixedStars, effectColumn: effectColumn };
  }

  function parseNo(doc) {
    const text = norm(doc.body ? doc.body.textContent : "");
    const m = text.match(/No\.\s*([0-9]+(?:['′])?)/i);
    return m ? m[1] : "";
  }

  function parseServantDocument(doc, url, npLevel, calculator) {
    const tables = Array.from(doc.querySelectorAll("table"));
    const grids = tables.map(function (table) { return calculator.tableToGrid(table); });
    const title = doc.title || "";
    const base = calculator.extractServantDataFromGrids(grids, title);
    if (!base || !base.servantName || !base.attack || !base.noblePhantasmCardType) return null;

    const npGrid = findNpGrid(grids);
    const np = parseNpDetails(npGrid, npLevel);
    if (!np || !np.multiplier || !np.card) return null;

    const skillBuffs = parseBuffTables(collectCurrentSkillTables(doc), calculator, "skill");
    const classBuffs = parseBuffTables(collectSectionTables(doc, "クラススキル"), calculator, "class");

    return {
      url: url,
      no: parseNo(doc),
      name: base.servantName,
      rarity: base.rarity || 0,
      naturalLevel: base.naturalLevel || 0,
      attack: base.attack,
      attackerClass: base.attackerClass || "other",
      attackBaseNp: base.attackBaseNp,
      starRate: base.starRate,
      hitCounts: base.hitCounts || {},
      npCard: np.card || base.noblePhantasmCardType,
      npMultiplier: np.multiplier,
      scope: np.scope,
      skillBuffs: skillBuffs,
      classBuffs: classBuffs,
      npPreBuffs: np.preBuffs,
      npEffect: np.npEffect,
      fixedStars: np.fixedStars
    };
  }

  function servantLinksFromListDocument(doc) {
    const headings = Array.from(doc.querySelectorAll("h2,h3"));
    const servantHeading = headings.find(function (h) { return compact(h.textContent) === "サーヴァント"; });
    if (!servantHeading) return [];
    const level = Number(servantHeading.tagName.slice(1));
    const all = Array.from(doc.querySelectorAll("h2,h3,a"));
    const start = all.indexOf(servantHeading);
    const seen = new Set();
    const result = [];
    for (let i = start + 1; i < all.length; i += 1) {
      const node = all[i];
      if (/^H[23]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
      if (node.tagName !== "A") continue;
      const href = node.getAttribute("href") || "";
      const text = norm(node.textContent);
      if (!text || text === "Image" || /編集|一覧/.test(text)) continue;
      if (!/\/siroi_human\/pages\/\d+\.html(?:$|[?#])/.test(href)) continue;
      const absolute = new URL(href, location.href).href;
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      result.push({ name: text, url: absolute });
    }
    return result;
  }

  async function ensureCalculator() {
    if (window.FGODamageCalculator && window.FGODamageCalculator.calculateDamage) return window.FGODamageCalculator;
    await new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = CALCULATOR_CDN;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    if (!window.FGODamageCalculator) throw new Error("FGO計算機を読み込めませんでした。");
    return window.FGODamageCalculator;
  }

  async function fetchDocument(url) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const html = await response.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  function loadCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (!parsed || !parsed.savedAt || Date.now() - parsed.savedAt > CACHE_MAX_AGE) return {};
      return parsed.items || {};
    } catch (_) { return {}; }
  }

  function saveCache(items) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items: items })); } catch (_) {}
  }

  async function mapConcurrent(items, limit, worker, onProgress) {
    const result = new Array(items.length);
    let next = 0;
    let done = 0;
    async function runner() {
      while (true) {
        const index = next++;
        if (index >= items.length) break;
        try { result[index] = await worker(items[index], index); }
        catch (error) { result[index] = { error: error }; }
        done += 1;
        if (onProgress) onProgress(done, items.length);
      }
    }
    const runners = Array.from({ length: Math.min(limit, items.length) }, runner);
    await Promise.all(runners);
    return result;
  }

  function calculateRow(servant, options, calculator) {
    const buffs = emptyBuffs();
    mergeBuffs(buffs, servant.classBuffs || emptyBuffs());
    if (options.useSkills) mergeBuffs(buffs, servant.skillBuffs || emptyBuffs());
    mergeBuffs(buffs, servant.npPreBuffs || emptyBuffs());

    const card = servant.npCard;
    const baseHits = Number(servant.hitCounts && servant.hitCounts.np) || 1;
    const hitCount = Math.max(1, Math.round(baseHits * (buffs.hitMultiplier || 1)));
    const targets = servant.scope === "all" ? options.aoeTargets : 1;
    const attack = Number(servant.attack) + (options.atkPlus1000 ? 1000 : 0);

    const params = {
      attackType: "np",
      attack: attack,
      attackerClass: servant.attackerClass,
      defenderClass: "saber",
      manualClassAffinity: true,
      classAffinityPercent: 100,
      attributeAffinity: 1,
      cardType: card,
      noblePhantasmMultiplier: servant.npMultiplier,
      cardPerformanceUp: buffs.cardUp[card] || 0,
      attackUp: buffs.attackUp,
      defenseDown: buffs.defenseDown,
      noblePhantasmDamageUp: buffs.npDamageUp,
      cardResistanceDown: buffs.cardResistanceDown[card] || 0,
      targetCount: targets,
      hitCount: hitCount,
      overkillHitCount: 0,
      attackBaseNp: Number(servant.attackBaseNp) || 0,
      manualDtdr: true,
      dtdrPercent: 100,
      npGainUp: buffs.npGainUp,
      starRate: Number(servant.starRate) || 0,
      manualDsr: true,
      dsrPercent: 0,
      starGenerationUp: buffs.starGenerationUp,
      critical: false
    };

    const calc = calculator.calculateDamage(params);
    const averageDamage = [calc.averageDamage, calc.meanDamage, calc.averageRandomDamage, calc.referenceDamage]
      .map(Number)
      .find(function (value) { return Number.isFinite(value); });
    const npAttack = Number(calc.npRecharge) || 0;
    const npTotal = npAttack + (Number(servant.npEffect) || 0);
    const starAttack = Number(calc.expectedStars) || 0;
    const starTotal = starAttack + (Number(servant.fixedStars) || 0);

    return Object.assign({}, servant, {
      effectiveAttack: attack,
      targets: targets,
      hitCount: hitCount,
      buffs: buffs,
      damageMin: calc.minimumDamage,
      damageAvg: averageDamage,
      damageRef: calc.referenceDamage,
      damageMax: calc.maximumDamage,
      npPerTarget: calc.npRechargePerTarget,
      npAttack: npAttack,
      npTotal: npTotal,
      starAttack: starAttack,
      starTotal: starTotal,
      starMin: (Number(calc.minimumStars) || 0) + (Number(servant.fixedStars) || 0),
      starMax: (Number(calc.maximumStars) || 0) + (Number(servant.fixedStars) || 0)
    });
  }

  function sortDesc(rows, key) {
    return rows.slice().sort(function (a, b) {
      const diff = (Number(b[key]) || 0) - (Number(a[key]) || 0);
      if (diff) return diff;
      return String(a.no).localeCompare(String(b.no), "ja", { numeric: true });
    });
  }

  function filterRows(rows, options) {
    return rows.filter(function (row) {
      if (options.rarity !== "all" && String(row.rarity) !== String(options.rarity)) return false;
      if (options.classId !== "all" && row.attackerClass !== options.classId) return false;
      if (options.scope !== "any" && row.scope !== options.scope) return false;
      return true;
    });
  }

  function rowNameHtml(row) {
    return '<a href="' + escapeHtml(row.url) + '">' + escapeHtml(row.name) + "</a>";
  }

  function tableWrap(title, note, head, body) {
    return '<section class="fgo-rank-section"><h3>' + escapeHtml(title) + '</h3><p class="fgo-rank-note">' + escapeHtml(note) + '</p><div class="fgo-rank-table-wrap"><table><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></section>';
  }

  function renderTables(root, rows, options) {
    const filtered = filterRows(rows, options);
    const limit = options.limit === "all" ? Infinity : Number(options.limit);

    const damage = sortDesc(filtered, "damageAvg").slice(0, limit);
    const np = sortDesc(filtered.filter(function (r) { return Number(r.attackBaseNp) > 0; }), "npTotal").slice(0, limit);
    const stars = sortDesc(filtered.filter(function (r) { return r.starRate != null && Number.isFinite(Number(r.starRate)); }), "starTotal").slice(0, limit);

    const damageBody = damage.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(r.no) + '</td><td>' + rowNameHtml(r) + '</td><td>' + escapeHtml(CLASS_LABEL[r.attackerClass] || r.attackerClass) + '</td><td>★' + r.rarity + '</td><td>' + escapeHtml(String(r.npCard).toUpperCase()) + '</td><td>' + (r.scope === "all" ? "全体" : "単体") + '</td><td>' + formatNumber(r.damageMin) + '</td><td><b>' + formatNumber(r.damageAvg) + '</b></td><td>' + formatNumber(r.damageMax) + '</td></tr>';
    }).join("");

    const npBody = np.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(r.no) + '</td><td>' + rowNameHtml(r) + '</td><td>' + escapeHtml(String(r.npCard).toUpperCase()) + '</td><td>' + r.hitCount + '</td><td>' + r.targets + '</td><td>' + formatNumber(r.npPerTarget, 2) + '%</td><td>' + formatNumber(r.npAttack, 2) + '%</td><td>' + formatNumber(r.npEffect, 2) + '%</td><td><b>' + formatNumber(r.npTotal, 2) + '%</b></td></tr>';
    }).join("");

    const starBody = stars.map(function (r, i) {
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(r.no) + '</td><td>' + rowNameHtml(r) + '</td><td>' + escapeHtml(String(r.npCard).toUpperCase()) + '</td><td>' + r.hitCount + '</td><td>' + r.targets + '</td><td>' + formatNumber(r.starAttack, 2) + '</td><td>' + formatNumber(r.fixedStars, 2) + '</td><td><b>' + formatNumber(r.starTotal, 2) + '</b></td><td>' + formatNumber(r.starMin, 0) + '～' + formatNumber(r.starMax, 0) + '</td></tr>';
    }).join("");

    root.querySelector(".fgo-rank-results").innerHTML =
      tableWrap("宝具火力ランキング", "1体あたり。特攻・クリティカル・オーバーキル・属性相性は不使用。", '<tr><th>順位</th><th>No.</th><th>名前</th><th>クラス</th><th>Rare</th><th>宝具</th><th>対象</th><th>最低</th><th>平均</th><th>最高</th></tr>', damageBody) +
      tableWrap("宝具NP獲得量ランキング", "攻撃によるNP＋宝具の即時NPリチャージ。毎ターンNPは含みません。", '<tr><th>順位</th><th>No.</th><th>名前</th><th>宝具</th><th>Hit</th><th>敵数</th><th>1体</th><th>攻撃合計</th><th>宝具効果</th><th>合計</th></tr>', npBody) +
      tableWrap("宝具スター獲得量ランキング", "攻撃による期待値＋宝具の即時スター獲得。", '<tr><th>順位</th><th>No.</th><th>名前</th><th>宝具</th><th>Hit</th><th>敵数</th><th>攻撃期待値</th><th>宝具効果</th><th>合計期待値</th><th>最小～最大</th></tr>', starBody);
  }

  function styles() {
    return `
#${ROOT_ID}{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif;line-height:1.5;color:#222}
#${ROOT_ID} .fgo-rank-card{border:1px solid #c9c9c9;border-radius:8px;background:#fff;padding:14px;margin:12px 0;box-shadow:0 1px 3px rgba(0,0,0,.08)}
#${ROOT_ID} .fgo-rank-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}
#${ROOT_ID} label{display:flex;flex-direction:column;gap:4px;font-weight:600;font-size:13px}
#${ROOT_ID} select,#${ROOT_ID} button{font:inherit;padding:7px 9px;border:1px solid #aaa;border-radius:5px;background:#fff}
#${ROOT_ID} button{cursor:pointer;background:#f4f4f4;font-weight:700}
#${ROOT_ID} button:hover{background:#e9e9e9}
#${ROOT_ID} .fgo-rank-check{flex-direction:row;align-items:center;padding:8px 0}
#${ROOT_ID} .fgo-rank-status{margin:10px 0;padding:8px 10px;background:#f7f7f7;border-left:4px solid #777}
#${ROOT_ID} .fgo-rank-table-wrap{overflow-x:auto}
#${ROOT_ID} table{border-collapse:collapse;width:100%;min-width:760px;font-size:13px}
#${ROOT_ID} th,#${ROOT_ID} td{border:1px solid #cfcfcf;padding:6px 7px;text-align:center;white-space:nowrap}
#${ROOT_ID} th{background:#eee}
#${ROOT_ID} td:nth-child(3){text-align:left}
#${ROOT_ID} .fgo-rank-section{margin:22px 0}
#${ROOT_ID} .fgo-rank-note{font-size:12px;color:#555;margin-top:-5px}
#${ROOT_ID} .fgo-rank-small{font-size:12px;color:#666}
`;
  }

  function readOptions(root) {
    return {
      npLevel: Number(root.querySelector("[data-key=npLevel]").value),
      useSkills: root.querySelector("[data-key=useSkills]").checked,
      atkPlus1000: root.querySelector("[data-key=atkPlus1000]").checked,
      aoeTargets: Number(root.querySelector("[data-key=aoeTargets]").value),
      rarity: root.querySelector("[data-key=rarity]").value,
      classId: root.querySelector("[data-key=classId]").value,
      scope: root.querySelector("[data-key=scope]").value,
      limit: root.querySelector("[data-key=limit]").value
    };
  }

  function uiHtml() {
    const classOptions = Object.keys(CLASS_LABEL).map(function (id) { return '<option value="' + id + '">' + CLASS_LABEL[id] + '</option>'; }).join("");
    return '<div class="fgo-rank-card"><h2>FGO ランキング生成</h2><div class="fgo-rank-controls">' +
      '<label>宝具Lv<select data-key="npLevel"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>' +
      '<label>全体宝具の敵数<select data-key="aoeTargets"><option>1</option><option>2</option><option selected>3</option></select></label>' +
      '<label>レアリティ<select data-key="rarity"><option value="all">すべて</option><option value="5">★5</option><option value="4">★4</option><option value="3">★3</option><option value="2">★2</option><option value="1">★1</option></select></label>' +
      '<label>クラス<select data-key="classId"><option value="all">すべて</option>' + classOptions + '</select></label>' +
      '<label>宝具範囲<select data-key="scope"><option value="any">すべて</option><option value="all">全体</option><option value="single">単体</option></select></label>' +
      '<label>表示件数<select data-key="limit"><option value="20">上位20</option><option value="50">上位50</option><option value="all">すべて</option></select></label>' +
      '<label class="fgo-rank-check"><input type="checkbox" data-key="useSkills" checked> 自前スキルLv10を使用</label>' +
      '<label class="fgo-rank-check"><input type="checkbox" data-key="atkPlus1000" checked> ATK＋1000</label>' +
      '<button type="button" data-action="generate">ランキング生成／更新</button>' +
      '<button type="button" data-action="clearCache">キャッシュ削除</button>' +
      '</div><p class="fgo-rank-small">ver.' + VERSION + ' / 強化後優先・上位3スキル・OC1・相性等倍。条件付き特攻は原則として含めません。</p>' +
      '<div class="fgo-rank-status">準備中…</div></div><div class="fgo-rank-results"></div>';
  }

  async function generate(root, forceReload) {
    const status = root.querySelector(".fgo-rank-status");
    const options = readOptions(root);
    status.textContent = "既存FGO計算機を読み込んでいます…";
    const calculator = await ensureCalculator();

    status.textContent = "サーヴァント一覧を取得しています…";
    const listDoc = await fetchDocument(SERVANT_LIST_URL);
    const links = servantLinksFromListDocument(listDoc);
    if (!links.length) throw new Error("サーヴァント一覧を取得できませんでした。");

    const cache = forceReload ? {} : loadCache();
    const cacheKeySuffix = "|np" + options.npLevel;
    let failures = 0;

    const parsed = await mapConcurrent(links, MAX_CONCURRENCY, async function (item) {
      const key = item.url + cacheKeySuffix;
      if (cache[key]) return cache[key];
      try {
        const doc = await fetchDocument(item.url);
        const data = parseServantDocument(doc, item.url, options.npLevel, calculator);
        if (data) cache[key] = data;
        return data;
      } catch (error) {
        failures += 1;
        return null;
      }
    }, function (done, total) {
      status.textContent = "個別ページを解析中… " + done + " / " + total + (failures ? "（取得失敗 " + failures + "）" : "");
    });

    saveCache(cache);
    const servants = parsed.filter(Boolean);
    const calculated = servants.map(function (servant) { return calculateRow(servant, options, calculator); });
    renderTables(root, calculated, options);
    status.textContent = "完了：" + calculated.length + "騎を集計" + (failures ? " / 取得失敗 " + failures + "件" : "") + "。宝具Lvや条件を変更して再生成できます。";
  }

  function mount() {
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.mounted === "1") return false;
    root.dataset.mounted = "1";
    const style = document.createElement("style");
    style.textContent = styles();
    document.head.appendChild(style);
    root.innerHTML = uiHtml();

    root.querySelector("[data-action=generate]").addEventListener("click", function () {
      generate(root, false).catch(function (error) {
        root.querySelector(".fgo-rank-status").textContent = "エラー：" + error.message;
      });
    });
    root.querySelector("[data-action=clearCache]").addEventListener("click", function () {
      localStorage.removeItem(CACHE_KEY);
      root.querySelector(".fgo-rank-status").textContent = "キャッシュを削除しました。次回は全ページを再取得します。";
    });

    generate(root, false).catch(function (error) {
      root.querySelector(".fgo-rank-status").textContent = "エラー：" + error.message;
    });
    return true;
  }

  window.FGORankingGenerator = {
    version: VERSION,
    mount: mount,
    parseServantDocument: parseServantDocument,
    servantLinksFromListDocument: servantLinksFromListDocument,
    calculateRow: calculateRow,
    parseNpDetails: parseNpDetails,
    applyEffectText: applyEffectText
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
