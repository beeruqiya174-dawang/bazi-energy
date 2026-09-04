/**
 * 能量转化分布计算 —— 全排列组合枚举
 *
 * 原理：四柱命盘的合法组合总数是确定的：
 *   年柱 60（干支同阳阴配对）× 月支 12（月干由五虎遁唯一确定）
 *   × 日柱 60 × 时支 12（时干由五鼠遁唯一确定）
 *   = 518,400 个不同命盘。
 *
 * 对每一个命盘跑确定性引擎，统计 (转化效率 ECE × 转化功率) 的联合分布，
 * 引擎内置的 ECE_POWER_GRID 即由此生成。稀有度 = 帕累托头部占比：
 * 同时达到「效率≥你 且 功率≥你」的命盘占比（含同档）。
 *
 * 运行：node scripts/rarity-stats.js
 * 规则改动后必须重跑本脚本并核对内置表。
 */

const BaziEngine = require('../lib/bazi.js');

const TG = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DZ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

// 合法干支柱：天干与地支阴阳同配 → 60 甲子
function allPillars() {
  const list = [];
  for (let s = 0; s < 10; s++) {
    for (let b = 0; b < 12; b++) {
      if (s % 2 === b % 2) list.push({ tg: TG[s], dz: DZ[b] });
    }
  }
  return list; // 60 个
}

// 五虎遁：年干定寅月天干，逐月顺推。月支序：寅=0 卯=1 ... 丑=11
function monthStem(yearStem, monthBranch) {
  const yi = DZ.indexOf('寅');
  let mi = monthBranch - yi;
  if (mi < 0) mi += 12;
  const idx = ((yearStem % 5) * 2 + 2 + mi) % 10;
  return TG[idx];
}

// 五鼠遁：日干定子时天干，逐时顺推。时支序：子=0 丑=1 ...
function hourStem(dayStem, hourBranch) {
  const idx = ((dayStem % 5) * 2 + hourBranch) % 10;
  return TG[idx];
}

function main() {
  const pillars60 = allPillars();
  const G = 20; // 与引擎内置 ECE_POWER_GRID 相同粒度
  const grid = Array.from({ length: G }, () => new Array(G).fill(0));
  const eceTenth = new Array(10).fill(0); // 0.1 一档的形态统计
  let count = 0;
  const t0 = Date.now();

  for (const yp of pillars60) {                 // 年柱 60
    const ys = TG.indexOf(yp.tg);
    for (let mb = 0; mb < 12; mb++) {           // 月支 12（月干五虎遁确定）
      const mp = { tg: monthStem(ys, mb), dz: DZ[mb] };
      for (const dp of pillars60) {             // 日柱 60
        const ds = TG.indexOf(dp.tg);
        for (let hb = 0; hb < 12; hb++) {       // 时支 12（时干五鼠遁确定）
          const sp = { tg: hourStem(ds, hb), dz: DZ[hb] };
          const { result } = BaziEngine.analyze({ n: yp, y: mp, r: dp, s: sp });
          const e = Math.min(G - 1, Math.floor(result.zhuanhua_xiaolv * G));
          const p = Math.min(G - 1, Math.floor(Math.min(1, result.zhuanhua_nengliang) * G));
          grid[e][p]++;
          eceTenth[Math.min(9, Math.floor(result.zhuanhua_xiaolv * 10))]++;
          count++;
        }
      }
    }
  }

  console.log(`枚举完成：${count.toLocaleString()} 个命盘，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  const pct = (x) => (100 * x / count).toFixed(2) + '%';

  console.log('══ ECE 分布形态（0.1 一档）══');
  for (let g = 0; g < 10; g++) {
    console.log(`${(g / 10).toFixed(1)}-${((g + 1) / 10).toFixed(1)}: ${pct(eceTenth[g])}`);
  }

  // 帕累托头部占比门槛
  const dom = (e, p) => {
    let c = 0;
    for (let i = e; i < G; i++) for (let j = p; j < G; j++) c += grid[i][j];
    return c / count;
  };
  console.log('\n══ 帕累托头部门槛（同时达到该效率与功率的占比）══');
  for (const [e, p] of [[19, 19], [19, 18], [19, 16], [18, 11], [16, 12], [12, 10], [10, 6], [0, 0]]) {
    console.log(`ECE≥${(e / G).toFixed(2)} 且 功率≥${(p / G).toFixed(2)}: ${(dom(e, p) * 100).toFixed(2)}%`);
  }

  // 黄金用例
  console.log('\n══ 黄金用例 ══');
  for (const [name, bazi] of [['大王', '甲寅 己巳 丙子 壬辰'], ['薛相公', '甲申 壬申 乙巳 戊寅']]) {
    const r = BaziEngine.analyze(bazi).result;
    console.log(`${name}: ECE=${r.zhuanhua_xiaolv} 功率=${r.zhuanhua_nengliang} → ${r.xiduyou}`);
  }

  // ══ 一致性校验：实时枚举 vs 引擎内置 ECE_POWER_GRID ══
  const embedded = BaziEngine.ECE_POWER_GRID;
  if (embedded) {
    let mismatch = 0;
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        if (grid[i][j] !== embedded[i][j]) {
          mismatch++;
          console.log(`⚠️ 不一致 [${i}][${j}]：枚举=${grid[i][j]} 内置=${embedded[i][j]}`);
        }
      }
    }
    if (mismatch === 0) {
      console.log('\n✅ 一致性校验通过：引擎内置 ECE_POWER_GRID 与实时全枚举完全一致（20×20 网格）');
    } else {
      console.log(`\n❌ ${mismatch} 个格子不一致——规则已改动，需用本次枚举结果更新 lib/bazi.js 的 ECE_POWER_GRID！`);
      console.log('新表：');
      console.log(JSON.stringify(grid));
      process.exitCode = 1;
    }
  }
}

main();
