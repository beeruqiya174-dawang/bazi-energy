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

  // 五行得分（藏干计分版：主气分不变，中气×0.3/余气×0.15补充分）
  assert.deepStrictEqual(result.wuxing, { 火: 0.48, 土: 0.345, 木: 0.095, 水: 0.039, 金: 0.014 });

  // 能量利用率与内耗（藏干补充后捕获0.973，利用率封顶显示）
  assert.strictEqual(result.nengliang_liyong, 0.973);
  assert.strictEqual(result.neihao.zhi, 0.027);
  assert.strictEqual(result.neihao.dengji, '低内耗');

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

  // 完整格局（仅描述用）与能量转化效率（ECE=世俗流/捕获能量，藏干计入捕获）
  assert.strictEqual(result.wanzheng_geju, '建禄格·伤官佩印·杀制群比');
  assert.strictEqual(result.gejuli, '大格');
  // 真流模型 V7.1：体源（火0.48+木0.095+土0.345）流向用（金0.014+水0.039）
  // 世俗流 = 官杀桶就地0.039 + 金生水管道流入0.014 = 0.053（财通道闭，金桶经金生水作为源真实流入官）
  // 财生官滋养：金财0.014先行滋养官桶（水桶有效实体0.039→0.053，管宽口径，金桶保留）
  // 内在流0.053：官生印管道（水生木）按滋养后有效实体重建 → 官印相生放大（0.039→0.053）
  assert.strictEqual(result.zhuanhua_nengliang, 0.053);
  assert.strictEqual(result.zhuanhua_xiaolv, 0.054);
  // 转化层次：杀制群比打通官杀（水）通道，官有地支电流（子主气0.039）→ 官贵之途
  // 财（金）有藏干电流（巳中庚金中气0.014）但不在做工系统内 → 通道仍关（电流≠通道，还需系统参与）
  // 食伤（土）在伤官佩印系统中流向内在，不归世俗 → shi_guishu=false（做工归属原则）
  assert.deepStrictEqual(result.zhuanhua_cengci, {
    cengci: '官贵之途', cengci_fen: 3,
    cai_tongdao: false, guan_tongdao: true,
    cai_dianliu: true, guan_dianliu: true,
    shisu_nengliang: 0.053, neizai_nengliang: 0.053, shisu_zhanbi: 0.5,
    shi_guishu: false,
    shisu_liu: 0.053, neizai_liu: 0.053, shuru_liu: 0.014,
    ke_liu: 0, ke_sunhao: 0, pingjing: '金生水管宽0.014',
    ziyang_liang: 0.014, ziyang_guan_hou: 0.053
  });
  // 根气层次：巳中丙本气强根 + 寅中丙中气弱根 → 有根，承重系数1
  assert.deepStrictEqual(result.genqi_cengci, {
    genqi: '有根', genqi_fen: 2, xishu: 1, congge: false, congge_ming: '',
    qiang_gen: 1, ruo_gen: 1,
    yin_xing: '木', yin_you: true, dangan: '有根，可担财官'
  });
  // 稀有度：层次×ECE×有效功率三维帕累托（官贵之途+效率5.4%+有效功率0.053 → 前31.6%）
  assert.strictEqual(result.xiduyou, '根气「有根」承重系数1（有根，可担财官），转化层次「官贵之途」（体用流转外向50%：世俗流0.053/内在流0.053），综合评级「官贵之途·中等转化」：转化效率5.4%×有效功率0.053（转化功率0.053×根气系数1），转化瓶颈：金生水管宽0.014，518,400盘全枚举中仅31.6%同时达到该层次与效率有效功率，位于人群前31.6%');
  assert.deepStrictEqual(result.xiduyou_data, {
    genqi: '有根', genqi_xishu: 1, congge: false,
    cengci: '官贵之途', cengci_fen: 3, shisu_zhanbi: 0.5,
    zhuanhua_xiaolv: 0.054, zhuanhua_gonglv: 0.053, youxiao_gonglv: 0.053, toubu_zhanbi: 0.3157,
    dengji: '官贵之途·中等转化', mingpan_zongshu: 518400
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

// 转化层次与稀有度（真流模型 V7.1：金官0.595+土财0.076 双桶充实，
//   财生官滋养：土财0.076先行滋养金官（金桶有效实体0.595→0.671，管宽口径，土桶保留——食伤生财中继不断）
//   火生土管道0.048补财路 → 世俗流0.719（外向96%）；内在流0.03（官生印回流）
//   ECE=0.801 功率=0.719 → 三维前6.06%）
  assert.strictEqual(result.zhuanhua_xiaolv, 0.801);
  assert.strictEqual(result.zhuanhua_nengliang, 0.719);
  assert.strictEqual(result.zhuanhua_cengci.cengci, '财官双全');
  assert.strictEqual(result.zhuanhua_cengci.cengci_fen, 4);
  assert.strictEqual(result.zhuanhua_cengci.cai_tongdao, true);
  assert.strictEqual(result.zhuanhua_cengci.guan_tongdao, true);
  assert.strictEqual(result.zhuanhua_cengci.cai_dianliu, true);
  assert.strictEqual(result.zhuanhua_cengci.guan_dianliu, true);
  assert.strictEqual(result.zhuanhua_cengci.shisu_zhanbi, 0.96);
  assert.strictEqual(result.zhuanhua_cengci.ziyang_liang, 0.076);
  assert.strictEqual(result.zhuanhua_cengci.ziyang_guan_hou, 0.671);
  // 根气：乙木通根寅中甲木（劫财根，本气位强根）→ 有根，承重系数1
  assert.strictEqual(result.genqi_cengci.genqi, '有根');
  assert.strictEqual(result.genqi_cengci.genqi_fen, 2);
  assert.strictEqual(result.genqi_cengci.xishu, 1);
  assert.strictEqual(result.xiduyou, '根气「有根」承重系数1（有根，可担财官），转化层次「财官双全」（体用流转外向96%：世俗流0.719/内在流0.03），综合评级「财官双全·高效转化」：转化效率80.1%×有效功率0.719（转化功率0.719×根气系数1），转化瓶颈：火生土管宽0.048，518,400盘全枚举中仅6.1%同时达到该层次与效率有效功率，位于人群前6.1%');
  assert.strictEqual(result.xiduyou_data.toubu_zhanbi, 0.0606);
  assert.strictEqual(result.xiduyou_data.youxiao_gonglv, 0.719);
  assert.strictEqual(result.xiduyou_data.dengji, '财官双全·高效转化');
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
  const WHITELIST = ['伤官佩印', '杀制群比', '食神制杀', '食神和官', '官印相生', '财生官', '财官印顺生', '财印双清', '伤官生财', '食神生财', '杀印相生'];
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
      assert.ok(WHITELIST.includes(base) || base === '官生印', `${c} 主线出现白名单外命名: ${sys}`);
    }
  }
});

