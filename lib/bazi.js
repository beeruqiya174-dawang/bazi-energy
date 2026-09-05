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
 *   七、格局三层结构（底色·做工系统·力度，仅描述用）
 *   七点五、能量转化效率 ECE（转化能量/捕获能量）与转化功率
 *   七点六、转化层次（世俗标准：财官双全 > 官贵之途 > 财富之路 > 内在通达 > 未转化）
 *   八、稀有度——层次×ECE×有效功率 三维帕累托（有效功率=转化功率×根气系数：有根1/有气无根0.5/无根无气0/从格特判1；全枚举518,400盘真实分布，格局不参与）
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

// 做工系统 → 参与十神白名单（用于能量转化效率：该十神对应五行的得分计入"转化能量"）
const SYSTEM_SHISHEN = {
  '财官印顺生': ['正财', '偏财', '正官', '七杀', '正印', '偏印'],
  '财生官': ['正财', '偏财', '正官', '七杀'],
  '官印相生': ['正官', '七杀', '正印', '偏印'],
  '杀印相生': ['七杀', '正印', '偏印'],
  '财印双清': ['正财', '偏财', '正印', '偏印'],
  '食神制杀': ['食神', '伤官', '七杀'],
  '食神和官': ['食神', '正官'],   // 食神与正官相辅相成（食神生财、财生官：才华→财富→仕途链条；正官非敌对，故名"和"而非"制"）
  '伤官生财': ['伤官', '食神', '正财', '偏财'],
  '伤官佩印': ['伤官', '食神', '正印', '偏印'],
  '杀制群比': ['七杀', '比肩', '劫财']
};

const QUDONG = {
  '食神': '输出型', '伤官': '输出型',
  '正财': '掌控型', '偏财': '掌控型', '正官': '掌控型', '七杀': '掌控型',
  '正印': '内核型', '偏印': '内核型', '比肩': '内核型', '劫财': '内核型'
};

