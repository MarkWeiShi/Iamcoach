/* ==========================================================
   我是教练 + 环球世界 Demo · 主逻辑
   - 严格按照 PRD 实现：
     · 单次抽奖消耗 GOAL；GOAL 不足 → 提示，不扣费、不计入进度
     · 宫格内有球 → X% 概率成功；无球 → 直接失败
     · 失败清零 success_progress；成功累计 1，满 3 触发卡片掉落
     · 国家卡片在未获得国家中等概率分配： 1/(48-card_owned)
     · 集齐 16 / 32 / 48 弹起解锁权益卡片
   ========================================================== */
(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  const CONFIG = {
    GOAL_COST: 10,            // 单次抽奖消耗
    SUCCESS_RATE: 0.6,        // 宫格有球时的成功概率 X%
    BALL_MOVE_INTERVAL: 1100, // 足球切换间隔 (ms)
    BALL_VISIBLE_RATE: 0.85,  // 每次切换时球出现的概率（其余时间球可能消失）
  };

  const TEXTS = {
    fail: [
      { text: '对手中场一脚抢断，我方进攻戒然而止！',     sfx: 'boo'         },
      { text: '后腰调度失误，长传被对方轻松带走。',         sfx: 'sigh'        },
      { text: '前锋拼抢中踏伤倒地，被担架抬出场外！',     sfx: 'gasp'        },
      { text: '防守动作过大，主裁哨响吹了犯规！',         sfx: 'whistle-foul' },
      { text: '廟德对抽身被镜像铲倒，反击点完全中断。',     sfx: 'thud'        },
      { text: '高空球头顶拼抓失势，丢掉了第二点机会。',     sfx: 'sigh'        },
    ],
    success: [
      { text: '清道夫一脚大脚解围，进攻压力应声化解。',     sfx: 'applause'    },
      { text: '中场连环三脚短传渗透，对方防线被撞开！',     sfx: 'excite'      },
      { text: '禁区弧顶一脚妖传直赛，隔断三名防守！',     sfx: 'wow'         },
      { text: '前场被犯赢得一脚任意球，机会绝佳！',         sfx: 'whistle-soft' },
      { text: '左侧开出弧线下坠角球，门前一阵混战。',         sfx: 'corner'      },
      { text: '边路接应取得界外球，快速发动反击在即。',     sfx: 'rally'       },
    ],
    win: [
      { text: '门前 25 米抽射闪电远射，球应声中网！',         sfx: 'goal-power'   },
      { text: '角球中后点高跃头锥，武锁后角在必得！',     sfx: 'goal-header'  },
      { text: '门前乱军中抢到第一点，一脚推射入网！',     sfx: 'goal-tap'     },
      { text: '禁区边缘一脚挑射远角，越过出接门将！',     sfx: 'goal-finesse' },
      { text: '抹过后卫一脚抽射远角，精准钉入死角！',     sfx: 'goal-power'   },
      { text: '与门将单刀推射近角，冷静送球入网！',         sfx: 'goal-finesse' },
    ],
    neutral: [
      { text: '中场陷入胶着拉扯，双方在中圈反复倒脚。',     sfx: 'rally'  },
      { text: '两队均势对峙，攻防节奏暂时平稳。',           sfx: 'rally'  },
      { text: '皮球在边线附近反复争抢，局势僵持。',         sfx: 'rally'  },
      { text: '后场来回横传，对方上抢逼迫不出空间。',       sfx: 'rally'  },
      { text: '场上比赛进入相持阶段，势均力敌。',           sfx: 'rally'  },
      { text: '看台球迷齐声助威，等待教练做出决断！',       sfx: 'excite' },
    ],
  };

  /* ---------- 状态 ---------- */
  const state = {
    goalTotal: 2000,
    goalBalance: 2000,
    successProgress: 0,
    failStreak: 0,         // 连续失败计数，满 2 则敌方进球
    scoreHome: 0,
    scoreAway: 0,
    ownedCards: [],          // 已获得国家 code 列表
    rightCount: 0,           // right_goalofworld
    currentBallCell: -1,     // 当前足球所在宫格 index，-1 表示无
    idleBallTicks: 0,          // 自上次点击/播报以来足球跳转次数（用于均势文案）
    // —— 赛制 / 奖励额外状态 ——
    matchMinute: 0,            // 当前比赛分钟（0–9999）
    stoppageMinutes: 0,        // 本场伤停补时总时长（0 表示未达到 90′）
    fullTime: false,           // 全场结束
    failsBeforeNextGoal: 0,    // 距上次我方进球以来的失误点击次数
    everBehindThisMatch: false,// 本场是否曾落后
    // —— 多卡抽取队列 ——
    dropQueue: 0,              // 剩余待抽卡片数
    dropTotal: 0,              // 本轮共抽张数
    dropLabel: '',             // 本轮奖励名号
  };

  /* ---------- DOM ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const els = {
    goalTotal: $('#goalTotal'),
    goalBalance: $('#goalBalance'),
    grid: $('#grid'),
    reportBody: $('#reportBody'),
    progressBar: $('#progressBar'),
    progBalls: null, // init later
    btnWorld: $('#btnWorld'),
    worldModal: $('#worldModal'),
    btnCloseWorld: $('#btnCloseWorld'),
    worldGlobe: $('#worldGlobe'),
    ownedCount: $('#ownedCount'),
    rightCount: $('#rightCount'),
    cardDrop: $('#cardDrop'),
    dropFlag: $('#dropFlag'),
    dropName: $('#dropName'),
    dropDesc: $('#dropDesc'),
    dropStar: $('#dropStar'),
    btnDropConfirm: $('#btnDropConfirm'),
    detailModal: $('#detailModal'),
    detailFlag: $('#detailFlag'),
    detailName: $('#detailName'),
    detailDesc: $('#detailDesc'),
    detailStar: $('#detailStar'),
    btnCloseDetail: $('#btnCloseDetail'),
    unlockModal: $('#unlockModal'),
    unlockTier: $('#unlockTier'),
    btnContinue: $('#btnContinue'),
    btnGoStore: $('#btnGoStore'),
    btnCloseUnlock: $('#btnCloseUnlock'),
    toast: $('#toast'),
    goalPanel: $('#goalPanel'),
  };

  /* ---------- 初始化 ---------- */
  function init() {
    buildGrid();
    buildSlots();
    bindEvents();
    startBallLoop();
    startMatchClock();
    render();
    // 比赛一开始就尝试播放球场环境声；若被浏览器自动播放策略拦截，
    // 则在首次任意用户交互时自动恢复。
    startRealAmbient();
    const resume = () => {
      startRealAmbient();
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      window.removeEventListener('touchstart', resume);
    };
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
    window.addEventListener('touchstart', resume, { once: true });
  }

  function buildGrid() {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.idx = String(i);
      cell.addEventListener('click', () => onCellClick(i, cell));
      frag.appendChild(cell);
    }
    els.grid.appendChild(frag);
    els.progBalls = $$('.prog-ball');
  }

  function buildSlots() {
    // 48 slots split into 3 tiers (16 each)
    const tiers = [
      els.worldGlobe.querySelector('.tier-1'),
      els.worldGlobe.querySelector('.tier-2'),
      els.worldGlobe.querySelector('.tier-3'),
    ];
    for (let i = 0; i < 48; i++) {
      const tier = Math.floor(i / 16);
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.idx = String(i);
      // 第 16 / 32 / 48 个坑位 → 🔒
      const isLockSlot = i === 15 || i === 31 || i === 47;
      if (isLockSlot) {
        slot.classList.add('locked');
        slot.textContent = '🔒';
      } else {
        slot.textContent = '？';
      }
      slot.addEventListener('click', () => onSlotClick(i, slot));
      tiers[tier].appendChild(slot);
    }
  }

  function bindEvents() {
    els.btnWorld.addEventListener('click', openWorld);
    els.btnCloseWorld.addEventListener('click', () => hide(els.worldModal));
    els.btnDropConfirm.addEventListener('click', confirmDrop);
    els.btnCloseDetail.addEventListener('click', () => hide(els.detailModal));
    els.btnCloseUnlock.addEventListener('click', () => hide(els.unlockModal));
    els.btnContinue.addEventListener('click', () => hide(els.unlockModal));
    els.btnGoStore.addEventListener('click', () => {
      hide(els.unlockModal);
      toast('跳转「商店 - 限量权益」（Demo）');
    });
    const btnNext = document.getElementById('btnNextMatch');
    if (btnNext) btnNext.addEventListener('click', startNewMatch);

    // 进度条点击 → 玩法说明
    els.progressBar.addEventListener('click', () => {
      toast(`连续成功 3 次解锁国家卡片（当前 ${state.successProgress}/3）`);
    });

    // GOAL 长按
    let pressTimer;
    const startPress = () => { pressTimer = setTimeout(() => {
      toast('GOAL 是抽奖消耗的能量值，可在商店或活动中获得');
    }, 500); };
    const clearPress = () => clearTimeout(pressTimer);
    els.goalPanel.addEventListener('mousedown', startPress);
    els.goalPanel.addEventListener('touchstart', startPress);
    els.goalPanel.addEventListener('mouseup', clearPress);
    els.goalPanel.addEventListener('touchend', clearPress);
    els.goalPanel.addEventListener('mouseleave', clearPress);

    // 点击模态遮罩关闭
    $$('.modal-mask').forEach((mask) => {
      mask.addEventListener('click', () => hide(mask.parentElement));
    });
  }

  /* ---------- 足球随机移动 ---------- */
  function startBallLoop() {
    moveBall();
    setInterval(moveBall, CONFIG.BALL_MOVE_INTERVAL);
  }

  /* ---------- 比赛计时器：3s = 1 分钟 ---------- */
  function isPitchObscured() {
    // 任何能遮蔽九宫格的弹窗/卡片
    const ids = ['cardDrop', 'worldModal', 'detailModal', 'unlockModal', 'fulltimeModal'];
    return ids.some((id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden');
    });
  }
  function startMatchClock() {
    setInterval(tickClock, 3000);
    renderClock();
  }
  function tickClock() {
    if (state.fullTime) return;
    // 任何弹窗遮蔽九宫格时暂停计时
    if (isPitchObscured()) return;
    state.matchMinute += 1;
    // 刚抵达 90 分钟：随机生成伤停补时分钟数
    if (state.matchMinute === 90 && state.stoppageMinutes === 0) {
      state.stoppageMinutes = 3 + Math.floor(Math.random() * 8); // 3 - 10
    }
    // 伤停补时结束 → 全场结束
    if (state.stoppageMinutes > 0 && state.matchMinute >= 90 + state.stoppageMinutes) {
      state.fullTime = true;
      renderClock();
      setTimeout(showFulltime, 600);
      return;
    }
    renderClock();
  }

  function showFulltime() {
    const ft = document.getElementById('fulltimeModal');
    const final = document.getElementById('ftFinal');
    const result = document.getElementById('ftResult');
    if (final) final.textContent = `最终比分  ${state.scoreHome} : ${state.scoreAway}`;
    if (result) {
      if (state.scoreHome > state.scoreAway) result.textContent = '我方胜！恭喜拿下这场比赛🏆';
      else if (state.scoreHome < state.scoreAway) result.textContent = '遗憾输球，下场再拼！';
      else result.textContent = '不分胜负，双方互不相让。';
    }
    if (ft) ft.classList.remove('hidden');
    playSfx('whistle-foul');
  }

  function startNewMatch() {
    // 保留：GOAL / 已收集卡片 / 权益次数
    state.matchMinute = 0;
    state.stoppageMinutes = 0;
    state.fullTime = false;
    state.scoreHome = 0;
    state.scoreAway = 0;
    state.successProgress = 0;
    state.failStreak = 0;
    state.failsBeforeNextGoal = 0;
    state.everBehindThisMatch = false;
    state.idleBallTicks = 0;
    state.dropQueue = 0; state.dropTotal = 0; state.dropLabel = '';
    document.getElementById('fulltimeModal').classList.add('hidden');
    renderClock();
    render();
    setReport('新一场比赛开始，加油！', 'neutral');
  }
  function renderClock() {
    const root = document.getElementById('matchClock');
    const txt = document.getElementById('clockText');
    const tag = document.getElementById('clockTag');
    if (!root || !txt) return;
    if (state.matchMinute < 90) {
      txt.textContent = `${state.matchMinute}′ / 90′`;
      root.classList.remove('stoppage', 'fulltime');
      tag.textContent = '';
    } else {
      const extra = state.matchMinute - 90;
      txt.textContent = `90+${extra}′ / 90+${state.stoppageMinutes}′`;
      if (state.fullTime) {
        root.classList.remove('stoppage');
        root.classList.add('fulltime');
        tag.textContent = '全场结束';
      } else {
        root.classList.add('stoppage');
        tag.textContent = '伤停补时';
      }
    }
  }
  function moveBall() {
    // 清除旧球
    const old = els.grid.querySelector('.ball');
    if (old) old.remove();

    if (Math.random() > CONFIG.BALL_VISIBLE_RATE) {
      state.currentBallCell = -1;
    } else {
      const idx = Math.floor(Math.random() * 9);
      state.currentBallCell = idx;
      const cell = els.grid.children[idx];
      const ball = document.createElement('span');
      ball.className = 'ball';
      ball.textContent = '⚽';
      cell.appendChild(ball);
    }

    // 用户未点击 → 每 4 次跳转播报一条均势文案（仅文字，不叠加音效，仅保留环境声）
    state.idleBallTicks += 1;
    if (state.idleBallTicks >= 4) {
      state.idleBallTicks = 0;
      const item = pick(TEXTS.neutral);
      setReport(item.text, 'neutral');
    }
  }

  /* ---------- 点击宫格主流程 ---------- */
  function onCellClick(idx, cellEl) {
    // 用户点击 → 重置均势文案的 idle 计数
    state.idleBallTicks = 0;
    // 1. GOAL 校验
    if (state.goalBalance < CONFIG.GOAL_COST) {
      toast('GOAL 值不足，无法抽奖');
      return;
    }

    // 2. 扣费
    state.goalBalance -= CONFIG.GOAL_COST;

    // 3. 判定
    const hasBall = idx === state.currentBallCell;
    let isSuccess = false;
    if (hasBall) {
      isSuccess = Math.random() < CONFIG.SUCCESS_RATE;
    }

    if (isSuccess) {
      handleSuccess(cellEl);
    } else {
      handleFail(cellEl);
    }

    render();
  }

  function handleFail(cellEl) {
    // 失败不再清零 successProgress，保留进度
    cellEl.classList.remove('flash-fail');
    void cellEl.offsetWidth;
    cellEl.classList.add('flash-fail');

    state.failsBeforeNextGoal += 1; // 本轮进球前失误计数

    const item = pick(TEXTS.fail);
    setReport(item.text, 'fail');
    playClickSfx('fail');

    // 连续失败计数：满 2 次 → 敌方进球
    state.failStreak += 1;
    if (state.failStreak >= 2) {
      state.failStreak = 0;
      setTimeout(() => opponentScores(), 700);
    }
  }

  function opponentScores() {
    // 封顶：敌方仅能领先我方 1 分
    if (state.scoreAway >= state.scoreHome + 1) {
      setReport('门将主嬰神勇扩不住，但后防已守住后门！', 'fail');
      playSfx('applause');
      return;
    }
    state.scoreAway += 1;
    // 进度球 -1（不低于 0）
    if (state.successProgress > 0) state.successProgress -= 1;
    // 本场是否曾落后
    if (state.scoreAway > state.scoreHome) state.everBehindThisMatch = true;
    setReport('对手连续掌控后以一脚远射破门，敌方进球！', 'fail');
    playSfx('boo');
    const sa = document.getElementById('scoreAway');
    if (sa) { sa.classList.remove('bump'); void sa.offsetWidth; sa.classList.add('bump'); }
    render();
  }

  function handleSuccess(cellEl) {
    state.failStreak = 0; // 成功重置连败计数
    state.successProgress += 1;
    cellEl.classList.remove('flash-success');
    void cellEl.offsetWidth;
    cellEl.classList.add('flash-success');

    if (state.successProgress >= 3) {
      // 触发抽中：先踢球声 + 抽中的进球狂欢
      const item = pick(TEXTS.win);
      setReport(item.text, 'win');
      kickSolid();
      setTimeout(() => playRealSfx(item.sfx), 200);
      state.successProgress = 0; // 重置
      // —— 计算奖励叠加 ——
      const prev = { scoreHome: state.scoreHome, scoreAway: state.scoreAway };
      state.scoreHome += 1;
      const sh = document.getElementById('scoreHome');
      if (sh) { sh.classList.remove('bump'); void sh.offsetWidth; sh.classList.add('bump'); }
      const bonus = computeBonusCards(prev);
      // 重置本轮计数
      state.failsBeforeNextGoal = 0;
      if (state.scoreHome > state.scoreAway) {
        // 领先后取消“曾落后”标记（反超只触发一次）
        state.everBehindThisMatch = false;
      }

      if (state.ownedCards.length >= 48) {
        toast('已集齐 48 国！本次成功转化为 GOAL 返还');
        state.goalBalance += CONFIG.GOAL_COST * 3;
        state.goalTotal += CONFIG.GOAL_COST * 3;
      } else {
        // 如果是多卡奖励，按余额剩余位置收敛
        const remaining = 48 - state.ownedCards.length;
        const n = Math.min(bonus.n, remaining);
        state.dropQueue = n;
        state.dropTotal = n;
        state.dropLabel = bonus.label;
        if (bonus.label) {
          setTimeout(() => toast(`🎉 ${bonus.label}！奖励 ${n} 张国家卡片`), 400);
        }
        setTimeout(dropCountryCard, 700);
      }
    } else {
      const item = pick(TEXTS.success);
      setReport(item.text, 'success');
      playClickSfx('success');
    }
  }

  /* ---------- 奖励卡片数量计算 ---------- */
  function computeBonusCards(prev) {
    const inStoppage = state.matchMinute >= 90 && !state.fullTime;
    const wasBehind = prev.scoreAway > prev.scoreHome;
    const wasTied   = prev.scoreAway === prev.scoreHome;
    const nowTied   = state.scoreHome === state.scoreAway;
    const nowLeading = state.scoreHome > state.scoreAway;
    const noFail    = state.failsBeforeNextGoal === 0;
    const reach3lead = (state.scoreHome - state.scoreAway === 3) && (prev.scoreHome - prev.scoreAway < 3);
    const everBehind = state.everBehindThisMatch;
    // 开始领先且本场曾落后 → 反超达成
    const isOvertake = nowLeading && everBehind;
    // 压哨扯平：伤停 + 本轮从落后打平
    const stopEqualize = inStoppage && wasBehind && nowTied;
    // 压哨反超：伤停 + 领先 + 曾落后
    const stopOvertake = inStoppage && isOvertake && (wasBehind || wasTied);

    let n = 1;
    let label = '';
    if (noFail)        { n = Math.max(n, 2); label = '0失误进球'; }
    if (reach3lead)    { n = Math.max(n, 2); label = '3球领先·帽子戏法'; }
    if (isOvertake)    { n = Math.max(n, 2); label = '反超比分'; }
    if (inStoppage)    { n = Math.max(n, 3); label = '加时压哨进球'; }
    if (stopEqualize)  { n = Math.max(n, 4); label = '加时压哨扯平比分'; }
    if (stopOvertake)  { n = Math.max(n, 4); label = '加时压哨反超比分'; }
    return { n, label };
  }

  /* ---------- 国家卡片掉落 ---------- */
  function dropCountryCard() {
    // 在尚未获得的国家中等概率随机
    const owned = new Set(state.ownedCards.map((c) => c.code));
    const pool = window.COUNTRIES.filter((c) => !owned.has(c.code));
    if (pool.length === 0) return;
    const country = pool[Math.floor(Math.random() * pool.length)];

    els.dropFlag.textContent = country.flag;
    els.dropName.textContent = country.name;
    els.dropDesc.textContent = country.desc;
    els.dropStar.textContent = country.star;
    els.cardDrop.dataset.code = country.code;
    // 多卡奖励徽章/计数显示
    const badge = document.getElementById('dropBadge');
    const counter = document.getElementById('dropCounter');
    if (badge) {
      if (state.dropLabel && state.dropTotal > 1) {
        badge.textContent = `🏆 ${state.dropLabel} ×${state.dropTotal}`;
        badge.classList.add('show');
      } else {
        badge.classList.remove('show');
      }
    }
    if (counter) {
      if (state.dropTotal > 1) {
        const idx = state.dropTotal - state.dropQueue + 1;
        counter.textContent = `${idx} / ${state.dropTotal}`;
        counter.classList.add('show');
      } else {
        counter.classList.remove('show');
      }
    }
    show(els.cardDrop);
  }

  function confirmDrop() {
    const code = els.cardDrop.dataset.code;
    const country = window.COUNTRIES.find((c) => c.code === code);
    if (!country) { hide(els.cardDrop); return; }

    state.ownedCards.push(country);
    hide(els.cardDrop);

    // 检查解锁
    const n = state.ownedCards.length;
    if (n === 16 || n === 32 || n === 48) {
      state.rightCount = Math.min(state.rightCount + 1, 3);
      setTimeout(() => showUnlock(n), 700);
    }

    // 多卡队列：还有剩余，继续抽下一张
    if (state.dropQueue > 1) {
      state.dropQueue -= 1;
      setTimeout(() => dropCountryCard(), 500);
    } else {
      state.dropQueue = 0;
      state.dropTotal = 0;
      state.dropLabel = '';
      // 最后一张后才拉起环球世界
      openWorld(true);
    }
    render();
  }

  /* ---------- 环球世界 ---------- */
  function openWorld(justDropped = false) {
    show(els.worldModal);
    renderSlots(justDropped === true);
  }

  function renderSlots(highlightLast) {
    const slots = els.worldGlobe.querySelectorAll('.slot');
    // 顺序填入：第 N 张卡片填到第 N 个非锁定坑位
    // 这里简化：填充顺序按 ownedCards 的索引依次填入坑位 0..47，跳过 lock 标记 → 但 PRD 说"下一个未被填充的坑位"，因此包含 lock 位
    // 选择：lock 位也可以被填充国旗（解锁仅依赖 count 数量），符合"下一个空位"原则
    slots.forEach((s) => {
      s.classList.remove('filled', 'just-dropped');
      const idx = Number(s.dataset.idx);
      const isLockSlot = idx === 15 || idx === 31 || idx === 47;
      s.textContent = isLockSlot ? '🔒' : '？';
      s.classList.toggle('locked', isLockSlot);
    });

    state.ownedCards.forEach((country, i) => {
      const s = slots[i];
      s.classList.add('filled');
      s.classList.remove('locked');
      s.textContent = country.flag;
      if (highlightLast && i === state.ownedCards.length - 1) {
        s.classList.add('just-dropped');
      }
    });
  }

  function onSlotClick(idx, slotEl) {
    if (slotEl.classList.contains('filled')) {
      const country = state.ownedCards[idx];
      if (country) showDetail(country);
      return;
    }
    if (slotEl.classList.contains('locked')) {
      toast('收集齐该区域 16 个球形国旗，将获得兑换商城权益资格');
      return;
    }
    toast('通过『我是教练』抽奖获得球形国旗');
  }

  function showDetail(country) {
    els.detailFlag.textContent = country.flag;
    els.detailName.textContent = country.name;
    els.detailDesc.textContent = country.desc;
    els.detailStar.textContent = country.star;
    show(els.detailModal);
  }

  function showUnlock(n) {
    const tier = n === 16 ? '一档（上区）' : n === 32 ? '二档（中区）' : '三档（下区）';
    els.unlockTier.textContent = `已解锁 ${tier} · 累计权益 ${state.rightCount}/3`;
    show(els.unlockModal);
  }

  /* ---------- 渲染 ---------- */
  function render() {
    els.goalTotal.textContent = state.goalTotal;
    els.goalBalance.textContent = state.goalBalance;
    els.ownedCount.textContent = state.ownedCards.length;
    els.rightCount.textContent = state.rightCount;
    const sh = document.getElementById('scoreHome');
    const sa = document.getElementById('scoreAway');
    if (sh) sh.textContent = state.scoreHome;
    if (sa) sa.textContent = state.scoreAway;

    els.progBalls.forEach((b, i) => {
      b.classList.remove('lit-1', 'lit-2', 'lit-3');
      if (i < state.successProgress) {
        b.classList.add(`lit-${i + 1}`);
      }
    });
    const fill = document.getElementById('progressFill');
    if (fill) fill.style.width = (state.successProgress / 3 * 100) + '%';
  }

  function setReport(text, type) {
    els.reportBody.className = `report-overlay ${type} active`;
    els.reportBody.textContent = text;
    clearTimeout(els.reportBody._t);
    els.reportBody._t = setTimeout(() => {
      els.reportBody.classList.remove('active');
    }, 2200);
  }

  /* ---------- Utils ---------- */
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }

  let toastTimer;
  function toast(msg) {
    els.toast.textContent = msg;
    show(els.toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => hide(els.toast), 1800);
  }

  /* ---------- 场景音效（Web Audio API） ---------- */
  let audioCtx;
  function getCtx() {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // 人群噪声：低频 + 带通滤波，模拟众多语音混合
  function crowdNoise({ dur, vol, intensity = 1, delay = 0 }) {
    try {
      const ctx = getCtx();
      const sampleRate = ctx.sampleRate;
      const buf = ctx.createBuffer(1, sampleRate * dur, sampleRate);
      const data = buf.getChannelData(0);
      // 生成粉红噪声（更接近人群噪）
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
        // 加入起伏调制模拟人群哄闹的波动
        const env = 1 + 0.3 * Math.sin(i / sampleRate * 6 * Math.PI * intensity)
                      + 0.2 * Math.sin(i / sampleRate * 13 * Math.PI * intensity);
        data[i] = pink * env;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.7;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + delay;
      // 包络：起 持 落
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.08);
      gain.gain.setValueAtTime(vol, t0 + dur - 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp); bp.connect(gain); gain.connect(masterGain || ctx.destination);
      src.start(t0); src.stop(t0 + dur + 0.05);
      return { src, gain };
    } catch (e) { return null; }
  }

  function tone({ freq, dur = 0.18, type = 'sine', vol = 0.15, delay = 0, slideTo = null }) {
    try {
      const ctx = getCtx();
      const t0 = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(masterGain || ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  /* ---------- 踢球声合成（合成器 — 不依赖外部 mp3） ---------- */
  // 实心击球：低频“金” + 多体冲击 + 短促噪点
  function kickSolid() {
    try {
      const ctx = getCtx();
      const t0 = ctx.currentTime;
      // 低频 thump: 180Hz → 60Hz 下滑
      const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
      o1.type = 'sine'; o1.frequency.setValueAtTime(180, t0);
      o1.frequency.exponentialRampToValueAtTime(55, t0 + 0.12);
      g1.gain.setValueAtTime(0.0001, t0);
      g1.gain.exponentialRampToValueAtTime(0.55, t0 + 0.005);
      g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o1.connect(g1); g1.connect(masterGain || ctx.destination);
      o1.start(t0); o1.stop(t0 + 0.22);
      // 高频噪点 click（3kHz以上的口哨）
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.04, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const ns = ctx.createBufferSource(); ns.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      ns.connect(hp); hp.connect(ng); ng.connect(masterGain || ctx.destination);
      ns.start(t0); ns.stop(t0 + 0.04);
    } catch (e) { /* ignore */ }
  }
  // 踢偏：软闷响 + 摩擦面，低频不够实、高频不亮
  function kickMiss() {
    try {
      const ctx = getCtx();
      const t0 = ctx.currentTime;
      const o1 = ctx.createOscillator(); const g1 = ctx.createGain();
      o1.type = 'sine'; o1.frequency.setValueAtTime(120, t0);
      o1.frequency.exponentialRampToValueAtTime(70, t0 + 0.18);
      g1.gain.setValueAtTime(0.0001, t0);
      g1.gain.exponentialRampToValueAtTime(0.28, t0 + 0.01);
      g1.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);
      o1.connect(g1); g1.connect(masterGain || ctx.destination);
      o1.start(t0); o1.stop(t0 + 0.24);
      // 草皮摩擦噪音（中频带通）
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) * 0.6;
      const ns = ctx.createBufferSource(); ns.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
      const ng = ctx.createGain(); ng.gain.value = 0.22;
      ns.connect(bp); bp.connect(ng); ng.connect(masterGain || ctx.destination);
      ns.start(t0 + 0.02); ns.stop(t0 + 0.20);
    } catch (e) { /* ignore */ }
  }
  // 一次点击的复合声效：踢球 + 反应音频
  function playClickSfx(kind) {
    startRealAmbient();
    if (kind === 'success') {
      kickSolid();
      setTimeout(() => playRealSfx('applause'), 160);
    } else {
      kickMiss();
      setTimeout(() => playRealSfx('sigh'), 180);
    }
  }

  // 裁判哨声：高频方波 + 微额额 FM 模拟哨肌震动
  function whistleBlow({ delay = 0, dur = 0.6, vol = 0.18 }) {
    try {
      const ctx = getCtx();
      const t0 = ctx.currentTime + delay;
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const gain = ctx.createGain();
      carrier.type = 'sine';
      carrier.frequency.value = 2400;
      mod.type = 'sine';
      mod.frequency.value = 25;
      modGain.gain.value = 60;
      mod.connect(modGain); modGain.connect(carrier.frequency);
      carrier.connect(gain); gain.connect(masterGain || ctx.destination);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
      gain.gain.setValueAtTime(vol, t0 + dur - 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      carrier.start(t0); mod.start(t0);
      carrier.stop(t0 + dur + 0.02); mod.stop(t0 + dur + 0.02);
    } catch (e) {}
  }

  // 主增益 + 背景环境
  let masterGain = null;
  let ambientStarted = false;
  function startAmbient() {
    if (ambientStarted) return;
    ambientStarted = true;
    const ctx = getCtx();
    masterGain = ctx.createGain(); masterGain.gain.value = 1; masterGain.connect(ctx.destination);
    // 循环人群背景声：生成 6 秒循环 buffer
    const dur = 6;
    const sampleRate = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sampleRate * dur, sampleRate);
    const data = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
      // 丰富的人群起伏波动
      const t = i / sampleRate;
      const env = 1
        + 0.25 * Math.sin(t * 0.7 * Math.PI)
        + 0.20 * Math.sin(t * 1.9 * Math.PI + 0.6)
        + 0.15 * Math.sin(t * 4.3 * Math.PI + 1.3);
      data[i] = pink * env * 0.8;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.6;
    const ambGain = ctx.createGain(); ambGain.gain.value = 0.08;
    src.connect(bp); bp.connect(ambGain); ambGain.connect(masterGain);
    src.start();
  }

  const SFX = {
    // 哨声（犯规）：一声长哨 + 人群低鸣
    whistle: () => {
      whistleBlow({ dur: 0.55, vol: 0.22 });
      crowdNoise({ dur: 1.1, vol: 0.10, intensity: 0.6, delay: 0.5 });
    },
    // 软哨（任意球）：一声短哨 + 期待声
    'whistle-soft': () => {
      whistleBlow({ dur: 0.25, vol: 0.18 });
      crowdNoise({ dur: 1.0, vol: 0.10, intensity: 1.2, delay: 0.2 });
    },
    // 嘘声（被断球）：低频人群 boooo
    boo: () => {
      const ctx = getCtx();
      const dur = 1.3;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
        data[i] = pink;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350; lp.Q.value = 1.5;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + 0.15);
      gain.gain.setValueAtTime(0.35, t0 + dur - 0.4);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(lp); lp.connect(gain); gain.connect(masterGain || ctx.destination);
      src.start(); src.stop(t0 + dur);
      // 下滑馈音增强 boo 感
      tone({ freq: 220, dur: 1.0, type: 'sawtooth', vol: 0.05, slideTo: 110 });
    },
    // 叹息（失误）
    sigh: () => {
      crowdNoise({ dur: 1.2, vol: 0.18, intensity: 0.4 });
      tone({ freq: 350, dur: 1.0, type: 'sine', vol: 0.06, slideTo: 180 });
    },
    // 惊呼（受伤）
    gasp: () => {
      crowdNoise({ dur: 0.4, vol: 0.28, intensity: 2.2 });
      crowdNoise({ dur: 0.9, vol: 0.10, intensity: 0.8, delay: 0.4 });
    },
    // 掌声（成功防守）
    applause: () => {
      const ctx = getCtx();
      const dur = 1.3;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      // 模拟掌声：高频短脉冲密集出现
      for (let i = 0; i < data.length; i++) {
        const claps = Math.random() < 0.25 ? (Math.random() * 2 - 1) : 0;
        const noise = (Math.random() * 2 - 1) * 0.3;
        data[i] = claps * 0.7 + noise * 0.3;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.20, t0 + 0.1);
      gain.gain.setValueAtTime(0.20, t0 + dur - 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(hp); hp.connect(gain); gain.connect(masterGain || ctx.destination);
      src.start(); src.stop(t0 + dur);
    },
    // 兴奋声（妙传）：人群 oooh上提
    excite: () => {
      crowdNoise({ dur: 1.2, vol: 0.22, intensity: 1.6 });
      tone({ freq: 300, dur: 1.0, type: 'sine', vol: 0.05, slideTo: 600 });
    },
    // 惊叹（妙传后人群 wow）
    wow: () => {
      crowdNoise({ dur: 1.3, vol: 0.25, intensity: 1.2 });
      tone({ freq: 400, dur: 1.1, type: 'sine', vol: 0.06, slideTo: 700 });
    },
    // 进球狂欢（1.5秒持续庆祝）
    'goal-cheer': () => {
      const ctx = getCtx();
      const dur = 1.5;
      // 层 1：大型人群狂欢
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
        const t = i / ctx.sampleRate;
        const env = 1 + 0.4 * Math.sin(t * 8 * Math.PI) + 0.3 * Math.sin(t * 17 * Math.PI);
        data[i] = pink * env;
      }
      const src = ctx.createBufferSource(); src.buffer = buf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 0.5;
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.40, t0 + 0.05);
      gain.gain.setValueAtTime(0.40, t0 + dur - 0.3);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bp); bp.connect(gain); gain.connect(masterGain || ctx.destination);
      src.start(); src.stop(t0 + dur);
      // 层 2： 叠加掌声
      const clapBuf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const cd = clapBuf.getChannelData(0);
      for (let i = 0; i < cd.length; i++) {
        cd[i] = Math.random() < 0.3 ? (Math.random() * 2 - 1) : 0;
      }
      const cs = ctx.createBufferSource(); cs.buffer = clapBuf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t0);
      cg.gain.exponentialRampToValueAtTime(0.18, t0 + 0.05);
      cg.gain.setValueAtTime(0.18, t0 + dur - 0.3);
      cg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      cs.connect(hp); hp.connect(cg); cg.connect(masterGain || ctx.destination);
      cs.start(); cs.stop(t0 + dur);
      // 层 3：勝利号角上行
      tone({ freq: 440, dur: 0.30, type: 'triangle', vol: 0.18 });
      tone({ freq: 660, dur: 0.30, type: 'triangle', vol: 0.18, delay: 0.20 });
      tone({ freq: 880, dur: 0.50, type: 'triangle', vol: 0.18, delay: 0.40 });
    },
  };

  // ====== \u8865\u5145 SFX\uff0c\u8fbe\u5230 12 \u79cd ======
  // \u8fdb\u7403\u72c2\u6b22\u57fa\u5e95\uff1a\u4eba\u7fa4 + \u638c\u58f0\u53e0\u52a0
  function goalCheerBase(dur) {
    const ctx = getCtx();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i = 0; i < data.length; i++) {
      const w = Math.random()*2-1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759; b2=0.96900*b2+w*0.1538520;
      b3=0.86650*b3+w*0.3104856; b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      const pink = (b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11; b6 = w*0.115926;
      const t = i/ctx.sampleRate;
      const env = 1 + 0.4*Math.sin(t*8*Math.PI) + 0.3*Math.sin(t*17*Math.PI);
      data[i] = pink * env;
    }
    const src=ctx.createBufferSource(); src.buffer=buf;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=1000; bp.Q.value=0.5;
    const g=ctx.createGain(); const t0=ctx.currentTime;
    g.gain.setValueAtTime(0.0001,t0);
    g.gain.exponentialRampToValueAtTime(0.40,t0+0.05);
    g.gain.setValueAtTime(0.40,t0+dur-0.3);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    src.connect(bp); bp.connect(g); g.connect(masterGain||ctx.destination);
    src.start(); src.stop(t0+dur);
    // \u638c\u58f0\u5c42
    const cb = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const cd = cb.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = Math.random()<0.3 ? (Math.random()*2-1) : 0;
    const cs=ctx.createBufferSource(); cs.buffer=cb;
    const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1800;
    const cg=ctx.createGain();
    cg.gain.setValueAtTime(0.0001,t0);
    cg.gain.exponentialRampToValueAtTime(0.18,t0+0.05);
    cg.gain.setValueAtTime(0.18,t0+dur-0.3);
    cg.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    cs.connect(hp); hp.connect(cg); cg.connect(masterGain||ctx.destination);
    cs.start(); cs.stop(t0+dur);
  }

  // 1) \u72af\u89c4\u54e8\uff08alias \u4e8e\u539f whistle\uff09
  SFX['whistle-foul'] = SFX.whistle;

  // 2) \u91cd\u6454/\u88ab\u94f2\u500c\uff1a\u4f4e\u9891\u949d\u54cd + \u4eba\u7fa4\u9707\u60ca
  SFX['thud'] = () => {
    tone({ freq: 140, dur: 0.18, type: 'sine', vol: 0.32, slideTo: 50 });
    tone({ freq: 80,  dur: 0.30, type: 'sine', vol: 0.20, slideTo: 35, delay: 0.05 });
    crowdNoise({ dur: 1.0, vol: 0.20, intensity: 1.6, delay: 0.15 });
  };

  // 3) \u89d2\u7403\u671f\u5f85\u9f13\u638c\uff1a\u8282\u594f\u638c\u58f0\u9010\u6e10\u52a0\u901f
  SFX['corner'] = () => {
    const ctx = getCtx();
    [0, 0.28, 0.52, 0.74, 0.92, 1.08, 1.20].forEach((t, i) => {
      const len = 0.06;
      const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let k = 0; k < data.length; k++) data[k] = (Math.random()*2-1) * Math.exp(-k/data.length*8);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
      const g = ctx.createGain(); g.gain.value = 0.18 + i*0.01;
      src.connect(hp); hp.connect(g); g.connect(masterGain || ctx.destination);
      src.start(ctx.currentTime + t); src.stop(ctx.currentTime + t + len);
    });
    crowdNoise({ dur: 1.4, vol: 0.10, intensity: 0.8 });
  };

  // 4) \u53cd\u51fb\u9f13\u52a8\uff1a\u4f4e\u9891\u9f13\u70b9 + \u4eba\u7fa4\u8d77\u54c4
  SFX['rally'] = () => {
    [0, 0.18, 0.36, 0.54, 0.72, 0.90].forEach((t) => {
      tone({ freq: 90, dur: 0.10, type: 'sine', vol: 0.22, slideTo: 50, delay: t });
    });
    crowdNoise({ dur: 1.3, vol: 0.18, intensity: 1.4, delay: 0.1 });
  };

  // 5) \u8fdc\u5c04\u91cd\u70ae\uff1a\u91cd\u4f4e\u97f3\u51b2\u51fb + \u72c2\u6b22 + \u4e0b\u884c\u53f7\u89d2
  SFX['goal-power'] = () => {
    goalCheerBase(1.5);
    tone({ freq: 80,  dur: 0.20, type: 'sine',   vol: 0.40 });
    tone({ freq: 120, dur: 0.30, type: 'sine',   vol: 0.30, delay: 0.05 });
    tone({ freq: 880, dur: 0.40, type: 'square', vol: 0.10, delay: 0.30 });
    tone({ freq: 660, dur: 0.40, type: 'square', vol: 0.10, delay: 0.55 });
    tone({ freq: 440, dur: 0.60, type: 'square', vol: 0.10, delay: 0.80 });
  };

  // 6) \u5934\u7403\u5f97\u5206\uff1a\u4e0a\u884c\u53f7\u89d2 + \u72c2\u6b22
  SFX['goal-header'] = () => {
    goalCheerBase(1.5);
    tone({ freq: 660, dur: 0.20, type: 'triangle', vol: 0.18 });
    tone({ freq: 880, dur: 0.20, type: 'triangle', vol: 0.18, delay: 0.18 });
    tone({ freq: 1175,dur: 0.30, type: 'triangle', vol: 0.18, delay: 0.36 });
    tone({ freq: 1320,dur: 0.50, type: 'triangle', vol: 0.20, delay: 0.60 });
  };

  // 7) \u62a2\u70b9\u63a8\u5c04\uff1a\u9ad8\u9891\u51b2\u51fb + \u72c2\u6b22 + \u5feb\u901f\u638c\u58f0
  SFX['goal-tap'] = () => {
    goalCheerBase(1.5);
    tone({ freq: 1500, dur: 0.10, type: 'square', vol: 0.16 });
    tone({ freq: 1800, dur: 0.12, type: 'square', vol: 0.16, delay: 0.10 });
    const ctx = getCtx();
    [0.20, 0.32, 0.45, 0.60, 0.78, 0.96, 1.15].forEach((t) => {
      const len = 0.05;
      const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * Math.exp(-i/d.length*6);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const g = ctx.createGain(); g.gain.value = 0.20;
      src.connect(hp); hp.connect(g); g.connect(masterGain || ctx.destination);
      src.start(ctx.currentTime + t); src.stop(ctx.currentTime + t + len);
    });
  };

  // 8) \u5de7\u5c04\uff1a\u4f18\u96c5\u4e0a\u884c\u65cb\u5f8b + \u72c2\u6b22
  SFX['goal-finesse'] = () => {
    goalCheerBase(1.5);
    tone({ freq: 523, dur: 0.18, type: 'sine', vol: 0.16 });
    tone({ freq: 659, dur: 0.18, type: 'sine', vol: 0.16, delay: 0.16 });
    tone({ freq: 784, dur: 0.18, type: 'sine', vol: 0.16, delay: 0.32 });
    tone({ freq: 1046,dur: 0.50, type: 'sine', vol: 0.18, delay: 0.48 });
  };

  function playSfx(name) {
    startRealAmbient();
    playRealSfx(name);
  }

  /* ---------- 真实球场音频 (HTML5 Audio) ---------- */
  const SFX_FILES = {
    'whistle-foul':  'sounds/01-whistle-foul.mp3',
    'boo':           'sounds/02-boo.mp3',
    'sigh':          'sounds/03-sigh.mp3',
    'gasp':          'sounds/04-gasp.mp3',
    'thud':          'sounds/05-thud.mp3',
    'applause':      'sounds/06-applause.mp3',
    'excite':        'sounds/07-excite.mp3',
    'wow':           'sounds/08-wow.mp3',
    'whistle-soft':  'sounds/09-whistle-soft.mp3',
    'corner':        'sounds/10-corner.mp3',
    'rally':         'sounds/11-rally.mp3',
    'goal-power':    'sounds/12a-goal-power.mp3',
    'goal-header':   'sounds/12b-goal-header.mp3',
    'goal-tap':      'sounds/12c-goal-tap.mp3',
    'goal-finesse':  'sounds/12d-goal-finesse.mp3',
  };
  const _audioCache = {};
  function playRealSfx(name) {
    const src = SFX_FILES[name];
    if (!src) return;
    let pool = _audioCache[name];
    if (!pool) {
      pool = _audioCache[name] = [new Audio(src), new Audio(src), new Audio(src)];
      pool.forEach((a) => { a.volume = 0.85; a.preload = 'auto'; });
    }
    // 找一个空闲实例，避免互相打断
    const a = pool.find((x) => x.paused || x.ended) || pool[0];
    try {
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch (e) {}
  }

  let _ambient;
  let _ambientStarted = false;
  function startRealAmbient() {
    if (_ambientStarted) return;
    _ambientStarted = true;
    _ambient = new Audio('sounds/00-ambient.mp3');
    _ambient.loop = true;
    _ambient.volume = 0.35;
    _ambient.play().catch(() => { _ambientStarted = false; });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
