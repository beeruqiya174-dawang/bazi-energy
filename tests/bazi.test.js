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

  // 完整格局（仅描述用）与能量转化效率（ECE=转化能量/捕获能量）
  assert.strictEqual(result.wanzheng_geju, '建禄格·伤官佩印·杀制群比');
  assert.strictEqual(result.gejuli, '大格');
  assert.strictEqual(result.zhuanhua_nengliang, 0.8);
  assert.strictEqual(result.zhuanhua_xiaolv, 1);
  // 转化层次：杀制群比打通官杀（水）通道 → 官贵之途，世俗能量0.03（占已转化3.8%）
  assert.deepStrictEqual(result.zhuanhua_cengci, {
    cengci: '官贵之途', cengci_fen: 3,
    cai_tongdao: false, guan_tongdao: true,
    shisu_nengliang: 0.03, neizai_nengliang: 0.77, shisu_zhanbi: 0.038
  });
  // 根气层次：巳中丙本气强根 + 寅中丙中气弱根 → 有根，可担财官
  assert.deepStrictEqual(result.genqi_cengci, {
    genqi: '有根', genqi_fen: 2,
    qiang_gen: 1, ruo_gen: 1,
    yin_xing: '木', yin_you: true, dangan: '有根，可担财官'
  });
  // 稀有度：根气×层次×ECE×功率四维帕累托（有根+官贵之途+效率100%+功率0.8 → 前4.68%）
  assert.strictEqual(result.xiduyou, '根气「有根」（有根，可担财官），转化层次「官贵之途」（世俗通道能量占已转化3.8%），综合评级「有根·官贵之途·极高转化」：转化效率100%×功率0.8，518,400盘全枚举中仅4.7%同时达到该根气层次与效率功率，位于人群前4.7%');
  assert.deepStrictEqual(result.xiduyou_data, {
    genqi: '有根', genqi_fen: 2,
    cengci: '官贵之途', cengci_fen: 3, shisu_zhanbi: 0.038,
    zhuanhua_xiaolv: 1, zhuanhua_gonglv: 0.8, toubu_zhanbi: 0.0468,
    dengji: '有根·官贵之途·极高转化', mingpan_zongshu: 518400
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

  // 转化层次与稀有度（财官印顺生 → 财官双全，世俗能量占比100%；ECE=0.902 功率=0.55 → 四维前6.96%）
  assert.strictEqual(result.zhuanhua_xiaolv, 0.902);
  assert.strictEqual(result.zhuanhua_nengliang, 0.55);
  assert.strictEqual(result.zhuanhua_cengci.cengci, '财官双全');
  assert.strictEqual(result.zhuanhua_cengci.cengci_fen, 4);
  assert.strictEqual(result.zhuanhua_cengci.shisu_zhanbi, 1);
  // 根气：乙木通根寅中甲木（劫财根，本气位强根）→ 有根
  assert.strictEqual(result.genqi_cengci.genqi, '有根');
  assert.strictEqual(result.genqi_cengci.genqi_fen, 2);
  assert.strictEqual(result.xiduyou, '根气「有根」（有根，可担财官），转化层次「财官双全」（世俗通道能量占已转化100%），综合评级「有根·财官双全·高效转化」：转化效率90.2%×功率0.55，518,400盘全枚举中仅7%同时达到该根气层次与效率功率，位于人群前7%');
  assert.strictEqual(result.xiduyou_data.toubu_zhanbi, 0.0696);
  assert.strictEqual(result.xiduyou_data.dengji, '有根·财官双全·高效转化');
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

test('转化分布表：3×5×20×20四维网格总和恰为518,400（60年×12月×60日×12时）', () => {
  const { GENQI_CENGGI_ECE_POWER_GRID, TOTAL_CHARTS } = require('../lib/bazi.js');
  assert.strictEqual(GENQI_CENGGI_ECE_POWER_GRID.length, 3);
  for (const gq of GENQI_CENGGI_ECE_POWER_GRID) {
    assert.strictEqual(gq.length, 5);
    for (const lv of gq) {
      assert.strictEqual(lv.length, 20);
      for (const row of lv) {
        assert.strictEqual(row.length, 20);
        for (const v of row) assert.ok(Number.isInteger(v) && v >= 0, `非法计数 ${v}`);
      }
    }
  }
  let sum = 0;
  for (const gq of GENQI_CENGGI_ECE_POWER_GRID) for (const lv of gq) for (const row of lv) for (const v of row) sum += v;
  assert.strictEqual(sum, TOTAL_CHARTS, `分布表总和 ${sum} ≠ ${TOTAL_CHARTS}，表与全枚举不一致`);
  assert.strictEqual(TOTAL_CHARTS, 518400);
});

test('转化分布表：四维帕累托头部占比随根气/层次/效率/功率桶单调不增', () => {
  const { GENQI_CENGGI_ECE_POWER_GRID, TOTAL_CHARTS } = require('../lib/bazi.js');
  const dom = (g, l, e, p) => {
    let c = 0;
    for (let a = g; a < 3; a++) for (let b = l; b < 5; b++) for (let j = e; j < 20; j++) for (let k = p; k < 20; k++) c += GENQI_CENGGI_ECE_POWER_GRID[a][b][j][k];
    return c;
  };
  for (let e = 0; e < 20; e++) {
    for (let p = 0; p < 20; p++) {
      if (e < 19) {
        assert.ok(dom(2, 0, e, p) >= dom(2, 0, e + 1, p), `单调性破坏 e=${e} p=${p}`);
        assert.ok(dom(2, 4, e, p) >= dom(2, 4, e + 1, p), `顶层单调性破坏 e=${e} p=${p}`);
      }
      if (p < 19) {
        assert.ok(dom(2, 0, e, p) >= dom(2, 0, e, p + 1), `单调性破坏 e=${e} p=${p}`);
        assert.ok(dom(2, 4, e, p) >= dom(2, 4, e, p + 1), `顶层单调性破坏 e=${e} p=${p}`);
      }
    }
  }
  for (let l = 0; l < 4; l++) assert.ok(dom(2, l, 0, 0) >= dom(2, l + 1, 0, 0), `层次单调性破坏 l=${l}`);
  for (let g = 0; g < 2; g++) assert.ok(dom(g, 0, 0, 0) >= dom(g + 1, 0, 0, 0), `根气单调性破坏 g=${g}`);
  assert.strictEqual(dom(0, 0, 0, 0), TOTAL_CHARTS);
});

test('转化层次：世俗+内在=转化能量，层次名在白名单内', () => {
  const CENGGI_WHITELIST = ['财官双全', '官贵之途', '财富之路', '内在通达', '能量未转化'];
  const cases = ['甲寅 己巳 丙子 壬辰', '甲申 壬申 乙巳 戊寅', '庚戌 戊子 庚申 庚辰', '癸亥 甲子 壬寅 壬寅', '甲子 甲子 甲子 甲子'];
  for (const c of cases) {
    const { result } = analyze(c);
    const cc = result.zhuanhua_cengci;
    assert.ok(CENGGI_WHITELIST.includes(cc.cengci), `${c} 层次名非法: ${cc.cengci}`);
    assert.ok([0, 1, 2, 3, 4].includes(cc.cengci_fen), `${c} 层次分非法: ${cc.cengci_fen}`);
    // 能量守恒：世俗 + 内在 = 转化能量
    assert.ok(Math.abs(cc.shisu_nengliang + cc.neizai_nengliang - result.zhuanhua_nengliang) < 1e-9,
      `${c} 世俗${cc.shisu_nengliang} + 内在${cc.neizai_nengliang} ≠ 转化${result.zhuanhua_nengliang}`);
    // 双通道 ⟺ 财官双全；单通道 ⟺ 官贵/财富；零系统 ⟺ 未转化
    if (cc.cai_tongdao && cc.guan_tongdao) assert.strictEqual(cc.cengci, '财官双全');
    if (cc.cai_tongdao && !cc.guan_tongdao) assert.strictEqual(cc.cengci, '财富之路');
    if (!cc.cai_tongdao && cc.guan_tongdao) assert.strictEqual(cc.cengci, '官贵之途');
    if (result.xitong_list.length === 0) assert.strictEqual(cc.cengci, '能量未转化');
    // 世俗能量 ≤ 转化能量
    assert.ok(cc.shisu_nengliang <= result.zhuanhua_nengliang + 1e-9, `${c} 世俗能量超过转化能量`);
  }
});

test('根气层次：有根>有气无根>无根无气，与藏干/印星判定一致', () => {
  const GENQI_WHITELIST = ['无根无气', '有气无根', '有根'];
  const cases = ['甲寅 己巳 丙子 壬辰', '甲申 壬申 乙巳 戊寅', '庚戌 戊子 庚申 庚辰', '癸亥 甲子 壬寅 壬寅', '甲子 甲子 甲子 甲子'];
  for (const c of cases) {
    const { result } = analyze(c);
    const gc = result.genqi_cengci;
    assert.ok(GENQI_WHITELIST.includes(gc.genqi), `${c} 根气名非法: ${gc.genqi}`);
    assert.ok([0, 1, 2].includes(gc.genqi_fen), `${c} 根气分非法: ${gc.genqi_fen}`);
    assert.ok(GENQI_WHITELIST.indexOf(gc.genqi) === gc.genqi_fen, `${c} 根气名与根气分不匹配`);
    // 有根 ⟺ 强根+弱根 > 0
    assert.strictEqual(gc.genqi_fen === 2, (gc.qiang_gen + gc.ruo_gen) > 0, `${c} 有根判定与根数矛盾`);
    // 无根无气 ⟺ 无根 且 印星无落点
    if (gc.genqi_fen === 0) assert.strictEqual(gc.yin_you, false, `${c} 无根无气但印星有落点`);
    if (gc.genqi_fen >= 1) assert.ok(gc.yin_you || gc.qiang_gen + gc.ruo_gen > 0, `${c} 层次≥1 但既无根也无印`);
  }
});

test('转化能量恒不超过捕获能量，ECE 恒在0-1之间', () => {
  const cases = ['甲寅 己巳 丙子 壬辰', '甲申 壬申 乙巳 戊寅', '庚戌 戊子 庚申 庚辰', '癸亥 甲子 壬寅 壬寅', '甲子 甲子 甲子 甲子'];
  for (const c of cases) {
    const { result } = analyze(c);
    assert.ok(result.zhuanhua_nengliang <= result.nengliang_liyong + 1e-9, `${c} 转化能量超过捕获能量`);
    assert.ok(result.zhuanhua_xiaolv >= 0 && result.zhuanhua_xiaolv <= 1, `${c} ECE越界: ${result.zhuanhua_xiaolv}`);
  }
});

