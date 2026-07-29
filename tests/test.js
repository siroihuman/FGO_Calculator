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

assert.equal(calculator.version, "1.0.0");
assert.equal(calculator.randomValues.length, 200);
assert.equal(calculator.randomValues[0], 0.9);
assert.equal(calculator.randomValues[199], 1.099);

assert.equal(calculator.getClassCorrection("archer"), 0.95);
assert.equal(calculator.getClassCorrection("lancer"), 1.05);
assert.equal(calculator.getClassAffinity("saber", "lancer"), 2.0);
assert.equal(calculator.getClassAffinity("saber", "archer"), 0.5);
assert.equal(calculator.getClassAffinity("berserker", "foreigner"), 0.5);
assert.equal(calculator.getClassAffinity("foreigner", "berserker"), 2.0);

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
