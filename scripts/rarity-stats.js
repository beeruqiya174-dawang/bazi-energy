/**
 * 稀有度真实分布计算 —— 全排列组合枚举
 *
 * 原理：四柱命盘的合法组合总数是确定的：
 *   年柱 60（干支同阳阴配对）× 月支 12（月干由五虎遁唯一确定）
 *   × 日柱 60 × 时支 12（时干由五鼠遁唯一确定）
 *   = 518,400 个不同命盘。
 *
 * 对每一个命盘跑确定性引擎，统计 (格局力度 × 做工系统数) 的真实分布，
 * 得到各稀有度档位的精确概率——不是拍脑袋查表，是算出来的。
 *
 * 运行：node scripts/rarity-stats.js
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
  const total = 60 * 12 * 60 * 12;
  console.log(`合法命盘总数（排列组合）：${total.toLocaleString()}`);

  // 统计器
  const tier = { '0': 0, '1': 0, '2': 0, '3+': 0 };            // 做工系统数
  const tierDage = { '0': 0, '1': 0, '2': 0, '3+': 0 };         // 其中大格
  const gejuliDist = { '大格': 0, '中格': 0, '弱格': 0 };
  const gejuMingDist = {};
  const xiduyouDist = {};
  const cellDist = {};                                           // gejuli|nSystems 联合分布
  let count = 0;
  const t0 = Date.now();

  for (const yp of pillars60) {                 // 年柱 60
    const ys = TG.indexOf(yp.tg);
    for (let mb = 0; mb < 12; mb++) {           // 月支 12（月干五虎遁确定）
      const ms = monthStem(ys, mb);
      const mp = { tg: ms, dz: DZ[mb] };
      for (const dp of pillars60) {             // 日柱 60
        const ds = TG.indexOf(dp.tg);
        for (let hb = 0; hb < 12; hb++) {       // 时支 12（时干五鼠遁确定）
          const hs = hourStem(ds, hb);
          const sp = { tg: hs, dz: DZ[hb] };
          const { result } = BaziEngine.analyze({ n: yp, y: mp, r: dp, s: sp });

          const n = result.xitong_list.length;
          const key = n >= 3 ? '3+' : String(n);
          tier[key]++;
          if (result.gejuli === '大格') tierDage[key]++;
          gejuliDist[result.gejuli]++;
          gejuMingDist[result.gejuming] = (gejuMingDist[result.gejuming] || 0) + 1;
          xiduyouDist[result.xiduyou] = (xiduyouDist[result.xiduyou] || 0) + 1;
          const ck = result.gejuli + '|' + n;
          cellDist[ck] = (cellDist[ck] || 0) + 1;
          count++;
        }
      }
    }
  }

  const pct = (x) => (100 * x / count).toFixed(4) + '%';
  const ms = Date.now() - t0;
  console.log(`枚举完成：${count.toLocaleString()} 个命盘，耗时 ${(ms / 1000).toFixed(1)}s\n`);

  console.log('══ 工况分布（V5.5 旧查表 vs 真实计算）══');
  console.log('档位                 旧查表值      真实占比      命盘数');
  const rows = [
    ['大格 + ≥2系统', '前0.1%', tierDage['2'] + tierDage['3+'], '千里挑一'],
    ['≥2系统(非大格)', '约1%',  tier['2'] + tier['3+'] - tierDage['2'] - tierDage['3+'], '极稀有'],
    ['恰1系统',        '约3%-5%', tier['1'], '稀有'],
    ['0系统',          '约20%',  tier['0'], '基础'],
  ];
  for (const [name, lookup, real] of rows) {
    console.log(`${name.padEnd(18)} ${lookup.padEnd(12)} ${pct(real).padEnd(12)} ${real.toLocaleString()}`);
  }

  console.log('\n══ 交叉验证：按当前 xiduyou 输出分桶 ══');
  for (const [k, v] of Object.entries(xiduyouDist)) console.log(`${pct(v).padEnd(10)} ${v.toLocaleString().padStart(8)}  ${k}`);

  console.log('\n══ 格局力度分布 ══');
  for (const [k, v] of Object.entries(gejuliDist)) console.log(`${k}：${pct(v)}（${v.toLocaleString()}）`);

  console.log('\n══ 十格分布 ══');
  for (const [k, v] of Object.entries(gejuMingDist).sort((a, b) => b[1] - a[1])) {
    console.log(`${k}：${pct(v)}（${v.toLocaleString()}）`);
  }

  // 大格&2系统以上的人群前占比（从高到低累计）
  const dage2 = tierDage['2'] + tierDage['3+'];
  const ge2 = tier['2'] + tier['3+'];
  console.log('\n══ 关键累计占比（"人群前X%"的严格含义）══');
  console.log(`达到 ≥2 系统（含大格）：前 ${(100 * ge2 / count).toFixed(3)}%`);
  console.log(`大格 + ≥2 系统：      前 ${(100 * dage2 / count).toFixed(3)}%`);
  console.log(`至少 1 系统：         前 ${(100 * (count - tier['0']) / count).toFixed(2)}%`);

  // ══ 一致性校验：实时枚举 vs 引擎内置 RARITY_COUNTS ══
  const embedded = BaziEngine.RARITY_COUNTS;
  if (embedded) {
    let mismatch = 0;
    const keys = new Set([...Object.keys(cellDist), ...Object.keys(embedded)]);
    for (const k of keys) {
      const live = cellDist[k] || 0;
      const emb = embedded[k] || 0;
      if (live !== emb) {
        mismatch++;
        console.log(`\n⚠️ 不一致 ${k}：枚举=${live} 内置=${emb}`);
      }
    }
    if (mismatch === 0) {
      console.log('\n✅ 一致性校验通过：引擎内置 RARITY_COUNTS 与实时全枚举完全一致（' + keys.size + ' 个格子）');
    } else {
      console.log(`\n❌ ${mismatch} 个格子不一致——规则已改动，需用本次枚举结果更新 lib/bazi.js 的 RARITY_COUNTS！`);
      process.exitCode = 1;
    }
  }
}

main();
