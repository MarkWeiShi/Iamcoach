#!/usr/bin/env bash
# 切片真实球场录音 → 12 个场上音效 + 1 个背景循环
# 输出：~/COACH/demo/sounds/*.mp3
set -e
OUT=~/COACH/demo/sounds
mkdir -p "$OUT"

WHISTLE=/tmp/whistle.mp3
KICK=/tmp/kick.mp3
CHEST=/tmp/chest.mp3
CHEER=/tmp/cheer.mp3
STADIUM=/tmp/stadium.mp3
GOAL1=/tmp/goal1.mp3
GOAL2=/tmp/goal2.mp3
PACK=/tmp/pack.mp3

# 通用切片函数：start, dur, src, out, [extra_filter]
slice() {
  local ss=$1 dur=$2 src=$3 out=$4 extra=$5
  local fadeout
  fadeout=$(awk -v d="$dur" 'BEGIN{printf "%.3f", d - 0.1}')
  local af="afade=t=in:st=0:d=0.05,afade=t=out:st=${fadeout}:d=0.1,loudnorm=I=-16:LRA=11:TP=-1.5"
  if [[ -n "$extra" ]]; then
    af="$extra,$af"
  fi
  ffmpeg -y -nostdin -loglevel error -ss "$ss" -t "$dur" -i "$src" \
    -ac 1 -ar 44100 -af "$af" -b:a 96k "$OUT/$out"
  echo "  ✓ $out"
}

echo "→ Generating 12 SFX..."

# === 失败类（5 种） ===
# 1. 犯规哨声（whistle.mp3 = 单声哨子录音）
slice 0.05 1.5 "$WHISTLE"  "01-whistle-foul.mp3"

# 2. 嘘声 boo（用人群欢呼做强力低通 → 低频嗡声）
slice 12.0 1.5 "$CHEER"    "02-boo.mp3"           "lowpass=f=350,volume=1.4"

# 3. 失误叹息（球场环境的低密度人群声）
slice 5.0  1.5 "$STADIUM"  "03-sigh.mp3"          "volume=1.2"

# 4. 受伤惊呼（goal1 进球前的欢呼起势处，截短突变段）
slice 0.3  1.3 "$GOAL1"    "04-gasp.mp3"          "volume=1.3"

# 5. 重摔/被铲倒（球击胸的冲击声 + 短余响）
slice 1.85 1.3 "$CHEST"    "05-thud.mp3"          "volume=1.5"

# === 成功类（6 种） ===
# 6. 掌声欢呼（cheer 高潮段）
slice 25.0 1.5 "$CHEER"    "06-applause.mp3"

# 7. 妙传兴奋（cheer 起势段，能量上扬）
slice 40.0 1.5 "$CHEER"    "07-excite.mp3"        "volume=1.2"

# 8. 惊叹 wow（cheer 后段大场面）
slice 60.0 1.5 "$CHEER"    "08-wow.mp3"           "volume=1.2"

# 9. 任意球短哨（whistle 前 0.7s + 衰减）
slice 0.05 1.0 "$WHISTLE"  "09-whistle-soft.mp3"  "volume=0.85"

# 10. 角球（连续踢球+欢呼，从 kick 取首段，叠加 mix 处理）
slice 0.4  1.5 "$KICK"     "10-corner.mp3"        "volume=1.4"

# 11. 反击鼓动（pack 中后段连续高能区）
slice 60.0 1.5 "$PACK"     "11-rally.mp3"         "volume=1.2"

# === 进球类（4 种 1.5s 持续欢呼） ===
# 12-A. 远射重炮：goal1 高潮段
slice 9.5  1.5 "$GOAL1"    "12a-goal-power.mp3"   "volume=1.2"

# 12-B. 头球得分：goal1 另一高潮段
slice 26.4 1.5 "$GOAL1"    "12b-goal-header.mp3"  "volume=1.2"

# 12-C. 抢点推射：goal2 高潮段
slice 33.0 1.5 "$GOAL2"    "12c-goal-tap.mp3"     "volume=1.2"

# 12-D. 巧射：goal2 后段渐起
slice 5.4  1.5 "$GOAL2"    "12d-goal-finesse.mp3" "volume=1.2"

# === 背景环境音（30s 循环，球场背景） ===
ffmpeg -y -nostdin -loglevel error -ss 5 -t 30 -i "$STADIUM" \
  -ac 1 -ar 44100 -af "afade=t=in:st=0:d=1,afade=t=out:st=29:d=1,volume=0.6" \
  -b:a 96k "$OUT/00-ambient.mp3"
echo "  ✓ 00-ambient.mp3"

echo ""
echo "Done. Output:"
ls -lh "$OUT"