// ── 能量转化三维联合分布表（转化层次0-4 × ECE × 转化功率 → 命盘数）──
// 全排列组合枚举结果：60年柱 × 12月支(五虎遁) × 60日柱 × 12时支(五鼠遁) = 518,400 个合法命盘，
// 逐个跑本引擎统计所得。5×20×20 网格；第一维 = 转化层次（0未转化/1内在通达/2财富之路/3官贵之途/4财官双全），
// 第二维 = ECE 桶，第三维 = 功率桶，桶宽均 0.05。用 scripts/rarity-stats.js 可重新枚举校验此表。
const TOTAL_CHARTS = 518400;
const CENGGI_ECE_YOUXIAO_GRID = [[[226375,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[[2519,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[738,3323,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[122,1850,397,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[21,429,605,806,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[12,115,601,790,42,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[4,41,140,312,626,114,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[2,43,138,61,545,382,28,0,0,0,0,0,0,0,0,0,0,0,0,0],[3,17,84,46,42,520,60,51,0,0,0,0,0,0,0,0,0,0,0,0],[1,7,119,23,69,90,167,100,86,0,0,0,0,0,0,0,0,0,0,0],[0,8,32,25,31,105,4,75,162,892,0,0,0,0,0,0,0,0,0,0],[1,13,26,20,77,119,14,12,19,1903,0,0,0,0,0,0,0,0,0,0],[1,5,35,10,103,52,13,49,23,1441,91,415,0,0,0,0,0,0,0,0],[0,9,16,8,71,129,13,14,27,1915,94,361,453,0,0,0,0,0,0,0],[2,6,20,15,65,93,13,27,40,1301,92,590,765,0,0,0,0,0,0,0],[0,3,23,8,95,74,14,30,93,1330,72,351,314,28,495,0,0,0,0,0],[2,5,32,16,67,74,14,14,56,854,200,621,452,0,0,356,0,0,0,0],[0,2,19,15,167,39,13,31,51,1032,87,232,629,40,282,756,0,0,0,0],[1,1,24,19,217,147,13,59,23,790,179,399,528,55,42,794,26,415,0,0],[1,1,6,28,233,234,54,69,70,130,241,673,614,72,258,561,34,172,600,0],[9,0,4,11,58,143,130,200,141,83,130,189,216,278,574,627,182,728,695,740]],[[3091,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1054,218,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[33,866,207,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[10,90,665,21,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,28,304,370,38,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,41,30,362,71,125,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[5,38,36,28,178,407,9,0,0,0,0,0,0,0,0,0,0,0,0,0],[2,46,29,25,11,338,46,57,0,0,0,0,0,0,0,0,0,0,0,0],[3,38,66,41,10,31,69,100,95,0,0,0,0,0,0,0,0,0,0,0],[5,18,37,42,3,49,5,77,106,358,0,0,0,0,0,0,0,0,0,0],[1,29,61,34,118,38,14,0,5,1493,0,0,0,0,0,0,0,0,0,0],[8,21,73,43,225,79,8,21,6,1974,165,193,0,0,0,0,0,0,0,0],[1,13,68,36,247,120,14,8,13,2845,526,374,199,0,0,0,0,0,0,0],[9,29,55,80,229,318,41,17,17,2424,407,721,1032,0,0,0,0,0,0,0],[8,8,28,39,276,164,19,33,45,3012,412,662,223,82,276,0,0,0,0,0],[8,21,28,34,235,411,69,10,42,2748,1309,1207,827,0,0,177,0,0,0,0],[10,19,41,31,190,121,96,74,49,3323,768,815,1588,491,485,679,0,0,0,0],[7,11,63,73,273,309,212,180,59,2087,1576,1275,1478,305,364,1667,95,219,0,0],[20,0,18,71,477,628,214,211,156,1402,1202,1143,1696,651,910,1974,486,746,596,0],[39,5,31,105,302,1104,917,905,876,600,1454,1750,2265,2067,1615,2772,1650,2505,2024,1800]],[[3872,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[915,2129,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[184,2194,183,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[40,498,906,260,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[9,78,444,838,26,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[4,68,78,887,140,53,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[6,37,79,39,481,190,13,0,0,0,0,0,0,0,0,0,0,0,0,0],[5,37,54,53,129,299,159,19,0,0,0,0,0,0,0,0,0,0,0,0],[5,36,56,42,38,31,184,57,23,0,0,0,0,0,0,0,0,0,0,0],[3,25,34,30,31,53,8,87,99,315,0,0,0,0,0,0,0,0,0,0],[14,38,48,43,72,56,24,2,3,1196,0,0,0,0,0,0,0,0,0,0],[20,24,61,25,139,64,13,25,4,1328,472,145,0,0,0,0,0,0,0,0],[19,25,62,26,181,113,11,15,14,2246,648,179,158,0,0,0,0,0,0,0],[9,24,79,54,137,157,25,17,38,1926,550,646,844,0,0,0,0,0,0,0],[11,10,67,44,226,147,27,39,50,2493,457,490,355,257,169,0,0,0,0,0],[15,6,78,68,304,358,34,10,41,2148,1389,1115,721,0,0,303,0,0,0,0],[20,4,36,121,371,244,74,58,49,2779,924,709,1332,767,393,627,0,0,0,0],[15,6,26,79,307,700,112,204,43,1974,1797,1344,1419,420,582,1793,272,304,0,0],[10,4,10,54,318,580,335,412,214,1131,1566,1671,1762,927,1183,1597,935,955,648,0],[33,4,17,64,245,815,949,823,831,483,1546,1738,2726,3201,2622,3429,3393,3995,2541,3368]],[[81,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[157,262,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,474,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,178,72,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,7,38,13,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,66,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,4,0,0,7,28,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,1,0,22,7,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,7,0,2,0,26,0,0,0,0,0,0,0,0,0,0,0,0,0],[2,3,5,5,1,0,2,8,8,0,0,0,0,0,0,0,0,0,0,0],[1,7,8,12,1,0,3,0,0,36,0,0,0,0,0,0,0,0,0,0],[4,0,14,15,37,13,2,2,0,27,222,0,0,0,0,0,0,0,0,0],[5,0,11,11,64,16,0,1,2,146,288,0,0,0,0,0,0,0,0,0],[1,0,3,33,7,94,2,5,7,56,406,126,116,0,0,0,0,0,0,0],[4,0,4,4,50,58,10,19,11,70,183,98,134,90,0,0,0,0,0,0],[2,2,14,19,47,225,7,3,8,78,525,492,110,0,0,0,0,0,0,0],[1,4,9,25,41,24,101,12,20,73,518,247,543,521,165,0,0,0,0,0],[9,0,19,27,98,214,130,57,17,82,1021,634,354,185,286,229,124,0,0,0],[7,0,16,33,53,309,76,134,92,116,1205,649,886,602,787,100,491,349,2,0],[27,0,6,67,125,565,1154,1038,977,192,508,1384,2430,2848,2662,2209,3064,2519,973,1425]]];

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

  // ── 五点五、根气层次（担财官的根基：无根者担不起财官）──
  // 有根 = 日主五行藏于任一地支藏干（本气位=强根，中气/余气位=弱根）；
  // 有气无根 = 无根，但印星（生我者）在天干或地支藏干中有实际落点——得生扶之气，以身代根；
  // 无根无气 = 既无根亦无印气，担纲力最弱，财官再旺也压不住。
  const yinEl = WX_LIST.find((w) => SHENG[w] === dayWX); // 生我者为印
  const youGen = (strongRoots + weakRoots) > 0;
  const youYin = hasStemOfElement(yinEl) || everyElement.includes(yinEl);
  let genqiFen = 0, genqi = '无根无气';
  if (youGen) { genqiFen = 2; genqi = '有根'; }
  else if (youYin) { genqiFen = 1; genqi = '有气无根'; }
  let dangan;
  if (genqiFen === 2) dangan = strongRoots >= 2 ? '根深，担纲有力' : '有根，可担财官';
  else if (genqiFen === 1) dangan = '印气代根，担纲打折';
  else dangan = '无根无气，担不起财官';
  calcLines.push(`【根气层次】${genqi}：强根${strongRoots} 弱根${weakRoots}，印星${yinEl}${youYin ? '有落点' : '无落点'} → ${dangan}`);

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
  if (hasShi && hasZhengGuan && !hasSha) { shengkeZhuxian.push('食神和官'); mainlineSystems.push('食神和官'); }
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

  // ── 七点五、能量转化效率（核心量化指标）──
  // 转化链：捕获能量（五行总得分=利用率）→ 其中流入做工系统的部分（转化能量）。
  // 某五行的能量算"已转化" ⟺ 该五行的天干十神参与任一做工系统；
  // 月令主气即格局之星天然有根，若其十神参与系统，月令五行亦计入。
  const participants = new Set();
  xitongList.forEach((name) => (SYSTEM_SHISHEN[name] || []).forEach((s) => participants.add(s)));
  const workingWX = new Set();
  stemInfo.forEach((s) => { if (participants.has(s.shishen)) workingWX.add(s.wx); });
  if (participants.has(gejuShishen)) workingWX.add(monthWX);
  let zhuanhuaNengliang = 0;
  workingWX.forEach((w) => { zhuanhuaNengliang += wuxing[w]; });
  zhuanhuaNengliang = round3(zhuanhuaNengliang);
  const ece = nengliangLiyong > 0 ? Math.min(1, round3(zhuanhuaNengliang / nengliangLiyong)) : 0;
  calcLines.push(`【转化效率】转化能量${zhuanhuaNengliang} / 捕获能量${nengliangLiyong} = ${ece}${xitongList.length ? '' : '（无做工系统，能量未进入转化通道）'}`);

  // ── 七点六、转化层次（世俗标准：财=富路，官杀=贵路）──
  // 已转化的能量分两条性质不同的通道：
  //   世俗通道——财（我克者，利禄）与官杀（克我者，功名），世俗标准以贵为上、富次之；
  //   内在通道——印（才学）、食伤（才艺表达）、比劫（同侪），成就在己不在势位。
  // 层次：财官双全(4) > 官贵之途(3) > 财富之路(2) > 内在通达(1) > 能量未转化(0)。
  // 通道电流判定：只有天干没有地支没有用——财官虚透不开通道；
  //   通道开 = 该五行地支主气有电流，或食伤做工电流注入（伤官生财喂财路/食神制杀喂贵路）。
  const caiEl = KE[dayWX];                          // 我克者为财
  const guanEl = WX_LIST.find((w) => KE[w] === dayWX); // 克我者为官杀
  const shiEl = SHENG[dayWX];                       // 我生者为食伤
  const shishengCai = xitongList.includes('伤官生财');
  const shizhiSha = xitongList.includes('食神制杀');
  const shiDianliu = workingWX.has(shiEl) && wuxing[shiEl] > 0; // 食伤地支电流
  const caiActive = workingWX.has(caiEl) && (wuxing[caiEl] > 0 || (shishengCai && shiDianliu));
  const guanActive = workingWX.has(guanEl) && (wuxing[guanEl] > 0 || (shizhiSha && shiDianliu));
  let cengciFen = 1, cengci = '内在通达';
  if (xitongList.length === 0 || zhuanhuaNengliang === 0) { cengciFen = 0; cengci = '能量未转化'; }
  else if (caiActive && guanActive) { cengciFen = 4; cengci = '财官双全'; }
  else if (guanActive) { cengciFen = 3; cengci = '官贵之途'; }
  else if (caiActive) { cengciFen = 2; cengci = '财富之路'; }
  // 世俗归属（做工归属原则）：能量跟着它流经的做工系统走，而不是只看财官五行本身。
  //   食伤生财 → 食伤能量顺生入财，归财路（有食伤顺生，能量转化效率高，虚透之财亦经由食伤做工显化）；
  //   食神制杀 → 食伤能量扑向官杀，归贵路；
  //   印向系统（官印相生/杀印相生/伤官佩印/财印双清之印）能量流向内在才学，不归世俗；
  //   比劫在杀制群比中是被制服的对象，能量不流向财官，不归世俗。
  // 仅归入已在做工系统内（已转化）且地支有电流的食伤能量，保证 世俗 ≤ 转化 恒成立。
  const worldlyWX = new Set();
  if (caiActive) worldlyWX.add(caiEl);
  if (guanActive) worldlyWX.add(guanEl);
  const shiGuishu = (shishengCai || shizhiSha) && shiDianliu; // 食伤能量归入世俗通道
  if (shiGuishu) worldlyWX.add(shiEl);
  let shisuNengliang = 0;
  worldlyWX.forEach((w) => { shisuNengliang += wuxing[w]; });
  shisuNengliang = round3(shisuNengliang);
  const neizaiNengliang = round3(Math.max(0, zhuanhuaNengliang - shisuNengliang));
  const shisuZhanbi = zhuanhuaNengliang > 0 ? Math.round((shisuNengliang / zhuanhuaNengliang) * 1000) / 1000 : 0;
  const shisuNote = shiGuishu ? `（含食伤${shishengCai ? '顺生归入财路' : '制杀归入贵路'}）` : '';
  calcLines.push(`【转化层次】${cengci}：世俗能量${shisuNengliang}${shisuNote}（占已转化${fmtPct(shisuZhanbi)}）·内在能量${neizaiNengliang}`);

  // ── 八、稀有度：层次×ECE×有效功率 三维帕累托头部占比 ──
  // 根气不是独立维度，而是「承重系数」直接乘在转化功率上：
  //   有效功率 = 转化功率 × 根气系数（有根×1，有气无根×0.5，无根无气×0）
  //   「担不起财官」的数学直译——通道里能量再多，日主实际扛得住的才算数。
  // 从格特判：无根无气 且 财官通道有电流（层次≥财富之路）且 转化功率≥0.5 → 弃命从财官/从财/从杀，系数按1计
  //   双门槛：结构（通道有电流）+ 能量（通道里有真能量流过）。只查结构会把「从得不真」的假从格放进来（功率<0.5、通道名义激活实际无能量）；
  //   只查能量则漏掉单通道从格（从财/从杀与从财官同为弃命，无理由区别对待）。
  //   （子平真诠：从得真者大富大贵——「真」=能量真的在通道里。）
  //   伤官成局生虚透之财：财星无主气电流但食伤电流经做工系统注入财路——从得不假的从财/从儿之局，通道仍算开。
  // 全枚举 518,400 盘的 (层次, ECE, 有效功率) 联合分布内置为 5×20×20 网格。
  // 联合稀有度 = 同时达到「层次≥你 且 效率≥你 且 有效功率≥你」的命盘占比（含同档）。
  const congge = genqiFen === 0 && cengciFen >= 2 && zhuanhuaNengliang >= 0.5;
  const conggeMing = congge ? (cengciFen === 4 ? '从财官' : cengciFen === 3 ? '从杀' : '从财') : '';
  const genqiXishu = genqiFen === 2 ? 1 : genqiFen === 1 ? 0.5 : (congge ? 1 : 0);
  const youxiaoGonglv = round3(zhuanhuaNengliang * genqiXishu);
  const eBin = Math.min(19, Math.floor(ece * 20));
  const pBin = Math.min(19, Math.floor(Math.min(1, youxiaoGonglv) * 20));
  let dominate = 0;
  for (let i = cengciFen; i < 5; i++) for (let j = eBin; j < 20; j++) for (let k = pBin; k < 20; k++) dominate += CENGGI_ECE_YOUXIAO_GRID[i][j][k];
  const qianX = dominate / TOTAL_CHARTS;

  let tier;
  if (qianX <= 0.02) tier = '顶级转化';
  else if (qianX <= 0.05) tier = '极高转化';
  else if (qianX <= 0.10) tier = '高效转化';
  else if (qianX <= 0.25) tier = '中高转化';
  else if (qianX <= 0.50) tier = '中等转化';
  else tier = '低转化';

  let xiduyou;
  if (cengciFen === 0) {
    xiduyou = `能量转化处于人群底部区间：捕获的能量几乎未进入做工系统（转化效率${fmtPct(ece)}，转化功率${zhuanhuaNengliang}）`;
  } else if (congge) {
    xiduyou = `无根无气而${cengciFen === 4 ? '财官双全' : cengciFen === 3 ? '官杀成势' : '财星成势'}——弃命${conggeMing}（从格）：不担而顺，根气系数按1计。综合评级「${conggeMing}·${tier}」：转化效率${fmtPct(ece)}×有效功率${youxiaoGonglv}，518,400盘全枚举中仅${fmtPct(qianX)}同时达到该层次与效率有效功率，位于人群前${fmtPct(qianX)}`;
  } else {
    xiduyou = `根气「${genqi}」承重系数${genqiXishu}（${dangan}），转化层次「${cengci}」（世俗通道能量占已转化${fmtPct(shisuZhanbi)}），综合评级「${cengci}·${tier}」：转化效率${fmtPct(ece)}×有效功率${youxiaoGonglv}（转化功率${zhuanhuaNengliang}×根气系数${genqiXishu}），518,400盘全枚举中仅${fmtPct(qianX)}同时达到该层次与效率有效功率，位于人群前${fmtPct(qianX)}`;
  }
  const xiduyouData = {
    genqi,
    genqi_xishu: genqiXishu,
    congge,
    cengci,
    cengci_fen: cengciFen,
    shisu_zhanbi: shisuZhanbi,
    zhuanhua_xiaolv: ece,
    zhuanhua_gonglv: zhuanhuaNengliang,
    youxiao_gonglv: youxiaoGonglv,
    toubu_zhanbi: Math.round(qianX * 10000) / 10000,
    dengji: congge ? `${conggeMing}·${tier}` : (cengciFen === 0 ? tier : `${cengci}·${tier}`),
    mingpan_zongshu: TOTAL_CHARTS
  };
  calcLines.push(`【有效功率】转化功率${zhuanhuaNengliang} × 根气系数${genqiXishu}（${genqi}${congge ? `，${conggeMing}特判` : ''}）= ${youxiaoGonglv}`);
  calcLines.push(`【稀有度】层次×效率×有效功率帕累托：${congge ? conggeMing : cengci}，前${fmtPct(qianX)}（${xiduyouData.dengji}，全枚举518,400盘）`);

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
    zhuanhua_nengliang: zhuanhuaNengliang,
    zhuanhua_xiaolv: ece,
    zhuanhua_cengci: {
      cengci, cengci_fen: cengciFen,
      cai_tongdao: caiActive, guan_tongdao: guanActive,
      cai_dianliu: wuxing[caiEl] > 0, guan_dianliu: wuxing[guanEl] > 0, // 地支主气电流（虚透=false）
      shisu_nengliang: shisuNengliang, neizai_nengliang: neizaiNengliang,
      shisu_zhanbi: shisuZhanbi,
      shi_guishu: shiGuishu // 食伤能量按做工归属计入世俗通道（食伤生财归财路/食神制杀归贵路）
    },
    genqi_cengci: {
      genqi, genqi_fen: genqiFen,
      xishu: genqiXishu, congge, congge_ming: conggeMing,
      qiang_gen: strongRoots, ruo_gen: weakRoots,
      yin_xing: yinEl, yin_you: youYin, dangan
    },
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
  if (names.includes('食神') && names.includes('正官') && !sha) {
    return { system: '食神和官', desc: '食神和官 · 食神→财→官链条：才华化生为仕途，正道相辅' };
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

const BaziEngine = { analyze, parseBazi, shishen, DZ_CANGGAN, DZ_ZHUQI, CENGGI_ECE_YOUXIAO_GRID, TOTAL_CHARTS };

// CommonJS（Vercel / Node 测试）/ 浏览器全局 双兼容
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaziEngine;
}
if (typeof window !== 'undefined') {
  window.BaziEngine = BaziEngine;
}
