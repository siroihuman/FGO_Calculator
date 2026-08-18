"use strict";

const assert = require("node:assert/strict");
const ranking = require("../FGO_RankingGenerator_atwiki.js");

assert.equal(ranking.version, "1.1.0");

const skillGrid = [
  ["CT", "効果", "Lv.1", "Lv.2", "Lv.3", "Lv.4", "Lv.5", "Lv.6", "Lv.7", "Lv.8", "Lv.9", "Lv.10"],
  ["8", "自身のQuickカード性能をアップ(3T)[Lv]", "10","11","12","13","14","15","16","17","18","20"],
  ["", "＋味方全体の攻撃力をアップ(3T)[Lv]", "10","11","12","13","14","15","16","17","18","20"],
  ["", "＋自身のNPを増やす[Lv]", "10","11","12","13","14","15","16","17","18","20"],
  ["", "＋スターを獲得[Lv]", "5","6","7","8","9","10","11","12","13","15"],
  ["", "＋自身のスター発生率をアップ(3T)[Lv]", "30","32","34","36","38","40","42","44","46","50"],
  ["", "＋自身にQuickカード性能アップブースト状態を付与[Lv]", "10","15","20","25","30","35","40","45","50","50"],
  ["", "＋敵単体の〔悪〕特性の防御力をダウン(3T)[Lv]", "10","11","12","13","14","15","16","17","18","20"],
  ["", "＋自身の通常攻撃のHit数を2倍にする(1T)", "", "", "", "", "", "", "", "", "", ""],
  ["", "＋自身のHit数を2倍にする(1T)", "2", "2", "2", "2", "2", "2", "2", "2", "2", "2"]
];

const skill = ranking.parseEffectGrid(skillGrid, "skill");
assert.equal(skill.cardUp.quick, 20);
assert.equal(skill.attackUp, 20);
assert.equal(skill.directNp, 20);
assert.equal(skill.directStars, 15);
assert.equal(skill.starGenerationUp, 50);
assert.equal(skill.defenseDown, 0);
assert.equal(skill.npHitMultiplier, 2);

const noValueGrid = [
  ["効果", "Lv.1", "Lv.10"],
  ["自身に回避状態を付与(3回・3T)", "", ""]
];
const noValue = ranking.parseEffectGrid(noValueGrid, "skill");
assert.equal(noValue.directNp, 0);
assert.equal(noValue.attackUp, 0);

const preDamage = ranking.emptyEffects();
ranking.applyEffectText(preDamage, "自身に『攻撃時のダメージ前に対象の防御力をダウン(3T)する状態』を付与", 20);
assert.equal(preDamage.defenseDown, 20);

const delayed = ranking.emptyEffects();
ranking.applyEffectText(delayed, "自身に『攻撃時に対象の防御力をダウン(3T)する状態』を付与", 20);
assert.equal(delayed.defenseDown, 0);

const npGrid = [
  ["Card", "ランク", "種別", "効果", "1", "2", "3", "4", "5"],
  ["Quick", "A+", "対軍宝具", "自身のQuickカード性能をアップ(1T)<OC:効果UP>", "10", "15", "20", "25", "30"],
  ["Quick", "A+", "対軍宝具", "敵全体に強力な攻撃[Lv] Quick(x0.8)", "800", "1000", "1100", "1150", "1200"],
  ["Quick", "A+", "対軍宝具", "＋自身のNPをリチャージする[Lv]", "10", "15", "20", "25", "30"],
  ["Quick", "A+", "対軍宝具", "＋スターを獲得<OC:効果UP>", "20", "25", "30", "35", "40"]
];
const np = ranking.parseNpDetails(npGrid, 3);
assert.equal(np.multiplier, 1100);
assert.equal(np.scope, "all");
assert.equal(np.card, "quick");
assert.equal(np.preEffects.cardUp.quick, 10);
assert.equal(np.afterEffects.directNp, 20);
assert.equal(np.afterEffects.directStars, 20);

const calculatorStub = {
  calculateDamage(params) {
    assert.equal(params.manualClassAffinity, true);
    assert.equal(params.classAffinityPercent, 100);
    assert.equal(params.attributeAffinity, 1);
    assert.equal(params.overkillHitCount, 0);
    return {
      minimumDamage: 9000,
      averageDamage: 10000,
      referenceDamage: 10005,
      maximumDamage: 11000,
      npRechargePerTarget: 5,
      npRecharge: 15,
      expectedStars: 8.5,
      minimumStars: 6,
      maximumStars: 11
    };
  }
};

const servant = {
  attack: 7000,
  attackerClass: "assassin",
  npCard: "quick",
  npMultiplier: 800,
  scope: "all",
  hitCounts: { np: 5 },
  attackBaseNp: 0.7,
  starRate: 25,
  classEffects: ranking.emptyEffects(),
  skillEffects: skill,
  npPreEffects: np.preEffects,
  npAfterEffects: np.afterEffects
};
const pair = ranking.calculateRow(servant, { atkPlus1000: true, aoeTargets: 3 }, calculatorStub);
assert.equal(pair.withoutSkills.effectiveAttack, 8000);
assert.equal(pair.withoutSkills.npTotal, 35);
assert.equal(pair.withSkills.npTotal, 55);
assert.equal(pair.withSkills.starTotal, 43.5);
assert.equal(pair.withSkills.hitCount, 10);

// 旧ランキングの八百屋お七（Lv70 ATK7161 +1000、Quick宝具800%、Assassin補正0.9）の係数確認。
const oshichiReference = (7161 + 1000) * 8 * 0.8 * 0.9 * 0.23;
assert.ok(oshichiReference > 10800 && oshichiReference < 10830);
const oshichiWithSkills = oshichiReference * 1.4 * 1.4;
assert.ok(oshichiWithSkills > 21170 && oshichiWithSkills < 21220);

console.log("Ranking generator v1.1.0 tests passed.");