test('确定性：同一八字两次计算结果完全一致', () => {
  const a = analyze('甲寅 己巳 丙子 壬辰');
  const b = analyze('甲寅 己巳 丙子 壬辰');
  assert.deepStrictEqual(a.result, b.result);
});

test('转化分布表：5×20×20三维网格总和恰为518,400（60年×12月×60日×12时）', () => {
  const { CENGGI_ECE_YOUXIAO_GRID, TOTAL_CHARTS } = require('../lib/bazi.js');
  assert.strictEqual(CENGGI_ECE_YOUXIAO_GRID.length, 5);
  for (const lv of CENGGI_ECE_YOUXIAO_GRID) {
    assert.strictEqual(lv.length, 20);
    for (const row of lv) {
      assert.strictEqual(row.length, 20);
      for (const v of row) assert.ok(Number.isInteger(v) && v >= 0, `非法计数 ${v}`);
    }
  }
  let sum = 0;
  for (const lv of CENGGI_ECE_YOUXIAO_GRID) for (const row of lv) for (const v of row) sum += v;
  assert.strictEqual(sum, TOTAL_CHARTS, `分布表总和 ${sum} ≠ ${TOTAL_CHARTS}，表与全枚举不一致`);
  assert.strictEqual(TOTAL_CHARTS, 518400);
});

test('转化分布表：三维帕累托头部占比随层次/效率/有效功率桶单调不增', () => {
  const { CENGGI_ECE_YOUXIAO_GRID, TOTAL_CHARTS } = require('../lib/bazi.js');
  const dom = (l, e, p) => {
    let c = 0;
    for (let i = l; i < 5; i++) for (let j = e; j < 20; j++) for (let k = p; k < 20; k++) c += CENGGI_ECE_YOUXIAO_GRID[i][j][k];
    return c;
  };
  for (let e = 0; e < 20; e++) {
    for (let p = 0; p < 20; p++) {
      if (e < 19) {
        assert.ok(dom(0, e, p) >= dom(0, e + 1, p), `单调性破坏 e=${e} p=${p}`);
        assert.ok(dom(4, e, p) >= dom(4, e + 1, p), `顶层单调性破坏 e=${e} p=${p}`);
      }
      if (p < 19) {
        assert.ok(dom(0, e, p) >= dom(0, e, p + 1), `单调性破坏 e=${e} p=${p}`);
        assert.ok(dom(4, e, p) >= dom(4, e, p + 1), `顶层单调性破坏 e=${e} p=${p}`);
      }
    }
  }
  for (let l = 0; l < 4; l++) {
    assert.ok(dom(l, 0, 0) >= dom(l + 1, 0, 0), `层次单调性破坏 l=${l}`);
  }
  assert.strictEqual(dom(0, 0, 0), TOTAL_CHARTS);
});


