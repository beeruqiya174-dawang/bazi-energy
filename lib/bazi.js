'use strict';

/**
 * 能量图谱 · 八字计算引擎 V5.5（确定性规则实现）
 *
 * 依据 references/calculation-rules.md（V5.5 规则集）逐条代码化：
 *   一、基础对照表（子=癸水，亥=壬水；藏干完整表）
 *   二、十神判断
 *   三、能量计算公式（权重×衰减×天干系数）
 *   四、十神来源：地支主气 + 天干分开列出
 *   五、日主强弱判断（藏干算根）
 *   六、地支状态（已显化/潜力/空白）与 renqun 固定查表
 *   七、格局三层结构（底色·做工系统·力度）
 *   八、格局稀有度——基于全排列组合枚举的真实概率分布（518,400 种命盘）
 *
 * 零依赖、纯函数、毫秒级。可在 Node（Vercel）与浏览器中共同使用。
 */

// ── 一、基础对照表 ──────────────────────────────────────────
const TG_XY = {
  '甲': ['木', 1], '乙': ['木', 0], '丙': ['火', 1], '丁': ['火', 0],
  '戊': ['土', 1], '己': ['土', 0], '庚': ['金', 1], '辛': ['金', 0],
  '壬': ['水', 1], '癸': ['水', 0]
};

// 地支主气（V5.5 修正：子=癸水，亥=壬水）
const DZ_ZHUQI = {
  '子': '癸', '丑': '己', '寅': '甲', '卯': '乙', '辰': '戊', '巳': '丙',
  '午': '丁', '未': '己', '申': '庚', '酉': '辛', '戌': '戊', '亥': '壬'
};

// 地支完整藏干表（判断"是否有根/空白"必须查这张表，不能只看主气）
const DZ_CANGGAN = {
  '子': ['癸'],
  '丑': ['己', '癸', '辛'],
  '寅': ['甲', '丙', '戊'],
  '卯': ['乙'],
  '辰': ['戊', '乙', '癸'],
  '巳': ['丙', '庚', '戊'],
  '午': ['丁', '己'],
  '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'],
  '酉': ['辛'],
  '戌': ['戊', '辛', '丁'],
  '亥': ['壬', '甲']
};

const DZ_YY = {
  '子': 1, '丑': 0, '寅': 1, '卯': 0, '辰': 1, '巳': 0,
  '午': 1, '未': 0, '申': 1, '酉': 0, '戌': 1, '亥': 0
};

const SHENG = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
const KE = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };
const WX_LIST = ['木', '火', '土', '金', '水'];

// 地支权重：月令45% 时支30% 日支15% 年支10%
const PILLAR_WEIGHT = { n: 0.10, y: 0.45, r: 0.15, s: 0.30 };
const PILLAR_NAME = { n: '年柱', y: '月柱', r: '日柱', s: '时柱' };
const PILLAR_POS = { n: '年支', y: '月令', r: '日支', s: '时支' };

// 天干五合（持续稳定）与六冲（脉冲爆发）
const TG_HE = [['甲', '己'], ['乙', '庚'], ['丙', '辛'], ['丁', '壬'], ['戊', '癸']];
const TG_CHONG = [['甲', '庚'], ['乙', '辛'], ['丙', '壬'], ['丁', '癸']];

// 地支六冲
const DZ_CHONG = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];

// 格局命名白名单（严禁造词）
const GEJU_NAME = {
  '正官': '正官格', '七杀': '七杀格', '正印': '正印格', '偏印': '偏印格',
  '食神': '食神格', '伤官': '伤官格', '正财': '正财格', '偏财': '偏财格',
  '比肩': '建禄格', '劫财': '月劫格'
};

const QUDONG = {
  '食神': '输出型', '伤官': '输出型',
  '正财': '掌控型', '偏财': '掌控型', '正官': '掌控型', '七杀': '掌控型',
  '正印': '内核型', '偏印': '内核型', '比肩': '内核型', '劫财': '内核型'
};

// ── 稀有度联合分布（格局力度 × 做工系统数 → 命盘数）──
// 全排列组合枚举结果：60年柱 × 12月支 × 60日柱 × 12时支 = 518,400 个合法命盘，
// 逐个跑本引擎统计所得。用 scripts/rarity-stats.js 可重新枚举校验此表。
const TOTAL_CHARTS = 518400;
const RARITY_COUNTS = {
  '大格|0': 198546, '大格|1': 198350, '大格|2': 59167, '大格|3': 12492, '大格|4': 545,
  '中格|0': 13619,  '中格|1': 7211,   '中格|2': 1387,  '中格|3': 78,    '中格|4': 0,
  '弱格|0': 17198,  '弱格|1': 8290,   '弱格|2': 1478,  '弱格|3': 34,    '弱格|4': 5
};

