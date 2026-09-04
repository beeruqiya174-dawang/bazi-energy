'use strict';

/**
 * 能量图谱 · 回归测试（node --test tests/）
 * 黄金案例来自 references/test-cases.md
 * 运行：node --test tests/
 */

const test = require('node:test');
const assert = require('node:assert');
const { analyze, parseBazi } = require('../lib/bazi.js');

test('案例一：甲寅 己巳 丙子 壬辰（用户本人基准八字）', () => {
  const { result } = analyze('年柱甲寅 月柱己巳 日柱丙子 时柱壬辰');

  // 日主
  assert.strictEqual(result.rizhu, '丙 · 阳火');

  // 五行得分
  assert.deepStrictEqual(result.wuxing, { 火: 0.45, 土: 0.27, 木: 0.05, 水: 0.03, 金: 0 });

  // 能量利用率与内耗
  assert.strictEqual(result.nengliang_liyong, 0.8);
  assert.strictEqual(result.neihao.zhi, 0.2);
  assert.strictEqual(result.neihao.dengji, '中内耗');

  // 十神（地支主气来源，有得分）
  const byZhu = Object.fromEntries(result.shishen_list.filter(s => s.laiyuan === '地支主气').map(s => [s.zhu, s]));
  assert.strictEqual(byZhu['年支'].shishen, '偏印');
  assert.strictEqual(byZhu['年支'].defen, 0.05);
  assert.strictEqual(byZhu['月令'].shishen, '比肩');
  assert.strictEqual(byZhu['月令'].defen, 0.45);
  assert.strictEqual(byZhu['日支'].shishen, '正官'); // V5.5：子=癸水（阴）对丙（阳）→ 正官。见下方专项说明测试。
  assert.strictEqual(byZhu['日支'].defen, 0.03);
  assert.strictEqual(byZhu['时支'].shishen, '食神');
  assert.strictEqual(byZhu['时支'].defen, 0.27);

  // 天干透出十神：己土单独算伤官，不与辰地支食神合并（历史bug#3）
  const byGan = Object.fromEntries(result.shishen_list.filter(s => s.laiyuan === '天干透出').map(s => [s.gan, s]));
  assert.strictEqual(byGan['己'].shishen, '伤官');
  assert.strictEqual(byGan['甲'].shishen, '偏印');
  assert.strictEqual(byGan['壬'].shishen, '七杀');

  // renqun 固定查表（历史bug#2：禁止按得分自行调整）
  for (const s of result.shishen_list) {
    if (s.zhuangtai === '已显化') {
      const isTu = s.laiyuan === '天干透出' ? false : ['辰', '戌', '丑', '未'].includes('');
      assert.ok(['前30%', '前50%'].includes(s.renqun), `renqun 非法: ${s.renqun}`);
    }
  }

  // 做工系统：甲己合（伤官佩印）+ 丙壬冲（杀制群比）
  assert.deepStrictEqual(result.xitong_list, ['伤官佩印', '杀制群比']);
  assert.strictEqual(result.gongzuo.he[0].zuhe, '甲己');
  assert.strictEqual(result.gongzuo.chong_tg[0].zuhe, '丙壬');
  assert.deepStrictEqual(result.gongzuo.chong_dz, []);

  // 完整格局与稀有度（数学计算：大格+2系统 → 占11.4%，累计前23.4%）
  assert.strictEqual(result.wanzheng_geju, '建禄格·伤官佩印·杀制群比');
  assert.strictEqual(result.gejuli, '大格');
  assert.strictEqual(result.xiduyou, '属于人群前23.4%的少见格局（该组合在518,400种命盘中占11.4%）');
  assert.deepStrictEqual(result.xiduyou_data, {
    gejuli: '大格', xitong_shu: 2, dengji: '少见',
    zhanbi: 0.1141, qianfenbi: 0.2344, mingpan_zongshu: 518400
  });

  // 空白五行：金虽无得分，但巳中藏庚金，不为空白
  assert.deepStrictEqual(result.kongbai, []);
});

test('案例二：甲申 壬申 乙巳 戊寅（子平真诠·薛相公命）', () => {
  const { result } = analyze('年柱甲申 月柱壬申 日柱乙巳 时柱戊寅');

  assert.strictEqual(result.rizhu, '乙 · 阴木');
  assert.strictEqual(result.gejuming, '正官格');

  // 藏干算根（历史bug：只查主气）：壬水正印靠申中藏壬有根
  const ren = result.shishen_list.find(s => s.gan === '壬');
  assert.ok(ren, '壬水正印应计入十神列表（有根）');
  assert.strictEqual(ren.shishen, '正印');

  // 戊土正财靠寅中藏戊有根
  const wu = result.shishen_list.find(s => s.gan === '戊');
  assert.ok(wu, '戊土正财应计入十神列表（有根）');
  assert.strictEqual(wu.shishen, '正财');

  // 日主强弱：乙木靠寅木同气有根 → 中和（不能因日支巳无木而判身弱）
  assert.ok(['中和', '身强'].includes(result.rizhu_qiangruo), `日主强弱判定错误: ${result.rizhu_qiangruo}`);

  // 生克主线：财生官 → 官生印 → 财官印顺生
  assert.ok(result.shengke_zhuxian.includes('财生官'));
  assert.ok(result.shengke_zhuxian.includes('官生印'));
  assert.ok(result.shengke_zhuxian.includes('财官印顺生'));

  // 地支寅申冲
  assert.ok(result.gongzuo.chong_dz.some(c => c.zuhe === '寅申'));

  // 稀有度（数学计算：大格+1系统 → 占38.3%，累计前61.7%）
  assert.strictEqual(result.xiduyou, '属于人群前61.7%的常见格局（该组合在518,400种命盘中占38.3%）');
});

