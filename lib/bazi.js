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
// 藏干位置系数：主气=1.0（原有口径不变），中气=0.3，余气=0.15（补充分）
// 大王拍板：地支藏干有初始能量（戌藏丁火不为0），但明显弱于主气——"有根"的能量含义
const CANGGAN_XISHU = [1.0, 0.3, 0.15];
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
  '食神生财': ['食神', '正财', '偏财'],  // 食神顺生财星：平稳输出持续变现（与伤官生财同为输出变现系统）
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
const CENGGI_ECE_YOUXIAO_GRID = [[[195514,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[[1355,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[623,778,41,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[91,738,572,75,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[24,208,645,519,88,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,94,237,640,379,76,3,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,35,86,243,502,216,86,1,0,0,0,0,0,0,0,0,0,0,0,0],[0,4,52,79,194,387,192,67,2,0,0,0,0,0,0,0,0,0,0,0],[0,5,41,61,61,107,315,164,76,9,0,0,0,0,0,0,0,0,0,0],[0,5,23,58,57,48,93,163,179,132,19,0,0,0,0,0,0,0,0,0],[0,4,2,50,62,58,47,38,123,322,188,34,0,0,0,0,0,0,0,0],[0,5,12,12,60,68,66,43,25,317,284,141,50,0,0,0,0,0,0,0],[0,1,4,4,31,78,53,29,38,343,279,156,109,25,4,0,0,0,0,0],[0,6,8,7,20,37,51,28,37,273,311,230,148,50,15,35,1,0,0,0],[0,3,3,9,43,49,22,46,44,200,230,199,227,76,45,84,23,7,0,0],[0,2,6,6,39,84,18,28,42,149,159,159,209,91,60,119,70,21,18,1],[1,0,3,4,33,72,37,21,23,74,90,97,139,91,67,114,67,36,59,11],[1,0,4,3,21,67,16,19,16,30,62,45,65,35,34,83,36,18,57,18],[1,0,1,2,22,41,19,20,18,13,10,34,40,26,22,35,13,11,27,19],[2,0,1,0,13,25,13,12,8,5,5,6,10,9,6,21,6,10,17,7],[0,0,0,0,1,2,5,10,4,5,6,12,10,6,9,9,3,10,7,2]],[[969,94,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[188,1877,82,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,811,1037,126,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,21,812,968,167,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,6,111,799,544,135,4,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,20,13,194,474,348,152,19,0,0,0,0,0,0,0,0,0,0,0,0],[2,39,16,49,130,387,267,109,30,0,0,0,0,0,0,0,0,0,0,0],[4,34,36,44,25,126,257,229,197,29,0,0,0,0,0,0,0,0,0,0],[7,22,42,70,40,30,74,192,274,317,92,0,0,0,0,0,0,0,0,0],[2,13,31,71,98,57,38,31,114,1090,763,156,7,0,0,0,0,0,0,0],[3,6,31,62,89,220,37,28,14,1370,1391,692,266,11,0,0,0,0,0,0],[5,4,26,47,123,336,110,27,28,1412,1542,1281,923,309,26,0,0,0,0,0],[3,9,24,50,101,312,150,35,37,1177,1885,1515,981,604,239,133,3,0,0,0],[12,11,28,59,102,257,187,70,46,899,1626,1604,1430,838,480,584,111,13,0,0],[11,11,15,65,137,289,264,139,105,653,1345,1665,1707,1097,821,1112,432,195,69,0],[10,6,39,53,120,345,361,268,219,435,1036,1246,1841,1554,1272,1498,1077,641,449,81],[7,5,36,63,152,352,327,282,264,304,638,1049,1311,1283,1343,1607,1293,956,934,565],[17,0,25,55,136,457,385,228,236,144,341,609,888,1190,1219,1198,1156,1131,1110,1707],[10,2,4,27,101,326,473,326,252,116,150,268,411,515,654,809,860,828,861,2969],[19,0,3,21,45,186,290,346,393,414,199,185,212,262,306,392,437,387,367,1362]],[[3642,148,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[961,3686,268,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[187,1471,2322,224,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[40,239,1367,1548,207,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[19,83,216,1303,1200,170,3,0,0,0,0,0,0,0,0,0,0,0,0,0],[10,55,97,317,957,590,131,9,0,0,0,0,0,0,0,0,0,0,0,0],[1,33,37,90,247,523,370,93,14,0,0,0,0,0,0,0,0,0,0,0],[1,32,32,68,45,128,329,213,110,9,0,0,0,0,0,0,0,0,0,0],[3,28,41,53,48,33,84,165,224,331,62,0,0,0,0,0,0,0,0,0],[6,29,51,44,82,46,38,34,100,863,606,149,5,0,0,0,0,0,0,0],[10,22,48,50,106,104,37,28,21,1081,1079,598,260,10,0,0,0,0,0,0],[16,11,46,44,113,156,61,21,40,1192,1312,909,734,203,38,0,0,0,0,0],[22,6,43,58,99,211,62,24,21,996,1566,1171,715,438,236,99,5,0,0,0],[9,3,39,71,123,221,99,61,37,737,1266,1247,1227,627,362,450,139,7,1,0],[11,3,30,62,116,245,167,130,52,535,1080,1351,1478,914,620,864,435,206,72,12],[10,0,20,54,130,288,263,261,110,337,849,1213,1614,1364,1068,1163,878,521,388,137],[12,0,11,65,104,315,312,328,194,209,578,1069,1310,1316,1278,1375,1177,943,926,630],[10,1,8,44,124,396,403,331,263,197,368,686,1046,1351,1554,1327,1143,1225,1206,1776],[5,0,9,27,103,318,422,319,371,291,249,297,515,749,1069,1392,1327,1448,1208,3579],[1,0,0,18,40,209,360,403,297,200,124,127,215,337,403,595,735,886,931,3624]],[[1374,38,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[207,1293,29,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,661,406,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,58,324,140,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,8,53,192,81,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,5,51,120,31,23,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,3,6,50,64,59,11,3,0,0,0,0,0,0,0,0,0,0,0],[0,0,2,1,2,22,76,17,8,0,0,0,0,0,0,0,0,0,0,0],[0,0,3,8,4,2,22,14,28,32,8,0,0,0,0,0,0,0,0,0],[2,1,5,14,9,5,2,6,23,131,210,68,12,0,0,0,0,0,0,0],[0,0,7,16,30,25,11,4,2,221,409,250,117,17,0,0,0,0,0,0],[3,0,14,14,24,92,51,6,5,230,469,455,341,130,22,2,0,0,0,0],[8,0,9,23,35,56,47,8,11,219,465,405,359,302,149,54,8,0,0,0],[10,6,6,52,38,82,70,11,16,199,449,558,563,365,218,139,64,0,0,0],[2,3,3,8,75,142,125,64,36,161,424,713,793,646,502,431,218,56,21,0],[1,3,11,12,24,166,272,284,92,129,368,711,1106,1056,912,690,679,309,96,26],[3,4,18,12,33,84,240,303,193,108,388,667,1023,1220,1222,1044,942,781,437,280],[1,0,26,27,36,139,219,207,201,114,268,562,1024,1243,1312,1181,970,898,791,1056],[4,0,3,37,54,214,323,352,255,169,156,344,752,1042,1442,1806,1559,1625,1196,2645],[21,0,1,17,50,186,535,762,972,993,778,350,421,730,951,1484,1836,2097,2120,8830]]];

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
  // 主气计分（原口径不变）+ 中气/余气补充分（藏干有初始能量，但弱于主气）
  const dizhiMingxi = [];
  const cangganMingxi = []; // 中气/余气补充计分明细
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
    // 中气/余气补充分：同柱权重×衰减×天干系数×位置系数
    DZ_CANGGAN[dz].forEach((cg, i) => {
      if (i === 0 || DZ_ZHUQI[dz] === cg) return; // 主气已计（子卯酉单藏干天然跳过）
      const cwx = TG_XY[cg][0];
      const csj = shuaijian(cwx, monthWX);
      const cdefen = round3(weight * csj * tx * CANGGAN_XISHU[i]);
      wuxing[cwx] = round3(wuxing[cwx] + cdefen);
      cangganMingxi.push({
        zhu: PILLAR_POS[k], dizhi: dz, canggan: cg, weizhi: i === 1 ? '中气' : '余气',
        wuxing: cwx, quanzhong: round3(weight * CANGGAN_XISHU[i]),
        shuaijian: csj, tianganxi: tx, defen: cdefen,
        shishen: shishen(dayTG, cg)
      });
      if (cdefen > 0) {
        calcLines.push(`　　　└ 藏干${cg}(${cwx}·${i === 1 ? '中气' : '余气'}) 系数${CANGGAN_XISHU[i]} 衰减${csj} 得分=${cdefen}`);
      }
    });
  });

  // 捕获总量（主气+藏干补充，可超1）；利用率显示层封顶1（藏干补充令库存溢出=低内耗极致）
  const buhuoZong = round3(Object.values(wuxing).reduce((a, b) => a + b, 0));
  const nengliangLiyong = Math.min(1, buhuoZong);
  const neihaoZhi = round3(Math.max(0, 1 - buhuoZong));
  let neihaoDengji;
  if (neihaoZhi <= 0.10) neihaoDengji = '低内耗';
  else if (neihaoZhi <= 0.25) neihaoDengji = '中内耗';
  else if (neihaoZhi <= 0.40) neihaoDengji = '高内耗';
  else neihaoDengji = '极高内耗';
  calcLines.push(`【能量利用率】捕获${buhuoZong}（主气+藏干补充）利用率${nengliangLiyong} 内耗=${neihaoZhi}（${neihaoDengji}）`);

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
  else if (hasShi && hasCai && !hasSha) { shengkeZhuxian.push('食神生财（输出变现）'); mainlineSystems.push('食神生财'); }
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
  const ece = buhuoZong > 0 ? Math.min(1, round3(zhuanhuaNengliang / buhuoZong)) : 0;
  calcLines.push(`【转化效率】转化能量${zhuanhuaNengliang} / 捕获能量${buhuoZong} = ${ece}${xitongList.length ? '' : '（无做工系统，能量未进入转化通道）'}`);

  // ── 七点六、转化层次（世俗标准：财=富路，官杀=贵路）──
  // 已转化的能量分两条性质不同的通道：
  //   世俗通道——财（我克者，利禄）与官杀（克我者，功名），世俗标准以贵为上、富次之；
  //   内在通道——印（才学）、食伤（才艺表达）、比劫（同侪），成就在己不在势位。
  // 层次：财官双全(4) > 官贵之途(3) > 财富之路(2) > 内在通达(1) > 能量未转化(0)。
  // 通道电流判定：只有天干没有地支没有用——财官虚透不开通道；
  //   通道开 = 该五行地支主气有电流，或食伤做工电流注入（伤官生财/食神生财喂财路/食神制杀喂贵路）。
  const caiEl = KE[dayWX];                          // 我克者为财
  const guanEl = WX_LIST.find((w) => KE[w] === dayWX); // 克我者为官杀
  const shiEl = SHENG[dayWX];                       // 我生者为食伤
  const shishengCai = xitongList.includes('伤官生财') || xitongList.includes('食神生财');
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
    canggan_mingxi: cangganMingxi, // 中气/余气补充计分明细（藏干初始能量）
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

// 合冲对 → 做工系统命名（白名单：伤官佩印/杀制群比/食神制杀/官印相生/财生官/财官印顺生/财印双清/伤官生财/食神生财）
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
