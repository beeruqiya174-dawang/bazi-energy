// 验证乙卯盘（用户盘）在全枚举 518,400 盘中的分位
// 标尺：千人企业 CEO / 年薪 5 百万 / 50 岁
const Bazi = require('/Users/ruirongwang/WorkBuddy/2026-09-05-05-56-02/bazi-energy/lib/bazi.js');

const G = 20;
const grid = Bazi.CENGGI_ECE_YOUXIAO_GRID;
const total = 518400;

const dom = (l, e, p) => {
  let c = 0;
  for (let b = l; b < 5; b++) for (let j = e; j < G; j++) for (let k = p; k < G; k++) c += grid[b][j][k];
  return c;
};

// ── 用户盘实算值 ──
const r = Bazi.analyze('乙卯 丙戌 戊子 庚申').result;
const c = r.zhuanhua_cengci;
const e = Math.min(G - 1, Math.floor(r.zhuanhua_xiaolv * G));
const p = Math.min(G - 1, Math.floor(Math.min(1, r.xiduyou_data.youxiao_gonglv) * G));

console.log('══ 乙卯（用户盘）实算值 ══');
console.log('日主=' + r.rizhu + '  五行=' + Object.keys(r.wuxing).map(k=>k+':'+r.wuxing[k].toFixed(3)).join(' '));
console.log('根气=' + r.genqi_cengci.genqi + '（×' + r.genqi_cengci.xishu + (r.genqi_cengci.congge ? '，从格特判' : '') + '）');
console.log('转化层次=' + c.cengci + ' (代码' + c.cengci_fen + ')');
console.log('世俗流=' + c.shisu_liu + '  内在流=' + c.neizai_liu + '  占比=' + c.shisu_zhanbi);
console.log('克边通过=' + c.ke_liu + '  克边耗散=' + c.ke_sunhao);
console.log('财生官滋养量=' + c.ziyang_liang + '  滋养后官桶=' + c.ziyang_guan_hou);
console.log('转化功率=' + r.zhuanhua_nengliang + '  ECE=' + r.zhuanhua_xiaolv + '  有效功率=' + r.xiduyou_data.youxiao_gonglv);
console.log('档次=' + r.xiduyou_data.dengji + '  前' + (r.xiduyou_data.toubu_zhanbi * 100).toFixed(2) + '%');
console.log('网格 bin: 层次=' + c.cengci_fen + '  ECE[' + e + '/20]=' + (e/G).toFixed(2) + '~' + ((e+1)/G).toFixed(2) + '  有效功率[' + p + '/20]=' + (p/G).toFixed(2) + '~' + ((p+1)/G).toFixed(2));

const cengciNames = ['未转化', '内在', '财富', '官贵', '双全'];
console.log('\n══ 乙卯盘的「头部占比」（同时 ≥ 层次 AND ≥ ECE AND ≥ 有效功率 的盘数）══');
console.log(cengciNames[c.cengci_fen] + ' · ECE≥' + r.zhuanhua_xiaolv.toFixed(3) + ' · 有效功率≥' + r.xiduyou_data.youxiao_gonglv.toFixed(3) + ':');
const headExact = dom(c.cengci_fen, e, p);
const headFloor = dom(c.cengci_fen, e + 1, p + 1);
console.log('  含同档（≥该 bin）: ' + headExact.toLocaleString() + ' 盘 / ' + (100*headExact/total).toFixed(3) + '%  ← 用户实际所在分位');
console.log('  严格更高一档:      ' + headFloor.toLocaleString() + ' 盘 / ' + (100*headFloor/total).toFixed(3) + '%');

// 层次 × 有效功率段 矩阵
console.log('\n══ 转化层次 × 有效功率段（518,400 盘细分）══');
const segs = [[0,1],[1,4],[4,10],[10,16],[16,20]];
const segNames = ['极低(0-0.05)','低(0.05-0.2)','中(0.2-0.5)','高(0.5-0.8)','极高(0.8-1.0)'];
console.log('层次 \\ 功率段      ' + segNames.map(n => n.padStart(14)).join(' '));
for (let l = 0; l < 5; l++) {
  let row = cengciNames[l].padEnd(8) + ' ';
  for (const [a,b] of segs) {
    let cnt = 0;
    for (let i = 0; i < G; i++) for (let k = a; k < b; k++) cnt += grid[l][i][k];
    row += (cnt.toString().padStart(8) + ' (' + (100*cnt/total).toFixed(2).padStart(5) + '%)').padStart(14) + ' ';
  }
  console.log(row);
}

