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
// 克边耗散效率（真流模型 V7）：克是不可逆的天然转换过程，η<1（热力学第二定律）。
// 大王定标 η=0.8：克边容量=0.8×min(双方桶)，通过量计入转化，损耗0.25×通过量计入内耗（生克转换的天然耗散）。
const KE_XIAOLV = 0.8;
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
const CENGGI_ECE_YOUXIAO_GRID = [[[207775,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[[12202,52,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1072,1524,35,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[7,342,466,50,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,23,159,193,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,6,45,53,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,1,5,3,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[[19655,233,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[2687,8288,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[554,3573,1013,95,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[121,300,956,701,184,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[49,217,167,588,782,168,2,0,0,0,0,0,0,0,0,0,0,0,0,0],[25,132,146,213,1066,681,245,25,0,0,0,0,0,0,0,0,0,0,0,0],[30,57,131,58,546,823,488,227,137,3,0,0,0,0,0,0,0,0,0,0],[26,30,145,80,101,473,610,263,492,116,7,0,0,0,0,0,0,0,0,0],[30,20,126,123,45,69,306,232,373,318,134,0,0,0,0,0,0,0,0,0],[26,11,48,146,94,39,52,195,356,595,602,180,16,0,0,0,0,0,0,0],[17,11,29,87,112,194,26,56,232,809,881,497,184,49,1,0,0,0,0,0],[16,9,17,24,181,325,93,9,75,745,1064,891,632,289,43,0,0,0,0,0],[12,4,33,30,107,260,96,22,30,679,1349,893,653,474,255,60,5,0,0,0],[21,4,39,36,75,270,119,36,35,502,858,933,833,599,424,377,109,26,0,0],[10,2,27,25,104,258,242,144,85,402,811,1023,1053,762,530,768,334,154,34,0],[12,0,22,28,89,270,420,336,221,290,444,636,1166,1062,980,990,834,578,276,73],[6,0,6,31,94,228,345,423,328,217,415,454,702,644,832,1251,989,699,567,462],[12,0,1,16,39,100,169,210,276,136,302,409,578,614,536,600,650,674,597,960],[2,0,1,9,44,66,91,70,95,66,164,204,332,387,434,449,259,295,346,906],[16,0,0,4,25,55,93,45,60,61,54,67,97,130,128,173,240,152,113,213]],[[16392,705,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[3187,13257,683,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[751,3825,5768,399,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[172,763,3456,2715,159,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[56,509,362,2243,1133,75,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[16,250,241,395,1181,431,29,0,0,0,0,0,0,0,0,0,0,0,0,0],[11,63,202,82,252,304,129,5,2,0,0,0,0,0,0,0,0,0,0,0],[7,40,82,43,52,136,31,9,13,4,0,0,0,0,0,0,0,0,0,0],[2,21,63,65,39,37,46,13,15,161,39,2,0,0,0,0,0,0,0,0],[2,18,53,66,44,27,41,17,26,521,314,92,10,0,0,0,0,0,0,0],[2,8,25,65,64,68,13,38,48,696,644,377,166,11,0,0,0,0,0,0],[0,4,25,32,59,190,53,5,24,691,712,712,585,174,23,1,0,0,0,0],[1,2,25,46,74,184,74,5,27,623,869,676,570,380,236,73,5,0,0,0],[1,2,15,44,66,258,161,23,27,474,581,884,843,462,324,341,101,7,0,0],[1,0,18,36,92,215,201,77,64,383,641,751,899,437,411,626,290,164,56,5],[4,0,8,38,54,209,297,225,131,231,408,863,1284,868,748,737,585,440,261,90],[5,0,6,33,79,149,325,211,164,108,240,428,678,731,780,960,671,557,542,434],[1,0,4,17,37,99,165,150,204,126,119,238,430,497,483,587,562,642,542,775],[3,0,0,15,19,52,92,143,99,99,119,194,301,280,327,323,187,220,292,607],[28,0,0,7,30,37,82,60,96,49,76,79,166,206,188,180,204,165,134,315]],[[1929,194,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[325,3792,166,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[74,1262,2241,83,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[25,181,1560,804,53,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[8,152,258,731,403,75,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[8,70,83,153,440,337,62,7,0,0,0,0,0,0,0,0,0,0,0,0],[8,25,70,26,96,392,195,86,24,1,0,0,0,0,0,0,0,0,0,0],[17,8,33,35,10,187,237,108,136,24,1,0,0,0,0,0,0,0,0,0],[11,1,37,24,27,42,169,117,142,63,22,0,0,0,0,0,0,0,0,0],[8,2,14,43,31,9,46,110,133,185,185,71,10,0,0,0,0,0,0,0],[5,1,4,40,39,49,11,49,68,204,272,270,140,27,0,0,0,0,0,0],[4,1,5,13,48,103,60,6,19,199,448,421,282,123,33,2,0,0,0,0],[2,0,6,14,43,77,69,7,4,207,418,349,349,287,150,58,4,0,0,0],[1,0,6,18,32,124,68,8,11,127,383,576,549,252,173,135,94,2,0,0],[0,0,2,7,64,102,142,91,46,104,245,387,484,357,266,278,222,87,30,2],[1,1,2,10,24,78,160,221,99,66,221,459,654,531,435,404,530,238,139,57],[2,5,10,10,39,89,283,291,178,120,265,369,530,714,667,655,477,439,295,224],[1,0,41,19,20,48,114,224,268,145,282,594,1066,1154,1038,786,630,536,429,605],[4,0,6,39,38,116,196,162,145,95,164,354,743,1077,1640,2059,1656,1414,934,1128],[27,0,0,10,61,157,428,814,921,886,653,301,403,614,733,1015,1449,1959,2084,8549]]];

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

// ── 五行流网络最大流（Edmonds-Karp；节点0-4=木火土金水，5=超源，6=超汇）──
// 真流模型 V7 核心求解器：edges=[{u,v,cap,kind,label}]，sources={节点:供给量}，sinks=[节点]。
// 返回 {flow:最大流, flows:各边实际流量, minCut:最小割边集（=转化瓶颈）}。
// 守恒保证：流值 ≤ 供给总量；无自由参数（容量全部由五行桶能量导出）。
function liuMaxFlow(edges, sources, sinks) {
  const N = 7, S = 5, T = 6;
  const cap = Array.from({ length: N }, () => new Array(N).fill(0));
  for (const e of edges) cap[e.u][e.v] += e.cap;
  for (const k of Object.keys(sources)) cap[S][+k] = sources[k];
  for (const t of sinks) cap[t][T] = 1e9;
  let flow = 0;
  const parent = new Array(N).fill(-1);
  for (;;) {
    parent.fill(-1);
    parent[S] = S;
    const q = [S];
    while (q.length && parent[T] === -1) {
      const u = q.shift();
      for (let v = 0; v < N; v++) if (parent[v] === -1 && cap[u][v] > 0) { parent[v] = u; q.push(v); }
    }
    if (parent[T] === -1) break;
    let aug = Infinity;
    for (let v = T; v !== S; v = parent[v]) aug = Math.min(aug, cap[parent[v]][v]);
    for (let v = T; v !== S; v = parent[v]) { cap[parent[v]][v] -= aug; cap[v][parent[v]] += aug; }
    flow += aug;
  }
  // 残量网络中从源可达的节点集 → 最小割
  const reach = new Set([S]);
  const stack = [S];
  while (stack.length) {
    const u = stack.pop();
    for (let v = 0; v < N; v++) if (!reach.has(v) && cap[u][v] > 0) { reach.add(v); stack.push(v); }
  }
  const flows = edges.map((e) => ({ ...e, flow: round3(Math.max(0, Math.min(e.cap, e.cap - cap[e.u][e.v]))) }));
  const minCut = edges.filter((e) => reach.has(e.u) && !reach.has(e.v));
  return { flow: round3(flow), flows, minCut };
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
    // 合而化（合本身构成做工系统）→ 被合天干仍算系统参与；合而不化 → 不参与（修复合绊不对称）
    pair[0].tiedSys = !!cls.system;
    pair[1].tiedSys = !!cls.system;
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

  // ── 七点五、能量转化（真流模型 V7：体用流网络最大流）──
  // 体用划分（大王定）：印比食为体（源），财官为用（汇）——能量转化本质是体用之间的动态平衡。
  //   财官桶里的能量「就地算有」直接计入转化；体的能量必须沿流网络流到用位才算转化。
  // 生边容量 = min(双方桶能量)——管道两头都要有实体支撑，弱者限流（大王拍板）；
  // 克边（食伤→官杀，制/和系统激活时）容量 = KE_XIAOLV×min(双方桶)——克是不可逆的天然转换过程（热力学第二定律），
  //   通过量计入转化，损耗 (1-KE_XIAOLV)/KE_XIAOLV×通过量 计入内耗（生克转换的天然耗散）。
  // 内在流：用+食伤 → 身（经印入本体，官印相生为典型）；印本身是体，不作内在源（防体能量自循环重复计数）。
  const caiEl = KE[dayWX];                              // 我克者为财
  const guanEl = WX_LIST.find((w) => KE[w] === dayWX);  // 克我者为官杀
  const shiEl = SHENG[dayWX];                           // 我生者为食伤
  const participants = new Set();
  xitongList.forEach((name) => (SYSTEM_SHISHEN[name] || []).forEach((s) => participants.add(s)));
  // 做工五行集合（仅作通道结构判定；能量记账全部走流网络，不再整桶划转）。
  // 合绊修正：被合住的天干若其合本身就是做工系统（合而化），仍算参与；合而不化不参与——修复合绊不对称。
  const workingWX = new Set();
  stemInfo.forEach((s) => { if (participants.has(s.shishen) && (!s.tied || s.tiedSys)) workingWX.add(s.wx); });
  if (participants.has(gejuShishen)) workingWX.add(monthWX);

  // ── 七点六、转化层次（世俗标准：财=富路，官杀=贵路）──
  // 通道电流判定（口径不变）：只有天干没有地支没有用——财官虚透不开通道；
  //   通道开 = 该五行地支主气有电流，或食伤做工电流注入。
  // 层次：财官双全(4) > 官贵之途(3) > 财富之路(2) > 内在通达(1) > 能量未转化(0)。
  //   结构（通道开）+ 能量（流得到）双确认：虚开通道而能量流不进的不算。
  const shishengCai = xitongList.includes('伤官生财') || xitongList.includes('食神生财');
  const shizhiSha = xitongList.includes('食神制杀');
  const shiheGuan = xitongList.includes('食神和官');
  const shiDianliu = workingWX.has(shiEl) && wuxing[shiEl] > 0; // 食伤地支电流
  const caiActive = workingWX.has(caiEl) && (wuxing[caiEl] > 0 || (shishengCai && shiDianliu));
  const guanActive = workingWX.has(guanEl) && (wuxing[guanEl] > 0 || (shizhiSha && shiDianliu));
  const shiGuishu = (shishengCai || shizhiSha) && shiDianliu; // 食伤电流在管道中做工（显示用）

  // ── 财生官先导滋养（V7.1，大王拍板：单步 + 官通道开启才滋养）──
  // 十神沿生环排列：比劫→食伤→财→官→印，财生官与食伤生财同为环上生边（五个日主结构性必然）。
  // 官通道开启时，财桶经生边先行滋养官桶：滋养量 t=min(财桶,官桶)（受端实体限流，单步不迭代——
  // 迭代会令财多官弱之局财尽归官，破坏弱侧限流原理）。
  // 记账口径（关键，修实移版回归）：官桶有效实体=官+t 仅用于管宽（以官为端的管道按新桶宽重建，
  // 「流动后的能量变化」）；财桶不清空——桶在本模型是管宽支撑而非消耗性水库，清空会卡死食伤生财中继。
  // 财通道闭而官通道开时：财作为源经生边真实流入官（水的能量给到木），到达即入世俗账。
  let ziyang = 0;
  const wuxingFlow = { ...wuxing };
  if (guanActive && wuxing[caiEl] > 0 && wuxing[guanEl] > 0) {
    ziyang = round3(Math.min(wuxing[caiEl], wuxing[guanEl]));
    wuxingFlow[guanEl] = round3(wuxing[guanEl] + ziyang);
  }

  // 流网络：节点 0-4 = 木火土金水（WX_LIST 序）；容量全部按滋养后的有效桶（wuxingFlow）
  const liuEdges = [];
  for (const w of WX_LIST) {
    const v = SHENG[w];
    const c = round3(Math.min(wuxingFlow[w], wuxingFlow[v]));
    if (c > 0) liuEdges.push({ u: WX_LIST.indexOf(w), v: WX_LIST.indexOf(v), cap: c, kind: '生', label: `${w}生${v}` });
  }
  if (shizhiSha || shiheGuan) {
    const c = round3(KE_XIAOLV * Math.min(wuxingFlow[shiEl], wuxingFlow[guanEl]));
    if (c > 0) liuEdges.push({ u: WX_LIST.indexOf(shiEl), v: WX_LIST.indexOf(guanEl), cap: c, kind: '克', label: `${shiEl}克${guanEl}（${shizhiSha ? '食神制杀' : '食神和官'}）` });
  }

  // 世俗流：体（印比食）供给 → 开放的用（财/官）汇；财官桶就地算有（滋养后口径）
  const worldlySinks = [];
  if (caiActive) worldlySinks.push(WX_LIST.indexOf(caiEl));
  if (guanActive) worldlySinks.push(WX_LIST.indexOf(guanEl));
  let shisuLiu = 0, shuruLiu = 0, keLiu = 0;
  let cutEdges = [];
  if (worldlySinks.length) {
    const tiSources = {};
    for (const w of [dayWX, shiEl, yinEl]) if (wuxingFlow[w] > 0) tiSources[WX_LIST.indexOf(w)] = wuxingFlow[w];
    // 财通道闭而官通道开：财桶能量作为源经生边流入开放的官（财生官真实流，到达即入账）
    if (!caiActive && guanActive && wuxing[caiEl] > 0) tiSources[WX_LIST.indexOf(caiEl)] = wuxing[caiEl];
    const r = liuMaxFlow(liuEdges, tiSources, worldlySinks);
    shuruLiu = r.flow;
    cutEdges = r.minCut;
    const keE = r.flows.find((e) => e.kind === '克');
    keLiu = keE ? keE.flow : 0;
    // 就地算有用原始桶：滋养量 t 是财的能量（财通道开时已计入财桶就地；通道闭时经源流入账），不重复计
    const jiuDi = (caiActive ? wuxing[caiEl] : 0) + (guanActive ? wuxing[guanEl] : 0);
    shisuLiu = round3(jiuDi + r.flow);
  }
  // 内在流：用+食伤供给 → 身（经印归本体）；无做工系统则不算
  // 源供给用原始桶（滋养不 inflate 供给，防财官双源重复计），管宽已按滋养后有效实体重建（官生印管道可变宽）
  let neizaiLiu = 0;
  if (xitongList.length) {
    const nSources = {};
    for (const w of [caiEl, guanEl, shiEl]) if (wuxing[w] > 0) nSources[WX_LIST.indexOf(w)] = wuxing[w];
    neizaiLiu = liuMaxFlow(liuEdges, nSources, [WX_LIST.indexOf(dayWX)]).flow;
  }

  let cengciFen = 1, cengci = '内在通达';
  if (xitongList.length === 0 || (shisuLiu === 0 && neizaiLiu === 0)) { cengciFen = 0; cengci = '能量未转化'; }
  else if (caiActive && guanActive && shisuLiu > 0) { cengciFen = 4; cengci = '财官双全'; }
  else if (guanActive && shisuLiu > 0) { cengciFen = 3; cengci = '官贵之途'; }
  else if (caiActive && shisuLiu > 0) { cengciFen = 2; cengci = '财富之路'; }
  else if (neizaiLiu === 0) { cengciFen = 0; cengci = '能量未转化'; }

  const zhuanhuaNengliang = cengciFen >= 2 ? shisuLiu : (cengciFen === 1 ? neizaiLiu : 0);
  const ece = buhuoZong > 0 ? Math.min(1, round3(zhuanhuaNengliang / buhuoZong)) : 0;
  // 体用平衡：外向流（世俗）与内向流（经印归本体）之比
  const shisuNengliang = shisuLiu;
  const neizaiNengliang = neizaiLiu;
  const shisuZhanbi = (shisuLiu + neizaiLiu) > 0 ? Math.round((shisuLiu / (shisuLiu + neizaiLiu)) * 1000) / 1000 : 0;
  // 克边耗散：交付 keLiu 需消耗 keLiu/KE_XIAOLV，损耗 = keLiu×(1-KE_XIAOLV)/KE_XIAOLV
  const keSunhao = round3(keLiu * (1 - KE_XIAOLV) / KE_XIAOLV);
  // 最小割瓶颈（转化卡在哪条管道）
  const cutSorted = [...cutEdges].sort((a, b) => a.cap - b.cap);
  const pingjing = cutSorted.length ? cutSorted.slice(0, 2).map((e) => `${e.label}管宽${e.cap}`).join('；') : '';

  calcLines.push(`【流网络】生边容量=min(双方桶)${(shizhiSha || shiheGuan) ? `，克边${shiEl}→${guanEl}容量=${KE_XIAOLV}×min(双方桶)` : ''}`);
  if (ziyang > 0) calcLines.push(`【财生官滋养】${caiEl}财${ziyang}经${caiEl}生${guanEl}先行滋养官桶（${guanEl}桶有效实体${wuxing[guanEl]}→${wuxingFlow[guanEl]}，管宽口径，${caiEl}桶保留），以${guanEl}为受端的管道按新桶宽重建${(shizhiSha || shiheGuan) ? `（克边管宽${round3(KE_XIAOLV * Math.min(wuxingFlow[shiEl], wuxingFlow[guanEl]))}）` : ''}${(!caiActive && guanActive && wuxing[caiEl] > 0) ? `；${caiEl}通道闭，${caiEl}桶能量作为源经${caiEl}生${guanEl}真实流入官侧入账` : ''}`);
  calcLines.push(`【世俗流】体流入用${shuruLiu} + 财官桶就地${round3(shisuLiu - shuruLiu)} = ${shisuLiu}${keLiu ? `（含克边通过${keLiu}，损耗${keSunhao}）` : ''}`);
  calcLines.push(`【内在流】用+食伤经印归身 = ${neizaiLiu}（体用比：外向${fmtPct(shisuZhanbi)}）`);
  calcLines.push(`【转化效率】转化能量${zhuanhuaNengliang} / 捕获能量${buhuoZong} = ${ece}${xitongList.length ? '' : '（无做工系统，能量未进入转化通道）'}`);
  calcLines.push(`【转化层次】${cengci}：世俗流${shisuNengliang} · 内在流${neizaiNengliang}${pingjing ? ` · 瓶颈：${pingjing}` : ''}`);

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
  // 内耗终值 = 结构性内耗（捕获缺口）+ 克边耗散（生克导流的天然耗散）
  const neihaoZong = round3(Math.min(1, neihaoZhi + keSunhao));
  let neihaoDengjiFinal;
  if (neihaoZong <= 0.10) neihaoDengjiFinal = '低内耗';
  else if (neihaoZong <= 0.25) neihaoDengjiFinal = '中内耗';
  else if (neihaoZong <= 0.40) neihaoDengjiFinal = '高内耗';
  else neihaoDengjiFinal = '极高内耗';

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
    xiduyou = `根气「${genqi}」承重系数${genqiXishu}（${dangan}），转化层次「${cengci}」（体用流转外向${fmtPct(shisuZhanbi)}：世俗流${shisuLiu}/内在流${neizaiLiu}），综合评级「${cengci}·${tier}」：转化效率${fmtPct(ece)}×有效功率${youxiaoGonglv}（转化功率${zhuanhuaNengliang}×根气系数${genqiXishu}）${pingjing ? `，转化瓶颈：${pingjing}` : ''}，518,400盘全枚举中仅${fmtPct(qianX)}同时达到该层次与效率有效功率，位于人群前${fmtPct(qianX)}`;
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
  if (keSunhao > 0) neihaoParts.push(`食伤${shizhiSha ? '制杀' : '和官'}克边导流${keSunhao}（生克转换的天然耗散）`);
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
      shisu_zhanbi: shisuZhanbi, // 体用平衡：外向流/总流转
      shi_guishu: shiGuishu,     // 食伤电流在管道中做工（显示用）
      // 真流模型 V7 明细
      shisu_liu: shisuLiu,       // 世俗流 = 财官桶就地 + 体流入用
      neizai_liu: neizaiLiu,     // 内在流 = 用+食伤经印归身
      shuru_liu: shuruLiu,       // 体净流入用的流量
      ke_liu: keLiu,             // 克边通过量（食伤→官杀）
      ke_sunhao: keSunhao,       // 克边耗散（计入内耗）
      ziyang_liang: ziyang,      // 财生官先导滋养量（单步实移，官通道开启时）
      ziyang_guan_hou: wuxingFlow[guanEl], // 滋养后官桶有效实体
      pingjing                  // 最小割瓶颈（转化卡点）
    },
    genqi_cengci: {
      genqi, genqi_fen: genqiFen,
      xishu: genqiXishu, congge, congge_ming: conggeMing,
      qiang_gen: strongRoots, ruo_gen: weakRoots,
      yin_xing: yinEl, yin_you: youYin, dangan
    },
    neihao: { zhi: neihaoZong, dengji: neihaoDengjiFinal, yuanyin: neihaoYuanyin, ke_sunhao: keSunhao },
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
