"use strict";

const assert = require("node:assert/strict");
const calculator = require("../FGO_DamageCalculator_atwiki.js");

function closeTo(actual, expected, tolerance, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    (message || "values differ") +
      `: expected ${expected}, received ${actual}`
  );
}

assert.equal(calculator.version, "1.1.1");
assert.equal(calculator.randomValues.length, 200);
assert.equal(calculator.randomValues[0], 0.9);
assert.equal(calculator.randomValues[199], 1.099);

assert.equal(calculator.getClassCorrection("archer"), 0.95);
assert.equal(calculator.getClassCorrection("lancer"), 1.05);
assert.equal(calculator.getClassAffinity("saber", "lancer"), 2.0);
assert.equal(calculator.getClassAffinity("saber", "archer"), 0.5);
assert.equal(calculator.getClassAffinity("berserker", "foreigner"), 0.5);
assert.equal(calculator.getClassAffinity("foreigner", "berserker"), 2.0);

const expandedGrid = calculator.tableToGrid({
  rows: [
    {
      cells: [
        { textContent: "ヒット数", rowSpan: 2, colSpan: 1 },
        { textContent: "Q", rowSpan: 1, colSpan: 1 },
        { textContent: "A", rowSpan: 1, colSpan: 1 }
      ]
    },
    {
      cells: [
        { textContent: "3", rowSpan: 1, colSpan: 1 },
        { textContent: "4", rowSpan: 1, colSpan: 1 }
      ]
    }
  ]
});
assert.deepEqual(expandedGrid, [
  ["ヒット数", "Q", "A"],
  ["ヒット数", "3", "4"]
]);

const einganaBasic = [
  ["真名", "エインガナ"],
  ["Class", "キャスター", "Rare", "5"],
  [
    "コマンドカード",
    "コマンドカード",
    "コマンドカード",
    "能力値",
    "Lv.1",
    "Lv.50",
    "Lv.60",
    "Lv.70",
    "Lv.80",
    "Lv.90",
    "Lv.100",
    "Lv.120"
  ],
  [
    "1",
    "2",
    "2",
    "ATK",
    "1578",
    "6231",
    "7252",
    "8172",
    "9193",
    "10215",
    "11182",
    "13125"
  ]
];
const einganaHidden = [
  ["成長", "平均", "中立", "中庸", "-", "スター発生率", "11.3"],
  ["ヒット数", "Q", "A", "B", "EX", "宝具", "スター集中度", "51"],
  ["ヒット数", "3", "3", "3", "6", "3", "DR", "30.0"],
  ["N/A*2", "0.62", "N/D*3", "3.00"]
];
const einganaNoblePhantasm = [
  ["Card", "ランク", "種別", "効果", "1", "2", "3", "4", "5"],
  [
    "Buster",
    "EX",
    "結界宝具",
    "敵全体に強力な攻撃[Lv] Buster(x1.5)",
    "300",
    "400",
    "450",
    "475",
    "500"
  ]
];
const einganaPageData = calculator.extractServantDataFromGrids(
  [einganaBasic, einganaHidden, einganaNoblePhantasm],
  "エインガナ - siroi_human"
);
assert.deepEqual(einganaPageData, {
  servantName: "エインガナ",
  rarity: 5,
  naturalLevel: 90,
  attack: 10215,
  attackerClass: "caster",
  attackBaseNp: 0.62,
  starRate: 11.3,
  hitCounts: {
    quick: 3,
    arts: 3,
    buster: 3,
    extra: 6,
    np: 3
  },
  noblePhantasmCardType: "buster",
  noblePhantasmMultiplier: 300
});

const basicOnlyPageData = calculator.extractServantDataFromGrids(
  [einganaBasic],
  "エインガナ - siroi_human"
);
assert.equal(basicOnlyPageData.servantName, "エインガナ");
assert.equal(basicOnlyPageData.attack, 10215);
assert.equal(basicOnlyPageData.attackerClass, "caster");
assert.equal(basicOnlyPageData.attackBaseNp, null);
assert.equal(basicOnlyPageData.starRate, null);
assert.deepEqual(basicOnlyPageData.hitCounts, {});