test('转化层次：体用双流的守恒不变量，层次名在白名单内', () => {
  const CENGGI_WHITELIST = ['财官双全', '官贵之途', '财富之路', '内在通达', '能量未转化'];
  const cases = ['甲寅 己巳 丙子 壬辰', '甲申 壬申 乙巳 戊寅', '庚戌 戊子 庚申 庚辰', '癸亥 甲子 壬寅 壬寅', '甲子 甲子 甲子 甲子'];
  for (const c of cases) {
    const { result } = analyze(c);
    const cc = result.zhuanhua_cengci;
    assert.ok(CENGGI_WHITELIST.includes(cc.cengci), `${c} 层次名非法: ${cc.cengci}`);
    assert.ok([0, 1, 2, 3, 4].includes(cc.cengci_fen), `${c} 层次分非法: ${cc.cengci_fen}`);
    // 真流模型 V7 守恒：转化能量 = 外向世俗流（层次≥财富之路时）/ 内在流（层次=内在通达时）/ 0（未转化）
    // 世俗流与内在流是体用之间的两条并行管道（外向输出 vs 回流滋养），不是同一笔能量的切分
    const expectZhuanhua = cc.cengci_fen >= 2 ? cc.shisu_liu : (cc.cengci_fen === 1 ? cc.neizai_liu : 0);
    assert.ok(Math.abs(expectZhuanhua - result.zhuanhua_nengliang) < 1e-9,
      `${c} 转化${result.zhuanhua_nengliang} ≠ 按层次取流（${expectZhuanhua}）`);
    // 兼容字段：shisu_nengliang/neizai_nengliang 即两流本值
    assert.ok(Math.abs(cc.shisu_nengliang - cc.shisu_liu) < 1e-9, `${c} shisu_nengliang 与 shisu_liu 不一致`);
    assert.ok(Math.abs(cc.neizai_nengliang - cc.neizai_liu) < 1e-9, `${c} neizai_nengliang 与 neizai_liu 不一致`);
    // 双通道 ⟺ 财官双全；单通道 ⟺ 官贵/财富；零系统 ⟺ 未转化
    if (cc.cai_tongdao && cc.guan_tongdao) assert.strictEqual(cc.cengci, '财官双全');
    if (cc.cai_tongdao && !cc.guan_tongdao) assert.strictEqual(cc.cengci, '财富之路');
    if (!cc.cai_tongdao && cc.guan_tongdao) assert.strictEqual(cc.cengci, '官贵之途');
    if (result.xitong_list.length === 0) assert.strictEqual(cc.cengci, '能量未转化');
    // 世俗能量 ≤ 转化能量（层次≥2 时两者相等；层次<2 时世俗流必为0）
    assert.ok(cc.shisu_nengliang <= result.zhuanhua_nengliang + 1e-9, `${c} 世俗能量超过转化能量`);
    // 管道流入 ≤ 世俗流（就地算有 + 管道流入 = 世俗流）
    assert.ok(cc.shuru_liu <= cc.shisu_liu + 1e-9, `${c} 管道流入超过世俗流`);
    // 克损耗守恒：ke_sunhao = ke_liu × (1-η)/η，η=0.8
    assert.ok(Math.abs(cc.ke_sunhao - cc.ke_liu * 0.25) < 1e-9, `${c} 克损耗≠克流量×25%`);
  }
});

