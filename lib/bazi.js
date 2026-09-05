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
 *   八、稀有度——层次×ECE×功率 三维帕累托头部占比（全枚举518,400盘真实分布，格局不参与）
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
const GENQI_CENGGI_ECE_POWER_GRID = [[[[1380,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],[0,0,0,0,2,1,0,0,0,0,7,7,0,0,0,0,0,0,0,0],[0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,2,0,1,2,0,0,0,0,0,0,0,0,0,0],[0,0,0,2,0,2,0,0,0,4,2,2,4,0,0,0,0,0,0,0],[0,0,0,0,0,0,5,0,0,1,2,2,14,0,0,16,0,0,0,0],[0,0,0,0,0,2,2,3,0,10,3,5,7,4,5,2,0,0,0,0],[0,0,0,0,0,4,1,6,9,18,21,26,20,35,19,28,40,73,0,0]],[[57,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[11,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,5,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,6,4,0,0,0,0,0,4,0,0,0,0,0,0,0,0,0,0],[0,0,3,0,2,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0],[0,0,8,1,1,0,0,0,0,7,0,2,0,0,0,0,0,0,0,0],[0,0,0,2,0,1,0,0,0,6,5,5,0,0,0,0,0,0,0,0],[0,0,0,4,0,0,0,0,0,6,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,1,9,4,5,0,0,0,0,0,0,0,0],[0,0,0,0,1,0,0,0,0,13,1,1,0,0,0,0,0,0,0,0],[0,0,0,1,1,0,0,0,0,6,3,9,0,0,0,4,0,0,0,0],[0,0,0,0,1,0,0,0,0,3,5,10,2,0,0,4,0,0,0,0],[0,0,0,2,6,3,4,2,0,8,19,20,12,6,1,9,4,8,0,0]],[[3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[3,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,2,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,2,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,6,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,1,0,1,0,0,0,6,0,0,0,0,0,0,0,0,0,0],[0,0,0,1,0,0,0,0,0,10,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,2,0,0,0,0,3,7,12,0,0,0,0,0,0,0,0],[0,0,0,0,0,1,0,0,0,6,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,1,12,16,3,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,1,0,0,11,4,14,0,0,5,20,0,0,0,0],[0,0,0,1,1,5,9,2,4,12,50,66,81,98,59,76,79,120,0,0]]],[[[17331,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[[150,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[36,50,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,54,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,10,6,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,8,3,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,3,3,17,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,2,2,5,3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,3,9,2,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,2,3,4,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,2,2,0,0,2,1,0,0,0,0,0,0,0,0,0,0,0],[0,0,7,2,0,1,0,0,0,20,0,0,0,0,0,0,0,0,0,0],[0,0,2,2,0,3,0,0,0,33,0,0,0,0,0,0,0,0,0,0],[0,0,5,2,0,4,0,0,0,42,0,11,0,0,0,0,0,0,0,0],[0,0,1,2,2,2,0,0,0,19,9,20,0,0,0,0,0,0,0,0],[0,0,3,0,3,0,0,0,1,36,4,1,0,0,0,0,0,0,0,0],[0,0,1,2,4,2,0,1,0,35,6,6,0,0,0,0,0,0,0,0],[0,0,0,1,1,0,2,0,3,60,12,2,0,0,0,7,0,0,0,0],[0,0,0,1,3,2,2,0,2,59,34,18,4,0,0,23,0,0,0,0],[0,0,0,1,0,2,4,0,1,69,20,26,8,0,0,20,2,7,0,0],[0,0,0,0,2,2,4,1,2,33,36,48,25,8,5,44,11,22,3,0]],[[45,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[29,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[2,30,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,14,12,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,2,22,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,29,11,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,3,23,15,4,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,2,19,23,0,17,0,2,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,24,10,21,24,3,7,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,8,6,9,16,12,4,2,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,21,6,36,3,6,0,114,0,0,0,0,0,0,0,0,0,0],[0,0,1,17,12,35,3,11,0,233,22,0,0,0,0,0,0,0,0,0],[0,0,3,6,13,43,5,14,6,239,34,39,0,0,0,0,0,0,0,0],[0,0,3,18,3,46,20,23,0,191,126,134,0,0,0,0,0,0,0,0],[0,0,3,3,5,13,4,33,11,190,39,40,2,0,0,0,0,0,0,0],[0,0,2,14,2,34,15,6,12,190,91,151,20,0,0,0,0,0,0,0],[0,0,0,13,11,23,10,22,28,163,59,23,46,0,0,31,0,0,0,0],[0,0,0,11,11,41,37,17,11,231,141,109,129,44,9,140,0,0,0,0],[0,0,0,0,1,15,18,36,26,386,288,241,110,40,16,150,89,23,0,0],[0,0,0,5,13,17,40,43,48,216,361,519,402,261,232,463,327,354,92,0]],[[718,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[238,75,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[14,155,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[6,27,8,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,3,5,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[2,0,18,6,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,2,16,11,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,21,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,23,11,11,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,17,4,7,12,3,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,20,13,13,16,3,2,0,28,0,0,0,0,0,0,0,0,0,0],[0,0,13,9,13,24,1,5,0,87,1,0,0,0,0,0,0,0,0,0],[0,0,9,11,11,27,1,10,2,100,9,15,0,0,0,0,0,0,0,0],[0,0,1,22,20,40,11,21,0,94,26,40,1,0,0,0,0,0,0,0],[0,0,0,6,31,22,9,11,9,141,67,15,2,0,0,0,0,0,0,0],[0,0,1,4,24,48,17,27,2,241,128,92,1,0,0,0,0,0,0,0],[0,0,0,3,14,33,28,55,27,294,138,39,53,0,0,20,0,0,0,0],[0,0,0,4,8,21,35,26,39,311,373,172,59,2,6,90,0,0,0,0],[0,0,0,3,1,8,26,15,47,308,313,259,208,36,105,219,92,16,0,0],[0,0,0,4,9,7,14,35,37,166,306,321,473,289,217,428,374,242,103,0]],[[16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[11,5,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,13,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,5,6,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,4,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,0,0,5,1,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,4,0,2,7,0,1,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,2,5,1,6,5,1,1,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,11,8,19,6,4,0,20,0,0,0,0,0,0,0,0,0,0],[0,0,3,0,28,10,7,11,0,47,8,0,0,0,0,0,0,0,0,0],[0,0,4,0,4,19,13,8,1,91,16,3,0,0,0,0,0,0,0,0],[0,0,4,5,2,5,22,32,0,87,60,44,0,0,0,0,0,0,0,0],[0,0,2,0,5,2,0,11,19,144,98,8,4,0,0,0,0,0,0,0],[0,0,0,7,3,21,17,2,0,93,184,226,8,0,0,0,0,0,0,0],[0,0,0,11,9,9,15,25,8,83,24,2,123,0,0,9,0,0,0,0],[0,0,0,1,25,16,16,17,18,170,232,106,110,33,14,50,0,0,0,0],[0,0,0,1,7,18,30,33,18,176,253,257,114,17,57,94,81,6,0,0],[0,0,0,0,0,6,31,49,64,121,272,524,743,684,670,572,653,526,180,0]]],[[[221973,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]],[[679,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[188,662,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[7,732,117,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,192,253,184,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,32,294,331,28,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,59,212,129,51,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,9,44,19,248,193,28,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,22,10,12,237,54,29,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,34,8,27,25,154,58,42,0,0,0,0,0,0,0,0,0,0,0],[0,0,7,3,8,46,2,57,109,102,0,0,0,0,0,0,0,0,0,0],[0,0,2,3,12,41,5,1,3,362,0,0,0,0,0,0,0,0,0,0],[0,0,2,4,20,21,4,16,6,391,5,27,0,0,0,0,0,0,0,0],[0,0,0,0,2,32,4,9,13,515,30,50,29,0,0,0,0,0,0,0],[0,0,0,1,5,16,5,9,12,391,37,94,112,0,0,0,0,0,0,0],[0,0,0,0,2,14,3,15,36,355,38,61,47,2,18,0,0,0,0,0],[0,0,0,2,1,6,5,3,12,252,124,136,98,0,0,25,0,0,0,0],[0,0,0,0,2,2,1,6,14,200,52,67,144,6,37,106,0,0,0,0],[0,0,0,2,0,5,1,7,5,116,108,55,98,23,6,161,0,27,0,0],[0,0,0,1,0,0,4,2,5,92,57,53,72,31,30,130,7,26,55,0],[0,0,0,1,0,1,2,4,3,16,79,92,96,44,49,118,28,66,78,44]],[[2347,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[737,969,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,983,264,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,89,685,200,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,301,421,33,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,1,39,345,210,118,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,40,29,191,385,9,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,15,24,16,370,46,55,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,35,28,14,41,69,98,91,0,0,0,0,0,0,0,0,0,0,0],[0,0,8,24,8,48,5,76,103,632,0,0,0,0,0,0,0,0,0,0],[0,0,13,26,17,37,14,0,7,1951,0,0,0,0,0,0,0,0,0,0],[0,0,11,27,20,35,6,27,7,2303,178,312,0,0,0,0,0,0,0,0],[0,0,6,11,16,44,9,7,14,3166,492,497,333,0,0,0,0,0,0,0],[0,0,2,24,4,60,21,15,25,2371,334,840,1184,0,0,0,0,0,0,0],[0,0,9,7,33,46,15,24,35,2731,396,622,354,87,444,0,0,0,0,0],[0,0,1,12,2,48,50,9,40,2315,1135,1046,756,0,0,295,0,0,0,0],[0,0,0,5,12,38,26,38,37,2441,666,722,1391,415,417,951,0,0,0,0],[0,0,0,14,4,33,37,31,43,1612,1333,918,1192,264,306,1559,98,362,0,0],[0,0,0,6,4,10,42,26,42,1037,909,947,1345,503,717,1411,406,666,740,0],[0,0,0,8,18,15,43,34,38,363,1030,1168,1520,1415,1233,1915,1192,1756,1439,1500]],[[3660,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[882,3204,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[47,2468,297,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[7,558,885,505,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[1,77,585,839,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,26,121,723,350,36,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,22,97,73,541,132,8,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,2,79,72,135,278,73,10,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,82,31,65,57,100,36,13,0,0,0,0,0,0,0,0,0,0,0],[0,0,20,42,33,89,9,40,61,451,0,0,0,0,0,0,0,0,0,0],[0,0,23,39,37,113,25,5,8,1330,0,0,0,0,0,0,0,0,0,0],[0,0,25,12,32,79,17,36,10,1253,418,223,0,0,0,0,0,0,0,0],[0,0,13,16,16,135,16,17,21,2066,577,252,249,0,0,0,0,0,0,0],[0,0,14,12,10,73,21,32,46,1807,442,596,809,0,0,0,0,0,0,0],[0,0,15,8,17,54,24,49,77,2305,423,536,365,205,260,0,0,0,0,0],[0,0,5,13,21,64,19,18,62,1918,1124,1093,728,0,0,317,0,0,0,0],[0,0,1,10,28,47,9,21,63,2566,836,720,1249,747,357,645,0,0,0,0],[0,0,0,13,8,59,17,63,41,1719,1499,1353,1368,328,602,1643,258,336,0,0],[0,0,0,3,8,17,45,61,104,754,1408,1756,1752,863,1271,1472,914,924,652,0],[0,0,0,4,7,12,29,47,67,282,1026,1256,2030,2728,2485,2735,2988,3546,2200,2923]],[[1879,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[552,730,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[8,845,55,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,230,294,23,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,11,98,91,7,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,4,1,145,32,31,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,6,3,56,109,0,0,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,0,1,12,84,19,14,0,0,0,0,0,0,0,0,0,0,0,0],[0,0,5,5,2,4,34,18,26,0,0,0,0,0,0,0,0,0,0,0],[0,0,5,3,2,6,2,25,29,252,0,0,0,0,0,0,0,0,0,0],[0,0,4,6,5,11,5,0,2,664,0,0,0,0,0,0,0,0,0,0],[0,0,8,4,1,31,7,6,0,505,346,149,0,0,0,0,0,0,0,0],[0,0,9,0,8,17,5,2,3,959,435,81,155,0,0,0,0,0,0,0],[0,0,15,1,1,27,23,7,11,802,537,412,528,0,0,0,0,0,0,0],[0,0,12,0,10,30,13,30,28,1212,228,331,198,161,181,0,0,0,0,0],[0,0,2,11,23,38,6,4,19,1072,801,982,450,0,0,146,0,0,0,0],[0,0,0,3,21,23,21,23,38,1912,689,449,1144,628,448,225,0,0,0,0],[0,0,0,5,4,44,16,36,38,1304,1428,1310,1024,289,355,897,155,168,0,0],[0,0,0,0,6,11,27,46,39,605,1647,1362,1743,844,1119,1039,598,563,324,0],[0,0,0,2,6,14,30,69,71,237,978,1966,3256,3692,3354,3622,3725,3900,2259,2713]]]];

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
  const caiEl = KE[dayWX];                          // 我克者为财
  const guanEl = WX_LIST.find((w) => KE[w] === dayWX); // 克我者为官杀
  const caiActive = workingWX.has(caiEl);
  const guanActive = workingWX.has(guanEl);
  let cengciFen = 1, cengci = '内在通达';
  if (xitongList.length === 0 || zhuanhuaNengliang === 0) { cengciFen = 0; cengci = '能量未转化'; }
  else if (caiActive && guanActive) { cengciFen = 4; cengci = '财官双全'; }
  else if (guanActive) { cengciFen = 3; cengci = '官贵之途'; }
  else if (caiActive) { cengciFen = 2; cengci = '财富之路'; }
  const shisuNengliang = round3((caiActive ? wuxing[caiEl] : 0) + (guanActive ? wuxing[guanEl] : 0));
  const neizaiNengliang = round3(Math.max(0, zhuanhuaNengliang - shisuNengliang));
  const shisuZhanbi = zhuanhuaNengliang > 0 ? Math.round((shisuNengliang / zhuanhuaNengliang) * 1000) / 1000 : 0;
  calcLines.push(`【转化层次】${cengci}：世俗能量${shisuNengliang}（占已转化${fmtPct(shisuZhanbi)}）·内在能量${neizaiNengliang}`);

  // ── 八、稀有度：根气×转化层次×效率×功率 四维帕累托头部占比 ──
  // 全枚举 518,400 盘的 (根气, 层次, ECE, 功率) 联合分布内置为 3×5×20×20 网格。
  // 联合稀有度 = 同时达到「根气≥你 且 层次≥你 且 效率≥你 且 功率≥你」的命盘占比（含同档）。
  // 根气是最外层支配维度：无根的盘被所有有根盘压住——「没有根的担不起财官」的数学表达。
  // 世俗层次进稀有度：世俗标准以财官双全为上（贵为上，富次之），纯内在转化层次最低。
  const eBin = Math.min(19, Math.floor(ece * 20));
  const pBin = Math.min(19, Math.floor(Math.min(1, zhuanhuaNengliang) * 20));
  let dominate = 0;
  for (let g = genqiFen; g < 3; g++) for (let i = cengciFen; i < 5; i++) for (let j = eBin; j < 20; j++) for (let k = pBin; k < 20; k++) dominate += GENQI_CENGGI_ECE_POWER_GRID[g][i][j][k];
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
  } else {
    xiduyou = `根气「${genqi}」（${dangan}），转化层次「${cengci}」（世俗通道能量占已转化${fmtPct(shisuZhanbi)}），综合评级「${genqi}·${cengci}·${tier}」：转化效率${fmtPct(ece)}×功率${zhuanhuaNengliang}，518,400盘全枚举中仅${fmtPct(qianX)}同时达到该根气层次与效率功率，位于人群前${fmtPct(qianX)}`;
  }
  const xiduyouData = {
    genqi,
    genqi_fen: genqiFen,
    cengci,
    cengci_fen: cengciFen,
    shisu_zhanbi: shisuZhanbi,
    zhuanhua_xiaolv: ece,
    zhuanhua_gonglv: zhuanhuaNengliang,
    toubu_zhanbi: Math.round(qianX * 10000) / 10000,
    dengji: cengciFen === 0 ? `${genqi}·${tier}` : `${genqi}·${cengci}·${tier}`,
    mingpan_zongshu: TOTAL_CHARTS
  };
  calcLines.push(`【稀有度】根气×层次×效率×功率帕累托：${genqi}·${cengci}，前${fmtPct(qianX)}（${cengciFen === 0 ? genqi + '·' + tier : genqi + '·' + cengci + '·' + tier}，全枚举518,400盘）`);

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
      shisu_nengliang: shisuNengliang, neizai_nengliang: neizaiNengliang,
      shisu_zhanbi: shisuZhanbi
    },
    genqi_cengci: {
      genqi, genqi_fen: genqiFen,
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

const BaziEngine = { analyze, parseBazi, shishen, DZ_CANGGAN, DZ_ZHUQI, GENQI_CENGGI_ECE_POWER_GRID, TOTAL_CHARTS };

// CommonJS（Vercel / Node 测试）/ 浏览器全局 双兼容
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BaziEngine;
}
if (typeof window !== 'undefined') {
  window.BaziEngine = BaziEngine;
}
