/**
 * 能量转化三维分布计算 —— 全排列组合枚举
 *
 * 原理：四柱命盘的合法组合总数是确定的：
 *   年柱 60（干支同阳阴配对）× 月支 12（月干由五虎遁唯一确定）
 *   × 日柱 60 × 时支 12（时干由五鼠遁唯一确定）
 *   = 518,400 个不同命盘。
 *
 * 对每一个命盘跑确定性引擎，统计 (转化层次 × ECE × 转化功率) 的三维联合分布，
 * 引擎内置的 CENGGI_ECE_POWER_GRID 即由此生成。稀有度 = 三维帕累托头部占比：
 * 同时达到「层次≥你 且 效率≥你 且 功率≥你」的命盘占比（含同档）。
 *
 * 层次（世俗标准，贵为上、富次之）：
 *   4 财官双全（财、官杀两通道皆通）
 *   3 官贵之途（仅官杀通道）
 *   2 财富之路（仅财通道）
 *   1 内在通达（仅印/食伤/比劫内在转化）
 *   0 能量未转化（无做工系统）
 *
 * 运行：node scripts/rarity-stats.js
 * 规则改动后必须重跑本脚本并核对内置表。
 */

const BaziEngine = require('../lib/bazi.js');

const TG = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const DZ = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const CENGGI_NAMES = ['能量未转化', '内在通达', '财富之路', '官贵之途', '财官双全'];

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
  const G = 20; // 与引擎内置网格相同粒度
  const grid = Array.from({ length: 5 }, () => Array.from({ length: G }, () => new Array(G).fill(0)));
  const levelDist = [0, 0, 0, 0, 0];
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
          const l = result.zhuanhua_cengci.cengci_fen;
          const e = Math.min(G - 1, Math.floor(result.zhuanhua_xiaolv * G));
          const p = Math.min(G - 1, Math.floor(Math.min(1, result.zhuanhua_nengliang) * G));
          grid[l][e][p]++;
          levelDist[l]++;
          count++;
        }
      }
    }
  }

  console.log(`枚举完成：${count.toLocaleString()} 个命盘，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  const pct = (x) => (100 * x / count).toFixed(2) + '%';

  console.log('══ 转化层次分布（世俗标准）══');
  for (let i = 4; i >= 0; i--) {
    console.log(`${CENGGI_NAMES[i]}: ${pct(levelDist[i])}（${levelDist[i].toLocaleString()}）`);
  }

  // 三维帕累托头部门槛
  const dom = (l, e, p) => {
    let c = 0;
    for (let i = l; i < 5; i++) for (let j = e; j < G; j++) for (let k = p; k < G; k++) c += grid[i][j][k];
    return c / count;
  };
  console.log('\n══ 三维帕累托头部门槛（层次≥ 且 效率≥ 且 功率≥ 的占比）══');
  for (const [l, e, p] of [[4, 19, 19], [4, 18, 16], [4, 0, 0], [3, 19, 16], [1, 19, 16], [1, 0, 0], [0, 0, 0]]) {
    console.log(`${CENGGI_NAMES[l]} + ECE≥${(e / G).toFixed(2)} + 功率≥${(p / G).toFixed(2)}: ${(dom(l, e, p) * 100).toFixed(2)}%`);
  }

  // 黄金用例
  console.log('\n══ 黄金用例 ══');
  for (const [name, bazi] of [['大王', '甲寅 己巳 丙子 壬辰'], ['薛相公', '甲申 壬申 乙巳 戊寅']]) {
    const r = BaziEngine.analyze(bazi).result;
    const c = r.zhuanhua_cengci;
    console.log(`${name}: ${c.cengci}（世俗占${(100 * c.shisu_zhanbi).toFixed(1)}%）ECE=${r.zhuanhua_xiaolv} 功率=${r.zhuanhua_nengliang}`);
    console.log(`  ${r.xiduyou}`);
  }

  // ══ 一致性校验：实时枚举 vs 引擎内置 CENGGI_ECE_POWER_GRID ══
  const embedded = BaziEngine.CENGGI_ECE_POWER_GRID;
  if (embedded) {
    let mismatch = 0;
    for (let l = 0; l < 5; l++) {
      for (let i = 0; i < G; i++) {
        for (let j = 0; j < G; j++) {
          if (grid[l][i][j] !== embedded[l][i][j]) {
            mismatch++;
            if (mismatch <= 10) console.log(`⚠️ 不一致 [${l}][${i}][${j}]：枚举=${grid[l][i][j]} 内置=${embedded[l][i][j]}`);
          }
        }
      }
    }
    if (mismatch === 0) {
      console.log('\n✅ 一致性校验通过：引擎内置 CENGGI_ECE_POWER_GRID 与实时全枚举完全一致（5×20×20 网格）');
    } else {
      console.log(`\n❌ ${mismatch} 个格子不一致——规则已改动，需用本次枚举结果更新 lib/bazi.js 的 CENGGI_ECE_POWER_GRID！`);
      console.log('新表：');
      console.log(JSON.stringify(grid));
      process.exitCode = 1;
    }
  }
}

main();
