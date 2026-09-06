/**
 * 致动力条件化分位验证（V7.2）
 *
 * 大王之问：「个人努力系数不也应该是盘面决定的吗？不是所有人都有努力的能力。」
 * 本脚本把「5% 千人 CEO」从无条件分位修正为条件化分位：
 *
 *   CEO 真实人群 ≈ P(层次≥官贵 ∧ 有效功率≥0.5 ∧ 致动力≥阈值) × 大运命中率(~1/3)
 *
 * 跑法：node scripts/verify-zhidongli-percentile.js
 */
const BaziEngine = require('../lib/bazi.js');

const TG = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DZ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

function allPillars() {
  const list = [];
  for (let s = 0; s < 10; s++) for (let b = 0; b < 12; b++) if (s % 2 === b % 2) list.push({ tg: TG[s], dz: DZ[b] });
  return list;
}
function monthStem(yearStem, monthBranch) {
  const mi = (monthBranch - DZ.indexOf('寅') + 12) % 12;
  return TG[((yearStem % 5) * 2 + 2 + mi) % 10];
}
function hourStem(dayStem, hourBranch) {
  return TG[((dayStem % 5) * 2 + hourBranch) % 10];
}

// ── 用户盘（乙卯）致动力 ──
const u = BaziEngine.analyze('乙卯 丙戌 戊子 庚申').result;
const uzdl = u.zhuanhua_cengci.zhidongli;
console.log('══ 乙卯盘（用户）══');
console.log('致动力=' + uzdl + '（几何' + u.zhuanhua_cengci.zhidongli_geomMean +
  ' × 连通' + u.zhuanhua_cengci.zhidongli_connectivity +
  ' × 内耗折扣' + u.zhuanhua_cengci.zhidongli_neihaoFactor + '）');
console.log('五维饱和：' + Object.entries(u.zhuanhua_cengci.zhidongli_caps).map(([k, v]) => k + '=' + v).join(' '));
console.log('有效功率=' + u.xiduyou_data.youxiao_gonglv + '  层次=' + u.zhuanhua_cengci.cengci + '\n');

const pillars60 = allPillars();
const t0 = Date.now();
let count = 0;

// 全体致动力分布（20 档直方图）+ CEO 静态候选集（层次≥官贵 ∧ 有效功率≥0.5）内的致动力分布
const G = 20;
const zdlHist = new Array(G).fill(0);
let zdlSum = 0;
const ceoHist = new Array(G).fill(0);
let ceoCount = 0, ceoZdlSum = 0;
let ceoAndUserZdl = 0;      // CEO 静态候选 ∧ 致动力 ≥ 用户
let midAndUserZdl = 0;      // 中等局（层次≥官贵 ∧ 功率≥0.05）∧ 致动力 ≥ 用户
let midCount = 0;

for (const yp of pillars60) {
  const ys = TG.indexOf(yp.tg);
  for (let mb = 0; mb < 12; mb++) {
    const mp = { tg: monthStem(ys, mb), dz: DZ[mb] };
    for (const dp of pillars60) {
      const ds = TG.indexOf(dp.tg);
      for (let hb = 0; hb < 12; hb++) {
        const sp = { tg: hourStem(ds, hb), dz: DZ[hb] };
        const { result } = BaziEngine.analyze({ n: yp, y: mp, r: dp, s: sp });
        const zdl = result.zhuanhua_cengci.zhidongli;
        const l = result.zhuanhua_cengci.cengci_fen;
        const power = result.xiduyou_data.youxiao_gonglv;
        const bin = Math.min(G - 1, Math.floor(zdl * G));
        zdlHist[bin]++;
        zdlSum += zdl;
        if (l >= 3 && power >= 0.5) {
          ceoHist[bin]++;
          ceoCount++;
          ceoZdlSum += zdl;
          if (zdl >= uzdl) ceoAndUserZdl++;
        }
        if (l >= 3 && power >= 0.05) {
          midCount++;
          if (zdl >= uzdl) midAndUserZdl++;
        }
        count++;
      }
    }
  }
}

const pct = (x) => (100 * x / count).toFixed(2) + '%';
console.log('枚举完成：' + count.toLocaleString() + ' 盘，耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's\n');

// ── 全体致动力分布 ──
console.log('══ 全体致动力分布（518,400 盘）══');
let cum = 0;
for (let i = G - 1; i >= 0; i--) {
  if (zdlHist[i] === 0 && i > 0) continue;
  cum += zdlHist[i];
  if (i >= 10 || zdlHist[i] > 0) {
    console.log('  致动力[' + (i / G).toFixed(2) + '~' + ((i + 1) / G).toFixed(2) + '): ' +
      zdlHist[i].toLocaleString().padStart(7) + ' (' + pct(zdlHist[i]).padStart(6) + ')  累计头部 ' + pct(cum));
  }
}
console.log('  全体均值=' + (zdlSum / count).toFixed(3) + '  用户=' + uzdl + '\n');

// ── CEO 静态候选集内的致动力分布 ──
console.log('══ CEO 静态候选集（层次≥官贵 ∧ 有效功率≥0.5，共 ' + ceoCount.toLocaleString() + ' 盘 = ' + pct(ceoCount) + '）内的致动力分布 ══');
cum = 0;
for (let i = G - 1; i >= 0; i--) {
  if (ceoHist[i] === 0) continue;
  cum += ceoHist[i];
  console.log('  致动力[' + (i / G).toFixed(2) + '~' + ((i + 1) / G).toFixed(2) + '): ' +
    ceoHist[i].toLocaleString().padStart(7) + ' (' + (100 * ceoHist[i] / ceoCount).toFixed(2).padStart(6) + '%)  累计 ' + (100 * cum / ceoCount).toFixed(2) + '%');
}
console.log('  候选集均值=' + (ceoZdlSum / ceoCount).toFixed(3) + '\n');

// ── 条件化分位结论 ──
console.log('══ 条件化分位结论 ══');
console.log('千人 CEO 静态候选（层次≥官贵 ∧ 功率≥0.5）:            ' + pct(ceoCount));
console.log('候选 ∧ 致动力≥用户(' + uzdl + '):                          ' + ceoAndUserZdl.toLocaleString() + ' 盘 = ' + pct(ceoAndUserZdl));
console.log('中等局（层次≥官贵 ∧ 功率≥0.05）:                        ' + pct(midCount));
console.log('中等局 ∧ 致动力≥用户:                                    ' + pct(midAndUserZdl));
console.log('');
console.log('动态修正（50 岁抵达 ≈ 静态 × 1/3 大运命中率）:');
console.log('  无条件:    ' + (100 * ceoCount / count / 3).toFixed(2) + '% 真实人群');
console.log('  致动力≥' + uzdl + ': ' + (100 * ceoAndUserZdl / count / 3).toFixed(2) + '% 真实人群 ← 乙卯盘所在档');
console.log('');
console.log('结论：努力能力是盘面函数（五维几何均值×连通×内耗折扣），不是外部常数；');
console.log('CEO 真实人群 = 中等局 ∧ 高致动力 ∧ 大运命中 三条件交集，量级收敛至 ' +
  (100 * ceoAndUserZdl / count / 3).toFixed(1) + '%。');