test('输入解析与防御', () => {
  assert.ok(parseBazi('甲寅 己巳 丙子 壬辰'));
  assert.ok(parseBazi('年柱甲寅 月柱己巳 日柱丙子 时柱壬辰'));
  assert.strictEqual(parseBazi('甲寅 己巳'), null);
  assert.strictEqual(parseBazi(''), null);
  assert.throws(() => analyze('乱七八糟'));
});

test('历史bug防复发：子=癸水（非壬水），亥=壬水', () => {
  // 丙日主，子水克火：癸为阴水 → 正官；若误用壬水则为七杀
  const { result } = analyze('甲子 丙寅 丙子 甲午');
  const zi = result.shishen_list.filter(s => s.laiyuan === '地支主气' && s.dizhi === '子');
  assert.ok(zi.every(s => s.shishen === '正官'), '子主气应为癸水（阴），对丙为正官');
});

test('历史bug防复发：戌藏丁火，全盘有火不算空白', () => {
  // 四柱无火天干、无火主气地支，但戌藏丁火 → 火不空白
  const { result } = analyze('庚戌 戊子 庚申 丙戌');
  // 此例时干丙为火，换一个更纯的例子
  const r2 = analyze('庚戌 戊子 庚申 庚辰');
  assert.ok(!r2.result.kongbai.includes('火'), '戌中藏丁火，火不应判为空白');
});

test('历史bug防复发：能量利用率恒在0-1之间', () => {
  const cases = ['甲寅 己巳 丙子 壬辰', '甲申 壬申 乙巳 戊寅', '庚戌 戊子 庚申 庚辰', '癸亥 甲子 壬寅 壬寅'];
  for (const c of cases) {
    const { result } = analyze(c);
    assert.ok(result.nengliang_liyong >= 0 && result.nengliang_liyong <= 1, `${c} 利用率越界: ${result.nengliang_liyong}`);
  }
});

test('历史bug防复发：做工系统命名全部在白名单内', () => {
  const WHITELIST = ['伤官佩印', '杀制群比', '食神制杀', '官印相生', '财生官', '财官印顺生', '财印双清', '伤官生财', '杀印相生'];
  const cases = [
    '甲寅 己巳 丙子 壬辰', '甲申 壬申 乙巳 戊寅', '癸卯 戊午 丙申 庚寅',
    '壬子 壬子 壬子 壬寅', '辛未 丁酉 庚午 丁亥', '戊戌 乙卯 甲寅 丙寅'
  ];
  for (const c of cases) {
    const { result } = analyze(c);
    for (const sys of result.xitong_list) {
      assert.ok(WHITELIST.includes(sys), `${c} 出现白名单外命名: ${sys}`);
    }
    for (const sys of result.shengke_zhuxian) {
      const base = sys.replace('（输出变现）', '');
      assert.ok(WHITELIST.includes(base) || base === '食伤生财' || base === '官生印', `${c} 主线出现白名单外命名: ${sys}`);
    }
  }
});

test('确定性：同一八字两次计算结果完全一致', () => {
  const a = analyze('甲寅 己巳 丙子 壬辰');
  const b = analyze('甲寅 己巳 丙子 壬辰');
  assert.deepStrictEqual(a.result, b.result);
});

test('稀有度数学表：总和恰为518,400（60年×12月×60日×12时）', () => {
  const { RARITY_COUNTS, TOTAL_CHARTS } = require('../lib/bazi.js');
  const sum = Object.values(RARITY_COUNTS).reduce((a, b) => a + b, 0);
  assert.strictEqual(sum, TOTAL_CHARTS, `稀有度表总和 ${sum} ≠ ${TOTAL_CHARTS}，表与全枚举不一致`);
  assert.strictEqual(TOTAL_CHARTS, 518400);
});

test('稀有度数学表：所有计数非负，档位单调（占例越大累计占比越大）', () => {
  const { RARITY_COUNTS, TOTAL_CHARTS } = require('../lib/bazi.js');
  for (const [k, v] of Object.entries(RARITY_COUNTS)) {
    assert.ok(Number.isInteger(v) && v >= 0, `非法计数 ${k}=${v}`);
  }
  // 累计占比（不大于自身计数的格子之和）必须随自身计数单调不减
  const cum = (c) => Object.values(RARITY_COUNTS).filter(x => x <= c).reduce((a, b) => a + b, 0);
  const sorted = Object.values(RARITY_COUNTS).filter(v => v > 0).sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(cum(sorted[i]) >= cum(sorted[i - 1]), '累计占比不单调');
  }
  assert.strictEqual(cum(sorted[sorted.length - 1]), TOTAL_CHARTS);
});