test('根气层次：有根>有气无根>无根无气，承重系数与从格特判一致', () => {
  const GENQI_WHITELIST = ['无根无气', '有气无根', '有根'];
  const cases = ['甲寅 己巳 丙子 壬辰', '甲申 壬申 乙巳 戊寅', '庚戌 戊子 庚申 庚辰', '癸亥 甲子 壬寅 壬寅', '甲子 甲子 甲子 甲子',
    '甲寅 丙寅 癸卯 甲寅', '甲子 癸酉 己卯 甲子'];
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
    // 承重系数：有根1 / 有气无根0.5 / 无根无气0（从格特判1）
    const expectXishu = gc.genqi_fen === 2 ? 1 : gc.genqi_fen === 1 ? 0.5 : (gc.congge ? 1 : 0);
    assert.strictEqual(gc.xishu, expectXishu, `${c} 承重系数错误`);
    // 从格 ⟺ 无根无气 且 通道已开（层次≥财富之路）且 通道里有真能量（功率≥0.5）
    assert.strictEqual(gc.congge,
      gc.genqi_fen === 0 && result.zhuanhua_cengci.cengci_fen >= 2 && result.zhuanhua_nengliang >= 0.5,
      `${c} 从格特判错误`);
    // congge_ming ⟺ congge（有根盘不得携带从格名）
    assert.strictEqual(gc.congge_ming ? true : false, gc.congge, `${c} congge_ming 与 congge 不一致`);
    // 有效功率 = 转化功率 × 承重系数
    assert.ok(Math.abs(result.xiduyou_data.youxiao_gonglv - Math.round(result.zhuanhua_nengliang * expectXishu * 1000) / 1000) < 1e-9,
      `${c} 有效功率 ≠ 转化功率×承重系数`);
  }
});

test('从格特判：甲子 癸酉 戊子 癸亥（戊土无根无印、水财木官，弃命从财官）', () => {
  const { result } = analyze('甲子 癸酉 戊子 癸亥');
  assert.strictEqual(result.genqi_cengci.genqi, '无根无气');
  // 真流模型 V7.1：金官0.45+水财0.401 双桶充实且互相供养（金生水管宽0.401）
  // 财生官滋养：水财0.009先行滋养木官（木桶有效实体0.009→0.018）
  // 世俗流0.811（就地+管道）→ 财官双全，转化功率0.811≥0.5 → 从得真
  assert.strictEqual(result.zhuanhua_cengci.cengci, '财官双全');
  assert.strictEqual(result.genqi_cengci.congge, true);
  assert.strictEqual(result.genqi_cengci.congge_ming, '从财官');
  assert.strictEqual(result.genqi_cengci.xishu, 1);
  assert.strictEqual(result.xiduyou_data.youxiao_gonglv, 0.811);
  assert.strictEqual(result.xiduyou_data.dengji, '从财官·极高转化');
  assert.strictEqual(result.xiduyou_data.toubu_zhanbi, 0.037);
});

test('从格特判：甲寅 丙寅 癸卯 甲寅（癸水无根无印、伤官成局生财——流模型下从得不真，不算从格）', () => {
  const { result } = analyze('甲寅 丙寅 癸卯 甲寅');
  assert.strictEqual(result.genqi_cengci.genqi, '无根无气');
  assert.strictEqual(result.zhuanhua_cengci.cengci, '财富之路');
  // 真流模型 V7.1 诚实结论（大王已知情）：财桶（火0.23）接不住伤官势（木0.895）
  // 木生火管宽 = min(0.895, 0.23) = 0.23，世俗流 = 财桶就地0.23 + 管道流入0.23 = 0.46 < 0.5
  // 官（土）通道闭 → 财生官滋养不触发（大王拍板：官通道开启才滋养）
  // 从得不真 → 不算从格，承重系数归零（旧桶模型曾整桶划转误判 1.125 为从财）
  assert.strictEqual(result.genqi_cengci.congge, false);
  assert.strictEqual(result.genqi_cengci.congge_ming, '');
  assert.strictEqual(result.genqi_cengci.xishu, 0);
  assert.strictEqual(result.zhuanhua_nengliang, 0.46);
  assert.strictEqual(result.zhuanhua_xiaolv, 0.404);
  assert.strictEqual(result.xiduyou_data.youxiao_gonglv, 0);
  assert.strictEqual(result.xiduyou_data.dengji, '财富之路·中等转化');
  assert.strictEqual(result.xiduyou_data.toubu_zhanbi, 0.3257);
  // 通道电流：财（火）有藏干电流（寅中丙火中气）→ cai_dianliu=true（虚透之财被食伤电流+藏干共同养活）
  assert.strictEqual(result.zhuanhua_cengci.cai_dianliu, true);
  assert.strictEqual(result.zhuanhua_cengci.cai_tongdao, true);
  // 世俗归属（做工归属原则）：伤官生财系统 → 伤官（木）顺生入财路，世俗流0.46 全外向
  assert.strictEqual(result.zhuanhua_cengci.shi_guishu, true);
  assert.strictEqual(result.zhuanhua_cengci.shisu_zhanbi, 1);
  assert.strictEqual(result.zhuanhua_cengci.shisu_nengliang, 0.46);
  // 转化瓶颈在接收端：木生火管宽0.23（财桶容量限制，非输送不足）
  assert.strictEqual(result.zhuanhua_cengci.pingjing, '木生火管宽0.23');
});