// 百分数显示：<1% 保留2位小数，<10% 保留1位，其余保留1位
function fmtPct(x) {
  const p = x * 100;
  if (p >= 1) return (Math.round(p * 10) / 10) + '%';
  if (p >= 0.1) return (Math.round(p * 100) / 100) + '%';
  return (Math.round(p * 1000) / 1000) + '%';
}

const round3 = (x) => Math.round(x * 1000) / 1000;

// ── 二、十神判断 ──────────────────────────────────────────
function shishen(dayTG, otherTG) {
  const [dwx, dyy] = TG_XY[dayTG];
  const [owx, oyy] = TG_XY[otherTG];
  const sameYY = dyy === oyy;
  if (owx === dwx) return sameYY ? '比肩' : '劫财';
  if (SHENG[owx] === dwx) return sameYY ? '偏印' : '正印';   // 生我
  if (SHENG[dwx] === owx) return sameYY ? '食神' : '伤官';   // 我生
  if (KE[owx] === dwx) return sameYY ? '七杀' : '正官';      // 克我
  if (KE[dwx] === owx) return sameYY ? '偏财' : '正财';      // 我克
  return '';
}

// 衰减系数（以月令主气五行为基准）
function shuaijian(targetWX, monthWX) {
  if (targetWX === monthWX) return 1.0;         // 同气
  if (SHENG[monthWX] === targetWX) return 0.9;  // 月令所生
  if (SHENG[targetWX] === monthWX) return 0.5;  // 生月令
  if (KE[targetWX] === monthWX) return 0.2;     // 克月令
  if (KE[monthWX] === targetWX) return 0.1;     // 月令所克
  return 0.0;
}

// 天干系数：全盘任意地支（含藏干）同五行=1.0 / 同柱地支（含藏干）生该天干=0.6 / 否则=0.3
// 注意：只看五行，不分阴阳（历史bug：戊己阴阳不同被误判不算透干）
function tianganXishu(tg, samePillarDZ, allBranchElements) {
  const wx = TG_XY[tg][0];
  for (const elems of allBranchElements) {
    if (elems.includes(wx)) return 1.0;
  }
  for (const s of DZ_CANGGAN[samePillarDZ]) {
    if (SHENG[TG_XY[s][0]] === wx) return 0.6;
  }
  return 0.3;
}

// ── 输入解析 ─────────────────────────────────────────────
// 支持格式："年柱甲寅 月柱己巳 日柱丙子 时柱壬辰" / "甲寅 己巳 丙子 壬辰"
function parseBazi(input) {
  if (!input || typeof input !== 'string') return null;
  const chars = input.match(/[甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥]/g);
  if (!chars || chars.length !== 8) return null;
  const order = ['n', 'y', 'r', 's'];
  const pillars = {};
  for (let i = 0; i < 4; i++) {
    const tg = chars[i * 2];
    const dz = chars[i * 2 + 1];
    if (!TG_XY[tg] || !DZ_ZHUQI[dz]) return null;
    pillars[order[i]] = { tg, dz };
  }
  return pillars;
}

