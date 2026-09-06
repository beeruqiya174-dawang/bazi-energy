/**
 * 「四支全透干」稀有度验证 —— 回应大王：地支4个都有透干的概率应该很小？
 *
 * 透干定义：某地支的藏干（本气+中气+余气）至少一个出现在四柱天干中。
 * 标准藏干表：
 *   子=壬癸        丑=己癸辛      寅=甲丙戊      卯=乙
 *   辰=戊乙癸      巳=丙戊庚      午=丁己        未=己丁乙
 *   申=庚壬戊      酉=辛          戌=戊辛丁      亥=壬甲
 *
 * 枚举全部 518,400 合法命盘，统计：
 *   1) 每支柱透干的联合分布（k 个支透干的盘占比）
 *   2) 四支全透干的盘的层次/有效功率分布 → 验证「全透干 ≠ 高分位」
 *   3) 目标盘 甲寅 己巳 丙子 壬辰 实际是几支透干
 *
 * 运行：node scripts/verify-tougan.js
 */
const BaziEngine = require('../lib/bazi.js');

const TG = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DZ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 地支藏干（本气/中气/余气）
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
function monthStem(yearStem, monthBranch) {
  const yi = DZ.indexOf('寅');
  let mi = monthBranch - yi; if (mi < 0) mi += 12;
  return TG[((yearStem % 5) * 2 + 2 + mi) % 10];
}
function hourStem(dayStem, hourBranch) {
  return TG[((dayStem % 5) * 2 + hourBranch) % 10];
}

const pillars = allPillars();
const countByTou = [0, 0, 0, 0, 0]; // 0~4 支透干
const allTouCengci = [0, 0, 0, 0, 0]; // 四支全透干盘的层次分布
const allTouPowerBins = [0, 0, 0, 0]; // 四支全透干盘的有效功率档（0-0.05/0.05-0.2/0.2-0.5/0.5+）
let allTouCount = 0;

function branchTou(branch, stems) {
  return CANGGAN[branch].some((g) => stems.includes(g));
}

for (const y of pillars) {
  for (let mb = 0; mb < 12; mb++) {
    const m = { tg: monthStem(TG.indexOf(y.tg), mb), dz: DZ[mb] };
    for (const d of pillars) {
      for (let hb = 0; hb < 12; hb++) {
        const h = { tg: hourStem(TG.indexOf(d.tg), hb), dz: DZ[hb] };
        const stems = [y.tg, m.tg, d.tg, h.tg];
        const branches = [y.dz, m.dz, d.dz, h.dz];
        const touCount = branches.filter((b) => branchTou(b, stems)).length;
        countByTou[touCount]++;
        if (touCount === 4) {
          allTouCount++;
          const { result } = BaziEngine.analyze(`${y.tg}${y.dz} ${m.tg}${m.dz} ${d.tg}${d.dz} ${h.tg}${h.dz}`);
          allTouCengci[result.zhuanhua_cengci.cengci_fen]++;
          const p = result.xiduyou_data.youxiao_gonglv;
          allTouPowerBins[p < 0.05 ? 0 : p < 0.2 ? 1 : p < 0.5 ? 2 : 3]++;
        }
      }
    }
  }
}

const total = countByTou.reduce((a, b) => a + b, 0);
console.log(`══ 全枚举 ${total.toLocaleString()} 盘：k 支透干分布 ══`);
for (let k = 0; k <= 4; k++)
  console.log(`  ${k} 支透干: ${(countByTou[k] / total * 100).toFixed(2)}%  (${countByTou[k].toLocaleString()} 盘)`);
console.log(`  ≥3 支透干: ${((countByTou[3] + countByTou[4]) / total * 100).toFixed(2)}%`);

console.log(`\n══ 四支全透干的 ${allTouCount.toLocaleString()} 盘（${(allTouCount / total * 100).toFixed(2)}%）质量如何 ══`);
const CN = ['能量未转化', '内在通达', '财富之路', '官贵之途', '财官双全'];
allTouCengci.forEach((n, i) => console.log(`  ${CN[i]}: ${(n / allTouCount * 100).toFixed(2)}%`));
console.log(`  有效功率档: <0.05=${(allTouPowerBins[0] / allTouCount * 100).toFixed(1)}%  0.05-0.2=${(allTouPowerBins[1] / allTouCount * 100).toFixed(1)}%  0.2-0.5=${(allTouPowerBins[2] / allTouCount * 100).toFixed(1)}%  ≥0.5=${(allTouPowerBins[3] / allTouCount * 100).toFixed(1)}%`);

// 目标盘
const target = ['甲寅', '己巳', '丙子', '壬辰'];
const stems = target.map((p) => p[0]);
const branches = target.map((p) => p[1]);
console.log(`\n══ 目标盘 ${target.join(' ')} ══`);
branches.forEach((b, i) => {
  const match = CANGGAN[b].filter((g) => stems.includes(g));
  console.log(`  ${b}（藏干 ${CANGGAN[b].join('/')}）→ ${match.length ? '透 ' + match.join('/') : '不透'}`);
});
