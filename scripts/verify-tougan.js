/**
 * 透干两种口径 + 天干五行多样性稀有度验证（V2，大王更正后）
 *
 * 大王更正两点：
 *   1) 辰也算透干：五行口径（己土对辰中戊土、壬水对辰中癸水）
 *      ——这正是引擎自己的口径（lib/bazi.js:146 历史注释：
 *      「只看五行，不分阴阳（历史bug：戊己阴阳不同被误判不算透干）」）
 *   2) 真正的稀有度假设：天干有 4 个互不相同的五行（共 5 个取 4 个），
 *      是「具备能量数量的最大值」；多数人只有 1-2 个天干五行，重复是浪费。
 *
 * 本脚本验证：
 *   A) 五行口径 vs 字面口径的 k 支透干分布
 *   B) 天干五行种类数分布（1~4 种）——大王假设的实测稀有度
 *   C) 天干 4 种五行的盘 vs 其他盘：层次/有效功率对比——
 *      「五行多样性」到底带来多少能量优势（桶模型按五行合并，重复不浪费？）
 *
 * 运行：node scripts/verify-tougan.js
 */
const BaziEngine = require('../lib/bazi.js');

const TG = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DZ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const WX = ['木', '火', '土', '金', '水'];
const tgWX = (s) => Math.floor(TG.indexOf(s) / 2); // 甲乙0 丙丁1 戊己2 庚辛3 壬癸4