// 关键：成功大小标尺
console.log('\n══ 「官贵+双全 + 有效功率≥k」累计占比（事业层标尺）══');
const bands = [0.05, 0.10, 0.20, 0.30, 0.50, 0.80];
for (const thr of bands) {
  let c = 0;
  for (let l = 3; l < 5; l++) for (let i = 0; i < G; i++) for (let k = 0; k < G; k++) {
    if (k/G >= thr) c += grid[l][i][k];
  }
  const tag = thr <= 0.08 ? ' ← 用户所在档(0.076)' : (thr <= 0.20 ? ' ≈ 中等事业' : (thr <= 0.50 ? ' ≈ 行业精英' : ' ≈ 顶层'));
  console.log('  官贵+双全 & 有效功率≥' + thr.toFixed(2) + ': ' + c.toLocaleString().padStart(8) + ' 盘 (' + (100*c/total).toFixed(2) + '%)' + tag);
}

console.log('\n══ 「双全 + 有效功率≥k」累计占比（财官双通道皆开）══');
for (const thr of bands) {
  let c = 0;
  for (let l = 4; l < 5; l++) for (let i = 0; i < G; i++) for (let k = 0; k < G; k++) {
    if (k/G >= thr) c += grid[l][i][k];
  }
  console.log('  双全 & 有效功率≥' + thr.toFixed(2) + ': ' + c.toLocaleString().padStart(8) + ' 盘 (' + (100*c/total).toFixed(2) + '%)');
}

console.log('\n══ 「官贵+双全 + ECE≥k」累计占比（看转化效率）══');
for (const thr of [0.05, 0.10, 0.20, 0.30, 0.50, 0.80]) {
  let c = 0;
  for (let l = 3; l < 5; l++) for (let i = 0; i < G; i++) for (let k = 0; k < G; k++) {
    if (i/G >= thr) c += grid[l][i][k];
  }
  const tag = thr <= 0.10 ? ' ← 用户 ECE 0.079 所在档' : '';
  console.log('  官贵+双全 & ECE≥' + thr.toFixed(2) + ': ' + c.toLocaleString().padStart(8) + ' 盘 (' + (100*c/total).toFixed(2) + '%)' + tag);
}

// 时间维度：50 岁抵达
console.log('\n══ 时间维度：50 岁抵达意味着什么 ══');
console.log('静态（命盘一辈子能到的高度）:');
console.log('  - 官贵 + 有效功率≥0.076: ' + (100*byPowerAt(0.076, 3)/total).toFixed(2) + '%  ← 用户的「事业天花板」');
console.log('  - 官贵 + 有效功率≥0.50:   ' + (100*byPowerAt(0.50, 3)/total).toFixed(2) + '%  ← 千人企业 CEO 静态底');
console.log('  - 双全 + 有效功率≥0.50:   ' + (100*byPowerAt(0.50, 4)/total).toFixed(2) + '%  ← 顶级 CEO 静态底');
console.log('动态（30~50 岁流年大运放大）:');
console.log('  - 大运十年一换，50 年 5 步大运；约 1/3 步能踩中"用神当令"');
console.log('  - 实际抵达率 ≈ 静态分位 × 1/3 × 致动力条件（V7.2：努力能力=盘面函数，见 verify-zhidongli-percentile.js）');
console.log('  - 用户是乙卯（CEO 千人员工+5M 薪）→ 静态候选17.17% ∧ 致动力≥0.231 → 2.99% × 1/3 ≈ 1% 真实抵达');

function byPowerAt(thr, lmin) {
  let c = 0;
  for (let l = lmin; l < 5; l++) for (let i = 0; i < G; i++) for (let k = 0; k < G; k++) {
    if (k/G >= thr) c += grid[l][i][k];
  }
  return c;
}
