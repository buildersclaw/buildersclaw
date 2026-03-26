#!/bin/bash
BASE="https://buildersclaw.vercel.app"
SECRET="buildersclaw-test-2026"

api() {
  local method=$1 path=$2 body=$3 key=$4
  local h=(-H "Content-Type: application/json")
  [ -n "$key" ] && h+=(-H "Authorization: Bearer $key")
  [ -n "$body" ] && h+=(-d "$body")
  curl -s -X "$method" "$BASE$path" "${h[@]}"
}

jp() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)"; }

echo "═══ 1. CREATE HACKATHON (team_size_max=4) ═══"
SEED_RES=$(curl -s -X POST "$BASE/api/v1/seed-test" -H "Content-Type: application/json" -H "x-seed-secret: hackaclaw-test-2026" -d '{"title":"Marketplace Mayhem","brief":"Build a real-time crypto portfolio tracker dashboard. Must include: live price charts (simulated), portfolio donut chart, transaction history table, alerts panel, dark theme with neon accents. All interactive, responsive, single HTML file.","rules":"Single HTML file. No CDN. Canvas or SVG charts. Responsive. Interactive.","prize_pool":300,"challenge_type":"landing_page","team_size_max":4,"ends_at":"2026-03-23T12:00:00Z"}')
HID=$(echo "$SEED_RES" | jp "['data']['id']")
echo "  Hackathon: $HID"
echo "  URL: $BASE/hackathons/$HID"

reg_agent() {
  local name=$1 display=$2
  local res=$(api POST /api/v1/agents/register "{\"name\":\"$name\",\"display_name\":\"$display\",\"model\":\"gemini\"}")
  local key=$(echo "$res" | jp "['data']['agent']['api_key']")
  local aid=$(echo "$res" | jp "['data']['agent']['id']")
  api POST /api/v1/balance/test-credit "{\"secret\":\"$SECRET\",\"amount_usd\":5}" "$key" > /dev/null
  echo "$key|$aid"
}

echo ""
echo "═══ 2. REGISTER AGENTS ═══"
TS=$(date +%s)

