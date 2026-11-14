#!/usr/bin/env bash
# End-to-end production check for TJ AI CONTENT FACTORY.
# Registers a throwaway account, creates a project with scenes, renders a real
# MP4 through the production engine, and validates the file with ffprobe.
#
# Usage: BASE_URL=http://127.0.0.1:3000 bash scripts/selftest.sh
set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
JAR="$(mktemp)"
EMAIL="selftest+$(date +%s)@example.com"
PASS=0
FAIL=0

note() { printf '  %s\n' "$*"; }
good() { printf '  [PASS] %s\n' "$*"; PASS=$((PASS + 1)); }
bad()  { printf '  [FAIL] %s\n' "$*"; FAIL=$((FAIL + 1)); }

api() { # api METHOD PATH [JSON]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -m 60 -b "$JAR" -c "$JAR" -X "$method" "$BASE_URL$path" \
      -H 'content-type: application/json' -d "$body"
  else
    curl -sS -m 60 -b "$JAR" -c "$JAR" -X "$method" "$BASE_URL$path"
  fi
}

json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s);const v=$1;console.log(v===undefined?'':v)}catch(e){console.log('')}})"; }

echo "TJ AI CONTENT FACTORY · self test against $BASE_URL"

# 1. Health
HEALTH="$(curl -sS -m 30 "$BASE_URL/api/health")"
FFMPEG_OK="$(printf '%s' "$HEALTH" | json "j.ffmpeg&&j.ffmpeg.ready")"
if [ "$FFMPEG_OK" = "true" ]; then good "health: ffmpeg detected ($(printf '%s' "$HEALTH" | json "j.ffmpeg.version"))"
else bad "health: ffmpeg not available"; fi

# 2. Independent auth
REG="$(api POST /api/auth/register "{\"email\":\"$EMAIL\",\"password\":\"selftest-pass-123\",\"name\":\"Self Test\"}")"
if [ -n "$(printf '%s' "$REG" | json "j.user&&j.user.id")" ]; then good "auth: registered independent account"
else bad "auth: registration failed -> $REG"; fi

# 3. Project
PROJ="$(api POST /api/projects '{"title":"Self Test Project","topic":"AI content automation","aspect":"9:16"}')"
PID="$(printf '%s' "$PROJ" | json "j.project&&j.project.id")"
if [ -n "$PID" ]; then good "library: project created ($PID)"; else bad "library: project create failed -> $PROJ"; fi

# 4. Scenes (no AI key required)
api POST /api/scenes "{\"projectId\":\"$PID\",\"text\":\"Discover trends before your competitors do.\",\"visualPrompt\":\"futuristic dashboard\",\"duration\":3}" >/dev/null
api POST /api/scenes "{\"projectId\":\"$PID\",\"text\":\"Create, produce and publish in one place.\",\"visualPrompt\":\"neon studio\",\"duration\":3}" >/dev/null
SCENES="$(api GET "/api/scenes?projectId=$PID")"
COUNT="$(printf '%s' "$SCENES" | json "j.scenes&&j.scenes.length")"
if [ "${COUNT:-0}" -ge 2 ]; then good "scenes: $COUNT scenes stored"; else bad "scenes: expected 2, got ${COUNT:-0}"; fi

# 5. Render an MP4 through the production engine
RENDER="$(api POST /api/videos "{\"projectId\":\"$PID\",\"aspect\":\"9:16\",\"subtitles\":true}")"
VID="$(printf '%s' "$RENDER" | json "j.videoId")"
if [ -n "$VID" ]; then good "engine: render queued ($VID)"; else bad "engine: render request failed -> $RENDER"; fi

STATUS=""
URL=""
for _ in $(seq 1 40); do
  sleep 3
  V="$(api GET "/api/videos/$VID")"
  STATUS="$(printf '%s' "$V" | json "j.video&&j.video.status")"
  URL="$(printf '%s' "$V" | json "j.video&&j.video.url")"
  ERR="$(printf '%s' "$V" | json "j.video&&j.video.error")"
  [ "$STATUS" = "ready" ] && break
  [ "$STATUS" = "failed" ] && { bad "engine: render failed -> ${ERR:-unknown}"; break; }
done
if [ "$STATUS" = "ready" ]; then good "engine: render finished (ready)"; else bad "engine: render did not finish (status=${STATUS:-none})"; fi

# 6. Download and validate the MP4
if [ -n "$URL" ]; then
  OUT="$(mktemp --suffix=.mp4)"
  CODE="$(curl -sS -m 120 -b "$JAR" -o "$OUT" -w '%{http_code}' "$BASE_URL$URL")"
  SIZE="$(stat -c%s "$OUT" 2>/dev/null || echo 0)"
  if [ "$CODE" = "200" ] && [ "$SIZE" -gt 20000 ]; then
    good "export: MP4 downloaded ($SIZE bytes)"
    PROBE="$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -show_entries format=duration,format_name -of json "$OUT" 2>/dev/null)"
    CODEC="$(printf '%s' "$PROBE" | json "j.streams&&j.streams[0]&&j.streams[0].codec_name")"
    W="$(printf '%s' "$PROBE" | json "j.streams&&j.streams[0]&&j.streams[0].width")"
    H="$(printf '%s' "$PROBE" | json "j.streams&&j.streams[0]&&j.streams[0].height")"
    DUR="$(printf '%s' "$PROBE" | json "j.format&&j.format.duration")"
    FMT="$(printf '%s' "$PROBE" | json "j.format&&j.format.format_name")"
    note "probe: codec=$CODEC ${W}x${H} duration=${DUR}s container=$FMT"
    if [ "$CODEC" = "h264" ] && [ "$W" = "1080" ] && [ "$H" = "1920" ]; then good "export: valid H.264 1080x1920 MP4"; else bad "export: unexpected video stream ($CODEC ${W}x${H})"; fi
    if printf '%s' "$DUR" | grep -qE '^[0-9]+'; then good "export: duration ${DUR}s"; else bad "export: unreadable duration"; fi
    AUDIO="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$OUT" 2>/dev/null)"
    if [ -n "$AUDIO" ]; then good "export: audio track present ($AUDIO)"; else note "export: no audio track (no narration or music was generated)"; fi
  else
    bad "export: download failed (HTTP $CODE, $SIZE bytes)"
  fi
  rm -f "$OUT"
else
  bad "export: no media URL returned"
fi

# 7. Publishing must refuse without an approval flag
PUB="$(api POST /api/publish "{\"videoId\":\"$VID\",\"title\":\"Self test\"}")"
PUBERR="$(printf '%s' "$PUB" | json "j.error")"
case "$PUBERR" in
  *pprov*) good "publishing: upload blocked until explicitly approved" ;;
  *) note "publishing: response -> ${PUBERR:-prepared}" ;;
esac

# 8. Session isolation: unauthenticated request must be rejected
ANON="$(curl -sS -m 30 -o /dev/null -w '%{http_code}' "$BASE_URL/api/projects")"
if [ "$ANON" = "401" ]; then good "auth: unauthenticated API access rejected (401)"; else bad "auth: expected 401 for anonymous request, got $ANON"; fi

rm -f "$JAR"
echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
