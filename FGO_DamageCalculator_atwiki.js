(function (factory) {
  "use strict";

  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (typeof window !== "undefined") {
    window.FGODamageCalculator = api;

    const start = function () {
      if (api.autoMount()) {
        return;
      }

      [300, 1000, 2500].forEach(function (delay) {
        setTimeout(function () {
          if (!document.getElementById("fgo-damage-calculator")) {
            api.autoMount();
          }
        }, delay);
      });
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }
})(function () {
  "use strict";

  const VERSION = "1.1.2";
  const ATTACK_CORRECTION = 0.23;
  const RANDOM_VALUES = Array.from({ length: 200 }, function (_, index) {
    return (900 + index) / 1000;
  });

  const CLASS_DATA = {
    saber: { label: "セイバー", correction: 1.0 },
    archer: { label: "アーチャー", correction: 0.95 },
    lancer: { label: "ランサー", correction: 1.05 },
    rider: { label: "ライダー", correction: 1.0 },
    caster: { label: "キャスター", correction: 0.9 },
    assassin: { label: "アサシン", correction: 0.9 },
    berserker: { label: "バーサーカー", correction: 1.1 },
    shielder: { label: "シールダー", correction: 1.0 },
    ruler: { label: "ルーラー", correction: 1.1 },
    avenger: { label: "アヴェンジャー", correction: 1.1 },
    moonCancer: { label: "ムーンキャンサー", correction: 1.0 },
    alterEgo: { label: "アルターエゴ", correction: 1.0 },
    foreigner: { label: "フォーリナー", correction: 1.0 },
    pretender: { label: "プリテンダー", correction: 1.0 },
    beast: { label: "ビースト／特殊クラス", correction: 1.0 },
    other: { label: "その他", correction: 1.0 }
  };

  const CARD_DATA = {
    quick: {
      label: "Quick",
      normal: [0.8, 0.96, 1.12],
      noblePhantasm: 0.8,
      npGain: [1.0, 1.5, 2.0],
      star: [0.8, 1.3, 1.8]
    },
    arts: {
      label: "Arts",
      normal: [1.0, 1.2, 1.4],
      noblePhantasm: 1.0,
      npGain: [3.0, 4.5, 6.0],
      star: [0, 0, 0]
    },
    buster: {
      label: "Buster",
      normal: [1.5, 1.8, 2.1],
      noblePhantasm: 1.5,
      npGain: [0, 0, 0],
      star: [0.1, 0.15, 0.2]
    },
    extra: {
      label: "Extra Attack",
      normal: [1.0, 1.0, 1.0],
      noblePhantasm: 1.0,
      npGain: [1.0, 1.0, 1.0],
      star: [1.0, 1.0, 1.0]
    }
  };

  const DTDR_BY_CLASS = {
    saber: 1.0,
    archer: 1.0,
    lancer: 1.0,
    rider: 1.1,
    caster: 1.2,
    assassin: 0.9,
    berserker: 0.8,
    shielder: 1.0,
    ruler: 1.0,
    avenger: 1.0,
    moonCancer: 1.2,
    alterEgo: 1.0,
    foreigner: 1.0,
    pretender: 1.0,
    beast: 1.0,
    other: 1.0
  };

  const DSR_BY_CLASS = {
    saber: 0,
    archer: 0.05,
    lancer: -0.05,
    rider: 0.1,
    caster: 0,
    assassin: -0.1,
    berserker: 0,
    shielder: 0,
    ruler: 0,
    avenger: -0.1,
    moonCancer: 0,
    alterEgo: 0.05,
    foreigner: 0.2,
    pretender: -0.1,
    beast: 0,
    other: 0
  };

  const DEFAULTS = {
    attackType: "normal",
    attack: 10000,
    attackerClass: "saber",
    defenderClass: "saber",
    manualClassCorrection: false,
    classCorrectionPercent: 100,
    manualClassAffinity: false,
    classAffinityPercent: 100,
    attributeAffinity: 1.0,
    cardType: "buster",
    cardPosition: 1,
    noblePhantasmMultiplier: 300,
    busterFirstBonus: false,
    artsFirstBonus: false,
    quickFirstBonus: false,
    critical: false,
    extraType: "normal",
    busterChain: false,
    cardPerformanceUp: 0,
    cardPerformanceDown: 0,
    cardResistanceUp: 0,
    cardResistanceDown: 0,
    attackUp: 0,
    attackDown: 0,
    defenseUp: 0,
    defenseDown: 0,
    ignoreDefense: false,
    specialResistanceUp: 0,
    specialResistanceDown: 0,
    powerUp: 0,
    powerDown: 0,
    targetDamageUp: 0,
    targetDamageDown: 0,
    criticalDamageUp: 0,
    criticalDamageDown: 0,
    noblePhantasmDamageUp: 0,
    noblePhantasmDamageDown: 0,
    noblePhantasmSpecialMultiplier: 100,
    stateSpecialMultiplier: 100,
    specialPowerMultiplier: 100,
    flatDamage: 0,
    targetFlatDamage: 0,
    damageCut: 0,
    targetCount: 1,
    hitCount: 1,
    overkillHitCount: 0,
    attackBaseNp: 0.8,
    manualDtdr: false,
    dtdrPercent: 100,
    npGainUp: 0,
    npGainDown: 0,
    starRate: 10,
    manualDsr: false,
    dsrPercent: 0,
    starGenerationUp: 0,
    starGenerationDown: 0,
    enemyStarGenerationUp: 0,
    enemyStarGenerationDown: 0
  };

  const NATURAL_MAX_LEVEL_BY_RARITY = {
    1: 60,
    2: 65,
    3: 70,
    4: 80,
    5: 90
  };

  const CLASS_NAME_TO_ID = {
    セイバー: "saber",
    アーチャー: "archer",
    ランサー: "lancer",
    ライダー: "rider",
    キャスター: "caster",
    アサシン: "assassin",
    バーサーカー: "berserker",
    シールダー: "shielder",
    ルーラー: "ruler",
    アヴェンジャー: "avenger",
    ムーンキャンサー: "moonCancer",
    アルターエゴ: "alterEgo",
    フォーリナー: "foreigner",
    プリテンダー: "pretender",
    ビースト: "beast",
    saber: "saber",
    archer: "archer",
    lancer: "lancer",
    rider: "rider",
    caster: "caster",
    assassin: "assassin",
    berserker: "berserker",
    shielder: "shielder",
    ruler: "ruler",
    avenger: "avenger",
    mooncancer: "moonCancer",
    alterego: "alterEgo",
    foreigner: "foreigner",
    pretender: "pretender",
    beast: "beast"
  };

  function normalizeFullWidth(value) {
    return String(value == null ? "" : value)
      .replace(/[０-９Ａ-Ｚａ-ｚ]/g, function (character) {
        return String.fromCharCode(character.charCodeAt(0) - 65248);
      })
      .replace(/．/g, ".")
      .replace(/，/g, ",")
      .replace(/％/g, "%");
  }

  function normalizeText(value) {
    return normalizeFullWidth(value)
      .replace(/\u00a0/g, " ")
      .replace(/[ \t\r\n\u3000]+/g, " ")
      .trim();
  }

  function compactText(value) {
    return normalizeText(value).replace(/\s+/g, "");
  }

  function numberFromText(value) {
    const match = normalizeFullWidth(value)
      .replace(/,/g, "")
      .match(/-?\d+(?:\.\d+)?/);
    if (!match) {
      return null;
    }
    const number = Number(match[0]);
    return Number.isFinite(number) ? number : null;
  }

  function isUsableNumber(value) {
    return value !== null && value !== "" && Number.isFinite(Number(value));
  }

  function tableToGrid(table) {
    if (!table || !table.rows) {
      return [];
    }

    const grid = [];
    Array.from(table.rows).forEach(function (row, rowIndex) {
      if (!grid[rowIndex]) {
        grid[rowIndex] = [];
      }

      let columnIndex = 0;
      Array.from(row.cells || []).forEach(function (cell) {
        while (grid[rowIndex][columnIndex] !== undefined) {
          columnIndex += 1;
        }

        const text = normalizeText(cell.textContent || "");
        const rowSpan = Math.max(
          1,
          parseInt(
            cell.rowSpan ||
              (cell.getAttribute && cell.getAttribute("rowspan")) ||
              1,
            10
          ) || 1
        );
        const columnSpan = Math.max(
          1,
          parseInt(
            cell.colSpan ||
              (cell.getAttribute && cell.getAttribute("colspan")) ||
              1,
            10
          ) || 1
        );

        for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
          const targetRow = rowIndex + rowOffset;
          if (!grid[targetRow]) {
            grid[targetRow] = [];
          }
          for (
            let columnOffset = 0;
            columnOffset < columnSpan;
            columnOffset += 1
          ) {
            const targetColumn = columnIndex + columnOffset;
            if (grid[targetRow][targetColumn] === undefined) {
              grid[targetRow][targetColumn] = text;
            }
          }
        }

        columnIndex += columnSpan;
      });
    });

    return grid.map(function (row) {
      return row.map(function (cell) {
        return cell === undefined ? "" : cell;
      });
    });
  }

  function gridContains(grid, text) {
    const target = compactText(text).toLowerCase();
    return grid.some(function (row) {
      return row.some(function (cell) {
        return compactText(cell).toLowerCase().indexOf(target) !== -1;
      });
    });
  }

  function labelMatches(value, label) {
    const text = compactText(value).toLowerCase();
    const target = compactText(label).toLowerCase();
    return text === target || text.indexOf(target) === 0;
  }

  function valueAfterLabel(grid, labels) {
    const targets = Array.isArray(labels) ? labels : [labels];

    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      const row = grid[rowIndex];
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        const matched = targets.some(function (label) {
          return labelMatches(row[columnIndex], label);
        });
        if (!matched) {
          continue;
        }

        for (
          let nextColumn = columnIndex + 1;
          nextColumn < row.length;
          nextColumn += 1
        ) {
          const candidate = normalizeText(row[nextColumn]);
          if (!candidate) {
            continue;
          }
          const repeatsLabel = targets.some(function (label) {
            return labelMatches(candidate, label);
          });
          if (!repeatsLabel) {
            return candidate;
          }
        }
      }
    }

    return "";
  }

  function classIdFromText(value) {
    const text = compactText(value).toLowerCase();
    const classNames = Object.keys(CLASS_NAME_TO_ID).sort(function (left, right) {
      return right.length - left.length;
    });

    for (let index = 0; index < classNames.length; index += 1) {
      const name = compactText(classNames[index]).toLowerCase();
      if (text.indexOf(name) !== -1) {
        return CLASS_NAME_TO_ID[classNames[index]];
      }
    }
    return null;
  }

  function findAtkAtNaturalLevel(grid, rarity) {
    const naturalLevel = NATURAL_MAX_LEVEL_BY_RARITY[rarity] || null;
    const atkRow = grid.find(function (row) {
      return row.some(function (cell) {
        return compactText(cell).toUpperCase() === "ATK";
      });
    });

    if (!atkRow) {
      return { attack: null, naturalLevel: naturalLevel };
    }

    if (naturalLevel) {
      const levelPattern = new RegExp("^Lv\\.?"+ naturalLevel + "$", "i");
      for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
        const headerRow = grid[rowIndex];
        for (
          let columnIndex = 0;
          columnIndex < headerRow.length;
          columnIndex += 1
        ) {
          if (!levelPattern.test(compactText(headerRow[columnIndex]))) {
            continue;
          }
          const attack = numberFromText(atkRow[columnIndex]);
          if (attack !== null) {
            return { attack: attack, naturalLevel: naturalLevel };
          }
        }
      }
    }

    let atkLabelColumn = -1;
    atkRow.some(function (cell, columnIndex) {
      if (compactText(cell).toUpperCase() === "ATK") {
        atkLabelColumn = columnIndex;
        return true;
      }
      return false;
    });

    const fallbackValues = atkRow
      .slice(atkLabelColumn + 1)
      .map(numberFromText)
      .filter(function (value) {
        return value !== null;
      });

    return {
      attack: fallbackValues.length
        ? fallbackValues[fallbackValues.length - 1]
        : null,
      naturalLevel: naturalLevel
    };
  }

  function findHitCounts(grid) {
    const hitCounts = {};
    const cardLabels = {
      Q: "quick",
      QUICK: "quick",
      A: "arts",
      ARTS: "arts",
      B: "buster",
      BUSTER: "buster",
      EX: "extra",
      EXTRA: "extra",
      宝具: "np"
    };

    for (let rowIndex = 0; rowIndex < grid.length; rowIndex += 1) {
      const row = grid[rowIndex];
      const compactRow = row.map(function (cell) {
        return compactText(cell).toUpperCase();
      });
      const requiredLabels = ["Q", "A", "B", "EX"];
      const hasCardHeader = requiredLabels.every(function (label) {
        return compactRow.indexOf(label) !== -1;
      });
      if (!hasCardHeader) {
        continue;
      }

      compactRow.forEach(function (label, columnIndex) {
        const key = cardLabels[label];
        if (!key) {
          return;
        }
        for (
          let valueRowIndex = rowIndex + 1;
          valueRowIndex < Math.min(grid.length, rowIndex + 4);
          valueRowIndex += 1
        ) {
          const value = numberFromText(grid[valueRowIndex][columnIndex]);
          if (value !== null && value >= 1 && value <= 99) {
            hitCounts[key] = Math.round(value);
            break;
          }
        }
      });

      if (Object.keys(hitCounts).length) {
        break;
      }
    }

    return hitCounts;
  }

  function cardIdFromRow(row) {
    const cardNames = {
      quick: "quick",
      arts: "arts",
      buster: "buster"
    };

    for (let index = 0; index < row.length; index += 1) {
      const text = compactText(row[index]).toLowerCase();
      if (cardNames[text]) {
        return cardNames[text];
      }
    }
    return null;
  }

  function findNoblePhantasmData(grids) {
    let detected = null;

    grids.forEach(function (grid) {
      if (!gridContains(grid, "Card") || !gridContains(grid, "効果")) {
        return;
      }

      let effectColumn = -1;
      grid.some(function (row) {
        return row.some(function (cell, columnIndex) {
          if (compactText(cell) === "効果") {
            effectColumn = columnIndex;
            return true;
          }
          return false;
        });
      });

      grid.forEach(function (row) {
        const effectText = compactText(row.join(" "));
        if (
          effectText.indexOf("強力な攻撃") === -1 &&
          effectText.indexOf("超強力な攻撃") === -1
        ) {
          return;
        }

        const cardType = cardIdFromRow(row);
        let multiplier = null;
        const searchStart = Math.max(0, effectColumn + 1);
        for (let index = searchStart; index < row.length; index += 1) {
          const value = numberFromText(row[index]);
          if (value !== null && value >= 100) {
            multiplier = value;
            break;
          }
        }

        if (cardType || multiplier !== null) {
          detected = {
            cardType: cardType,
            multiplier: multiplier
          };
        }
      });
    });

    return detected;
  }

  function extractServantDataFromGrids(grids, pageTitle) {
    const basicGrid = grids.find(function (grid) {
      return (
        gridContains(grid, "Class") &&
        gridContains(grid, "Rare") &&
        gridContains(grid, "ATK")
      );
    });
    const hiddenGrid = grids.find(function (grid) {
      return (
        gridContains(grid, "ヒット数") &&
        gridContains(grid, "スター発生率") &&
        gridContains(grid, "N/A")
      );
    });

    if (!basicGrid) {
      return null;
    }

    const rarity = numberFromText(valueAfterLabel(basicGrid, "Rare"));
    const atk = findAtkAtNaturalLevel(basicGrid, rarity);
    const noblePhantasm = findNoblePhantasmData(grids);
    const servantName =
      valueAfterLabel(basicGrid, "真名") ||
      normalizeText(pageTitle).replace(/\s*[-|｜].*$/, "");
    const starRate = hiddenGrid
      ? numberFromText(valueAfterLabel(hiddenGrid, "スター発生率"))
      : null;
    const attackBaseNp = hiddenGrid
      ? numberFromText(valueAfterLabel(hiddenGrid, "N/A"))
      : null;

    return {
      servantName: servantName || "サーヴァント",
      rarity: rarity,
      naturalLevel: atk.naturalLevel,
      attack: atk.attack,
      attackerClass: classIdFromText(
        valueAfterLabel(basicGrid, ["Class", "クラス"])
      ),
      attackBaseNp: attackBaseNp,
      starRate: starRate,
      hitCounts: hiddenGrid ? findHitCounts(hiddenGrid) : {},
      noblePhantasmCardType: noblePhantasm
        ? noblePhantasm.cardType
        : null,
      noblePhantasmMultiplier: noblePhantasm
        ? noblePhantasm.multiplier
        : null
    };
  }

  function extractServantPageData(sourceDocument) {
    if (!sourceDocument || !sourceDocument.querySelectorAll) {
      return null;
    }

    const grids = Array.from(sourceDocument.querySelectorAll("table")).map(
      tableToGrid
    );
    return extractServantDataFromGrids(
      grids,
      sourceDocument.title || ""
    );
  }

  function toFiniteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function nonNegative(value, fallback) {
    return Math.max(0, toFiniteNumber(value, fallback));
  }

  function percent(value, fallback) {
    return toFiniteNumber(value, fallback) / 100;
  }

  function classLabel(classId) {
    return CLASS_DATA[classId] ? CLASS_DATA[classId].label : CLASS_DATA.other.label;
  }

  function getClassCorrection(classId) {
    return CLASS_DATA[classId] ? CLASS_DATA[classId].correction : 1.0;
  }

  function getClassAffinity(attackerClass, defenderClass) {
    const attacker = CLASS_DATA[attackerClass] ? attackerClass : "other";
    const defender = CLASS_DATA[defenderClass] ? defenderClass : "other";

    if (
      attacker === "shielder" ||
      defender === "shielder" ||
      attacker === "beast" ||
      defender === "beast" ||
      attacker === "other" ||
      defender === "other"
    ) {
      return 1.0;
    }

    if (attacker === "berserker") {
      return defender === "foreigner" ? 0.5 : 1.5;
    }

    if (defender === "berserker") {
      return 2.0;
    }

    const affinity = {
      saber: { lancer: 2.0, archer: 0.5 },
      archer: { saber: 2.0, lancer: 0.5 },
      lancer: { archer: 2.0, saber: 0.5 },
      rider: { caster: 2.0, assassin: 0.5 },
      caster: { assassin: 2.0, rider: 0.5 },
      assassin: { rider: 2.0, caster: 0.5 },
      ruler: { moonCancer: 2.0, avenger: 0.5 },
      avenger: { ruler: 2.0, moonCancer: 0.5 },
      moonCancer: { avenger: 2.0, ruler: 0.5 },
      alterEgo: {
        saber: 0.5,
        archer: 0.5,
        lancer: 0.5,
        rider: 1.5,
        caster: 1.5,
        assassin: 1.5,
        foreigner: 2.0,
        pretender: 0.5
      },
      foreigner: {
        alterEgo: 0.5,
        pretender: 2.0
      },
      pretender: {
        saber: 1.5,
        archer: 1.5,
        lancer: 1.5,
        rider: 0.5,
        caster: 0.5,
        assassin: 0.5,
        alterEgo: 2.0,
        foreigner: 0.5
      }
    };

    return affinity[attacker] && affinity[attacker][defender]
      ? affinity[attacker][defender]
      : 1.0;
  }

  function getCardCorrection(attackType, cardType, cardPosition) {
    const card = CARD_DATA[cardType] || CARD_DATA.buster;

    if (attackType === "np") {
      return card.noblePhantasm;
    }

    if (cardType === "extra") {
      return 1.0;
    }

    const positionIndex = clamp(Math.round(toFiniteNumber(cardPosition, 1)), 1, 3) - 1;
    return card.normal[positionIndex];
  }

  function getResourceCardCorrection(
    attackType,
    cardType,
    cardPosition,
    resource
  ) {
    const card = CARD_DATA[cardType] || CARD_DATA.buster;
    const values = resource === "star" ? card.star : card.npGain;

    if (attackType === "np" || cardType === "extra") {
      return values[0];
    }

    const positionIndex = clamp(Math.round(toFiniteNumber(cardPosition, 1)), 1, 3) - 1;
    return values[positionIndex];
  }

  function getDtdr(classId) {
    return Object.prototype.hasOwnProperty.call(DTDR_BY_CLASS, classId)
      ? DTDR_BY_CLASS[classId]
      : 1.0;
  }

  function getDsr(classId) {
    return Object.prototype.hasOwnProperty.call(DSR_BY_CLASS, classId)
      ? DSR_BY_CLASS[classId]
      : 0;
  }

  function floorTo(value, digits) {
    const multiplier = Math.pow(10, digits);
    return Math.floor((value + Number.EPSILON) * multiplier) / multiplier;
  }

  function boundedStateDelta(upPercent, downPercent, minimumFactor, maximumFactor) {
    const factor = clamp(
      1 + percent(upPercent, 0) - percent(downPercent, 0),
      minimumFactor,
      maximumFactor
    );
    return factor - 1;
  }

  function upperBoundedDelta(upPercent, downPercent, maximumDelta) {
    return Math.min(
      maximumDelta,
      percent(upPercent, 0) - percent(downPercent, 0)
    );
  }

  function normalizeModel(source) {
    const input = Object.assign({}, DEFAULTS, source || {});
    const attackType = input.attackType === "np" ? "np" : "normal";
    let cardType = CARD_DATA[input.cardType] ? input.cardType : "buster";

    if (attackType === "np" && cardType === "extra") {
      cardType = "buster";
    }

    return {
      attackType: attackType,
      attack: nonNegative(input.attack, DEFAULTS.attack),
      attackerClass: CLASS_DATA[input.attackerClass] ? input.attackerClass : "other",
      defenderClass: CLASS_DATA[input.defenderClass] ? input.defenderClass : "other",
      manualClassCorrection: Boolean(input.manualClassCorrection),
      classCorrectionPercent: nonNegative(
        input.classCorrectionPercent,
        DEFAULTS.classCorrectionPercent
      ),
      manualClassAffinity: Boolean(input.manualClassAffinity),
      classAffinityPercent: nonNegative(
        input.classAffinityPercent,
        DEFAULTS.classAffinityPercent
      ),
      attributeAffinity: nonNegative(
        input.attributeAffinity,
        DEFAULTS.attributeAffinity
      ),
      cardType: cardType,
      cardPosition: clamp(Math.round(toFiniteNumber(input.cardPosition, 1)), 1, 3),
      noblePhantasmMultiplier: nonNegative(
        input.noblePhantasmMultiplier,
        DEFAULTS.noblePhantasmMultiplier
      ),
      busterFirstBonus: Boolean(input.busterFirstBonus),
      artsFirstBonus: Boolean(input.artsFirstBonus),
      quickFirstBonus: Boolean(input.quickFirstBonus),
      critical: Boolean(input.critical),
      extraType: input.extraType === "same" ? "same" : "normal",
      busterChain: Boolean(input.busterChain),
      cardPerformanceUp: nonNegative(input.cardPerformanceUp, 0),
      cardPerformanceDown: nonNegative(input.cardPerformanceDown, 0),
      cardResistanceUp: nonNegative(input.cardResistanceUp, 0),
      cardResistanceDown: nonNegative(input.cardResistanceDown, 0),
      attackUp: nonNegative(input.attackUp, 0),
      attackDown: nonNegative(input.attackDown, 0),
      defenseUp: nonNegative(input.defenseUp, 0),
      defenseDown: nonNegative(input.defenseDown, 0),
      ignoreDefense: Boolean(input.ignoreDefense),
      specialResistanceUp: nonNegative(input.specialResistanceUp, 0),
      specialResistanceDown: nonNegative(input.specialResistanceDown, 0),
      powerUp: nonNegative(input.powerUp, 0),
      powerDown: nonNegative(input.powerDown, 0),
      targetDamageUp: nonNegative(input.targetDamageUp, 0),
      targetDamageDown: nonNegative(input.targetDamageDown, 0),
      criticalDamageUp: nonNegative(input.criticalDamageUp, 0),
      criticalDamageDown: nonNegative(input.criticalDamageDown, 0),
      noblePhantasmDamageUp: nonNegative(input.noblePhantasmDamageUp, 0),
      noblePhantasmDamageDown: nonNegative(input.noblePhantasmDamageDown, 0),
      noblePhantasmSpecialMultiplier: nonNegative(
        input.noblePhantasmSpecialMultiplier,
        100
      ),
      stateSpecialMultiplier: nonNegative(input.stateSpecialMultiplier, 100),
      specialPowerMultiplier: nonNegative(input.specialPowerMultiplier, 100),
      flatDamage: toFiniteNumber(input.flatDamage, 0),
      targetFlatDamage: toFiniteNumber(input.targetFlatDamage, 0),
      damageCut: nonNegative(input.damageCut, 0),
      targetCount: clamp(
        Math.round(toFiniteNumber(input.targetCount, 1)),
        1,
        6
      ),
      hitCount: Math.max(1, Math.round(toFiniteNumber(input.hitCount, 1))),
      overkillHitCount: Math.max(
        0,
        Math.round(toFiniteNumber(input.overkillHitCount, 0))
      ),
      attackBaseNp: nonNegative(input.attackBaseNp, DEFAULTS.attackBaseNp),
      manualDtdr: Boolean(input.manualDtdr),
      dtdrPercent: nonNegative(input.dtdrPercent, DEFAULTS.dtdrPercent),
      npGainUp: nonNegative(input.npGainUp, 0),
      npGainDown: nonNegative(input.npGainDown, 0),
      starRate: toFiniteNumber(input.starRate, DEFAULTS.starRate),
      manualDsr: Boolean(input.manualDsr),
      dsrPercent: toFiniteNumber(input.dsrPercent, DEFAULTS.dsrPercent),
      starGenerationUp: nonNegative(input.starGenerationUp, 0),
      starGenerationDown: nonNegative(input.starGenerationDown, 0),
      enemyStarGenerationUp: nonNegative(input.enemyStarGenerationUp, 0),
      enemyStarGenerationDown: nonNegative(input.enemyStarGenerationDown, 0)
    };
  }

  function calculateDamage(source) {
    const input = normalizeModel(source);
    const isNoblePhantasm = input.attackType === "np";
    const isExtra = !isNoblePhantasm && input.cardType === "extra";
    const canCritical = !isNoblePhantasm && !isExtra;

    const attackMultiplier = isNoblePhantasm
      ? input.noblePhantasmMultiplier / 100
      : 1.0;

    const cardCorrection = getCardCorrection(
      input.attackType,
      input.cardType,
      input.cardPosition
    );

    const cardPerformanceDelta = boundedStateDelta(
      input.cardPerformanceUp,
      input.cardPerformanceDown,
      0,
      5
    );

    const cardResistanceDelta =
      Math.min(
        5,
        1 +
          percent(input.cardResistanceUp, 0) -
          percent(input.cardResistanceDown, 0)
      ) - 1;

    const effectiveCardPerformance = Math.max(
      0,
      1 + cardPerformanceDelta - cardResistanceDelta
    );

    const firstBusterBonus =
      !isNoblePhantasm &&
      input.busterFirstBonus
        ? 0.5
        : 0;

    const cardFactor = cardCorrection * effectiveCardPerformance + firstBusterBonus;

    const classCorrection = input.manualClassCorrection
      ? input.classCorrectionPercent / 100
      : getClassCorrection(input.attackerClass);

    const classAffinity = input.manualClassAffinity
      ? input.classAffinityPercent / 100
      : getClassAffinity(input.attackerClass, input.defenderClass);

    const attackStateDelta = boundedStateDelta(
      input.attackUp,
      input.attackDown,
      0,
      5
    );

    const effectiveDefenseUp = input.ignoreDefense ? 0 : input.defenseUp;
    const defenseStateDelta =
      Math.max(
        0,
        1 + percent(effectiveDefenseUp, 0) - percent(input.defenseDown, 0)
      ) - 1;

    const attackDefenseFactor = Math.max(
      0,
      1 + attackStateDelta - defenseStateDelta
    );

    const criticalFactor = canCritical && input.critical ? 2.0 : 1.0;
    const extraFactor = isExtra ? (input.extraType === "same" ? 3.5 : 2.0) : 1.0;

    const specialResistanceBase = Math.max(
      0,
      1 +
        percent(input.specialResistanceUp, 0) -
        percent(input.specialResistanceDown, 0)
    );
    const specialResistanceDelta = Math.min(5, specialResistanceBase - 1);
    const specialResistanceFactor = Math.max(0, 1 - specialResistanceDelta);

    const powerDelta = upperBoundedDelta(input.powerUp, input.powerDown, 10);
    const targetDamageDelta = upperBoundedDelta(
      input.targetDamageUp,
      input.targetDamageDown,
      5
    );
    const criticalDamageDelta =
      canCritical && input.critical
        ? upperBoundedDelta(
            input.criticalDamageUp,
            input.criticalDamageDown,
            5
          )
        : 0;
    const noblePhantasmDamageDelta = isNoblePhantasm
      ? upperBoundedDelta(
          input.noblePhantasmDamageUp,
          input.noblePhantasmDamageDown,
          5
        )
      : 0;

    const powerFactor = Math.max(
      0.001,
      1 +
        powerDelta +
        targetDamageDelta +
        criticalDamageDelta +
        noblePhantasmDamageDelta
    );

    const noblePhantasmSpecialFactor = isNoblePhantasm
      ? input.noblePhantasmSpecialMultiplier / 100
      : 1.0;
    const stateSpecialFactor = isNoblePhantasm
      ? input.stateSpecialMultiplier / 100
      : 1.0;
    const specialPowerFactor = clamp(
      input.specialPowerMultiplier / 100,
      0.001,
      10
    );

    const busterChainBonus =
      !isNoblePhantasm && !isExtra && input.busterChain
        ? input.attack * 0.2
        : 0;

    const fixedDamage =
      input.flatDamage +
      input.targetFlatDamage -
      input.damageCut +
      busterChainBonus;

    const targetCount = input.targetCount;
    const hitCount = input.hitCount;
    const overkillHitCount = clamp(input.overkillHitCount, 0, hitCount);
    const normalHitCount = hitCount - overkillHitCount;
    const resourceCardPerformance = Math.max(
      0,
      1 + cardPerformanceDelta - cardResistanceDelta
    );

    const npCardCorrection = getResourceCardCorrection(
      input.attackType,
      input.cardType,
      input.cardPosition,
      "np"
    );
    const firstArtsBonus =
      !isNoblePhantasm && input.artsFirstBonus ? 1.0 : 0;
    const npCardFactor = Math.max(
      0,
      npCardCorrection * resourceCardPerformance + firstArtsBonus
    );
    const dtdr = input.manualDtdr
      ? input.dtdrPercent / 100
      : getDtdr(input.defenderClass);
    const npGainFactor = clamp(
      1 + percent(input.npGainUp, 0) - percent(input.npGainDown, 0),
      0,
      5
    );
    const npCriticalFactor = canCritical && input.critical ? 2.0 : 1.0;
    const npPerHit = floorTo(
      input.attackBaseNp *
        npCardFactor *
        dtdr *
        npGainFactor *
        npCriticalFactor,
      2
    );
    const npRechargePerTarget = floorTo(
      npPerHit * normalHitCount + npPerHit * 1.5 * overkillHitCount,
      2
    );
    const npRecharge = floorTo(npRechargePerTarget * targetCount, 2);

    const starCardCorrection = getResourceCardCorrection(
      input.attackType,
      input.cardType,
      input.cardPosition,
      "star"
    );
    const firstQuickBonus =
      !isNoblePhantasm && input.quickFirstBonus ? 0.2 : 0;
    const dsr = input.manualDsr
      ? input.dsrPercent / 100
      : getDsr(input.defenderClass);
    const starGenerationDelta = clamp(
      percent(input.starGenerationUp, 0) -
        percent(input.starGenerationDown, 0),
      -5,
      5
    );
    const enemyStarGenerationDelta = clamp(
      percent(input.enemyStarGenerationUp, 0) -
        percent(input.enemyStarGenerationDown, 0),
      -5,
      5
    );
    const starCriticalBonus = canCritical && input.critical ? 0.2 : 0;
    const rawStarRate =
      percent(input.starRate, 0) +
      starCardCorrection * resourceCardPerformance +
      firstQuickBonus +
      dsr +
      starGenerationDelta -
      enemyStarGenerationDelta +
      starCriticalBonus;
    const normalStarRate = clamp(floorTo(rawStarRate, 3), 0, 3);
    const overkillStarRate = clamp(normalStarRate + 0.3, 0, 3);
    const expectedStarsPerTarget =
      normalStarRate * normalHitCount +
      overkillStarRate * overkillHitCount;

    function minimumStarsAtRate(rate) {
      return Math.floor(rate + 1e-9);
    }

    function maximumStarsAtRate(rate) {
      const minimum = minimumStarsAtRate(rate);
      return rate - minimum > 1e-9 ? Math.min(3, minimum + 1) : minimum;
    }

    const minimumStarsPerTarget =
      minimumStarsAtRate(normalStarRate) * normalHitCount +
      minimumStarsAtRate(overkillStarRate) * overkillHitCount;
    const maximumStarsPerTarget =
      maximumStarsAtRate(normalStarRate) * normalHitCount +
      maximumStarsAtRate(overkillStarRate) * overkillHitCount;
    const expectedStars = expectedStarsPerTarget * targetCount;
    const minimumStars = minimumStarsPerTarget * targetCount;
    const maximumStars = maximumStarsPerTarget * targetCount;

    const coreBeforeRandom =
      input.attack *
      attackMultiplier *
      cardFactor *
      classCorrection *
      classAffinity *
      input.attributeAffinity *
      ATTACK_CORRECTION *
      attackDefenseFactor *
      criticalFactor *
      extraFactor *
      specialResistanceFactor *
      powerFactor *
      specialPowerFactor *
      noblePhantasmSpecialFactor *
      stateSpecialFactor;

    function damageAt(randomCorrection) {
      return Math.floor(
        Math.max(0, coreBeforeRandom * randomCorrection + fixedDamage)
      );
    }

    const outcomes = RANDOM_VALUES.map(damageAt);
    const total = outcomes.reduce(function (sum, value) {
      return sum + value;
    }, 0);

    const referenceDamage = damageAt(1.0);
    const minimumDamage = outcomes[0];
    const maximumDamage = outcomes[outcomes.length - 1];
    const exactAverageDamage = total / outcomes.length;

    const notices = [
      "表示値は攻撃全体（全Hit合計）のダメージです。Hit数を掛ける必要はありません。",
      "乱数は0.900～1.099を0.001刻みで計算しています。",
      "NPとスターはHit単位で計算し、指定したオーバーキルHitだけに補正を適用しています。"
    ];

    if (
      (input.attackerClass === "beast" ||
        input.attackerClass === "other" ||
        input.defenderClass === "beast" ||
        input.defenderClass === "other") &&
      !input.manualClassAffinity
    ) {
      notices.push(
        "特殊クラスを含むため、クラス相性は等倍で計算しています。必要に応じて手動指定してください。"
      );
    }

    if (input.ignoreDefense && input.defenseDown > 0) {
      notices.push(
        "防御無視では防御力アップだけを無視し、防御力ダウンは有効として計算しています。"
      );
    }

    return {
      version: VERSION,
      input: input,
      outcomes: outcomes,
      minimumDamage: minimumDamage,
      maximumDamage: maximumDamage,
      referenceDamage: referenceDamage,
      averageDamage: Math.round(exactAverageDamage),
      exactAverageDamage: exactAverageDamage,
      npRecharge: npRecharge,
      npRechargePerTarget: npRechargePerTarget,
      npPerHit: npPerHit,
      expectedStars: expectedStars,
      expectedStarsPerTarget: expectedStarsPerTarget,
      minimumStars: minimumStars,
      maximumStars: maximumStars,
      normalStarRate: normalStarRate,
      overkillStarRate: overkillStarRate,
      factors: {
        attackMultiplier: attackMultiplier,
        cardCorrection: cardCorrection,
        cardPerformanceDelta: cardPerformanceDelta,
        cardResistanceDelta: cardResistanceDelta,
        effectiveCardPerformance: effectiveCardPerformance,
        firstBusterBonus: firstBusterBonus,
        cardFactor: cardFactor,
        classCorrection: classCorrection,
        classAffinity: classAffinity,
        attributeAffinity: input.attributeAffinity,
        attackCorrection: ATTACK_CORRECTION,
        attackStateDelta: attackStateDelta,
        defenseStateDelta: defenseStateDelta,
        attackDefenseFactor: attackDefenseFactor,
        criticalFactor: criticalFactor,
        extraFactor: extraFactor,
        specialResistanceFactor: specialResistanceFactor,
        powerDelta: powerDelta,
        targetDamageDelta: targetDamageDelta,
        criticalDamageDelta: criticalDamageDelta,
        noblePhantasmDamageDelta: noblePhantasmDamageDelta,
        powerFactor: powerFactor,
        specialPowerFactor: specialPowerFactor,
        noblePhantasmSpecialFactor: noblePhantasmSpecialFactor,
        stateSpecialFactor: stateSpecialFactor,
        busterChainBonus: busterChainBonus,
        fixedDamage: fixedDamage,
        coreBeforeRandom: coreBeforeRandom,
        targetCount: targetCount,
        hitCount: hitCount,
        overkillHitCount: overkillHitCount,
        normalHitCount: normalHitCount,
        npCardCorrection: npCardCorrection,
        npCardFactor: npCardFactor,
        firstArtsBonus: firstArtsBonus,
        dtdr: dtdr,
        npGainFactor: npGainFactor,
        npCriticalFactor: npCriticalFactor,
        starCardCorrection: starCardCorrection,
        firstQuickBonus: firstQuickBonus,
        dsr: dsr,
        starGenerationDelta: starGenerationDelta,
        enemyStarGenerationDelta: enemyStarGenerationDelta,
        starCriticalBonus: starCriticalBonus,
        resourceCardPerformance: resourceCardPerformance
      },
      notices: notices
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatInteger(value) {
    const number = Math.round(toFiniteNumber(value, 0));
    try {
      return number.toLocaleString("ja-JP");
    } catch (_) {
      return String(number);
    }
  }

  function formatDecimal(value, digits) {
    const number = toFiniteNumber(value, 0);
    return number.toFixed(digits);
  }

  function classOptions(selectedId) {
    return Object.keys(CLASS_DATA)
      .map(function (id) {
        const selected = id === selectedId ? " selected" : "";
        return (
          '<option value="' +
          escapeHtml(id) +
          '"' +
          selected +
          ">" +
          escapeHtml(CLASS_DATA[id].label) +
          "</option>"
        );
      })
      .join("");
  }

  function numberField(config) {
    const value =
      Object.prototype.hasOwnProperty.call(config, "value") &&
      config.value !== undefined
        ? config.value
        : 0;
    const min =
      Object.prototype.hasOwnProperty.call(config, "min") && config.min !== null
        ? ' min="' + escapeHtml(config.min) + '"'
        : "";
    const max =
      Object.prototype.hasOwnProperty.call(config, "max") && config.max !== null
        ? ' max="' + escapeHtml(config.max) + '"'
        : "";
    const step =
      Object.prototype.hasOwnProperty.call(config, "step")
        ? config.step
        : "any";
    const suffix = config.suffix
      ? '<span class="fdc-suffix">' + escapeHtml(config.suffix) + "</span>"
      : "";
    const note = config.note
      ? '<small class="fdc-field-note">' + escapeHtml(config.note) + "</small>"
      : "";
    const classes = config.className ? " " + config.className : "";

    return (
      '<label class="fdc-field' +
      classes +
      '">' +
      '<span class="fdc-label">' +
      escapeHtml(config.label) +
      "</span>" +
      '<span class="fdc-input-line">' +
      '<input type="number" data-key="' +
      escapeHtml(config.key) +
      '" value="' +
      escapeHtml(value) +
      '" step="' +
      escapeHtml(step) +
      '"' +
      min +
      max +
      ">" +
      suffix +
      "</span>" +
      note +
      "</label>"
    );
  }

  function checkboxField(config) {
    return (
      '<label class="fdc-check">' +
      '<input type="checkbox" data-key="' +
      escapeHtml(config.key) +
      '"' +
      (config.checked ? " checked" : "") +
      ">" +
      "<span>" +
      escapeHtml(config.label) +
      "</span>" +
      "</label>"
    );
  }

  function createMarkup() {
    return (
      '<div class="fdc-shell">' +
      '<header class="fdc-header">' +
      "<div>" +
      '<p class="fdc-kicker">Fate/Grand Order</p>' +
      '<h2 class="fdc-title">ダメージ・NP・スター計算機</h2>' +
      '<p class="fdc-lead">通常攻撃・宝具の全Hit合計ダメージを計算します。数値欄の「30」は30％を意味します。</p>' +
      "</div>" +
      '<span class="fdc-version">ver.' +
      VERSION +
      "</span>" +
      "</header>" +
      '<div class="fdc-toolbar">' +
      '<button type="button" class="fdc-button fdc-button-secondary" data-action="reset">入力を初期化</button>' +
      '<button type="button" class="fdc-button fdc-button-secondary" data-action="autofill">ページ情報を再入力</button>' +
      '<span class="fdc-page-state" data-role="page-state">ページ情報を確認しています</span>' +
      '<span class="fdc-save-state" data-role="save-state">入力は自動保存されます</span>' +
      "</div>" +
      '<div class="fdc-main-grid">' +
      '<form class="fdc-form" autocomplete="off">' +
      '<section class="fdc-section">' +
      '<h3 class="fdc-section-title"><span>1</span>基本情報</h3>' +
      '<div class="fdc-grid fdc-grid-2">' +
      '<label class="fdc-field">' +
      '<span class="fdc-label">攻撃種別</span>' +
      '<select data-key="attackType">' +
      '<option value="normal" selected>通常攻撃</option>' +
      '<option value="np">宝具</option>' +
      "</select>" +
      "</label>" +
      numberField({
        key: "attack",
        label: "最終ATK",
        value: DEFAULTS.attack,
        min: 0,
        step: 1,
        note: "自然上限LvのATKを自動入力。礼装・フォウ等を加えて編集できます"
      }) +
      '<label class="fdc-field">' +
      '<span class="fdc-label">攻撃側クラス</span>' +
      '<select data-key="attackerClass">' +
      classOptions(DEFAULTS.attackerClass) +
      "</select>" +
      "</label>" +
      '<label class="fdc-field">' +
      '<span class="fdc-label">防御側クラス</span>' +
      '<select data-key="defenderClass">' +
      classOptions(DEFAULTS.defenderClass) +
      "</select>" +
      "</label>" +
      "</div>" +
      '<div class="fdc-auto-summary">' +
      '<span>クラス補正 <strong data-role="class-correction">×1.000</strong></span>' +
      '<span>クラス相性 <strong data-role="class-affinity">×1.000</strong></span>' +
      "</div>" +
      '<details class="fdc-details">' +
      "<summary>クラス補正・相性を手動指定</summary>" +
      '<div class="fdc-grid fdc-grid-2 fdc-details-body">' +
      '<div class="fdc-inline-setting">' +
      checkboxField({
        key: "manualClassCorrection",
        label: "クラス補正を手動指定",
        checked: false
      }) +
      numberField({
        key: "classCorrectionPercent",
        label: "クラス補正",
        value: 100,
        min: 0,
        step: 0.1,
        suffix: "%"
      }) +
      "</div>" +
      '<div class="fdc-inline-setting">' +
      checkboxField({
        key: "manualClassAffinity",
        label: "クラス相性を手動指定",
        checked: false
      }) +
      numberField({
        key: "classAffinityPercent",
        label: "クラス相性",
        value: 100,
        min: 0,
        step: 0.1,
        suffix: "%"
      }) +
      "</div>" +
      "</div>" +
      "</details>" +
      '<div class="fdc-grid fdc-grid-2 fdc-top-gap">' +
      '<label class="fdc-field">' +
      '<span class="fdc-label">天地人・星獣相性</span>' +
      '<select data-key="attributeAffinity">' +
      '<option value="1" selected>等倍（×1.0）</option>' +
      '<option value="1.1">有利（×1.1）</option>' +
      '<option value="0.9">不利（×0.9）</option>' +
      "</select>" +
      '<small class="fdc-field-note">攻撃側から見た相性</small>' +
      "</label>" +
      "</div>" +
      "</section>" +
      '<section class="fdc-section">' +
      '<h3 class="fdc-section-title"><span>2</span>カード・チェイン</h3>' +
      '<div class="fdc-grid fdc-grid-3">' +
      '<label class="fdc-field">' +
      '<span class="fdc-label">カード種類</span>' +
      '<select data-key="cardType">' +
      '<option value="quick">Quick</option>' +
      '<option value="arts">Arts</option>' +
      '<option value="buster" selected>Buster</option>' +
      '<option value="extra">Extra Attack</option>' +
      "</select>" +
      "</label>" +
      '<label class="fdc-field" data-wrap="cardPosition">' +
      '<span class="fdc-label">カード順</span>' +
      '<select data-key="cardPosition">' +
      '<option value="1" selected>1st</option>' +
      '<option value="2">2nd</option>' +
      '<option value="3">3rd</option>' +
      "</select>" +
      "</label>" +
      numberField({
        key: "noblePhantasmMultiplier",
        label: "宝具倍率",
        value: DEFAULTS.noblePhantasmMultiplier,
        min: 0,
        step: 0.1,
        suffix: "%",
        className: "fdc-np-only"
      }) +
      "</div>" +
      '<div class="fdc-grid fdc-grid-2 fdc-check-grid">' +
      checkboxField({
        key: "busterFirstBonus",
        label: "1st Busterボーナス（+0.5）",
        checked: false
      }) +
      checkboxField({
        key: "artsFirstBonus",
        label: "1st Artsボーナス（NP獲得項+1.0）",
        checked: false
      }) +
      checkboxField({
        key: "quickFirstBonus",
        label: "1st Quickボーナス（スター率+20%）",
        checked: false
      }) +
      checkboxField({
        key: "critical",
        label: "クリティカル（×2）",
        checked: false
      }) +
      checkboxField({
        key: "busterChain",
        label: "Busterチェイン（ATK×0.2を加算）",
        checked: false
      }) +
      '<label class="fdc-field fdc-extra-only">' +
      '<span class="fdc-label">Extraボーナス</span>' +
      '<select data-key="extraType">' +
      '<option value="normal" selected>通常／Mighty（×2.0）</option>' +
      '<option value="same">同色Brave Chain（×3.5）</option>' +
      "</select>" +
      "</label>" +
      "</div>" +
      "</section>" +
      '<section class="fdc-section">' +
      '<h3 class="fdc-section-title"><span>3</span>カード・攻防バフ</h3>' +
      '<p class="fdc-section-note">アップ量とダウン量は、それぞれ合計値を入力してください。</p>' +
      '<div class="fdc-grid fdc-grid-2">' +
      numberField({
        key: "cardPerformanceUp",
        label: "カード性能アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "cardPerformanceDown",
        label: "カード性能ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "cardResistanceUp",
        label: "敵カード耐性アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "cardResistanceDown",
        label: "敵カード耐性ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "attackUp",
        label: "攻撃力アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "attackDown",
        label: "攻撃力ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "defenseUp",
        label: "敵防御力アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "defenseDown",
        label: "敵防御力ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      "</div>" +
      '<div class="fdc-check-grid fdc-top-gap">' +
      checkboxField({
        key: "ignoreDefense",
        label: "防御無視（敵の防御力アップを0として計算）",
        checked: false
      }) +
      "</div>" +
      "</section>" +
      '<section class="fdc-section">' +
      '<h3 class="fdc-section-title"><span>4</span>威力・特殊耐性</h3>' +
      '<div class="fdc-grid fdc-grid-2">' +
      numberField({
        key: "powerUp",
        label: "特攻威力アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "powerDown",
        label: "特攻威力ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "targetDamageUp",
        label: "敵の被ダメージアップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "targetDamageDown",
        label: "敵の被ダメージダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "criticalDamageUp",
        label: "クリティカル威力アップ",
        value: 0,
        min: 0,
        suffix: "%",
        className: "fdc-critical-only"
      }) +
      numberField({
        key: "criticalDamageDown",
        label: "クリティカル威力ダウン",
        value: 0,
        min: 0,
        suffix: "%",
        className: "fdc-critical-only"
      }) +
      numberField({
        key: "noblePhantasmDamageUp",
        label: "宝具威力アップ",
        value: 0,
        min: 0,
        suffix: "%",
        className: "fdc-np-only"
      }) +
      numberField({
        key: "noblePhantasmDamageDown",
        label: "宝具威力ダウン",
        value: 0,
        min: 0,
        suffix: "%",
        className: "fdc-np-only"
      }) +
      numberField({
        key: "specialResistanceUp",
        label: "敵の特殊耐性アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "specialResistanceDown",
        label: "敵の特殊耐性ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      "</div>" +
      '<details class="fdc-details">' +
      "<summary>宝具特攻・特殊威力の詳細設定</summary>" +
      '<div class="fdc-grid fdc-grid-3 fdc-details-body">' +
      numberField({
        key: "noblePhantasmSpecialMultiplier",
        label: "宝具特攻倍率",
        value: 100,
        min: 0,
        suffix: "%",
        note: "例：150なら×1.5",
        className: "fdc-np-only"
      }) +
      numberField({
        key: "stateSpecialMultiplier",
        label: "状態特攻倍率",
        value: 100,
        min: 0,
        suffix: "%",
        note: "対象状態がある場合",
        className: "fdc-np-only"
      }) +
      numberField({
        key: "specialPowerMultiplier",
        label: "特殊威力倍率",
        value: 100,
        min: 0.1,
        max: 1000,
        step: 0.1,
        suffix: "%",
        note: "通常は100のまま"
      }) +
      "</div>" +
      "</details>" +
      "</section>" +
      '<section class="fdc-section">' +
      '<h3 class="fdc-section-title"><span>5</span>固定ダメージ</h3>' +
      '<div class="fdc-grid fdc-grid-3">' +
      numberField({
        key: "flatDamage",
        label: "与ダメージ加算",
        value: 0,
        step: 1,
        note: "マイナス入力可"
      }) +
      numberField({
        key: "targetFlatDamage",
        label: "敵の被ダメージ加算",
        value: 0,
        step: 1,
        note: "マイナス入力可"
      }) +
      numberField({
        key: "damageCut",
        label: "敵のダメージカット",
        value: 0,
        min: 0,
        step: 1
      }) +
      "</div>" +
      "</section>" +
      '<section class="fdc-section">' +
      '<h3 class="fdc-section-title"><span>6</span>NPリチャージ・スター</h3>' +
      '<p class="fdc-section-note">ダメージは全Hit合計のまま、NPとスターだけHit数を使って計算します。</p>' +
      '<div class="fdc-grid fdc-grid-3">' +
      numberField({
        key: "targetCount",
        label: "攻撃対象数",
        value: 1,
        min: 1,
        max: 6,
        step: 1,
        note: "同じ条件の敵へ攻撃する数"
      }) +
      numberField({
        key: "hitCount",
        label: "攻撃Hit数",
        value: 1,
        min: 1,
        step: 1
      }) +
      numberField({
        key: "overkillHitCount",
        label: "オーバーキルHit数",
        value: 0,
        min: 0,
        step: 1,
        note: "撃破判定が出たHit以降の数"
      }) +
      numberField({
        key: "attackBaseNp",
        label: "N/A",
        value: 0.8,
        min: 0,
        step: 0.01,
        note: "例：0.80"
      }) +
      numberField({
        key: "starRate",
        label: "SR（スター発生率）",
        value: 10,
        step: 0.1,
        suffix: "%"
      }) +
      "</div>" +
      '<div class="fdc-auto-summary">' +
      '<span>敵DTDR <strong data-role="dtdr">×1.000</strong></span>' +
      '<span>敵DSR <strong data-role="dsr">0.0%</strong></span>' +
      "</div>" +
      '<details class="fdc-details">' +
      "<summary>DTDR・DSRを手動指定</summary>" +
      '<div class="fdc-grid fdc-grid-2 fdc-details-body">' +
      '<div class="fdc-inline-setting">' +
      checkboxField({
        key: "manualDtdr",
        label: "DTDRを手動指定",
        checked: false
      }) +
      numberField({
        key: "dtdrPercent",
        label: "DTDR",
        value: 100,
        min: 0,
        step: 0.1,
        suffix: "%"
      }) +
      "</div>" +
      '<div class="fdc-inline-setting">' +
      checkboxField({
        key: "manualDsr",
        label: "DSRを手動指定",
        checked: false
      }) +
      numberField({
        key: "dsrPercent",
        label: "DSR",
        value: 0,
        step: 0.1,
        suffix: "%"
      }) +
      "</div>" +
      "</div>" +
      "</details>" +
      '<div class="fdc-grid fdc-grid-2 fdc-top-gap">' +
      numberField({
        key: "npGainUp",
        label: "NP獲得量アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "npGainDown",
        label: "NP獲得量ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "starGenerationUp",
        label: "スター発生率アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "starGenerationDown",
        label: "スター発生率ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "enemyStarGenerationUp",
        label: "敵のスター発生耐性アップ",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      numberField({
        key: "enemyStarGenerationDown",
        label: "敵のスター発生耐性ダウン",
        value: 0,
        min: 0,
        suffix: "%"
      }) +
      "</div>" +
      "</section>" +
      "</form>" +
      '<aside class="fdc-result-panel">' +
      '<div class="fdc-result-sticky">' +
      '<div class="fdc-result-heading">' +
      "<h3>計算結果</h3>" +
      '<button type="button" class="fdc-button fdc-button-primary" data-action="copy">結果をコピー</button>' +
      "</div>" +
      '<div class="fdc-reference-result">' +
      "<span>基準ダメージ（乱数×1.000）</span>" +
      '<strong data-role="reference-damage">0</strong>' +
      "</div>" +
      '<div class="fdc-result-cards">' +
      '<div><span>最小</span><strong data-role="minimum-damage">0</strong><small>乱数×0.900</small></div>' +
      '<div><span>平均</span><strong data-role="average-damage">0</strong><small>200通り平均</small></div>' +
      '<div><span>最大</span><strong data-role="maximum-damage">0</strong><small>乱数×1.099</small></div>' +
      "</div>" +
      '<div class="fdc-range">' +
      "<span>乱数範囲</span>" +
      '<strong data-role="damage-range">0 ～ 0</strong>' +
      "</div>" +
      '<div class="fdc-resource-results">' +
      '<div class="fdc-resource-card">' +
      "<span>NPリチャージ量</span>" +
      '<strong data-role="np-recharge">0.00%</strong>' +
      '<small data-role="np-per-hit">1Hit：0.00%</small>' +
      "</div>" +
      '<div class="fdc-resource-card">' +
      "<span>スター獲得期待値</span>" +
      '<strong data-role="expected-stars">0.00個</strong>' +
      '<small data-role="star-range">獲得量：0～0個</small>' +
      "</div>" +
      "</div>" +
      '<table class="fdc-breakdown">' +
      "<tbody>" +
      '<tr><th>攻撃倍率</th><td data-role="attack-multiplier">×1.000</td></tr>' +
      '<tr><th>カード項</th><td data-role="card-factor">×1.000</td></tr>' +
      '<tr><th>クラス補正</th><td data-role="result-class-correction">×1.000</td></tr>' +
      '<tr><th>クラス相性</th><td data-role="result-class-affinity">×1.000</td></tr>' +
      '<tr><th>天地人相性</th><td data-role="attribute-affinity">×1.000</td></tr>' +
      '<tr><th>攻防バフ項</th><td data-role="attack-defense-factor">×1.000</td></tr>' +
      '<tr><th>威力バフ項</th><td data-role="power-factor">×1.000</td></tr>' +
      '<tr><th>固定加算</th><td data-role="fixed-damage">0</td></tr>' +
      '<tr><th>通常Hitスター率</th><td data-role="normal-star-rate">0.0%</td></tr>' +
      '<tr><th>Overkillスター率</th><td data-role="overkill-star-rate">0.0%</td></tr>' +
      "</tbody>" +
      "</table>" +
      '<ul class="fdc-notices" data-role="notices"></ul>' +
      '<p class="fdc-copy-state" data-role="copy-state" aria-live="polite"></p>' +
      "</div>" +
      "</aside>" +
      "</div>" +
      '<footer class="fdc-footer">参照式：Fate/Grand Order @wiki「サーヴァント/隠しステータス」各種計算式</footer>' +
      "</div>"
    );
  }

  function injectStyles() {
    if (document.getElementById("fgo-damage-calculator-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "fgo-damage-calculator-style";
    style.textContent =
      "#fgo-damage-calculator-panel{margin:18px 0;border:1px solid #9fb4c8;border-radius:10px;background:#eef4fa;box-shadow:0 3px 12px rgba(27,57,91,.09);overflow:hidden}" +
      "#fgo-damage-calculator-panel>summary{padding:13px 16px;color:#214a70;font-weight:700;cursor:pointer;background:linear-gradient(180deg,#f7fbff,#e5eef7)}" +
      "#fgo-damage-calculator-panel[open]>summary{border-bottom:1px solid #b8c9d9}" +
      "#fgo-damage-calculator-panel>#fgo-damage-calculator{margin:14px}" +
      "#fgo-damage-calculator{--fdc-ink:#172335;--fdc-muted:#5c6b7d;--fdc-line:#cbd7e5;--fdc-soft:#eef4fa;--fdc-panel:#fff;--fdc-blue:#245f9e;--fdc-blue-dark:#174774;--fdc-gold:#b9862e;max-width:1180px;margin:18px auto;color:var(--fdc-ink);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans JP',Meiryo,sans-serif;line-height:1.55}" +
      "#fgo-damage-calculator *{box-sizing:border-box}" +
      "#fgo-damage-calculator .fdc-shell{background:linear-gradient(180deg,#f8fbfe 0,#edf3f9 100%);border:1px solid #adc1d5;border-radius:14px;box-shadow:0 8px 28px rgba(27,57,91,.12);overflow:hidden}" +
      "#fgo-damage-calculator .fdc-header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:20px 22px 18px;color:#fff;background:linear-gradient(125deg,#163f69 0,#286aa8 72%,#b9862e 160%)}" +
      "#fgo-damage-calculator .fdc-kicker{margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;opacity:.78}" +
      "#fgo-damage-calculator .fdc-title{margin:0;font-size:25px;line-height:1.3;color:#fff;border:0;padding:0}" +
      "#fgo-damage-calculator .fdc-lead{margin:6px 0 0;font-size:13px;opacity:.9}" +
      "#fgo-damage-calculator .fdc-version{flex:0 0 auto;margin-top:3px;padding:4px 9px;border:1px solid rgba(255,255,255,.35);border-radius:999px;font-size:11px;background:rgba(255,255,255,.1)}" +
      "#fgo-damage-calculator .fdc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:9px 12px;padding:10px 16px;background:#e2ebf4;border-bottom:1px solid var(--fdc-line)}" +
      "#fgo-damage-calculator .fdc-button{appearance:none;border:1px solid transparent;border-radius:7px;padding:8px 13px;font:inherit;font-size:13px;font-weight:700;line-height:1.2;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}" +
      "#fgo-damage-calculator .fdc-button:active{transform:translateY(1px)}" +
      "#fgo-damage-calculator .fdc-button:disabled{opacity:.5;cursor:not-allowed;transform:none}" +
      "#fgo-damage-calculator .fdc-button:focus-visible,#fgo-damage-calculator input:focus-visible,#fgo-damage-calculator select:focus-visible,#fgo-damage-calculator summary:focus-visible{outline:3px solid rgba(54,128,200,.3);outline-offset:1px}" +
      "#fgo-damage-calculator .fdc-button-secondary{border-color:#9db1c5;background:#fff;color:#334b64}" +
      "#fgo-damage-calculator .fdc-button-secondary:hover{background:#f5f9fd}" +
      "#fgo-damage-calculator .fdc-button-primary{background:var(--fdc-blue);color:#fff;border-color:var(--fdc-blue-dark)}" +
      "#fgo-damage-calculator .fdc-button-primary:hover{background:var(--fdc-blue-dark)}" +
      "#fgo-damage-calculator .fdc-page-state{flex:1 1 300px;color:#315873;font-size:12px;font-weight:600}" +
      "#fgo-damage-calculator .fdc-save-state{font-size:12px;color:var(--fdc-muted)}" +
      "#fgo-damage-calculator .fdc-main-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.72fr);gap:16px;padding:16px}" +
      "#fgo-damage-calculator .fdc-form{min-width:0}" +
      "#fgo-damage-calculator .fdc-section{margin:0 0 14px;padding:15px;background:var(--fdc-panel);border:1px solid var(--fdc-line);border-radius:10px;box-shadow:0 2px 8px rgba(31,62,93,.045)}" +
      "#fgo-damage-calculator .fdc-section:last-child{margin-bottom:0}" +
      "#fgo-damage-calculator .fdc-section-title{display:flex;align-items:center;gap:8px;margin:0 0 13px;padding:0;border:0;color:#25435f;font-size:16px}" +
      "#fgo-damage-calculator .fdc-section-title span{display:inline-grid;place-items:center;width:25px;height:25px;border-radius:50%;background:#dbe9f6;color:var(--fdc-blue);font-size:12px}" +
      "#fgo-damage-calculator .fdc-section-note{margin:-7px 0 12px;color:var(--fdc-muted);font-size:12px}" +
      "#fgo-damage-calculator .fdc-grid{display:grid;gap:11px 13px}" +
      "#fgo-damage-calculator .fdc-grid-2{grid-template-columns:repeat(2,minmax(0,1fr))}" +
      "#fgo-damage-calculator .fdc-grid-3{grid-template-columns:repeat(3,minmax(0,1fr))}" +
      "#fgo-damage-calculator .fdc-field{display:flex;min-width:0;flex-direction:column;gap:4px;margin:0}" +
      "#fgo-damage-calculator .fdc-label{font-size:12px;font-weight:700;color:#334b64}" +
      "#fgo-damage-calculator .fdc-field input,#fgo-damage-calculator .fdc-field select{width:100%;min-width:0;height:38px;margin:0;padding:7px 9px;color:var(--fdc-ink);font:inherit;font-size:14px;background:#fff;border:1px solid #aebdcb;border-radius:6px}" +
      "#fgo-damage-calculator .fdc-field input:disabled,#fgo-damage-calculator .fdc-field select:disabled{color:#7c8794;background:#edf1f4;border-color:#d5dce3;cursor:not-allowed}" +
      "#fgo-damage-calculator .fdc-input-line{display:flex;align-items:center;gap:6px}" +
      "#fgo-damage-calculator .fdc-suffix{flex:0 0 auto;color:var(--fdc-muted);font-size:13px}" +
      "#fgo-damage-calculator .fdc-field-note{min-height:1em;color:#748293;font-size:10px;line-height:1.35}" +
      "#fgo-damage-calculator .fdc-check{display:flex;align-items:flex-start;gap:8px;margin:0;padding:8px 9px;border:1px solid #d2dce6;border-radius:7px;background:#f8fafc;color:#344d65;font-size:12px;font-weight:600;cursor:pointer}" +
      "#fgo-damage-calculator .fdc-check input{width:16px;height:16px;margin:1px 0 0;accent-color:var(--fdc-blue)}" +
      "#fgo-damage-calculator .fdc-check:has(input:disabled){opacity:.52;cursor:not-allowed}" +
      "#fgo-damage-calculator .fdc-check-grid{align-items:start}" +
      "#fgo-damage-calculator .fdc-auto-summary{display:flex;flex-wrap:wrap;gap:8px 18px;margin-top:11px;padding:9px 11px;border-radius:7px;background:var(--fdc-soft);color:#3b536a;font-size:12px}" +
      "#fgo-damage-calculator .fdc-auto-summary strong{color:var(--fdc-blue)}" +
      "#fgo-damage-calculator .fdc-details{margin-top:11px;border:1px solid #d1dce7;border-radius:8px;background:#fafcfe}" +
      "#fgo-damage-calculator .fdc-details summary{padding:9px 11px;color:#385671;font-size:12px;font-weight:700;cursor:pointer}" +
      "#fgo-damage-calculator .fdc-details-body{padding:2px 11px 11px}" +
      "#fgo-damage-calculator .fdc-inline-setting{display:grid;gap:7px}" +
      "#fgo-damage-calculator .fdc-top-gap{margin-top:11px}" +
      "#fgo-damage-calculator .fdc-result-panel{min-width:0}" +
      "#fgo-damage-calculator .fdc-result-sticky{position:sticky;top:12px;padding:15px;background:#fff;border:1px solid #9fb4c8;border-radius:10px;box-shadow:0 5px 18px rgba(24,52,82,.1)}" +
      "#fgo-damage-calculator .fdc-result-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}" +
      "#fgo-damage-calculator .fdc-result-heading h3{margin:0;padding:0;border:0;color:#24425f;font-size:17px}" +
      "#fgo-damage-calculator .fdc-reference-result{padding:14px;border-radius:9px;background:linear-gradient(135deg,#174a79,#2875b6);color:#fff;text-align:center}" +
      "#fgo-damage-calculator .fdc-reference-result span{display:block;margin-bottom:2px;font-size:11px;opacity:.85}" +
      "#fgo-damage-calculator .fdc-reference-result strong{display:block;font-size:31px;line-height:1.25;letter-spacing:.02em}" +
      "#fgo-damage-calculator .fdc-result-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}" +
      "#fgo-damage-calculator .fdc-result-cards div{padding:8px 4px;border:1px solid #d0dbe5;border-radius:7px;background:#f8fafc;text-align:center}" +
      "#fgo-damage-calculator .fdc-result-cards span,#fgo-damage-calculator .fdc-result-cards small{display:block;color:#6b7886;font-size:9px}" +
      "#fgo-damage-calculator .fdc-result-cards strong{display:block;margin:1px 0;color:#1d3e5c;font-size:16px}" +
      "#fgo-damage-calculator .fdc-range{display:flex;justify-content:space-between;gap:10px;margin:10px 0;padding:8px 10px;border-radius:7px;background:#fff6e6;color:#6b4b18;font-size:12px}" +
      "#fgo-damage-calculator .fdc-range strong{text-align:right}" +
      "#fgo-damage-calculator .fdc-resource-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:0 0 10px}" +
      "#fgo-damage-calculator .fdc-resource-card{padding:10px 7px;border:1px solid #bfd0df;border-radius:8px;background:linear-gradient(180deg,#f7fbff,#edf5fb);text-align:center}" +
      "#fgo-damage-calculator .fdc-resource-card span,#fgo-damage-calculator .fdc-resource-card small{display:block;color:#657687;font-size:9px}" +
      "#fgo-damage-calculator .fdc-resource-card strong{display:block;margin:2px 0;color:#1c5b8e;font-size:18px}" +
      "#fgo-damage-calculator .fdc-breakdown{width:100%;margin:0;border-collapse:collapse;font-size:11px}" +
      "#fgo-damage-calculator .fdc-breakdown th,#fgo-damage-calculator .fdc-breakdown td{padding:6px 5px;border-bottom:1px solid #e0e6ec}" +
      "#fgo-damage-calculator .fdc-breakdown th{width:55%;color:#5f6f7e;font-weight:500;text-align:left}" +
      "#fgo-damage-calculator .fdc-breakdown td{color:#254966;font-weight:700;text-align:right}" +
      "#fgo-damage-calculator .fdc-notices{margin:11px 0 0;padding-left:18px;color:#667482;font-size:10px}" +
      "#fgo-damage-calculator .fdc-notices li{margin:3px 0}" +
      "#fgo-damage-calculator .fdc-copy-state{min-height:1.4em;margin:8px 0 0;color:#237048;font-size:11px;text-align:center}" +
      "#fgo-damage-calculator .fdc-footer{padding:10px 16px;border-top:1px solid var(--fdc-line);background:#dfe8f1;color:#667687;font-size:10px;text-align:center}" +
      "#fgo-damage-calculator [hidden]{display:none!important}" +
      "@media(max-width:860px){#fgo-damage-calculator .fdc-main-grid{grid-template-columns:1fr}#fgo-damage-calculator .fdc-result-panel{grid-row:1}#fgo-damage-calculator .fdc-result-sticky{position:static}}" +
      "@media(max-width:620px){#fgo-damage-calculator-panel>#fgo-damage-calculator{margin:8px}#fgo-damage-calculator{margin:10px auto}#fgo-damage-calculator .fdc-shell{border-radius:9px}#fgo-damage-calculator .fdc-header{padding:16px}#fgo-damage-calculator .fdc-title{font-size:21px}#fgo-damage-calculator .fdc-main-grid{padding:10px;gap:10px}#fgo-damage-calculator .fdc-section{padding:12px}#fgo-damage-calculator .fdc-grid-2,#fgo-damage-calculator .fdc-grid-3{grid-template-columns:1fr}#fgo-damage-calculator .fdc-result-cards strong{font-size:14px}#fgo-damage-calculator .fdc-reference-result strong{font-size:27px}#fgo-damage-calculator .fdc-resource-results{grid-template-columns:1fr 1fr}#fgo-damage-calculator .fdc-toolbar{align-items:stretch;flex-direction:column}#fgo-damage-calculator .fdc-page-state{flex-basis:auto}}" +
      "@media(prefers-reduced-motion:reduce){#fgo-damage-calculator .fdc-button{transition:none}}";
    document.head.appendChild(style);
  }

  function setHidden(root, selector, hidden) {
    root.querySelectorAll(selector).forEach(function (element) {
      element.hidden = hidden;
    });
  }

  function setDisabled(root, key, disabled) {
    const element = root.querySelector('[data-key="' + key + '"]');
    if (element) {
      element.disabled = disabled;
    }
  }

  function readForm(root) {
    const data = {};
    root.querySelectorAll("[data-key]").forEach(function (element) {
      const key = element.getAttribute("data-key");
      if (element.type === "checkbox") {
        data[key] = element.checked;
      } else if (element.type === "number") {
        data[key] = toFiniteNumber(element.value, DEFAULTS[key] || 0);
      } else {
        data[key] = element.value;
      }
    });
    return data;
  }

  function applyStoredState(root, stored) {
    if (!stored || typeof stored !== "object") {
      return;
    }

    root.querySelectorAll("[data-key]").forEach(function (element) {
      const key = element.getAttribute("data-key");
      if (!Object.prototype.hasOwnProperty.call(stored, key)) {
        return;
      }

      if (element.type === "checkbox") {
        element.checked = Boolean(stored[key]);
        return;
      }

      if (element.tagName === "SELECT") {
        const value = String(stored[key]);
        const valid = Array.from(element.options).some(function (option) {
          return option.value === value;
        });
        if (valid) {
          element.value = value;
        }
        return;
      }

      if (element.type === "number" && Number.isFinite(Number(stored[key]))) {
        element.value = String(stored[key]);
      }
    });
  }

  function pageAttackState(pageData, currentState, options) {
    if (!pageData) {
      return {};
    }

    const settings = options || {};
    const state = currentState || DEFAULTS;
    const pageState = {};
    const attackType = state.attackType === "np" ? "np" : "normal";
    let cardType = CARD_DATA[state.cardType] ? state.cardType : "buster";

    if (
      attackType === "np" &&
      settings.forceNoblePhantasmCard &&
      pageData.noblePhantasmCardType
    ) {
      cardType = pageData.noblePhantasmCardType;
      pageState.cardType = cardType;
    }

    const hitKey = attackType === "np" ? "np" : cardType;
    if (
      pageData.hitCounts &&
      isUsableNumber(pageData.hitCounts[hitKey])
    ) {
      pageState.hitCount = Number(pageData.hitCounts[hitKey]);
    }

    if (
      attackType === "np" &&
      isUsableNumber(pageData.noblePhantasmMultiplier)
    ) {
      pageState.noblePhantasmMultiplier = Number(
        pageData.noblePhantasmMultiplier
      );
    }

    return pageState;
  }

  function pageDataToState(pageData, currentState, options) {
    if (!pageData) {
      return {};
    }

    const pageState = pageAttackState(pageData, currentState, options);
    if (isUsableNumber(pageData.attack)) {
      pageState.attack = Number(pageData.attack);
    }
    if (pageData.attackerClass && CLASS_DATA[pageData.attackerClass]) {
      pageState.attackerClass = pageData.attackerClass;
    }
    if (isUsableNumber(pageData.attackBaseNp)) {
      pageState.attackBaseNp = Number(pageData.attackBaseNp);
    }
    if (isUsableNumber(pageData.starRate)) {
      pageState.starRate = Number(pageData.starRate);
    }
    if (isUsableNumber(pageData.noblePhantasmMultiplier)) {
      pageState.noblePhantasmMultiplier = Number(
        pageData.noblePhantasmMultiplier
      );
    }

    return pageState;
  }

  function pageDataSummary(pageData) {
    if (!pageData) {
      return "ページ情報：未検出（各項目を手動入力できます）";
    }

    const parts = [pageData.servantName || "サーヴァント"];
    if (
      isUsableNumber(pageData.attack) &&
      isUsableNumber(pageData.naturalLevel)
    ) {
      parts.push(
        "Lv." +
          pageData.naturalLevel +
          " ATK " +
          formatInteger(pageData.attack)
      );
    }
    if (isUsableNumber(pageData.attackBaseNp)) {
      parts.push("N/A " + pageData.attackBaseNp);
    }
    if (isUsableNumber(pageData.starRate)) {
      parts.push("SR " + pageData.starRate + "%");
    }
    return "ページ情報：" + parts.join(" / ");
  }

  function storageKey() {
    if (typeof location === "undefined") {
      return "fgo-damage-calculator:" + VERSION;
    }
    return (
      "fgo-damage-calculator:" +
      location.origin +
      location.pathname +
      ":v2"
    );
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storageKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function saveState(state) {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearState() {
    try {
      localStorage.removeItem(storageKey());
    } catch (_) {
      // 保存不可の環境では何もしない。
    }
  }

  function syncAvailability(root) {
    const state = readForm(root);
    const isNoblePhantasm = state.attackType === "np";

    if (isNoblePhantasm && state.cardType === "extra") {
      const card = root.querySelector('[data-key="cardType"]');
      if (card) {
        card.value = "buster";
        state.cardType = "buster";
      }
    }

    const isExtra = !isNoblePhantasm && state.cardType === "extra";
    const position = Number(state.cardPosition);
    const isFirstNormalCard =
      !isNoblePhantasm && !isExtra && position === 1;

    if (isFirstNormalCard) {
      const firstBonusMap = {
        busterFirstBonus: state.cardType === "buster",
        artsFirstBonus: state.cardType === "arts",
        quickFirstBonus: state.cardType === "quick"
      };
      Object.keys(firstBonusMap).forEach(function (key) {
        const checkbox = root.querySelector('[data-key="' + key + '"]');
        if (checkbox) {
          checkbox.checked = firstBonusMap[key];
        }
      });
    }

    setHidden(root, ".fdc-np-only", !isNoblePhantasm);
    setHidden(root, ".fdc-extra-only", !isExtra);
    setHidden(
      root,
      ".fdc-critical-only",
      isNoblePhantasm || isExtra || !state.critical
    );
    setDisabled(root, "cardPosition", isNoblePhantasm || isExtra);
    setDisabled(root, "noblePhantasmMultiplier", !isNoblePhantasm);
    setDisabled(
      root,
      "busterFirstBonus",
      isNoblePhantasm || isFirstNormalCard
    );
    setDisabled(root, "artsFirstBonus", isNoblePhantasm || isFirstNormalCard);
    setDisabled(root, "quickFirstBonus", isNoblePhantasm || isFirstNormalCard);
    setDisabled(root, "critical", isNoblePhantasm || isExtra);
    setDisabled(root, "extraType", !isExtra);
    setDisabled(root, "busterChain", isNoblePhantasm || isExtra);
    setDisabled(root, "criticalDamageUp", isNoblePhantasm || isExtra || !state.critical);
    setDisabled(
      root,
      "criticalDamageDown",
      isNoblePhantasm || isExtra || !state.critical
    );
    setDisabled(root, "noblePhantasmDamageUp", !isNoblePhantasm);
    setDisabled(root, "noblePhantasmDamageDown", !isNoblePhantasm);
    setDisabled(root, "noblePhantasmSpecialMultiplier", !isNoblePhantasm);
    setDisabled(root, "stateSpecialMultiplier", !isNoblePhantasm);
    setDisabled(root, "classCorrectionPercent", !state.manualClassCorrection);
    setDisabled(root, "classAffinityPercent", !state.manualClassAffinity);
    setDisabled(root, "dtdrPercent", !state.manualDtdr);
    setDisabled(root, "dsrPercent", !state.manualDsr);

    const hitCount = Math.max(1, Math.round(Number(state.hitCount) || 1));
    const overkillInput = root.querySelector('[data-key="overkillHitCount"]');
    if (overkillInput) {
      overkillInput.max = String(hitCount);
      if (Number(overkillInput.value) > hitCount) {
        overkillInput.value = String(hitCount);
      }
    }
  }

  function setText(root, role, text) {
    const element = root.querySelector('[data-role="' + role + '"]');
    if (element) {
      element.textContent = text;
    }
  }

  function renderResult(root, result) {
    const factors = result.factors;
    setText(root, "reference-damage", formatInteger(result.referenceDamage));
    setText(root, "minimum-damage", formatInteger(result.minimumDamage));
    setText(root, "average-damage", formatInteger(result.averageDamage));
    setText(root, "maximum-damage", formatInteger(result.maximumDamage));
    setText(
      root,
      "damage-range",
      formatInteger(result.minimumDamage) +
        " ～ " +
        formatInteger(result.maximumDamage)
    );
    setText(root, "np-recharge", formatDecimal(result.npRecharge, 2) + "%");
    setText(
      root,
      "np-per-hit",
      "1対象：" +
        formatDecimal(result.npRechargePerTarget, 2) +
        "% / 1Hit：" +
        formatDecimal(result.npPerHit, 2) +
        "%"
    );
    setText(
      root,
      "expected-stars",
      formatDecimal(result.expectedStars, 2) + "個"
    );
    setText(
      root,
      "star-range",
      "獲得量：" +
        formatInteger(result.minimumStars) +
        "～" +
        formatInteger(result.maximumStars) +
        "個"
    );
    setText(
      root,
      "class-correction",
      "×" + formatDecimal(factors.classCorrection, 3)
    );
    setText(
      root,
      "class-affinity",
      "×" + formatDecimal(factors.classAffinity, 3)
    );
    setText(root, "dtdr", "×" + formatDecimal(factors.dtdr, 3));
    setText(root, "dsr", formatDecimal(factors.dsr * 100, 1) + "%");
    setText(
      root,
      "attack-multiplier",
      "×" + formatDecimal(factors.attackMultiplier, 3)
    );
    setText(
      root,
      "card-factor",
      "×" + formatDecimal(factors.cardFactor, 3)
    );
    setText(
      root,
      "result-class-correction",
      "×" + formatDecimal(factors.classCorrection, 3)
    );
    setText(
      root,
      "result-class-affinity",
      "×" + formatDecimal(factors.classAffinity, 3)
    );
    setText(
      root,
      "attribute-affinity",
      "×" + formatDecimal(factors.attributeAffinity, 3)
    );
    setText(
      root,
      "attack-defense-factor",
      "×" + formatDecimal(factors.attackDefenseFactor, 3)
    );
    setText(
      root,
      "power-factor",
      "×" + formatDecimal(factors.powerFactor, 3)
    );
    setText(root, "fixed-damage", formatInteger(factors.fixedDamage));
    setText(
      root,
      "normal-star-rate",
      formatDecimal(result.normalStarRate * 100, 1) + "%"
    );
    setText(
      root,
      "overkill-star-rate",
      formatDecimal(result.overkillStarRate * 100, 1) + "%"
    );

    const notices = root.querySelector('[data-role="notices"]');
    if (notices) {
      notices.innerHTML = result.notices
        .map(function (notice) {
          return "<li>" + escapeHtml(notice) + "</li>";
        })
        .join("");
    }

    root.__fdcLastResult = result;
  }

  function copyText(text) {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const succeeded = document.execCommand("copy");
        textarea.remove();
        if (succeeded) {
          resolve();
        } else {
          reject(new Error("copy failed"));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  function resultText(result) {
    const input = result.input;
    const attackName = input.attackType === "np" ? "宝具" : "通常攻撃";
    const cardName = CARD_DATA[input.cardType]
      ? CARD_DATA[input.cardType].label
      : input.cardType;

    return [
      "FGO ダメージ計算結果",
      "攻撃種別：" + attackName + " / " + cardName,
      "ATK：" + formatInteger(input.attack),
      "クラス：" +
        classLabel(input.attackerClass) +
        " → " +
        classLabel(input.defenderClass),
      "攻撃対象数：" + formatInteger(input.targetCount),
      "最小：" + formatInteger(result.minimumDamage),
      "平均：" + formatInteger(result.averageDamage),
      "基準：" + formatInteger(result.referenceDamage) + "（乱数×1.000）",
      "最大：" + formatInteger(result.maximumDamage),
      "乱数範囲：×0.900～×1.099（200通り）",
      "NPリチャージ量：" + formatDecimal(result.npRecharge, 2) + "%",
      "スター獲得期待値：" +
        formatDecimal(result.expectedStars, 2) +
        "個（" +
        formatInteger(result.minimumStars) +
        "～" +
        formatInteger(result.maximumStars) +
        "個）"
    ].join("\n");
  }

  function findAutoInsertionAnchor(sourceDocument) {
    const headings = Array.from(
      sourceDocument.querySelectorAll("h1,h2,h3,h4,h5,h6")
    );
    const preferredHeadings = ["保有スキル", "性能", "プロフィール"];

    for (
      let preferredIndex = 0;
      preferredIndex < preferredHeadings.length;
      preferredIndex += 1
    ) {
      const preferred = preferredHeadings[preferredIndex];
      const heading = headings.find(function (candidate) {
        const text = compactText(candidate.textContent);
        return text === preferred || text.indexOf(preferred) === 0;
      });
      if (heading) {
        return heading;
      }
    }

    return null;
  }

  function createAutoPanel(sourceDocument, pageData) {
    const anchor = findAutoInsertionAnchor(sourceDocument);
    if (!anchor || !anchor.parentNode) {
      return null;
    }

    const panel = sourceDocument.createElement("details");
    panel.id = "fgo-damage-calculator-panel";

    const summary = sourceDocument.createElement("summary");
    summary.textContent =
      (pageData.servantName || "サーヴァント") +
      "：ダメージ・NP・スター計算機（ページ情報を自動入力）";

    const root = sourceDocument.createElement("div");
    root.id = "fgo-damage-calculator";

    panel.appendChild(summary);
    panel.appendChild(root);
    anchor.parentNode.insertBefore(panel, anchor);
    return root;
  }

  function mount(targetId, options) {
    if (typeof document === "undefined") {
      return null;
    }

    const settings = options || {};
    const root = document.getElementById(targetId || "fgo-damage-calculator");
    if (!root || root.getAttribute("data-fdc-mounted") === "true") {
      return root || null;
    }

    const pageData = Object.prototype.hasOwnProperty.call(settings, "pageData")
      ? settings.pageData
      : extractServantPageData(document);

    injectStyles();
    root.setAttribute("data-fdc-mounted", "true");
    root.innerHTML = createMarkup();
    root.__fdcPageData = pageData;

    const form = root.querySelector(".fdc-form");
    applyStoredState(
      root,
      pageDataToState(pageData, DEFAULTS, {
        forceNoblePhantasmCard: false
      })
    );
    applyStoredState(root, loadState());
    setText(root, "page-state", pageDataSummary(pageData));

    const autofillButton = root.querySelector('[data-action="autofill"]');
    if (autofillButton) {
      autofillButton.disabled = !pageData;
      autofillButton.title = pageData
        ? "ATK・クラス・N/A・SR・Hit数・宝具情報をページ表から再取得します"
        : "このページではサーヴァント情報を検出できませんでした";
    }
    syncAvailability(root);

    let saveTimer = 0;
    function update(options) {
      const settings = options || {};
      syncAvailability(root);
      const state = readForm(root);
      const result = calculateDamage(state);
      renderResult(root, result);

      if (settings.save !== false) {
        if (saveTimer) {
          clearTimeout(saveTimer);
        }
        saveTimer = setTimeout(function () {
          const saved = saveState(readForm(root));
          setText(
            root,
            "save-state",
            saved
              ? "入力は自動保存されます"
              : "この環境では入力を保存できません"
          );
        }, 120);
      }
    }

    form.addEventListener("input", function () {
      update();
    });
    form.addEventListener("change", function (event) {
      const changedKey =
        event.target && event.target.getAttribute
          ? event.target.getAttribute("data-key")
          : "";
      if (
        pageData &&
        (changedKey === "attackType" || changedKey === "cardType")
      ) {
        applyStoredState(
          root,
          pageAttackState(pageData, readForm(root), {
            forceNoblePhantasmCard: changedKey === "attackType"
          })
        );
      }
      update();
    });

    const resetButton = root.querySelector('[data-action="reset"]');
    resetButton.addEventListener("click", function () {
      clearState();
      form.reset();
      applyStoredState(
        root,
        pageDataToState(pageData, DEFAULTS, {
          forceNoblePhantasmCard: false
        })
      );
      syncAvailability(root);
      update({ save: false });
      setText(
        root,
        "save-state",
        pageData
          ? "ページの基本情報へ戻しました"
          : "入力を初期化しました"
      );
      setTimeout(function () {
        setText(root, "save-state", "入力は自動保存されます");
      }, 1600);
    });

    if (autofillButton && pageData) {
      autofillButton.addEventListener("click", function () {
        applyStoredState(
          root,
          pageDataToState(pageData, readForm(root), {
            forceNoblePhantasmCard: true
          })
        );
        update();
        setText(root, "page-state", pageDataSummary(pageData));
        setText(root, "save-state", "ページ情報を再入力しました");
        setTimeout(function () {
          setText(root, "save-state", "入力は自動保存されます");
        }, 1600);
      });
    }

    const copyButton = root.querySelector('[data-action="copy"]');
    copyButton.addEventListener("click", function () {
      const result = root.__fdcLastResult;
      if (!result) {
        return;
      }

      copyText(resultText(result))
        .then(function () {
          setText(root, "copy-state", "計算結果をコピーしました。");
        })
        .catch(function () {
          setText(
            root,
            "copy-state",
            "コピーできませんでした。ブラウザの権限を確認してください。"
          );
        });

      setTimeout(function () {
        setText(root, "copy-state", "");
      }, 2200);
    });

    update({ save: false });
    return root;
  }

  function autoMount() {
    if (typeof document === "undefined") {
      return null;
    }

    const existingRoot = document.getElementById("fgo-damage-calculator");
    if (existingRoot) {
      return mount("fgo-damage-calculator");
    }

    const pageData = extractServantPageData(document);
    if (!pageData) {
      return null;
    }

    const root = createAutoPanel(document, pageData);
    return root
      ? mount("fgo-damage-calculator", { pageData: pageData })
      : null;
  }

  return {
    version: VERSION,
    defaults: Object.assign({}, DEFAULTS),
    classData: CLASS_DATA,
    cardData: CARD_DATA,
    randomValues: RANDOM_VALUES.slice(),
    getClassCorrection: getClassCorrection,
    getClassAffinity: getClassAffinity,
    getCardCorrection: getCardCorrection,
    getResourceCardCorrection: getResourceCardCorrection,
    getDtdr: getDtdr,
    getDsr: getDsr,
    calculateDamage: calculateDamage,
    tableToGrid: tableToGrid,
    extractServantDataFromGrids: extractServantDataFromGrids,
    extractServantPageData: extractServantPageData,
    mount: mount,
    autoMount: autoMount
  };
});