// ── 主分析函数 ────────────────────────────────────────────
function analyze(pillarsInput) {
  const pillars = typeof pillarsInput === 'string' ? parseBazi(pillarsInput) : pillarsInput;
  if (!pillars || !pillars.n || !pillars.y || !pillars.r || !pillars.s) {
    throw new Error('八字输入无效：需要四柱天干地支共8个字');
  }

  const dayTG = pillars.r.tg;
  const [dayWX, dayYY] = TG_XY[dayTG];
  const monthDZ = pillars.y.dz;
  const monthWX = TG_XY[DZ_ZHUQI[monthDZ]][0];

  // 强制核对流程：先逐一列出四柱完整藏干（CANGGAN_QINGDIAN）
  const allBranchElements = ['n', 'y', 'r', 's'].map((k) =>
    DZ_CANGGAN[pillars[k].dz].map((s) => TG_XY[s][0])
  );
  const everyElement = [].concat(...allBranchElements);

  const calcLines = [];
  calcLines.push('【藏干清点】');
  ['n', 'y', 'r', 's'].forEach((k) => {
    calcLines.push(`${PILLAR_NAME[k]}${pillars[k].tg}${pillars[k].dz}：藏干 ${DZ_CANGGAN[pillars[k].dz].join('、')}`);
  });

  // ── 三、能量计算 ──
  const dizhiMingxi = [];
  const wuxing = { '火': 0, '土': 0, '木': 0, '水': 0, '金': 0 };

  ['n', 'y', 'r', 's'].forEach((k) => {
    const { tg, dz } = pillars[k];
    const zhuqi = DZ_ZHUQI[dz];
    const ewx = TG_XY[zhuqi][0];
    const weight = PILLAR_WEIGHT[k];
    const sj = shuaijian(ewx, monthWX);
    const tx = tianganXishu(tg, dz, allBranchElements);
    const defen = round3(weight * sj * tx);
    wuxing[ewx] = round3(wuxing[ewx] + defen);
    dizhiMingxi.push({
      zhu: PILLAR_POS[k],
      dizhi: dz,
      wuxing: ewx,
      quanzhong: weight,
      shuaijian: sj,
      tianganxi: tx,
      defen,
      shishen: shishen(dayTG, zhuqi),
      zhuangtai: '',
      renqun: ''
    });
    calcLines.push(`【${PILLAR_POS[k]}${dz}】主气${zhuqi}(${ewx}) 权重${weight} 衰减${sj} 天干系数${tx} 得分=${defen}`);
  });

  const nengliangLiyong = round3(Object.values(wuxing).reduce((a, b) => a + b, 0));
  const neihaoZhi = round3(Math.max(0, 1 - nengliangLiyong));
  let neihaoDengji;
  if (neihaoZhi <= 0.10) neihaoDengji = '低内耗';
  else if (neihaoZhi <= 0.25) neihaoDengji = '中内耗';
  else if (neihaoZhi <= 0.40) neihaoDengji = '高内耗';
  else neihaoDengji = '极高内耗';
  calcLines.push(`【能量利用率】${nengliangLiyong} 内耗=${neihaoZhi}（${neihaoDengji}）`);

  // ── 六、地支状态与 renqun 固定查表 ──
  const stemList = ['n', 'y', 'r', 's'].map((k) => pillars[k].tg);
  const hasStemOfElement = (wx) => stemList.some((tg) => TG_XY[tg][0] === wx);

  dizhiMingxi.forEach((d) => {
    const revealed = hasStemOfElement(d.wuxing); // 天干透出（含日主）；有根由该地支自身保证
    d.zhuangtai = revealed ? '已显化' : '潜力';
    d.renqun = revealed ? (d.wuxing === '土' ? '前50%' : '前30%') : '待激活';
  });

  // ── 四、十神列表：地支主气 + 天干分开列出 ──
  const shishenList = [];
  dizhiMingxi.forEach((d) => {
    shishenList.push({
      laiyuan: '地支主气', zhu: d.zhu, gan: DZ_ZHUQI[d.dizhi],
      shishen: d.shishen, defen: d.defen,
      zhuangtai: d.zhuangtai, jihuo: '无', jihuo_type: '',
      renqun: d.renqun, shiji_nengli: d.zhuangtai === '已显化' ? '强' : '待激活'
    });
  });
  // 天干透出十神（仅当有根时计入；日主本身除外）
  const stemHasRoot = (tg) => everyElement.includes(TG_XY[tg][0]);
  ['n', 'y', 'r', 's'].forEach((k) => {
    const tg = pillars[k].tg;
    if (tg === dayTG) return;
    if (!stemHasRoot(tg)) return;
    const wx = TG_XY[tg][0];
    shishenList.push({
      laiyuan: '天干透出', zhu: PILLAR_NAME[k] + '干', gan: tg,
      shishen: shishen(dayTG, tg), defen: 0,
      zhuangtai: '已显化', jihuo: '无', jihuo_type: '',
      renqun: wx === '土' ? '前50%' : '前30%', shiji_nengli: '强'
    });
  });
  calcLines.push('【十神】' + shishenList.map((s) => `${s.zhu}${s.gan}=${s.shishen}${s.defen ? '(' + s.defen + ')' : ''}`).join(' / '));

  // ── 空白五行：既无天干也无地支（含藏干）──
  const kongbai = WX_LIST.filter((wx) => !hasStemOfElement(wx) && !everyElement.includes(wx));
  if (kongbai.length) calcLines.push('【空白五行】' + kongbai.join('、') + '（真正缺失）');

  // ── 五、日主强弱（藏干算根，独立维度）──
  let strongRoots = 0, weakRoots = 0;
  ['n', 'y', 'r', 's'].forEach((k) => {
    const cg = DZ_CANGGAN[pillars[k].dz];
    cg.forEach((s, idx) => {
      if (TG_XY[s][0] === dayWX) {
        if (idx === 0) strongRoots++; else weakRoots++;
      }
    });
  });
  let rizhuQiangruo;
  if (strongRoots >= 2 || (strongRoots >= 1 && weakRoots >= 2)) rizhuQiangruo = '身强';
  else if (strongRoots === 1 || (strongRoots === 0 && weakRoots >= 2)) rizhuQiangruo = '中和';
  else rizhuQiangruo = '身弱';
  calcLines.push(`【日主${dayTG}${dayWX}】强根${strongRoots} 弱根${weakRoots} → ${rizhuQiangruo}`);

  // ── 七、第一层：格局底色 ──
  const monthEntry = dizhiMingxi.find((d) => d.zhu === '月令');
  const gejuShishen = monthEntry.shishen;
  const gejuming = GEJU_NAME[gejuShishen];
  const qudongmoshi = QUDONG[gejuShishen];
  let gejuli;
  if (monthEntry.defen >= 0.35) gejuli = '大格';
  else if (monthEntry.defen >= 0.20) gejuli = '中格';
  else gejuli = '弱格';
  calcLines.push(`【格局】月令${monthDZ}主气${DZ_ZHUQI[monthDZ]}对日主=${gejuShishen} → ${gejuming}（${gejuli}，月令得分${monthEntry.defen}）`);

  // ── 第二层：做工系统 ──
  // 先识别天干合冲（合绊：参与合的天干不再计入生克主线）
  const stemInfo = ['n', 'y', 'r', 's'].map((k) => {
    const tg = pillars[k].tg;
    return {
      key: k, tg,
      shishen: tg === dayTG ? '比肩' : shishen(dayTG, tg),
      wx: TG_XY[tg][0],
      energy: wuxing[TG_XY[tg][0]],
      isDayMaster: tg === dayTG,
      rooted: tg === dayTG || stemHasRoot(tg),
      tied: false
    };
  });

  const gongzuoHe = [];
  const gongzuoChongTG = [];
  const gongzuoChongDZ = [];

  const findPair = (a, b) => {
    const i = stemInfo.findIndex((s) => s.tg === a);
    const j = stemInfo.findIndex((s) => s.tg === b);
    return (i >= 0 && j >= 0 && i !== j) ? [stemInfo[i], stemInfo[j]] : null;
  };

  // 天干五合
  for (const [a, b] of TG_HE) {
    const pair = findPair(a, b);
    if (!pair) continue;
    pair[0].tied = true; pair[1].tied = true;
    const [hi, lo] = pair[0].energy >= pair[1].energy ? [pair[0], pair[1]] : [pair[1], pair[0]];
    const names = pair.map((p) => p.shishen);
    const cls = classifyHeChong(names, 'he');
    gongzuoHe.push({
      zuhe: `${a}${b}`, gaoneng_ss: hi.shishen, dineng_ss: lo.shishen,
      fuzhetezhi: cls.desc
    });
    if (cls.system) calcLines.push(`【天干合】${a}${b}合（${names.join('×')}）→ ${cls.system}：高能${hi.shishen}带动低能${lo.shishen}，持续稳定`);
  }
  // 天干六冲
  for (const [a, b] of TG_CHONG) {
    const pair = findPair(a, b);
    if (!pair) continue;
    const [hi, lo] = pair[0].energy >= pair[1].energy ? [pair[0], pair[1]] : [pair[1], pair[0]];
    const names = pair.map((p) => p.shishen);
    const cls = classifyHeChong(names, 'chong');
    gongzuoChongTG.push({
      zuhe: `${a}${b}`, zhudong_ss: hi.shishen, beidong_ss: lo.shishen,
      biaoxian: cls.desc
    });
    if (cls.system) calcLines.push(`【天干冲】${a}${b}冲（${names.join('×')}）→ ${cls.system}：强方${hi.shishen}冲击弱方${lo.shishen}，脉冲爆发`);
  }
  // 地支六冲
  const dzList = ['n', 'y', 'r', 's'].map((k) => pillars[k].dz);
  for (const [a, b] of DZ_CHONG) {
    const i = dzList.indexOf(a);
    const j = dzList.indexOf(b);
    if (i >= 0 && j >= 0 && i !== j) {
      gongzuoChongDZ.push({
        zuhe: `${a}${b}`,
        yingxiang: `${PILLAR_POS[Object.keys(PILLAR_POS)[i]]}与${PILLAR_POS[Object.keys(PILLAR_POS)[j]]}相冲，地支做工受压，能量不稳定`
      });
      calcLines.push(`【地支冲】${a}${b}冲：地支做工受压`);
    }
  }

  // 生克主线（第一层做工系统判断）
  const S = (shishenSet) => {
    if (shishenSet.includes(gejuShishen)) return true; // 月令主气即格局之星，天然有根
    return stemInfo.some((s) =>
      !s.isDayMaster && !s.tied && s.rooted && shishenSet.includes(s.shishen)
    );
  };
  const hasCai = S(['正财', '偏财']);
  const hasGuan = S(['正官', '七杀']);
  const hasYin = S(['正印', '偏印']);
  const hasSha = S(['七杀']);
  const hasZhengGuan = S(['正官']);
  const hasShi = S(['食神']);
  const hasShang = S(['伤官']);

  const shengkeZhuxian = [];
  const mainlineSystems = [];
  if (hasCai && hasGuan && hasYin) {
    shengkeZhuxian.push('财生官', '官生印', '财官印顺生');
    mainlineSystems.push('财官印顺生');
  } else {
    if (hasCai && hasGuan) { shengkeZhuxian.push('财生官'); mainlineSystems.push('财生官'); }
    if (hasGuan && hasYin) {
      if (hasSha && !hasZhengGuan) { shengkeZhuxian.push('杀印相生'); mainlineSystems.push('杀印相生'); }
      else if (!hasSha) { shengkeZhuxian.push('官印相生'); mainlineSystems.push('官印相生'); }
      else { shengkeZhuxian.push('官印相生'); mainlineSystems.push('官印相生'); }
    }
    if (hasCai && hasYin && !hasGuan) { shengkeZhuxian.push('财印双清'); mainlineSystems.push('财印双清'); }
  }
  if (hasShi && hasSha) { shengkeZhuxian.push('食神制杀'); mainlineSystems.push('食神制杀'); }
  if (hasShang && hasCai) { shengkeZhuxian.push('伤官生财'); mainlineSystems.push('伤官生财'); }
  else if (hasShi && hasCai && !hasSha) shengkeZhuxian.push('食伤生财（输出变现）');
  if (hasSha && hasYin && !mainlineSystems.includes('杀印相生') && !mainlineSystems.includes('财官印顺生') && !(hasZhengGuan && mainlineSystems.includes('官印相生'))) {
    shengkeZhuxian.push('杀印相生'); mainlineSystems.push('杀印相生');
  }
  if (shengkeZhuxian.length) calcLines.push('【生克主线】' + shengkeZhuxian.join(' → '));

  // 汇总做工系统（命名白名单去重）
  const heChongSystems = []
    .concat(gongzuoHe.map((g) => classifyHeChong([g.gaoneng_ss, g.dineng_ss], 'he').system))
    .concat(gongzuoChongTG.map((g) => classifyHeChong([g.zhudong_ss, g.beidong_ss], 'chong').system))
    .filter(Boolean);
  const xitongList = [...new Set([...mainlineSystems, ...heChongSystems])];
  calcLines.push('【做工系统】' + (xitongList.length ? xitongList.join(' + ') : '无'));

  // ── 八、稀有度：基于全排列组合枚举的真实概率 ──
  // 合法命盘总数 = 60年柱 × 12月支(月干五虎遁唯一确定) × 60日柱 × 12时支(时干五鼠遁唯一确定) = 518,400。
  // 对每一个命盘跑本引擎，统计 (格局力度 × 做工系统数) 的联合分布，得到下表。
  // 由 scripts/rarity-stats.js 全枚举生成并校验，非拍脑袋估值。
  const n = xitongList.length;
  const cellCount = RARITY_COUNTS[gejuli + '|' + n] || 0;
  const share = cellCount / TOTAL_CHARTS;
  // 累计占比 = 比该组合更稀有（含自身）的人群比例，即严格的"人群前X%"
  const cum = Object.values(RARITY_COUNTS)
    .filter((c) => c <= cellCount)
    .reduce((a, c) => a + c, 0) / TOTAL_CHARTS;

  let tier;
  if (cum < 0.0002) tier = '万里挑一';
  else if (cum < 0.002) tier = '千里挑一';
  else if (cum < 0.05) tier = '极稀有';
  else if (cum < 0.15) tier = '稀有';
  else if (cum < 0.40) tier = '少见';
  else tier = '常见';

  let xiduyou;
  if (cum >= 0.995) {
    xiduyou = `属于人群中最常见的格局区间（该组合在518,400种命盘中占${fmtPct(share)}）`;
  } else {
    xiduyou = `属于人群前${fmtPct(cum)}的${tier}格局（该组合在518,400种命盘中占${fmtPct(share)}）`;
  }
  const xiduyouData = {
    gejuli, xitong_shu: n, dengji: tier,
    zhanbi: Math.round(share * 10000) / 10000,
    qianfenbi: Math.round(cum * 10000) / 10000,
    mingpan_zongshu: TOTAL_CHARTS
  };
  calcLines.push(`【稀有度】组合占${fmtPct(share)}，人群前${fmtPct(cum)}（${tier}，全枚举518,400盘）`);

  const wanZhengGeju = [gejuming, ...xitongList].join('·');

  // ── 内耗来源（确定性描述）──
  const neihaoParts = [];
  dizhiMingxi.forEach((d) => {
    if (d.shuaijian <= 0.2 && d.defen < 0.3) {
      const rel = d.shuaijian === 0.2 ? '克月令' : '被月令所克';
      neihaoParts.push(`${d.zhu}${d.dizhi}（${d.wuxing}）${rel}，能量对冲受阻`);
    }
  });
  if (gongzuoChongDZ.length) neihaoParts.push('地支相冲加剧不稳');
  const neihaoYuanyin = neihaoParts.length
    ? neihaoParts.join('；')
    : '能量流转顺畅，内耗主要来自结构性衰减';

  const result = {
    rizhu: `${dayTG} · ${dayYY ? '阳' : '阴'}${dayWX}`,
    rizhu_tian: dayTG,
    rizhu_qiangruo: rizhuQiangruo,
    gejuming,
    qudongmoshi,
    gejuli,
    wanzheng_geju: wanZhengGeju,
    xiduyou,
    xiduyou_data: xiduyouData,
    dizhi_mingxi: dizhiMingxi,
    wuxing,
    shishen_list: shishenList,
    nengliang_liyong: nengliangLiyong,
    neihao: { zhi: neihaoZhi, dengji: neihaoDengji, yuanyin: neihaoYuanyin },
    kongbai,
    shengke_zhuxian: shengkeZhuxian,
    xitong_list: xitongList,
    gongzuo: { he: gongzuoHe, chong_tg: gongzuoChongTG, chong_dz: gongzuoChongDZ },
    jieda: '' // 叙事层填充
  };

  return { calc: calcLines.join('\n'), result };
}

