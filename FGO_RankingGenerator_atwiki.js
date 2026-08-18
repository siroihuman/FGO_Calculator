(function (factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (typeof window !== "undefined") {
    window.FGORankingGenerator = api;

    const start = function () {
      api.mount();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
})(function () {
  "use strict";

  const VERSION = "1.1.0";
  const SERVANT_LIST_URL = "/siroi_human/pages/54.html";
  const CALCULATOR_CDN = "https://cdn.jsdelivr.net/gh/siroihuman/FGO_Calculator@main/FGO_DamageCalculator_atwiki.js?v=1.1.5";
  const ROOT_ID = "fgo-ranking-generator";
  const STYLE_ID = "fgo-ranking-generator-style";
  const CACHE_KEY = "fgo-ranking-generator-cache-v2";
  const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
  const MAX_CONCURRENCY = 5;

  const CLASS_LABEL = {
    saber: "セイバー", archer: "アーチャー", lancer: "ランサー", rider: "ライダー",
    caster: "キャスター", assassin: "アサシン", berserker: "バーサーカー",
    shielder: "シールダー", ruler: "ルーラー", avenger: "アヴェンジャー",
    moonCancer: "ムーンキャンサー", alterEgo: "アルターエゴ", foreigner: "フォーリナー",
    pretender: "プリテンダー", beast: "ビースト", other: "その他"
  };

  const EFFECT_WORDS = /攻撃力|宝具威力|カード性能|Quick|Arts|Buster|クイック|アーツ|バスター|防御力|耐性|NP|スター|Hit数|ヒット数|与ダメージ|被ダメージ|特攻威力/i;

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

  function strictNum(value) {
    const text = norm(value).replace(/,/g, "").replace(/%$/, "");
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return null;
    const valueNumber = Number(text);
    return Number.isFinite(valueNumber) ? valueNumber : null;
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

  function emptyEffects() {
    return {
      attackUp: 0,
      npDamageUp: 0,
      cardUp: { quick: 0, arts: 0, buster: 0 },
      defenseDown: 0,
      cardResistanceDown: { quick: 0, arts: 0, buster: 0 },
      npGainUp: 0,
      starGenerationUp: 0,
      flatDamage: 0,
      targetFlatDamage: 0,
      powerUp: 0,
      npHitMultiplier: 1,
      directNp: 0,
      turnNp: 0,
      directStars: 0,
      turnStars: 0
    };
  }

  function mergeEffects(target, source) {
    const s = source || emptyEffects();
    target.attackUp += s.attackUp || 0;
    target.npDamageUp += s.npDamageUp || 0;
    target.defenseDown += s.defenseDown || 0;
    target.npGainUp += s.npGainUp || 0;
    target.starGenerationUp += s.starGenerationUp || 0;
    target.flatDamage += s.flatDamage || 0;
    target.targetFlatDamage += s.targetFlatDamage || 0;
    target.powerUp += s.powerUp || 0;
    target.directNp += s.directNp || 0;
    target.turnNp += s.turnNp || 0;
    target.directStars += s.directStars || 0;
    target.turnStars += s.turnStars || 0;
    ["quick", "arts", "buster"].forEach(function (card) {
      target.cardUp[card] += (s.cardUp && s.cardUp[card]) || 0;
      target.cardResistanceDown[card] += (s.cardResistanceDown && s.cardResistanceDown[card]) || 0;
    });
    target.npHitMultiplier *= s.npHitMultiplier || 1;
    return target;
  }

  function detectCard(text) {
    const t = compact(text).toLowerCase();
    if (t.indexOf("quick") !== -1 || t.indexOf("クイック") !== -1) return "quick";
    if (t.indexOf("arts") !== -1 || t.indexOf("アーツ") !== -1) return "arts";
    if (t.indexOf("buster") !== -1 || t.indexOf("バスター") !== -1) return "buster";
    return null;
  }

  function embeddedEffectValue(text) {
    const t = norm(text).replace(/,/g, "");
    let match = t.match(/(?:NP|スター)[^。＋&]{0,30}?(\d+(?:\.\d+)?)\s*%?(?:増やす|獲得)/i);
    if (match) return Number(match[1]);
    match = t.match(/(?:アップ|ダウン|プラス)[^。＋&]{0,12}?(\d+(?:\.\d+)?)\s*%/i);
    if (match) return Number(match[1]);
    return null;
  }

  function findEffectCellIndex(row) {
    for (let i = 0; i < row.length; i += 1) {
      if (EFFECT_WORDS.test(norm(row[i]))) return i;
    }
    return -1;
  }

  function effectValueFromRow(row, preferredColumnIndexes) {
    if (preferredColumnIndexes && preferredColumnIndexes.length) {
      for (let i = 0; i < preferredColumnIndexes.length; i += 1) {
        const index = preferredColumnIndexes[i];
        if (index < 0 || index >= row.length) continue;
        const value = strictNum(row[index]);
        if (value != null) return value;
      }
    }

    const effectIndex = findEffectCellIndex(row);
    if (effectIndex >= 0) {
      for (let i = effectIndex + 1; i < row.length; i += 1) {
        const value = strictNum(row[i]);
        if (value != null) return value;
      }
      const embedded = embeddedEffectValue(row[effectIndex]);
      if (embedded != null) return embedded;
    }
    return null;
  }

  function findSkillLevelColumn(grid, targetLevel) {
    const labels = ["Lv." + targetLevel, "Lv" + targetLevel];
    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < grid[rowIndex].length; columnIndex += 1) {
        const cell = compact(grid[rowIndex][columnIndex]);
        if (labels.some(function (label) { return cell.toLowerCase() === label.toLowerCase(); })) {
          return columnIndex;
        }
      }
    }
    return -1;
  }

  function hasConditionalRequirement(text) {
    const t = compact(text);
    return /〔[^〕]+〕|特性の|特性を持つ|フィールド|残り?HP|HPが|HPの|状態の敵|状態の対象|確率で|成功時|の場合|時のみ|回数に応じ|数に応じ|所持数に応じ/.test(t);
  }

  function isSelfApplicable(text) {
    const t = compact(text);
    if (t.indexOf("自身を除く") !== -1) return false;
    if (hasConditionalRequirement(t)) return false;
    return /自身|味方全体|味方単体/.test(t);
  }

  function isEnemyApplicable(text) {
    const t = compact(text);
    if (hasConditionalRequirement(t)) return false;
    return /敵|対象の防御力|対象の(?:Quick|Arts|Buster|クイック|アーツ|バスター)耐性/.test(t);
  }

  function isDelayedTrigger(text) {
    const t = compact(text);
    if (/攻撃時のダメージ前に|宝具使用時|宝具攻撃時のダメージ前に/.test(t)) return false;
    return /通常攻撃時|攻撃時に|被ダメージ時|ガッツ発動時|ターン終了時/.test(t);
  }

  function applyEffectText(effects, text, value) {
    if (!Number.isFinite(Number(value))) return effects;
    const amount = Number(value);
    const t = compact(text);
    const card = detectCard(t);
    const isBoostState = /アップブースト状態|性能アップブースト|威力アップブースト/.test(t);
    const delayed = isDelayedTrigger(t);
    const preDamageTargetDebuff = /攻撃時のダメージ前に/.test(t);

    if (!delayed && !isBoostState && /攻撃力をアップ/.test(t) && isSelfApplicable(t)) effects.attackUp += amount;
    if (!delayed && !isBoostState && /宝具威力をアップ/.test(t) && isSelfApplicable(t)) effects.npDamageUp += amount;
    if (!delayed && !isBoostState && /カード性能をアップ|(?:Quick|Arts|Buster|クイック|アーツ|バスター)性能をアップ/.test(t) && card && isSelfApplicable(t)) {
      effects.cardUp[card] += amount;
    }
    if (!delayed && /NP獲得量をアップ/.test(t) && isSelfApplicable(t)) effects.npGainUp += amount;
    if (!delayed && /スター発生率をアップ/.test(t) && isSelfApplicable(t)) effects.starGenerationUp += amount;
    if (!delayed && /与ダメージプラス/.test(t) && isSelfApplicable(t)) effects.flatDamage += amount;
    if (!delayed && /特攻威力をアップ/.test(t) && isSelfApplicable(t)) effects.powerUp += amount;

    if ((!delayed || preDamageTargetDebuff) && /防御力をダウン/.test(t) && isEnemyApplicable(t)) effects.defenseDown += amount;
    if ((!delayed || preDamageTargetDebuff) && /耐性をダウン/.test(t) && isEnemyApplicable(t) && card) effects.cardResistanceDown[card] += amount;
    if ((!delayed || preDamageTargetDebuff) && /被ダメージプラス|被ダメージを増やす/.test(t) && isEnemyApplicable(t)) effects.targetFlatDamage += amount;

    if (!/通常攻撃/.test(t) && /Hit数を(?:2倍|倍増)|ヒット数を(?:2倍|倍増)/i.test(t) && !hasConditionalRequirement(t)) {
      effects.npHitMultiplier *= 2;
    }

    if (!delayed && !/毎ターン/.test(t) && /(?:自身|味方全体|味方単体)のNPを(?:少し)?増やす|NPをリチャージ/.test(t) && isSelfApplicable(t)) {
      effects.directNp += amount;
    }
    if (!delayed && /毎ターン.*NP|NP獲得状態を付与/.test(t) && isSelfApplicable(t)) {
      effects.turnNp += amount;
    }
    if (!delayed && !/毎ターン/.test(t) && /スターを獲得/.test(t)) {
      effects.directStars += amount;
    }
    if (!delayed && /毎ターンスター|毎ターン.*スター.*獲得/.test(t)) {
      effects.turnStars += amount;
    }

    return effects;
  }

  function headingSequence(doc) {
    return Array.from(doc.querySelectorAll("h2,h3,h4,h5,table"));
  }

  function nextTableAfterHeading(sequence, heading) {
    const start = sequence.indexOf(heading);
    if (start < 0) return null;
    const level = Number(heading.tagName.slice(1));
    for (let i = start + 1; i < sequence.length; i += 1) {
      const node = sequence[i];
      if (node.tagName === "TABLE") return node;
      if (/^H[2-5]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) return null;
    }
    return null;
  }

  function skillNameFromHeading(text) {
    return norm(text)
      .replace(/^Skill\s*[1-3](?:\s*\[強化後\])?\s*[：:]?\s*/i, "")
      .trim();
  }

  function collectCurrentSkillEntries(doc) {
    const sequence = headingSequence(doc);
    const chosen = {};
    Array.from(doc.querySelectorAll("h3,h4,h5")).forEach(function (heading) {
      const headingText = norm(heading.textContent);
      const m = headingText.match(/^Skill\s*([1-3])/i);
      if (!m) return;
      const table = nextTableAfterHeading(sequence, heading);
      if (!table) return;
      chosen[m[1]] = {
        number: Number(m[1]),
        name: skillNameFromHeading(headingText),
        enhanced: /\[強化後\]/.test(headingText),
        table: table
      };
    });
    return Object.keys(chosen).sort().map(function (key) { return chosen[key]; });
  }

  function collectSectionTables(doc, headingText) {
    const sequence = headingSequence(doc);
    const heading = Array.from(doc.querySelectorAll("h2,h3,h4")).find(function (h) {
      return compact(h.textContent) === compact(headingText);
    });
    if (!heading) return [];
    const start = sequence.indexOf(heading);
    const level = Number(heading.tagName.slice(1));
    const tables = [];
    for (let i = start + 1; i < sequence.length; i += 1) {
      const node = sequence[i];
      if (/^H[2-5]$/.test(node.tagName) && Number(node.tagName.slice(1)) <= level) break;
      if (node.tagName === "TABLE") tables.push(node);
    }
    return tables;
  }

  function parseEffectGrid(grid, mode) {
    const effects = emptyEffects();
    const level10Column = mode === "skill" ? findSkillLevelColumn(grid, 10) : -1;
    grid.forEach(function (row) {
      const text = row.join(" ");
      if (!EFFECT_WORDS.test(text)) return;
      const preferred = level10Column >= 0 ? [level10Column] : [];
      const value = effectValueFromRow(row, preferred);
      if (value == null) return;
      applyEffectText(effects, text, value);
    });
    return effects;
  }

  function parseSkillEffects(entries, calculator) {
    const effects = emptyEffects();
    const names = [];
    entries.forEach(function (entry) {
      const grid = calculator.tableToGrid(entry.table);
      mergeEffects(effects, parseEffectGrid(grid, "skill"));
      if (entry.name) names.push(entry.name);
    });
    return { effects: effects, names: names };
  }

  function parseClassEffects(tables, calculator) {
    const effects = emptyEffects();
    tables.forEach(function (table) {
      mergeEffects(effects, parseEffectGrid(calculator.tableToGrid(table), "class"));
    });
    return effects;
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
    const selectedCol = levelColumns[Math.max(0, Math.min(4, Number(npLevel) - 1))];
    const oc1Column = levelColumns[0];
    const attackRowIndex = grid.findIndex(function (row) { return /強力な攻撃|超強力な攻撃/.test(compact(row.join(" "))); });
    if (attackRowIndex < 0) return null;

    const attackRow = grid[attackRowIndex];
    const multiplier = selectedCol >= 0 ? strictNum(attackRow[selectedCol]) : null;
    const attackText = attackRow.join(" ");
    const scope = /敵全体/.test(attackText) ? "all" : (/敵単体/.test(attackText) ? "single" : "unknown");
    const card = detectCard(attackRow[0] || attackText);

    const preEffects = emptyEffects();
    for (let i = 0; i < attackRowIndex; i += 1) {
      const row = grid[i];
      const text = row.join(" ");
      if (!EFFECT_WORDS.test(text)) continue;
      let preferred = [];
      if (/\[Lv\]/i.test(text) && selectedCol >= 0) preferred = [selectedCol];
      else if (/OC|オーバーチャージ/i.test(text) && oc1Column >= 0) preferred = [oc1Column];
      const value = effectValueFromRow(row, preferred);
      if (value != null) applyEffectText(preEffects, text, value);
    }

    const afterEffects = emptyEffects();
    for (let i = attackRowIndex + 1; i < grid.length; i += 1) {
      const row = grid[i];
      const text = row.join(" ");
      if (!EFFECT_WORDS.test(text)) continue;
      let preferred = [];
      if (/\[Lv\]/i.test(text) && selectedCol >= 0) preferred = [selectedCol];
      else if (/OC|オーバーチャージ/i.test(text) && oc1Column >= 0) preferred = [oc1Column];
      const value = effectValueFromRow(row, preferred);
      if (value != null) applyEffectText(afterEffects, text, value);
    }

    return {
      multiplier: multiplier,
      scope: scope,
      card: card,
      preEffects: preEffects,
      afterEffects: afterEffects
    };
  }

  function parseNo(doc) {
    const text = norm(doc.body ? doc.body.textContent : "");
    const m = text.match(/No\.\s*([0-9]+(?:['′])?)/i);
    return m ? m[1] : "";
  }

  function parseServantDocument(doc, url, npLevel, calculator) {
    const tables = Array.from(doc.querySelectorAll("table"));
    const grids = tables.map(function (table) { return calculator.tableToGrid(table); });
    const base = calculator.extractServantDataFromGrids(grids, doc.title || "");
    if (!base || !base.servantName || !base.attack || !base.noblePhantasmCardType) return null;

    const np = parseNpDetails(findNpGrid(grids), npLevel);
    if (!np || !np.multiplier || !np.card || np.scope === "unknown") return null;

    const skill = parseSkillEffects(collectCurrentSkillEntries(doc), calculator);
    const classEffects = parseClassEffects(collectSectionTables(doc, "クラススキル"), calculator);

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
      skillNames: skill.names,
      skillEffects: skill.effects,
      classEffects: classEffects,
      npPreEffects: np.preEffects,
      npAfterEffects: np.afterEffects
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
      const absolute = new URL(href, window.location.href).href;
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
      script.onerror = function () { reject(new Error("FGO計算機ファイルの読み込みに失敗しました。")); };
      document.head.appendChild(script);
    });
    if (!window.FGODamageCalculator) throw new Error("FGO計算機を読み込めませんでした。");
    return window.FGODamageCalculator;
  }

  async function fetchDocument(url) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    return new DOMParser().parseFromString(await response.text(), "text/html");
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
    await Promise.all(Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, runner));
    return result;
  }

  function calculateVariant(servant, options, calculator, useSkills) {
    const effects = emptyEffects();
    mergeEffects(effects, servant.classEffects);
    if (useSkills) mergeEffects(effects, servant.skillEffects);
    mergeEffects(effects, servant.npPreEffects);

    const card = servant.npCard;
    const baseHits = Number(servant.hitCounts && servant.hitCounts.np) || 1;
    const hitCount = Math.max(1, Math.round(baseHits * (effects.npHitMultiplier || 1)));
    const targets = servant.scope === "all" ? Number(options.aoeTargets) : 1;
    const attack = Number(servant.attack) + (options.atkPlus1000 ? 1000 : 0);

    const calc = calculator.calculateDamage({
      attackType: "np",
      attack: attack,
      attackerClass: servant.attackerClass,
      defenderClass: "saber",
      manualClassAffinity: true,
      classAffinityPercent: 100,
      attributeAffinity: 1,
      cardType: card,
      noblePhantasmMultiplier: servant.npMultiplier,
      cardPerformanceUp: effects.cardUp[card] || 0,
      attackUp: effects.attackUp,
      defenseDown: effects.defenseDown,
      noblePhantasmDamageUp: effects.npDamageUp,
      cardResistanceDown: effects.cardResistanceDown[card] || 0,
      powerUp: effects.powerUp,
      flatDamage: effects.flatDamage,
      targetFlatDamage: effects.targetFlatDamage,
      targetCount: targets,
      hitCount: hitCount,
      overkillHitCount: 0,
      attackBaseNp: Number(servant.attackBaseNp) || 0,
      manualDtdr: true,
      dtdrPercent: 100,
      npGainUp: effects.npGainUp,
      starRate: Number(servant.starRate) || 0,
      manualDsr: true,
      dsrPercent: 0,
      starGenerationUp: effects.starGenerationUp,
      critical: false
    });

    const after = servant.npAfterEffects || emptyEffects();
    const npAttack = Number(calc.npRecharge) || 0;
    const npAdditional = effects.directNp + effects.turnNp + (after.directNp || 0) + (after.turnNp || 0);
    const starAttack = Number(calc.expectedStars) || 0;
    const starAdditional = effects.directStars + effects.turnStars + (after.directStars || 0) + (after.turnStars || 0);

    return {
      effectiveAttack: attack,
      targets: targets,
      hitCount: hitCount,
      effects: effects,
      damageMin: Number(calc.minimumDamage) || 0,
      damageAvg: Number(calc.averageDamage) || Number(calc.referenceDamage) || 0,
      damageRef: Number(calc.referenceDamage) || 0,
      damageMax: Number(calc.maximumDamage) || 0,
      npPerTarget: Number(calc.npRechargePerTarget) || 0,
      npAttack: npAttack,
      npAdditional: npAdditional,
      npTotal: npAttack + npAdditional,
      starAttack: starAttack,
      starAdditional: starAdditional,
      starTotal: starAttack + starAdditional,
      starMin: (Number(calc.minimumStars) || 0) + starAdditional,
      starMax: (Number(calc.maximumStars) || 0) + starAdditional
    };
  }

  function calculateRow(servant, options, calculator) {
    return Object.assign({}, servant, {
      withoutSkills: calculateVariant(servant, options, calculator, false),
      withSkills: calculateVariant(servant, options, calculator, true)
    });
  }

  function metricValue(row, metric, sortBasis) {
    const variant = sortBasis === "without" ? row.withoutSkills : row.withSkills;
    if (metric === "damage") return variant.damageAvg;
    if (metric === "np") return variant.npTotal;
    if (metric === "stars") return variant.starTotal;
    return 0;
  }

  function sortRows(rows, metric, options) {
    return rows.slice().sort(function (a, b) {
      const diff = metricValue(b, metric, options.sortBasis) - metricValue(a, metric, options.sortBasis);
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

  function cardHtml(card) {
    const label = String(card || "").toUpperCase();
    return '<span class="fgr-card fgr-card-' + escapeHtml(card) + '">' + escapeHtml(label) + '</span>';
  }

  function skillNamesHtml(row) {
    if (!row.skillNames || !row.skillNames.length) return '<span class="fgr-muted">－</span>';
    return row.skillNames.map(escapeHtml).join('<br>');
  }

  function tableWrap(id, title, note, tableHtml) {
    return '<section class="fgr-section" id="' + id + '"><h3>' + escapeHtml(title) + '</h3>' +
      '<p class="fgr-help">' + escapeHtml(note) + '</p><div class="fgr-scroll">' + tableHtml + '</div></section>';
  }

  function renderTables(root, rows, options) {
    const filtered = filterRows(rows, options);
    const limit = options.limit === "all" ? Infinity : Number(options.limit);
    const damage = sortRows(filtered, "damage", options).slice(0, limit);
    const np = sortRows(filtered.filter(function (r) { return Number(r.attackBaseNp) > 0; }), "np", options).slice(0, limit);
    const stars = sortRows(filtered.filter(function (r) { return Number.isFinite(Number(r.starRate)); }), "stars", options).slice(0, limit);

    const damageBody = damage.map(function (r, i) {
      const off = r.withoutSkills;
      const on = r.withSkills;
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(r.no) + '</td><td class="fgr-name">' + rowNameHtml(r) + '</td>' +
        '<td class="fgr-skills">' + skillNamesHtml(r) + '</td><td>' + escapeHtml(CLASS_LABEL[r.attackerClass] || r.attackerClass) + '</td>' +
        '<td>' + cardHtml(r.npCard) + '<br><span class="fgr-muted">' + (r.scope === "all" ? "全体" : "単体") + '</span></td>' +
        '<td>' + formatNumber(off.damageMax) + '</td><td><b>' + formatNumber(off.damageAvg) + '</b></td><td>' + formatNumber(off.damageMin) + '</td>' +
        '<td>' + formatNumber(on.damageMax) + '</td><td><b>' + formatNumber(on.damageAvg) + '</b></td><td>' + formatNumber(on.damageMin) + '</td></tr>';
    }).join("");

    const damageTable = '<table class="fgr-table"><thead><tr><th rowspan="2">順位</th><th rowspan="2">No.</th><th rowspan="2">名前</th><th rowspan="2">使用スキル</th><th rowspan="2">クラス</th><th rowspan="2">宝具</th>' +
      '<th colspan="3">スキル無</th><th colspan="3">スキル有</th></tr><tr><th>最高</th><th>平均</th><th>最低</th><th>最高</th><th>平均</th><th>最低</th></tr></thead><tbody>' + damageBody + '</tbody></table>';

    const npBody = np.map(function (r, i) {
      const off = r.withoutSkills;
      const on = r.withSkills;
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(r.no) + '</td><td class="fgr-name">' + rowNameHtml(r) + '</td>' +
        '<td class="fgr-skills">' + skillNamesHtml(r) + '</td><td>' + cardHtml(r.npCard) + '</td><td>' + off.hitCount + '</td><td>' + off.targets + '</td>' +
        '<td>' + formatNumber(off.npAttack, 2) + '%</td><td>' + formatNumber(off.npAdditional, 2) + '%</td><td><b>' + formatNumber(off.npTotal, 2) + '%</b></td>' +
        '<td>' + formatNumber(on.npAttack, 2) + '%</td><td>' + formatNumber(on.npAdditional, 2) + '%</td><td><b>' + formatNumber(on.npTotal, 2) + '%</b></td></tr>';
    }).join("");

    const npTable = '<table class="fgr-table"><thead><tr><th rowspan="2">順位</th><th rowspan="2">No.</th><th rowspan="2">名前</th><th rowspan="2">使用スキル</th><th rowspan="2">宝具</th><th rowspan="2">Hit</th><th rowspan="2">敵数</th>' +
      '<th colspan="3">スキル無</th><th colspan="3">スキル有</th></tr><tr><th>攻撃分</th><th>追加NP</th><th>合計</th><th>攻撃分</th><th>追加NP</th><th>合計</th></tr></thead><tbody>' + npBody + '</tbody></table>';

    const starBody = stars.map(function (r, i) {
      const off = r.withoutSkills;
      const on = r.withSkills;
      return '<tr><td>' + (i + 1) + '</td><td>' + escapeHtml(r.no) + '</td><td class="fgr-name">' + rowNameHtml(r) + '</td>' +
        '<td class="fgr-skills">' + skillNamesHtml(r) + '</td><td>' + cardHtml(r.npCard) + '</td><td>' + off.hitCount + '</td><td>' + off.targets + '</td>' +
        '<td>' + formatNumber(off.starAttack, 2) + '</td><td>' + formatNumber(off.starAdditional, 2) + '</td><td><b>' + formatNumber(off.starTotal, 2) + '</b></td>' +
        '<td>' + formatNumber(on.starAttack, 2) + '</td><td>' + formatNumber(on.starAdditional, 2) + '</td><td><b>' + formatNumber(on.starTotal, 2) + '</b></td></tr>';
    }).join("");

    const starTable = '<table class="fgr-table"><thead><tr><th rowspan="2">順位</th><th rowspan="2">No.</th><th rowspan="2">名前</th><th rowspan="2">使用スキル</th><th rowspan="2">宝具</th><th rowspan="2">Hit</th><th rowspan="2">敵数</th>' +
      '<th colspan="3">スキル無</th><th colspan="3">スキル有</th></tr><tr><th>攻撃期待値</th><th>追加</th><th>合計期待値</th><th>攻撃期待値</th><th>追加</th><th>合計期待値</th></tr></thead><tbody>' + starBody + '</tbody></table>';

    root.querySelector(".fgr-results").innerHTML =
      tableWrap("fgr-damage", "宝具火力ランキング", "自然上限Lv・ATK+1000（設定で解除可）・クラス/属性相性等倍。全体宝具も1体あたりのダメージです。条件付き特攻は自動適用しません。", damageTable) +
      tableWrap("fgr-np", "宝具NP獲得量ランキング", "DTDR100%、クリティカル・オーバーキルなし。全体宝具は指定した敵数で集計。『追加NP』には即時NP増加・宝具リチャージ・毎ターンNPの1回分を含めます。", npTable) +
      tableWrap("fgr-stars", "宝具スター獲得量ランキング", "DSR0%、クリティカル・オーバーキルなし。攻撃Hitの期待値に即時スター獲得・毎ターンスターの1回分を加算します。", starTable);
  }

  function styles() {
    return `
#${ROOT_ID}{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Yu Gothic UI",Meiryo,sans-serif;color:#1f2937;max-width:1240px;margin:16px auto;line-height:1.55}
#${ROOT_ID} *{box-sizing:border-box}
#${ROOT_ID} .fgr-shell{background:#f4f8fc;border:1px solid #b8cee3;border-radius:12px;padding:16px}
#${ROOT_ID} .fgr-title{margin:0 0 4px;font-size:22px}
#${ROOT_ID} .fgr-version{font-size:12px;color:#64748b}
#${ROOT_ID} .fgr-lead{margin:7px 0 14px;color:#526579}
#${ROOT_ID} .fgr-section{background:#fff;border:1px solid #ccd9e5;border-radius:9px;padding:14px;margin:12px 0}
#${ROOT_ID} .fgr-section h3{font-size:17px;margin:0 0 12px;border-left:5px solid #477fad;padding-left:9px}
#${ROOT_ID} .fgr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:10px;align-items:end}
#${ROOT_ID} .fgr-field{display:flex;flex-direction:column;gap:4px;font-weight:600;font-size:13px}
#${ROOT_ID} .fgr-field select{width:100%;border:1px solid #aebfd0;border-radius:6px;background:#fff;padding:8px;font:inherit;color:#111827}
#${ROOT_ID} .fgr-check{display:flex;gap:7px;align-items:center;font-size:13px;font-weight:600;padding:8px 0}
#${ROOT_ID} .fgr-check input{width:17px;height:17px}
#${ROOT_ID} .fgr-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
#${ROOT_ID} .fgr-btn{border:1px solid #35698f;border-radius:7px;background:#477fad;color:#fff;padding:8px 13px;font-weight:700;cursor:pointer;font:inherit}
#${ROOT_ID} .fgr-btn:hover{background:#35698f}
#${ROOT_ID} .fgr-btn.sub{background:#fff;color:#35698f}
#${ROOT_ID} .fgr-btn.sub:hover{background:#e8f1f8}
#${ROOT_ID} .fgr-status{padding:9px;border-radius:6px;margin:12px 0 0;background:#edf7ed;color:#245c2a}
#${ROOT_ID} .fgr-status.work{background:#edf5fb;color:#365c78}
#${ROOT_ID} .fgr-status.warn{background:#fff4d6;color:#7a4d00}
#${ROOT_ID} .fgr-help{font-size:12px;color:#64748b;margin:6px 0 10px}
#${ROOT_ID} .fgr-nav{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0 0}
#${ROOT_ID} .fgr-nav a{display:inline-block;border:1px solid #9ebbd1;border-radius:6px;background:#fff;color:#35698f;text-decoration:none;padding:5px 9px;font-size:12px;font-weight:700}
#${ROOT_ID} .fgr-nav a:hover{background:#e8f1f8}
#${ROOT_ID} .fgr-scroll{overflow-x:auto}
#${ROOT_ID} .fgr-table{border-collapse:collapse;width:100%;min-width:900px;font-size:13px}
#${ROOT_ID} .fgr-table th,#${ROOT_ID} .fgr-table td{border:1px solid #c7d5e2;padding:6px;text-align:center;white-space:nowrap;vertical-align:middle}
#${ROOT_ID} .fgr-table th{background:#e7eff7;font-weight:700}
#${ROOT_ID} .fgr-table thead tr:first-child th[colspan]{background:#dce9f4}
#${ROOT_ID} .fgr-table .fgr-name,#${ROOT_ID} .fgr-table .fgr-skills{text-align:left;white-space:normal;min-width:130px}
#${ROOT_ID} .fgr-table a{color:#075985;font-weight:700;text-decoration:none}
#${ROOT_ID} .fgr-table a:hover{text-decoration:underline}
#${ROOT_ID} .fgr-muted{font-size:11px;color:#64748b}
#${ROOT_ID} .fgr-card{display:inline-block;min-width:48px;padding:2px 6px;border-radius:4px;font-weight:800;color:#1f2937;border:1px solid rgba(0,0,0,.12)}
#${ROOT_ID} .fgr-card-quick{background:#ccefc8}
#${ROOT_ID} .fgr-card-arts{background:#cbdff8}
#${ROOT_ID} .fgr-card-buster{background:#f7caca}
@media(max-width:720px){#${ROOT_ID} .fgr-shell{padding:10px}#${ROOT_ID} .fgr-section{padding:10px}#${ROOT_ID} .fgr-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}}
`;
  }

  function readOptions(root) {
    return {
      npLevel: Number(root.querySelector("[data-key=npLevel]").value),
      atkPlus1000: root.querySelector("[data-key=atkPlus1000]").checked,
      aoeTargets: Number(root.querySelector("[data-key=aoeTargets]").value),
      rarity: root.querySelector("[data-key=rarity]").value,
      classId: root.querySelector("[data-key=classId]").value,
      scope: root.querySelector("[data-key=scope]").value,
      sortBasis: root.querySelector("[data-key=sortBasis]").value,
      limit: root.querySelector("[data-key=limit]").value
    };
  }

  function uiHtml() {
    const classOptions = Object.keys(CLASS_LABEL).map(function (id) {
      return '<option value="' + id + '">' + CLASS_LABEL[id] + '</option>';
    }).join("");

    return '<div class="fgr-shell"><h2 class="fgr-title">FGO ランキング生成</h2><div class="fgr-version">ver ' + VERSION + '</div>' +
      '<p class="fgr-lead">個別サーヴァントページから現在のデータを読み取り、宝具火力・NP獲得量・スター獲得量を同じ条件で比較します。</p>' +
      '<section class="fgr-section"><h3>ランキング条件</h3><div class="fgr-grid">' +
      '<label class="fgr-field"><span>宝具Lv</span><select data-key="npLevel"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>' +
      '<label class="fgr-field"><span>全体宝具の敵数</span><select data-key="aoeTargets"><option>1</option><option>2</option><option selected>3</option></select></label>' +
      '<label class="fgr-field"><span>レアリティ</span><select data-key="rarity"><option value="all">すべて</option><option value="5">★5</option><option value="4">★4</option><option value="3">★3</option><option value="2">★2</option><option value="1">★1</option></select></label>' +
      '<label class="fgr-field"><span>クラス</span><select data-key="classId"><option value="all">すべて</option>' + classOptions + '</select></label>' +
      '<label class="fgr-field"><span>宝具範囲</span><select data-key="scope"><option value="any">すべて</option><option value="all">全体</option><option value="single">単体</option></select></label>' +
      '<label class="fgr-field"><span>順位基準</span><select data-key="sortBasis"><option value="with">スキル有</option><option value="without">スキル無</option></select></label>' +
      '<label class="fgr-field"><span>表示件数</span><select data-key="limit"><option value="20">上位20</option><option value="50">上位50</option><option value="all">すべて</option></select></label>' +
      '<label class="fgr-check"><input type="checkbox" data-key="atkPlus1000" checked>ATK＋1000（フォウ）</label>' +
      '</div><div class="fgr-actions"><button type="button" class="fgr-btn" data-action="generate">ランキング生成／更新</button><button type="button" class="fgr-btn sub" data-action="clearCache">データを再取得</button></div>' +
      '<p class="fgr-help">固定条件：スキルLv10・上位3スキル・強化後優先・OC1・クラス相性/属性相性等倍・クリティカルなし・オーバーキルなし。対象特性やHPなど条件が必要な特攻・バフは自動適用しません。</p>' +
      '<nav class="fgr-nav"><a href="#fgr-damage">宝具火力</a><a href="#fgr-np">NP獲得量</a><a href="#fgr-stars">スター獲得量</a></nav>' +
      '<div class="fgr-status work">準備中…</div></section><div class="fgr-results"></div></div>';
  }

  function setStatus(root, text, kind) {
    const status = root.querySelector(".fgr-status");
    status.className = "fgr-status " + (kind || "");
    status.textContent = text;
  }

  async function generate(root, forceReload) {
    const options = readOptions(root);
    setStatus(root, "既存FGO計算機を読み込んでいます…", "work");
    const calculator = await ensureCalculator();

    setStatus(root, "サーヴァント一覧を取得しています…", "work");
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
      } catch (_) {
        failures += 1;
        return null;
      }
    }, function (done, total) {
      setStatus(root, "個別ページを解析中… " + done + " / " + total + (failures ? "（取得失敗 " + failures + "）" : ""), "work");
    });

    saveCache(cache);
    const servants = parsed.filter(Boolean);
    const calculated = servants.map(function (servant) { return calculateRow(servant, options, calculator); });
    renderTables(root, calculated, options);
    setStatus(root, "完了：" + calculated.length + "騎を集計" + (failures ? " / 取得失敗 " + failures + "件" : "") + "。条件を変更して再生成できます。", failures ? "warn" : "");
  }

  function mount() {
    if (typeof document === "undefined") return false;
    const root = document.getElementById(ROOT_ID);
    if (!root || root.dataset.mounted === "1") return false;
    root.dataset.mounted = "1";

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement("style");
      style.id = STYLE_ID;
      style.textContent = styles();
      document.head.appendChild(style);
    }

    root.innerHTML = uiHtml();
    root.querySelector("[data-action=generate]").addEventListener("click", function () {
      generate(root, false).catch(function (error) { setStatus(root, "エラー：" + error.message, "warn"); });
    });
    root.querySelector("[data-action=clearCache]").addEventListener("click", function () {
      try { localStorage.removeItem(CACHE_KEY); } catch (_) {}
      generate(root, true).catch(function (error) { setStatus(root, "エラー：" + error.message, "warn"); });
    });

    generate(root, false).catch(function (error) { setStatus(root, "エラー：" + error.message, "warn"); });
    return true;
  }

  return {
    version: VERSION,
    mount: mount,
    parseServantDocument: parseServantDocument,
    servantLinksFromListDocument: servantLinksFromListDocument,
    calculateRow: calculateRow,
    calculateVariant: calculateVariant,
    parseNpDetails: parseNpDetails,
    parseEffectGrid: parseEffectGrid,
    applyEffectText: applyEffectText,
    effectValueFromRow: effectValueFromRow,
    findSkillLevelColumn: findSkillLevelColumn,
    emptyEffects: emptyEffects,
    mergeEffects: mergeEffects
  };
});