const oshichiBasic = [
  ["真名", "八百屋お七"],
  ["Class", "アサシン", "Rare", "3"],
  [
    "コマンドカード",
    "コマンドカード",
    "コマンドカード",
    "能力値",
    "Lv.1",
    "Lv.30",
    "Lv.40",
    "Lv.50",
    "Lv.60",
    "Lv.70",
    "Lv.80",
    "Lv.90",
    "Lv.100",
    "Lv.120"
  ],
  [
    "3",
    "1",
    "1",
    "ATK",
    "1329",
    "3580",
    "4726",
    "5728",
    "6588",
    "7161",
    "8000",
    "8846",
    "9692",
    "11383"
  ]
];
const oshichiHidden = [
  ["成長", "凸型弱", "混沌", "善", "女性", "スター発生率", "25.1"],
  ["ヒット数", "Q", "A", "B", "EX", "宝具", "スター集中度", "97"],
  ["ヒット数", "4", "3", "3", "6", "7", "DR", "42.6"],
  ["N/A*2", "0.71", "N/D*3", "4.00"]
];
const oshichiNoblePhantasmBefore = [
  ["Card", "ランク", "種別", "効果", "1", "2", "3", "4", "5"],
  [
    "Quick",
    "B",
    "対人宝具",
    "敵全体に強力な攻撃[Lv] Quick(x0.8)",
    "600",
    "800",
    "900",
    "950",
    "1000"
  ]
];
const oshichiNoblePhantasmAfter = [
  ["Card", "ランク", "種別", "効果", "1", "2", "3", "4", "5"],
  [
    "Quick",
    "B+",
    "対人宝具",
    "敵全体に強力な攻撃[Lv] Quick(x0.8)",
    "800",
    "1000",
    "1100",
    "1150",
    "1200"
  ]
];
const oshichiPageData = calculator.extractServantDataFromGrids(
  [
    oshichiBasic,
    oshichiHidden,
    oshichiNoblePhantasmBefore,
    oshichiNoblePhantasmAfter
  ],
  "八百屋お七 - siroi_human"
);
assert.equal(oshichiPageData.attack, 7161);
assert.equal(oshichiPageData.attackerClass, "assassin");
assert.equal(oshichiPageData.attackBaseNp, 0.71);
assert.equal(oshichiPageData.starRate, 25.1);
assert.equal(oshichiPageData.hitCounts.quick, 4);
assert.equal(oshichiPageData.hitCounts.np, 7);
assert.equal(oshichiPageData.noblePhantasmCardType, "quick");
assert.equal(oshichiPageData.noblePhantasmMultiplier, 800);

const firstBuster = calculator.calculateDamage({
  attackType: "normal",
  attack: 10000,
  attackerClass: "saber",
  defenderClass: "saber",
  cardType: "buster",
  cardPosition: 1,
  busterFirstBonus: true,
  starRate: 0
});
assert.equal(firstBuster.minimumDamage, 4140);
assert.equal(firstBuster.referenceDamage, 4600);
assert.equal(firstBuster.maximumDamage, 5055);

const busterChain = calculator.calculateDamage({
  attackType: "normal",
  attack: 10000,
  cardType: "buster",
  cardPosition: 1,
  busterFirstBonus: true,
  busterChain: true,
  starRate: 0
});
assert.equal(
  busterChain.referenceDamage - firstBuster.referenceDamage,
  2000,
  "Buster Chain must add ATK × 0.2 after multiplicative damage"
);

const noblePhantasm = calculator.calculateDamage({
  attackType: "np",
  attack: 10000,
  cardType: "buster",
  noblePhantasmMultiplier: 300,
  busterFirstBonus: true,
  starRate: 0
});
assert.equal(noblePhantasm.referenceDamage, 10350);
assert.equal(
  noblePhantasm.factors.firstBusterBonus,
  0,
  "NP must not receive a first-card bonus"
);

// Reference-page example: Ereshkigal, first Arts, N/A 0.54, Arts up 11%, 6 hits.
const ereshkigal = calculator.calculateDamage({
  attackType: "normal",
  cardType: "arts",
  cardPosition: 1,
  artsFirstBonus: true,
  attackBaseNp: 0.54,
  cardPerformanceUp: 11,
  defenderClass: "saber",
  hitCount: 6,
  starRate: 0
});
assert.equal(ereshkigal.npPerHit, 2.33);
assert.equal(ereshkigal.npRecharge, 13.98);

const ereshkigalOverkill = calculator.calculateDamage({
  attackType: "normal",
  cardType: "arts",
  cardPosition: 1,
  artsFirstBonus: true,
  attackBaseNp: 0.54,
  cardPerformanceUp: 11,
  defenderClass: "saber",
  hitCount: 6,
  overkillHitCount: 5,
  starRate: 0
});
assert.equal(ereshkigalOverkill.npRecharge, 19.8);

const multiTargetRefund = calculator.calculateDamage({
  attackType: "normal",
  cardType: "arts",
  cardPosition: 1,
  artsFirstBonus: true,
  attackBaseNp: 0.54,
  cardPerformanceUp: 11,
  defenderClass: "saber",
  targetCount: 3,
  hitCount: 6,
  starRate: 0
});
assert.equal(multiTargetRefund.npRechargePerTarget, 13.98);
assert.equal(multiTargetRefund.npRecharge, 41.94);

// Reference-page example: Jack, first Quick, SR 25.5%, Quick up 50%,
// star generation up 10.5%, 5 hits.
const jack = calculator.calculateDamage({
  attackType: "normal",
  cardType: "quick",
  cardPosition: 1,
  quickFirstBonus: true,
  starRate: 25.5,
  cardPerformanceUp: 50,
  starGenerationUp: 10.5,
  hitCount: 5
});
assert.equal(jack.normalStarRate, 1.76);
closeTo(jack.expectedStars, 8.8, 1e-9);
assert.equal(jack.minimumStars, 5);
assert.equal(jack.maximumStars, 10);

const jackOverkill = calculator.calculateDamage({
  attackType: "normal",
  cardType: "quick",
  cardPosition: 2,
  quickFirstBonus: true,
  critical: true,
  starRate: 25.5,
  cardPerformanceUp: 50,
  starGenerationUp: 10.5,
  hitCount: 5,
  overkillHitCount: 5
});
assert.equal(jackOverkill.overkillStarRate, 3);
assert.equal(jackOverkill.expectedStars, 15);
assert.equal(jackOverkill.minimumStars, 15);
assert.equal(jackOverkill.maximumStars, 15);

console.log("All FGO calculator tests passed.");