test('食神和官（乙庚合=食神与正官相辅）：乙卯 丙戌 戊子 庚申', () => {
  // 食神+正官 在原白名单中缺失，导致此盘被判为「能量未转化」、转化效率0（用户上报的硬 bug）
  // 修复后：乙庚合 → 食神和官（食神生财、财生官：才华→财富→仕途链条，相辅相成）
  // 真流模型 V7.1：财生官滋养 + 财通道闭时财作源真实流入官（大王本人的提议）
  // 水财0.02经水生木先行滋养官桶（木桶有效实体0.02→0.04，管宽口径，水桶保留）
  // → 克边（金克木）管宽由0.8×min(金0.04,木0.02)=0.016 扩至 0.8×min(金0.04,木0.04)=0.032
  // 水通道闭 → 水桶0.024作为源经水生木（管宽min(0.024,0.04)=0.024）真实流入官侧入账
  // 世俗流 = 官杀桶就地0.02 + 管道流入0.056（水生木0.024+克边0.032）= 0.076、ECE 0.079
  // 克边按 η=0.8 导流，损耗0.008 计入内耗（杀敌一千自损八百）
  // 注意：食神与正官非敌对，是「和」关系（食神制杀的对象是七杀，正官不受制）；命名对称于食神制杀。
  const { result } = analyze('乙卯 丙戌 戊子 庚申');
  assert.strictEqual(result.xitong_list.includes('食神和官'), true, '做工系统应识别食神和官');
  assert.strictEqual(result.zhuanhua_cengci.ziyang_liang, 0.02);
  assert.strictEqual(result.zhuanhua_cengci.ziyang_guan_hou, 0.04);
  assert.strictEqual(result.zhuanhua_nengliang, 0.076);
  assert.strictEqual(result.zhuanhua_xiaolv, 0.079);
  assert.strictEqual(result.zhuanhua_cengci.shisu_liu, 0.076);
  assert.strictEqual(result.zhuanhua_cengci.ke_liu, 0.032);
  assert.strictEqual(result.zhuanhua_cengci.ke_sunhao, 0.008);
  assert.strictEqual(result.neihao.ke_sunhao, 0.008);
  assert.ok(result.neihao.yuanyin.includes('杀敌一千自损八百'), '克战损耗应写入内耗原因');
  // 戌藏丁火（余气0.034）→ 火初始能量不再为0（大王拍板：地支藏干有初始能量）
  assert.strictEqual(result.wuxing['火'], 0.034);
  assert.ok(result.canggan_mingxi.some(c => c.canggan === '丁' && c.dizhi === '戌' && c.weizhi === '余气'), '戌藏丁火应出现在藏干明细');
  assert.strictEqual(result.zhuanhua_cengci.cengci, '官贵之途');
  assert.strictEqual(result.zhuanhua_cengci.cengci_fen, 3);
  assert.strictEqual(result.zhuanhua_cengci.guan_tongdao, true);
  assert.strictEqual(result.zhuanhua_cengci.guan_dianliu, true); // 庚申主气庚金=食神电流喂官
  assert.strictEqual(result.xiduyou_data.dengji, '官贵之途·中等转化');
});

test('食神生财（辛亥 戊戌 丙戌 辛卯）：食神+正财原缺失导致转化效率0（用户上报硬bug）', () => {
  // 伤官生财在系统白名单中，但「食神生财」原先是展示标签、不进 mainlineSystems，
  // 导致所有 食神+财而无伤官 的盘被判「能量未转化」、转化效率0。
  // 修复后：食神生财成为做工系统（食神土+正财金计入转化能量）。
  // 真流模型 V7：世俗流 = 财桶就地0.163 + 土生金管道流入0.163 → 0.326、ECE 0.369；
  // 瓶颈在输送端（土生金管宽0.163 = min(0.6, 0.163)，财桶虽小但土源够，管道就那么宽）
  const { result } = analyze('辛亥 戊戌 丙戌 辛卯');
  assert.strictEqual(result.xitong_list.includes('食神生财'), true, '做工系统应识别食神生财');
  assert.strictEqual(result.zhuanhua_nengliang, 0.326);
  assert.strictEqual(result.zhuanhua_xiaolv, 0.369);
  assert.strictEqual(result.zhuanhua_cengci.cengci, '财富之路');
  assert.strictEqual(result.zhuanhua_cengci.cengci_fen, 2);
  assert.strictEqual(result.zhuanhua_cengci.cai_tongdao, true);
  assert.strictEqual(result.zhuanhua_cengci.shi_guishu, true);  // 食神顺生归财路
  assert.strictEqual(result.zhuanhua_cengci.shisu_zhanbi, 0.97);
  assert.strictEqual(result.zhuanhua_cengci.pingjing, '土生金管宽0.163');
  assert.strictEqual(result.xiduyou_data.dengji, '财富之路·中等转化');
});