# Team 1: Alpha (leader hires 2)
A1=$(reg_agent "alpha_lead_$TS" "Alpha Lead"); A1_KEY=${A1%%|*}; A1_ID=${A1##*|}
echo "  Alpha Lead: ${A1_ID:0:8}..."
A1H1=$(reg_agent "alpha_dev_$TS" "Alpha Dev"); A1H1_KEY=${A1H1%%|*}; A1H1_ID=${A1H1##*|}
echo "  Alpha Dev: ${A1H1_ID:0:8}..."
A1H2=$(reg_agent "alpha_design_$TS" "Alpha Designer"); A1H2_KEY=${A1H2%%|*}; A1H2_ID=${A1H2##*|}
echo "  Alpha Designer: ${A1H2_ID:0:8}..."

# Team 2: Beta (leader hires 1)
B1=$(reg_agent "beta_lead_$TS" "Beta Lead"); B1_KEY=${B1%%|*}; B1_ID=${B1##*|}
echo "  Beta Lead: ${B1_ID:0:8}..."
B1H1=$(reg_agent "beta_ops_$TS" "Beta Ops"); B1H1_KEY=${B1H1%%|*}; B1H1_ID=${B1H1##*|}
echo "  Beta Ops: ${B1H1_ID:0:8}..."

# Team 3: Gamma (leader hires 3 = max team of 4)
G1=$(reg_agent "gamma_lead_$TS" "Gamma Lead"); G1_KEY=${G1%%|*}; G1_ID=${G1##*|}
echo "  Gamma Lead: ${G1_ID:0:8}..."
G1H1=$(reg_agent "gamma_fe_$TS" "Gamma Frontend"); G1H1_KEY=${G1H1%%|*}; G1H1_ID=${G1H1##*|}
echo "  Gamma Frontend: ${G1H1_ID:0:8}..."
G1H2=$(reg_agent "gamma_be_$TS" "Gamma Backend"); G1H2_KEY=${G1H2%%|*}; G1H2_ID=${G1H2##*|}
echo "  Gamma Backend: ${G1H2_ID:0:8}..."
G1H3=$(reg_agent "gamma_qa_$TS" "Gamma QA"); G1H3_KEY=${G1H3%%|*}; G1H3_ID=${G1H3##*|}
echo "  Gamma QA: ${G1H3_ID:0:8}..."

# Team 4: Solo agent (no hires)
S1=$(reg_agent "solo_wolf_$TS" "Solo Wolf"); S1_KEY=${S1%%|*}; S1_ID=${S1##*|}
echo "  Solo Wolf: ${S1_ID:0:8}..."

echo ""
echo "═══ 3. CREATE TEAMS & JOIN ═══"
T1=$(api POST "/api/v1/hackathons/$HID/join" '{"name":"Team Alpha","color":"#00ffaa"}' "$A1_KEY" | jp "['data']['team']['id']")
echo "  Team Alpha: $T1"
T2=$(api POST "/api/v1/hackathons/$HID/join" '{"name":"Team Beta","color":"#ff6b6b"}' "$B1_KEY" | jp "['data']['team']['id']")
echo "  Team Beta: $T2"
T3=$(api POST "/api/v1/hackathons/$HID/join" '{"name":"Team Gamma","color":"#ffd93d"}' "$G1_KEY" | jp "['data']['team']['id']")
echo "  Team Gamma: $T3"
T4=$(api POST "/api/v1/hackathons/$HID/join" '{"name":"Lone Wolf","color":"#a29bfe"}' "$S1_KEY" | jp "['data']['team']['id']")
echo "  Lone Wolf: $T4"

echo ""
echo "═══ 4. MARKETPLACE: AGENTS LIST THEMSELVES ═══"
L_A1H1=$(api POST /api/v1/marketplace "{\"hackathon_id\":\"$HID\",\"skills\":\"React, TypeScript, Canvas API\",\"asking_share_pct\":20,\"preferred_roles\":[\"frontend\"],\"description\":\"Fast frontend dev, great with animations\"}" "$A1H1_KEY" | jp "['data']['id']")
echo "  Alpha Dev listed: $L_A1H1"

L_A1H2=$(api POST /api/v1/marketplace "{\"hackathon_id\":\"$HID\",\"skills\":\"UI/UX, CSS, SVG art\",\"asking_share_pct\":15,\"preferred_roles\":[\"designer\"],\"description\":\"Pixel-perfect designs, dark themes\"}" "$A1H2_KEY" | jp "['data']['id']")
echo "  Alpha Designer listed: $L_A1H2"

L_B1H1=$(api POST /api/v1/marketplace "{\"hackathon_id\":\"$HID\",\"skills\":\"DevOps, APIs, Data pipelines\",\"asking_share_pct\":25,\"preferred_roles\":[\"backend\",\"devops\"],\"description\":\"Backend expert, fast API builder\"}" "$B1H1_KEY" | jp "['data']['id']")
echo "  Beta Ops listed: $L_B1H1"

L_G1H1=$(api POST /api/v1/marketplace "{\"hackathon_id\":\"$HID\",\"skills\":\"React, Next.js, Tailwind\",\"asking_share_pct\":20,\"preferred_roles\":[\"frontend\",\"fullstack\"],\"description\":\"Fullstack dev, shipping fast\"}" "$G1H1_KEY" | jp "['data']['id']")
echo "  Gamma Frontend listed: $L_G1H1"

L_G1H2=$(api POST /api/v1/marketplace "{\"hackathon_id\":\"$HID\",\"skills\":\"Node.js, SQL, REST APIs\",\"asking_share_pct\":15,\"preferred_roles\":[\"backend\"],\"description\":\"Clean backend code, tested\"}" "$G1H2_KEY" | jp "['data']['id']")
echo "  Gamma Backend listed: $L_G1H2"

L_G1H3=$(api POST /api/v1/marketplace "{\"hackathon_id\":\"$HID\",\"skills\":\"Testing, QA, Code review\",\"asking_share_pct\":10,\"preferred_roles\":[\"qa\"],\"description\":\"Will find every bug\"}" "$G1H3_KEY" | jp "['data']['id']")
echo "  Gamma QA listed: $L_G1H3"

echo ""
echo "═══ 5. TEAM LEADERS SEND OFFERS ═══"
# Alpha hires 2: frontend dev (20%) and designer (15%)
O1=$(api POST /api/v1/marketplace/offers "{\"listing_id\":\"$L_A1H1\",\"team_id\":\"$T1\",\"offered_share_pct\":20,\"role\":\"frontend\",\"message\":\"Join us! We'll build the best dashboard.\"}" "$A1_KEY" | jp "['data']['id']")
echo "  Alpha -> Alpha Dev (20% frontend): $O1"

O2=$(api POST /api/v1/marketplace/offers "{\"listing_id\":\"$L_A1H2\",\"team_id\":\"$T1\",\"offered_share_pct\":15,\"role\":\"designer\",\"message\":\"Need your design skills for the dark theme.\"}" "$A1_KEY" | jp "['data']['id']")
echo "  Alpha -> Alpha Designer (15% designer): $O2"

O3=$(api POST /api/v1/marketplace/offers "{\"listing_id\":\"$L_B1H1\",\"team_id\":\"$T2\",\"offered_share_pct\":25,\"role\":\"backend\",\"message\":\"Let's crush the backend.\"}" "$B1_KEY" | jp "['data']['id']")
echo "  Beta -> Beta Ops (25% backend): $O3"

O4=$(api POST /api/v1/marketplace/offers "{\"listing_id\":\"$L_G1H1\",\"team_id\":\"$T3\",\"offered_share_pct\":20,\"role\":\"frontend\",\"message\":\"Build the UI.\"}" "$G1_KEY" | jp "['data']['id']")
echo "  Gamma -> Gamma Frontend (20% frontend): $O4"

O5=$(api POST /api/v1/marketplace/offers "{\"listing_id\":\"$L_G1H2\",\"team_id\":\"$T3\",\"offered_share_pct\":15,\"role\":\"backend\",\"message\":\"Handle data layer.\"}" "$G1_KEY" | jp "['data']['id']")
echo "  Gamma -> Gamma Backend (15% backend): $O5"

O6=$(api POST /api/v1/marketplace/offers "{\"listing_id\":\"$L_G1H3\",\"team_id\":\"$T3\",\"offered_share_pct\":10,\"role\":\"qa\",\"message\":\"Test everything.\"}" "$G1_KEY" | jp "['data']['id']")
echo "  Gamma -> Gamma QA (10% qa): $O6"

echo ""
echo "═══ 6. AGENTS ACCEPT OFFERS ═══"
R1=$(api PATCH "/api/v1/marketplace/offers/$O1" '{"action":"accept"}' "$A1H1_KEY" | jp "['data']['status']")
echo "  Alpha Dev accepted: $R1"
R2=$(api PATCH "/api/v1/marketplace/offers/$O2" '{"action":"accept"}' "$A1H2_KEY" | jp "['data']['status']")
echo "  Alpha Designer accepted: $R2"
R3=$(api PATCH "/api/v1/marketplace/offers/$O3" '{"action":"accept"}' "$B1H1_KEY" | jp "['data']['status']")
echo "  Beta Ops accepted: $R3"
R4=$(api PATCH "/api/v1/marketplace/offers/$O4" '{"action":"accept"}' "$G1H1_KEY" | jp "['data']['status']")
echo "  Gamma Frontend accepted: $R4"
R5=$(api PATCH "/api/v1/marketplace/offers/$O5" '{"action":"accept"}' "$G1H2_KEY" | jp "['data']['status']")
echo "  Gamma Backend accepted: $R5"
R6=$(api PATCH "/api/v1/marketplace/offers/$O6" '{"action":"accept"}' "$G1H3_KEY" | jp "['data']['status']")
echo "  Gamma QA accepted: $R6"

echo ""
echo "═══ 7. VERIFY TEAM COMPOSITION ═══"
echo "  Team Alpha (expect 3 members):"
api GET "/api/v1/hackathons/$HID/judge" | python3 -c "
import sys,json
data=json.load(sys.stdin)
for t in data.get('data',[]):
    print(f\"  {t['team_name']}: {len(t['members'])} members\")
    for m in t['members']:
        print(f\"    - {m.get('agent_display_name',m.get('agent_name','?'))} ({m.get('role','?')}, {m.get('revenue_share_pct','?')}%)\")
"

echo ""
echo "═══ DONE ═══"
echo "View: $BASE/hackathons/$HID"
echo ""
echo "Teams:"
echo "  Alpha: 3 agents (lead 65% + frontend 20% + designer 15%)"
echo "  Beta:  2 agents (lead 75% + backend 25%)"
echo "  Gamma: 4 agents (lead 55% + frontend 20% + backend 15% + qa 10%)"
echo "  Solo:  1 agent  (lead 100%)"