const CANGGAN = {
  子: ['壬', '癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
  辰: ['戊', '乙', '癸'], 巳: ['丙', '戊', '庚'], 午: ['丁', '己'], 未: ['己', '丁', '乙'],
  申: ['庚', '壬', '戊'], 酉: ['辛'], 戌: ['戊', '辛', '丁'], 亥: ['壬', '甲']
};

function allPillars() {
  const list = [];
  for (let s = 0; s < 10; s++)
    for (let b = 0; b < 12; b++)
      if (s % 2 === b % 2) list.push({ tg: TG[s], dz: DZ[b] });
  return list;
}
const monthStem = (y, mb) => { let mi = mb - 2; if (mi < 0) mi += 12; return TG[((y % 5) * 2 + 2 + mi) % 10]; };
const hourStem = (d, hb) => TG[((d % 5) * 2 + hb) % 10];

const pillars = allPillars();
const literalTou = [0, 0, 0, 0, 0];   // 字面口径（藏干字 = 天干字）
const wxTou = [0, 0, 0, 0, 0];        // 五行口径（藏干五行 = 天干五行，大王/引擎口径）
const stemWXCount = [0, 0, 0, 0];     // 天干五行种类数 1~4
// 天干 4 种五行盘的质量（分析引擎）与全体对照
const fourWX = { n: 0, cengci: [0, 0, 0, 0, 0], powerBins: [0, 0, 0, 0], powerSum: 0, zdlSum: 0 };
const otherWX = { n: 0, cengci: [0, 0, 0, 0, 0], powerBins: [0, 0, 0, 0], powerSum: 0, zdlSum: 0 };
let analyzed = 0;

for (const y of pillars) {
  for (let mb = 0; mb < 12; mb++) {
    const m = { tg: monthStem(TG.indexOf(y.tg), mb), dz: DZ[mb] };
    for (const d of pillars) {
      for (let hb = 0; hb < 12; hb++) {
        const h = { tg: hourStem(TG.indexOf(d.tg), hb), dz: DZ[hb] };
        const stems = [y.tg, m.tg, d.tg, h.tg];
        const stemWXs = stems.map(tgWX);
        const branches = [y.dz, m.dz, d.dz, h.dz];

        let lit = 0, wx = 0;
        for (const b of branches) {
          if (CANGGAN[b].some((g) => stems.includes(g))) lit++;
          if (CANGGAN[b].some((g) => stemWXs.includes(tgWX(g)))) wx++;
        }
        literalTou[lit]++; wxTou[wx]++;

        const distinct = new Set(stemWXs).size;
        stemWXCount[distinct - 1]++;

        if (distinct === 4 || distinct <= 1) {
          // 只分析两端（4 种 = 大王假设的最大值盘；1 种 = 对照下限），加全体基准抽样
        }
        // 对 4 种五行盘全量分析（约 30 万内），对 1~3 种做 1/8 抽样对照
        if (distinct === 4 || (distinct < 4 && analyzed % 8 === 0)) {
          const { result } = BaziEngine.analyze(`${y.tg}${y.dz} ${m.tg}${m.dz} ${d.tg}${d.dz} ${h.tg}${h.dz}`);
          const tgt = distinct === 4 ? fourWX : otherWX;
          tgt.n++;
          tgt.cengci[result.zhuanhua_cengci.cengci_fen]++;
          const p = result.xiduyou_data.youxiao_gonglv;
          tgt.powerBins[p < 0.05 ? 0 : p < 0.2 ? 1 : p < 0.5 ? 2 : 3]++;
          tgt.powerSum += p;
          tgt.zdlSum += (result.zhuanhua_cengci.zhidongli || 0);
        }
        analyzed++;
      }
    }
  }
}

const total = analyzed;
console.log(`══ A) 透干两口径（全枚举 ${total.toLocaleString()} 盘）══`);
console.log('  支数  字面口径      五行口径(大王/引擎)');
for (let k = 0; k <= 4; k++)
  console.log(`  ${k} 支   ${(literalTou[k] / total * 100).toFixed(2)}%      ${(wxTou[k] / total * 100).toFixed(2)}%`);

console.log(`\n══ B) 天干五行种类数分布（大王假设的实测）══`);
const names = ['1 种（全同）', '2 种', '3 种', '4 种（最大值）'];
for (let k = 0; k < 4; k++)
  console.log(`  ${names[k]}: ${(stemWXCount[k] / total * 100).toFixed(2)}%  (${stemWXCount[k].toLocaleString()} 盘)`);

console.log(`\n══ C) 天干 4 种五行 vs 其他（引擎实测质量）══`);
console.log(`  4 种五行盘 n=${fourWX.n.toLocaleString()}（全量）：平均有效功率 ${(fourWX.powerSum / fourWX.n).toFixed(4)}，平均致动力 ${(fourWX.zdlSum / fourWX.n).toFixed(4)}`);
console.log(`  其他盘   n=${otherWX.n.toLocaleString()}（1/8 抽样，代表 ${(otherWX.n * 8).toLocaleString()}）：平均有效功率 ${(otherWX.powerSum / otherWX.n).toFixed(4)}，平均致动力 ${(otherWX.zdlSum / otherWX.n).toFixed(4)}`);
const CN = ['能量未转化', '内在通达', '财富之路', '官贵之途', '财官双全'];
console.log('  4 种盘层次分布:');
fourWX.cengci.forEach((n, i) => console.log(`    ${CN[i]}: ${(n / fourWX.n * 100).toFixed(2)}%`));
console.log(`  4 种盘有效功率档: <0.05=${(fourWX.powerBins[0] / fourWX.n * 100).toFixed(1)}%  0.05-0.2=${(fourWX.powerBins[1] / fourWX.n * 100).toFixed(1)}%  0.2-0.5=${(fourWX.powerBins[2] / fourWX.n * 100).toFixed(1)}%  ≥0.5=${(fourWX.powerBins[3] / fourWX.n * 100).toFixed(1)}%`);
console.log('  其他盘层次分布(抽样):');
otherWX.cengci.forEach((n, i) => console.log(`    ${CN[i]}: ${(n / otherWX.n * 100).toFixed(2)}%`));
console.log(`  其他盘有效功率档: <0.05=${(otherWX.powerBins[0] / otherWX.n * 100).toFixed(1)}%  0.05-0.2=${(otherWX.powerBins[1] / otherWX.n * 100).toFixed(1)}%  0.2-0.5=${(otherWX.powerBins[2] / otherWX.n * 100).toFixed(1)}%  ≥0.5=${(otherWX.powerBins[3] / otherWX.n * 100).toFixed(1)}%`);

// 目标盘复核（五行口径）
const target = ['甲寅', '己巳', '丙子', '壬辰'];
const tstems = target.map((p) => p[0]);
const tstemWXs = tstems.map(tgWX);
console.log(`\n══ 目标盘 ${target.join(' ')}（五行口径）══`);
target.forEach((p, i) => {
  const b = p[1];
  const lit = CANGGAN[b].filter((g) => tstems.includes(g));
  const wxm = CANGGAN[b].filter((g) => tstemWXs.includes(tgWX(g)));
  console.log(`  ${b}（藏干${CANGGAN[b].join('/')}）→ 字面透${lit.length ? lit.join('/') : '无'} | 五行透${wxm.length ? wxm.join('/') : '无'}`);
});
console.log(`  天干五行: ${tstems.map((s) => WX[tgWX(s)]).join(' ')} → ${new Set(tstemWXs).size} 种`);