test('世俗归属：体用双流记账——用桶就地算有+管道流入；食伤和官克边导流；印向系统不归世俗', () => {
  // 伤官生财（从财例）：世俗流 = 财桶（火）就地0.23 + 木生火管道流入0.23 = 0.46
  const c1 = analyze('甲寅 丙寅 癸卯 甲寅').result;
  assert.strictEqual(c1.zhuanhua_cengci.shi_guishu, true);
  assert.strictEqual(c1.zhuanhua_cengci.shisu_nengliang, 0.46);
  assert.strictEqual(c1.zhuanhua_cengci.shuru_liu, 0.23); // 管道流入恰为财桶容量（管宽=接收桶）
  assert.ok(Math.abs(c1.zhuanhua_cengci.shisu_nengliang - (c1.wuxing['火'] + c1.zhuanhua_cengci.shuru_liu)) < 1e-9,
    '世俗流 = 财桶就地 + 管道流入');
  // 大王基准盘：伤官佩印（食伤流向内在）+ 杀制群比（比劫被制不流向财官）→ 食伤不归世俗
  // 世俗流 = 官杀桶（水）就地0.039 + 食伤生财管道流入0.014 = 0.053（财通道关，金桶就地不算）
  const c2 = analyze('甲寅 己巳 丙子 壬辰').result;
  assert.strictEqual(c2.zhuanhua_cengci.shi_guishu, false);
  assert.strictEqual(c2.zhuanhua_cengci.shisu_nengliang, 0.053);
  assert.ok(Math.abs(c2.zhuanhua_cengci.shisu_nengliang - (c2.wuxing['水'] + c2.zhuanhua_cengci.shuru_liu)) < 1e-9,
    '世俗流 = 官杀桶就地 + 管道流入');
});

test('从格特判：甲午 己巳 乙巳 辛巳（乙木无根无印、官贵之途但功率0.072——从得不真，不算从格）', () => {
  // 真流模型 V7.1：官通道开（辛金七杀有巳中主气电流）但世俗流仅0.072
  // （官杀桶就地0.024 + 管道流入0.048；财生官滋养下土财作为源经土生金流入官——财党杀）
  // 杀制群比电流微弱 → 0.072 < 0.5 → 从得不真
  const { result } = analyze('甲午 己巳 乙巳 辛巳');
  assert.strictEqual(result.genqi_cengci.genqi, '无根无气');
  assert.strictEqual(result.zhuanhua_cengci.cengci, '官贵之途');
  assert.strictEqual(result.genqi_cengci.congge, false);
  assert.strictEqual(result.genqi_cengci.congge_ming, '');
  assert.strictEqual(result.genqi_cengci.xishu, 0);
  assert.strictEqual(result.zhuanhua_nengliang, 0.072);
  assert.strictEqual(result.xiduyou_data.youxiao_gonglv, 0);
  assert.strictEqual(result.xiduyou_data.toubu_zhanbi, 0.3249);
});

test('转化能量恒不超过捕获能量，ECE 恒在0-1之间', () => {
  const cases = ['甲寅 己巳 丙子 壬辰', '甲申 壬申 乙巳 戊寅', '庚戌 戊子 庚申 庚辰', '癸亥 甲子 壬寅 壬寅', '甲子 甲子 甲子 甲子'];
  for (const c of cases) {
    const { result } = analyze(c);
    assert.ok(result.zhuanhua_nengliang <= result.nengliang_liyong + 1e-9, `${c} 转化能量超过捕获能量`);
    assert.ok(result.zhuanhua_xiaolv >= 0 && result.zhuanhua_xiaolv <= 1, `${c} ECE越界: ${result.zhuanhua_xiaolv}`);
  }
});