// 合冲对 → 做工系统命名（白名单：伤官佩印/杀制群比/食神制杀/官印相生/财生官/财官印顺生/财印双清/伤官生财）
function classifyHeChong(names, type) {
  const has = (arr) => arr.some((n) => names.includes(n));
  const shang = has(['伤官', '食神']);
  const yin = has(['正印', '偏印']);
  const sha = has(['七杀']);
  const bijian = has(['比肩', '劫财']);
  const cai = has(['正财', '偏财']);

  if (shang && yin && names.includes('伤官')) {
    return { system: '伤官佩印', desc: '伤官佩印 · 合激活：持续稳定，洞察力与创造力并存' };
  }
  if (shang && sha && names.includes('食神')) {
    return { system: '食神制杀', desc: '食神制杀 · 技术制压，果敢行动' };
  }
  if (names.includes('伤官') && cai) {
    return { system: '伤官生财', desc: '伤官生财 · 爆发力极强的输出变现' };
  }
  if (sha && bijian && type === 'chong') {
    return { system: '杀制群比', desc: '杀制群比 · 冲激活：脉冲爆发，遇强则强' };
  }
  if (sha && bijian && type === 'he') {
    return { system: null, desc: '杀与比劫合动 · 持续稳定的压力转化' };
  }
  if (shang && yin) {
    return { system: null, desc: '食神与印星联动 · 持续稳定' };
  }
  return {
    system: null,
    desc: type === 'he' ? '合激活 · 高能量持续带动低能量，复合特质显现' : '冲激活 · 应激爆发，遇强则强'
  };
}

const BaziEngine = { analyze, parseBazi, shishen, DZ_CANGGAN, DZ_ZHUQI, RARITY_COUNTS, TOTAL_CHARTS };

// CommonJS（Vercel / Node 测试）/ 浏览器全局 双兼容
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaziEngine;
}
if (typeof window !== 'undefined') {
  window.BaziEngine = BaziEngine;
}
